import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "crypto";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { successResponse, errorResponse } from "@/lib/api/response";
import { requireCampanasApiAccess } from "@/lib/campaigns/campaign-auth";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { schemaHasHiddenByTagColumn } from "@/lib/chat/tags/has-hidden-by-tag-column";
import { templateSnapshotHasHeaderImage, isHttpsUrl } from "@/lib/campaigns/campaign-header-image";
import { extractBodyPlaceholderKeysOrdered } from "@/lib/campaigns/campaign-placeholders-shared";
import { normalizeCampaignPhone } from "@/lib/campaigns/campaign-phone";

/**
 * Etiquetas Automáticas - FASE ETQ-CAMP-3.
 * Crea una campaña WhatsApp en status='draft' usando como audiencia las
 * conversaciones vigentes de una etiqueta del módulo Etiquetas.
 *
 * NO ejecuta launch. NO llama worker. NO envía WhatsApp. NO toca
 * chat_conversations ni hidden_by_tag.
 *
 * Inserts permitidos (sólo si todas las validaciones pasan):
 *   - chat_campaigns (status='draft')
 *   - chat_campaign_recipients (status='pending')
 *   - chat_campaign_events ('created', 'import_uploaded')
 */

const HARD_CAP_RECIPIENTS = 5000;

// P2-CAMP-PAPU-REPAIR-1: tags para los que NUNCA debemos incluir compradores reales
// (tienen ticket entregado o entrada con cupones).
const EXCLUDE_BUYERS_FOR_TAG_CODES = new Set(["datos_incompletos"]);

interface Body {
  tag_code?: string;
  template_id?: string;
  campaign_name?: string;
  exclude_reactivated?: boolean;
  exclude_human_taken_over?: boolean;
  exclude_recent_inbound_hours?: number;
  dedupe_by_phone?: boolean;
  header_image_url?: string;
  max_recipients?: number;
}

function boolVal(v: unknown, fallback: boolean): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "string") {
    const s = v.trim().toLowerCase();
    if (s === "true" || s === "1" || s === "yes") return true;
    if (s === "false" || s === "0" || s === "no") return false;
  }
  return fallback;
}

function intVal(v: unknown, fallback: number, max?: number): number {
  if (typeof v === "number" && Number.isFinite(v) && v > 0) return max ? Math.min(v, max) : v;
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    if (Number.isFinite(n) && n > 0) return max ? Math.min(n, max) : n;
  }
  return fallback;
}

interface AudienceRow {
  conversation_id: string;
  contact_id: string;
  contact_name: string | null;
  phone_number: string | null;
  phone_norm: string | null;
  last_message_at: string | null;
  flow_current_node: string | null;
}

export async function POST(request: NextRequest) {
  const auth = await requireCampanasApiAccess(request);
  if (!auth.ok) {
    return NextResponse.json(errorResponse(auth.message), { status: auth.status });
  }
  const empresaId = auth.empresaId;

  let body: Body;
  try {
    body = (await request.json()) as Body;
  } catch {
    return NextResponse.json(errorResponse("body JSON inválido"), { status: 400 });
  }

  const tagCode = String(body.tag_code ?? "").trim();
  const templateId = String(body.template_id ?? "").trim();
  if (!tagCode) return NextResponse.json(errorResponse("tag_code es obligatorio"), { status: 400 });
  if (!templateId) return NextResponse.json(errorResponse("template_id es obligatorio"), { status: 400 });

  const excludeReactivated = boolVal(body.exclude_reactivated, true);
  const excludeHuman = boolVal(body.exclude_human_taken_over, true);
  const excludeRecentInboundHours = intVal(body.exclude_recent_inbound_hours, 24, 24 * 30);
  const dedupeByPhone = boolVal(body.dedupe_by_phone, true);
  const maxRecipients = intVal(body.max_recipients, HARD_CAP_RECIPIENTS, HARD_CAP_RECIPIENTS);
  const headerImageUrl = typeof body.header_image_url === "string" ? body.header_image_url.trim() : "";

  // Pool para audiencia/etiquetas (tenant schema).
  const pool = getChatPostgresPool();
  if (!pool) return NextResponse.json(errorResponse("Pool no disponible"), { status: 503 });
  const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(empresaId));
  const hasCol = await schemaHasHiddenByTagColumn(pool, schema);
  if (!hasCol) {
    return NextResponse.json(
      errorResponse("Este tenant no tiene el módulo Etiquetas habilitado"),
      { status: 400 }
    );
  }

  // Cliente Supabase (service role) para escrituras consistentes con el resto del módulo Campañas.
  const sb = await getChatServiceClientForEmpresa(empresaId);

  // 1) Validar tag.
  const { data: tagRow, error: tagErr } = await sb
    .from("chat_conversation_tags")
    .select("id, code, label")
    .eq("empresa_id", empresaId)
    .eq("code", tagCode)
    .eq("is_active", true)
    .maybeSingle();
  if (tagErr) return NextResponse.json(errorResponse(`tag lookup: ${tagErr.message}`), { status: 400 });
  if (!tagRow) return NextResponse.json(errorResponse(`Etiqueta "${tagCode}" no encontrada`), { status: 404 });
  const tagId = String(tagRow.id);
  const tagLabel = String(tagRow.label || tagCode);

  // 2) Validar template.
  const { data: template, error: tplErr } = await sb
    .from("chat_campaign_templates")
    .select(
      "id, channel_id, provider, name, language, category, status, components_json, variable_schema_json"
    )
    .eq("empresa_id", empresaId)
    .eq("id", templateId)
    .maybeSingle();
  if (tplErr) return NextResponse.json(errorResponse(`template lookup: ${tplErr.message}`), { status: 400 });
  if (!template) return NextResponse.json(errorResponse("Template no encontrada"), { status: 404 });
  if (String(template.status).toUpperCase() !== "APPROVED") {
    return NextResponse.json(errorResponse("Template no está APROBADA"), { status: 400 });
  }
  if (String(template.provider) !== "meta") {
    return NextResponse.json(errorResponse("Solo se soportan templates Meta en esta fase"), { status: 400 });
  }

  // 3) Canal WhatsApp activo (Meta) — el template ya viene atado a un channel_id.
  const channelId = String(template.channel_id);
  const { data: channel, error: chErr } = await sb
    .from("chat_channels")
    .select("id, type, provider, activo, nombre")
    .eq("empresa_id", empresaId)
    .eq("id", channelId)
    .maybeSingle();
  if (chErr) return NextResponse.json(errorResponse(`channel lookup: ${chErr.message}`), { status: 400 });
  if (!channel || channel.activo !== true || String(channel.type) !== "whatsapp" || String(channel.provider) !== "meta") {
    return NextResponse.json(errorResponse("Canal WhatsApp Meta activo no disponible"), { status: 400 });
  }

  // 4) Header image gating.
  const componentsJson = Array.isArray(template.components_json) ? template.components_json : [];
  const needsHeaderImage = templateSnapshotHasHeaderImage(componentsJson);
  if (needsHeaderImage) {
    if (!headerImageUrl) {
      return NextResponse.json(
        errorResponse("Esta plantilla requiere header_image_url"),
        { status: 400 }
      );
    }
    if (!isHttpsUrl(headerImageUrl)) {
      return NextResponse.json(errorResponse("header_image_url debe ser HTTPS"), { status: 400 });
    }
  }

  // 5) Fetch audiencia (DISTINCT ON phone_normalized si dedupe).
  const audienceWhere: string[] = [
    `c.empresa_id = $1`,
    `c.current_tag_id = $2::uuid`,
    `c.hidden_by_tag = true`,
    `c.status IN ('open','pending')`,
  ];
  const audienceParams: unknown[] = [empresaId, tagId];
  if (excludeHuman) audienceWhere.push(`COALESCE(c.human_taken_over,false) = false`);
  if (excludeReactivated)
    audienceWhere.push(
      `NOT (c.tag_reactivated_at IS NOT NULL AND c.last_tagged_at IS NOT NULL AND c.tag_reactivated_at > c.last_tagged_at)`
    );
  audienceParams.push(excludeRecentInboundHours);
  const recentHoursIdx = audienceParams.length;
  audienceWhere.push(
    `NOT EXISTS (SELECT 1 FROM "${schema}".chat_messages m
                  WHERE m.empresa_id = $1 AND m.conversation_id = c.id
                    AND m.from_me = false
                    AND m.created_at > now() - ($${recentHoursIdx}::int * interval '1 hour'))`
  );
  const excludeBuyers = EXCLUDE_BUYERS_FOR_TAG_CODES.has(tagCode);
  if (excludeBuyers) {
    audienceWhere.push(
      `NOT EXISTS (SELECT 1 FROM "${schema}".sorteo_ticket_deliveries t
                    WHERE t.empresa_id = $1 AND t.conversation_id = c.id
                      AND t.is_current = true AND t.status = 'sent')`
    );
  }
  audienceParams.push(maxRecipients);
  const limitIdx = audienceParams.length;

  const audienceSql = dedupeByPhone
    ? `
      WITH ranked AS (
        SELECT DISTINCT ON (COALESCE(ct.phone_normalized, regexp_replace(COALESCE(ct.phone_number,''), '\\D','','g')))
               c.id::text AS conversation_id,
               c.contact_id::text AS contact_id,
               ct.name AS contact_name,
               ct.phone_number,
               COALESCE(ct.phone_normalized, regexp_replace(COALESCE(ct.phone_number,''), '\\D','','g')) AS phone_norm,
               c.last_message_at,
               c.flow_current_node
          FROM "${schema}".chat_conversations c
          JOIN "${schema}".chat_contacts ct ON ct.id = c.contact_id
         WHERE ${audienceWhere.join(" AND ")}
           AND COALESCE(ct.phone_normalized, regexp_replace(COALESCE(ct.phone_number,''), '\\D','','g')) IS NOT NULL
           AND length(COALESCE(ct.phone_normalized, regexp_replace(COALESCE(ct.phone_number,''), '\\D','','g'))) BETWEEN 8 AND 15
         ORDER BY COALESCE(ct.phone_normalized, regexp_replace(COALESCE(ct.phone_number,''), '\\D','','g')),
                  c.last_tagged_at DESC NULLS LAST
      )
      SELECT * FROM ranked
       ORDER BY last_message_at DESC NULLS LAST
       LIMIT $${limitIdx}`
    : `
      SELECT c.id::text AS conversation_id,
             c.contact_id::text AS contact_id,
             ct.name AS contact_name,
             ct.phone_number,
             COALESCE(ct.phone_normalized, regexp_replace(COALESCE(ct.phone_number,''), '\\D','','g')) AS phone_norm,
             c.last_message_at,
             c.flow_current_node
        FROM "${schema}".chat_conversations c
        JOIN "${schema}".chat_contacts ct ON ct.id = c.contact_id
       WHERE ${audienceWhere.join(" AND ")}
         AND COALESCE(ct.phone_normalized, regexp_replace(COALESCE(ct.phone_number,''), '\\D','','g')) IS NOT NULL
         AND length(COALESCE(ct.phone_normalized, regexp_replace(COALESCE(ct.phone_number,''), '\\D','','g'))) BETWEEN 8 AND 15
       ORDER BY c.last_message_at DESC NULLS LAST
       LIMIT $${limitIdx}`;

  // Conteo de compradores excluidos por guard (informativo).
  let realPurchaseExcludedCount = 0;
  if (excludeBuyers) {
    const exclRes = await pool.query(
      `SELECT count(DISTINCT c.id)::int AS n
         FROM "${schema}".chat_conversations c
         JOIN "${schema}".sorteo_ticket_deliveries t ON t.conversation_id=c.id
        WHERE c.empresa_id=$1 AND c.current_tag_id=$2::uuid
          AND c.hidden_by_tag=true AND c.status IN ('open','pending')
          AND t.empresa_id=$1 AND t.is_current=true AND t.status='sent'`,
      [empresaId, tagId]
    );
    realPurchaseExcludedCount = (exclRes.rows[0] as { n?: number })?.n ?? 0;
  }

  const audRes = await pool.query(audienceSql, audienceParams);
  const audience = audRes.rows as AudienceRow[];

  if (audience.length === 0) {
    return NextResponse.json(
      errorResponse("Audiencia vacía con los filtros actuales. No se creó la campaña."),
      { status: 400 }
    );
  }
  if (audience.length > maxRecipients) {
    return NextResponse.json(
      errorResponse(`Audiencia excede max_recipients=${maxRecipients}`),
      { status: 400 }
    );
  }

  // 6) Determinar placeholders del body de la template para mapeo {{1}} = contact_name.
  const bodyPlaceholders = extractBodyPlaceholderKeysOrdered(componentsJson);
  const firstPlaceholder = bodyPlaceholders[0] ?? null;
  const variableMappingJson: Record<string, string> =
    firstPlaceholder != null ? { [firstPlaceholder]: "contact_name" } : {};

  // 7) send_config_json con header_image_url (si aplica).
  const sendConfigJson: Record<string, unknown> = {};
  if (needsHeaderImage && headerImageUrl) {
    sendConfigJson.header_image = { mode: "global", url: headerImageUrl };
  }
  sendConfigJson.source = {
    kind: "tag",
    tag_code: tagCode,
    tag_label: tagLabel,
    created_at: new Date().toISOString(),
    fase: "etq_camp_3",
  };

  // 8) Crear campaña draft.
  const campaignName =
    (body.campaign_name ?? "").trim() ||
    `Etiqueta ${tagLabel} — ${new Date().toISOString().slice(0, 10)}`;

  const { data: campIns, error: campErr } = await sb
    .from("chat_campaigns")
    .insert({
      empresa_id: empresaId,
      name: campaignName,
      channel_id: channelId,
      queue_id: null,
      provider: "meta",
      template_id: templateId,
      template_name: String(template.name),
      template_language: String(template.language || "es"),
      template_category: template.category ? String(template.category) : null,
      template_components_json: componentsJson,
      variable_mapping_json: variableMappingJson,
      send_config_json: sendConfigJson,
      status: "draft",
      total_count: audience.length,
      valid_count: audience.length,
      invalid_count: 0,
      pending_count: audience.length,
      created_by: auth.usuarioCatalogId,
    })
    .select("id")
    .single();
  if (campErr || !campIns) {
    return NextResponse.json(errorResponse(`insert chat_campaigns: ${campErr?.message ?? "vacío"}`), {
      status: 400,
    });
  }
  const campaignId = String((campIns as { id: string }).id);

  // 9) Evento 'created'.
  await sb.from("chat_campaign_events").insert({
    empresa_id: empresaId,
    campaign_id: campaignId,
    recipient_id: null,
    event_type: "created",
    event_payload_json: {
      source: "etiquetas",
      tag_code: tagCode,
      tag_label: tagLabel,
      fase: "etq_camp_3",
    },
  });

  // 10) Bulk insert recipients en lotes de 200.
  const ts = new Date().toISOString();
  let rowNum = 1;
  let validCount = 0;
  let invalidCount = 0;
  const BATCH = 200;
  for (let i = 0; i < audience.length; i += BATCH) {
    const slice = audience.slice(i, i + BATCH);
    const rows = slice.map((a) => {
      const phoneRaw = a.phone_number ?? a.phone_norm ?? "";
      const norm = normalizeCampaignPhone(phoneRaw);
      const status = norm.ok ? "pending" : "invalid";
      if (norm.ok) validCount++;
      else invalidCount++;
      const rowNumber = rowNum++;
      const mappedVariables: Record<string, string> = {};
      if (firstPlaceholder != null) {
        mappedVariables[firstPlaceholder] = (a.contact_name ?? "").trim() || "amigo/a";
      }
      return {
        empresa_id: empresaId,
        campaign_id: campaignId,
        row_number: rowNumber,
        phone_raw: String(phoneRaw).trim() || null,
        phone_e164: norm.ok ? norm.e164 : `invalid_${rowNumber}_${campaignId.slice(0, 8)}`,
        contact_id: a.contact_id,
        conversation_id: a.conversation_id,
        row_payload_json: {
          tag_code: tagCode,
          tag_label: tagLabel,
          contact_name: a.contact_name ?? null,
          last_message_at: a.last_message_at,
          conversation_id: a.conversation_id,
          flow_current_node: a.flow_current_node,
        },
        mapped_variables_json: mappedVariables,
        status,
        validation_error: norm.ok ? null : "Teléfono inválido",
        created_at: ts,
        updated_at: ts,
      };
    });
    const { error: recErr } = await sb.from("chat_campaign_recipients").insert(rows);
    if (recErr) {
      return NextResponse.json(
        errorResponse(`insert recipients batch ${i}: ${recErr.message}`),
        { status: 400 }
      );
    }
  }

  // 11) Ajustar contadores reales en la campaña (pueden diferir si normalize tira invalid).
  await sb
    .from("chat_campaigns")
    .update({
      total_count: audience.length,
      valid_count: validCount,
      invalid_count: invalidCount,
      pending_count: validCount,
      updated_at: ts,
    })
    .eq("id", campaignId)
    .eq("empresa_id", empresaId);

  // 12) Evento 'import_uploaded' (simétrico al flujo XLSX).
  await sb.from("chat_campaign_events").insert({
    empresa_id: empresaId,
    campaign_id: campaignId,
    recipient_id: null,
    event_type: "import_uploaded",
    event_payload_json: {
      source: "etiquetas",
      tag_code: tagCode,
      total: audience.length,
      valid: validCount,
      invalid: invalidCount,
      dedupe_by_phone: dedupeByPhone,
      exclude_reactivated: excludeReactivated,
      exclude_human_taken_over: excludeHuman,
      exclude_recent_inbound_hours: excludeRecentInboundHours,
      exclude_buyers: excludeBuyers,
      compra_real_excluida_count: realPurchaseExcludedCount,
    },
  });

  return NextResponse.json(
    successResponse({
      campaign_id: campaignId,
      campaign_name: campaignName,
      tag_code: tagCode,
      tag_label: tagLabel,
      template_id: templateId,
      template_name: String(template.name),
      template_language: String(template.language || "es"),
      total_recipients: audience.length,
      valid_recipients: validCount,
      invalid_recipients: invalidCount,
      status: "draft",
      requires_header_image: needsHeaderImage,
      header_image_url: needsHeaderImage ? headerImageUrl : null,
      redirect_to: `/dashboard/campanas/${campaignId}`,
      // Nunca se invocó launch/process. La campaña queda en draft.
      launched: false,
      compra_real_excluida_count: realPurchaseExcludedCount,
    })
  );
}

export const dynamic = "force-dynamic";
