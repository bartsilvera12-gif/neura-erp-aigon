import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { schemaHasHiddenByTagColumn } from "@/lib/chat/tags/has-hidden-by-tag-column";

/**
 * Etiquetas Automáticas - FASE ETQ-CAMP-2.
 * Preview READ-ONLY de la audiencia de una posible campaña WhatsApp
 * armada desde una etiqueta del módulo Etiquetas.
 *
 * NO crea campañas. NO inserta recipients. NO toca chat_conversations.
 * Solo SELECTs sobre chat_conversations, chat_contacts, chat_conversation_tags.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

// P2-CAMP-PAPU-REPAIR-1: tags para los que NUNCA debemos incluir compradores reales
// (tienen ticket entregado o entrada con cupones). El clasificador puede haberlos
// dejado mal etiquetados antes de que completaran la compra.
const EXCLUDE_BUYERS_FOR_TAG_CODES = new Set(["datos_incompletos"]);

function parseIntCap(v: string | null, fallback: number, max?: number): number {
  if (!v) return fallback;
  const n = parseInt(v, 10);
  if (Number.isNaN(n) || n <= 0) return fallback;
  if (max && n > max) return max;
  return n;
}

function parseBool(v: string | null, fallback: boolean): boolean {
  if (v == null) return fallback;
  const s = v.trim().toLowerCase();
  if (s === "true" || s === "1" || s === "yes") return true;
  if (s === "false" || s === "0" || s === "no") return false;
  return fallback;
}

function normalizePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const digits = p.replace(/\D+/g, "");
  return digits || null;
}

/** Validación E.164 mínima: 8-15 dígitos. */
function isValidPhoneDigits(digits: string | null): boolean {
  if (!digits) return false;
  return digits.length >= 8 && digits.length <= 15;
}

interface SampleRecipient {
  contact_id: string | null;
  conversation_id: string;
  contact_name: string | null;
  phone_number: string | null;
  phone_normalized: string | null;
  valid_phone: boolean;
  last_message_at: string | null;
  days_idle: number | null;
  current_tag_code: string;
  current_tag_label: string;
  has_recent_inbound: boolean;
  tag_reactivated_at: string | null;
  human_taken_over: boolean;
  outside_24h: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth?.empresa_id) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    const pool = getChatPostgresPool();
    if (!pool) {
      return NextResponse.json({ ok: false, error: "Pool no disponible" }, { status: 503 });
    }
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));

    // Guard multi-tenant: el módulo Etiquetas solo está activo donde existe la columna.
    const hasCol = await schemaHasHiddenByTagColumn(pool, schema);
    if (!hasCol) {
      return NextResponse.json(
        {
          ok: false,
          error: "schema_sin_etiquetas",
          message: "Este tenant todavía no tiene el módulo Etiquetas habilitado.",
        },
        { status: 400 }
      );
    }

    const url = new URL(request.url);
    const tagCode = (url.searchParams.get("tag_code") || "").trim();
    if (!tagCode) {
      return NextResponse.json(
        { ok: false, error: "tag_code_requerido" },
        { status: 400 }
      );
    }
    const limit = parseIntCap(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
    const excludeReactivated = parseBool(url.searchParams.get("exclude_reactivated"), true);
    const excludeHuman = parseBool(url.searchParams.get("exclude_human_taken_over"), true);
    const excludeRecentInboundHours = parseIntCap(
      url.searchParams.get("exclude_recent_inbound_hours"),
      24,
      24 * 30
    );
    const dedupeByPhone = parseBool(url.searchParams.get("dedupe_by_phone"), true);
    const excludeBuyers = EXCLUDE_BUYERS_FOR_TAG_CODES.has(tagCode);

    // Resolver tag (label y id).
    const tagRes = await pool.query(
      `SELECT id::text AS tag_id, label, color
         FROM "${schema}".chat_conversation_tags
        WHERE empresa_id=$1 AND code=$2 AND is_active=true
        LIMIT 1`,
      [auth.empresa_id, tagCode]
    );
    const tagRow = tagRes.rows[0] as { tag_id?: string; label?: string; color?: string } | undefined;
    if (!tagRow?.tag_id) {
      return NextResponse.json({
        ok: true,
        wrote_changes: false,
        tag_code: tagCode,
        tag_label: null,
        total_conversations: 0,
        total_unique_phones: 0,
        valid_phone_count: 0,
        invalid_phone_count: 0,
        outside_24h_count: 0,
        reactivated_excluded_count: 0,
        human_excluded_count: 0,
        recent_inbound_excluded_count: 0,
        duplicate_phone_count: 0,
        sample_recipients: [],
        warnings: [{ code: "tag_no_encontrada", message: `La etiqueta "${tagCode}" no existe o no está activa.` }],
        recommended_template_required: true,
        filters: {
          tag_code: tagCode,
          limit,
          exclude_reactivated: excludeReactivated,
          exclude_human_taken_over: excludeHuman,
          exclude_recent_inbound_hours: excludeRecentInboundHours,
          dedupe_by_phone: dedupeByPhone,
        },
      });
    }

    // Detectar si la tabla chat_contacts tiene alguna columna de opt-out (para warning informativo).
    const optoutColRes = await pool.query(
      `SELECT 1 FROM information_schema.columns
        WHERE table_schema = $1 AND table_name = 'chat_contacts'
          AND column_name IN ('opt_out_marketing_at','opt_out_at','marketing_opt_out','consent_marketing')
        LIMIT 1`,
      [schema]
    );
    const hasOptOutColumn = (optoutColRes.rowCount ?? 0) > 0;

    // Query agregada principal (single round-trip): cuenta de conversaciones tag,
    // teléfonos válidos/inválidos, dentro/fuera ventana 24h, humanos, reactivados,
    // y mensajes inbound recientes.
    const aggSql = `
      WITH base AS (
        SELECT c.id AS conv_id,
               c.contact_id,
               c.last_message_at,
               c.tag_reactivated_at,
               c.last_tagged_at,
               COALESCE(c.human_taken_over, false) AS human_taken_over,
               ct.phone_number,
               ct.phone_normalized,
               COALESCE(ct.phone_normalized, regexp_replace(COALESCE(ct.phone_number,''), '\\D','','g')) AS phone_norm,
               EXISTS (
                 SELECT 1 FROM "${schema}".chat_messages m
                  WHERE m.empresa_id = $1
                    AND m.conversation_id = c.id
                    AND m.from_me = false
                    AND m.created_at > now() - ($3::int * interval '1 hour')
               ) AS has_recent_inbound,
               EXISTS (
                 SELECT 1 FROM "${schema}".sorteo_ticket_deliveries t
                  WHERE t.empresa_id = $1
                    AND t.conversation_id = c.id
                    AND t.is_current = true
                    AND t.status = 'sent'
               ) AS has_real_purchase
          FROM "${schema}".chat_conversations c
          JOIN "${schema}".chat_contacts ct ON ct.id = c.contact_id
         WHERE c.empresa_id = $1
           AND c.current_tag_id = $2::uuid
           AND c.hidden_by_tag = true
           AND c.status IN ('open','pending')
      ),
      classified AS (
        SELECT *,
               (phone_norm IS NOT NULL AND length(phone_norm) >= 8 AND length(phone_norm) <= 15) AS valid_phone,
               (last_message_at < now() - interval '24 hours') AS outside_24h,
               (tag_reactivated_at IS NOT NULL
                AND last_tagged_at IS NOT NULL
                AND tag_reactivated_at > last_tagged_at) AS is_reactivated
          FROM base
      )
      SELECT
        count(*)::int AS total_conversations,
        count(DISTINCT phone_norm) FILTER (WHERE valid_phone)::int AS total_unique_phones,
        count(*) FILTER (WHERE valid_phone)::int AS valid_phone_count,
        count(*) FILTER (WHERE NOT valid_phone)::int AS invalid_phone_count,
        count(*) FILTER (WHERE outside_24h)::int AS outside_24h_count,
        count(*) FILTER (WHERE is_reactivated)::int AS reactivated_count,
        count(*) FILTER (WHERE human_taken_over)::int AS human_count,
        count(*) FILTER (WHERE has_recent_inbound)::int AS recent_inbound_count,
        count(*) FILTER (WHERE has_real_purchase)::int AS real_purchase_count,
        (count(*) FILTER (WHERE valid_phone)
          - count(DISTINCT phone_norm) FILTER (WHERE valid_phone))::int AS duplicate_phone_count
      FROM classified
    `;
    const aggRes = await pool.query(aggSql, [auth.empresa_id, tagRow.tag_id, excludeRecentInboundHours]);
    const agg = aggRes.rows[0] as {
      total_conversations: number;
      total_unique_phones: number;
      valid_phone_count: number;
      invalid_phone_count: number;
      outside_24h_count: number;
      reactivated_count: number;
      human_count: number;
      recent_inbound_count: number;
      real_purchase_count: number;
      duplicate_phone_count: number;
    };

    // Sample: aplicar filtros opcionales pedidos por el caller, dedupe in-SQL si aplica.
    // Solo eligible: valid_phone + (no reactivated o flag off) + (no human o flag off) + (sin inbound reciente o flag off).
    const sampleWhere: string[] = [
      `c.empresa_id = $1`,
      `c.current_tag_id = $2::uuid`,
      `c.hidden_by_tag = true`,
      `c.status IN ('open','pending')`,
    ];
    const sampleParams: unknown[] = [auth.empresa_id, tagRow.tag_id];
    if (excludeHuman) sampleWhere.push(`COALESCE(c.human_taken_over,false) = false`);
    if (excludeReactivated)
      sampleWhere.push(
        `NOT (c.tag_reactivated_at IS NOT NULL AND c.last_tagged_at IS NOT NULL AND c.tag_reactivated_at > c.last_tagged_at)`
      );
    sampleParams.push(excludeRecentInboundHours);
    const recentHoursIdx = sampleParams.length;
    sampleWhere.push(
      `NOT EXISTS (SELECT 1 FROM "${schema}".chat_messages m
                    WHERE m.empresa_id = $1 AND m.conversation_id = c.id
                      AND m.from_me = false
                      AND m.created_at > now() - ($${recentHoursIdx}::int * interval '1 hour'))`
    );
    if (excludeBuyers) {
      sampleWhere.push(
        `NOT EXISTS (SELECT 1 FROM "${schema}".sorteo_ticket_deliveries t
                      WHERE t.empresa_id = $1 AND t.conversation_id = c.id
                        AND t.is_current = true AND t.status = 'sent')`
      );
    }

    sampleParams.push(limit);
    const limitIdx = sampleParams.length;

    const sampleSql = dedupeByPhone
      ? `
        WITH base AS (
          SELECT DISTINCT ON (COALESCE(ct.phone_normalized, regexp_replace(COALESCE(ct.phone_number,''), '\\D','','g')))
                 c.id::text AS conversation_id,
                 c.contact_id::text AS contact_id,
                 ct.name AS contact_name,
                 ct.phone_number,
                 COALESCE(ct.phone_normalized, regexp_replace(COALESCE(ct.phone_number,''), '\\D','','g')) AS phone_norm,
                 c.last_message_at,
                 c.tag_reactivated_at,
                 c.last_tagged_at,
                 COALESCE(c.human_taken_over, false) AS human_taken_over,
                 c.flow_current_node
            FROM "${schema}".chat_conversations c
            JOIN "${schema}".chat_contacts ct ON ct.id = c.contact_id
           WHERE ${sampleWhere.join(" AND ")}
           ORDER BY COALESCE(ct.phone_normalized, regexp_replace(COALESCE(ct.phone_number,''), '\\D','','g')),
                    c.last_tagged_at DESC NULLS LAST
        )
        SELECT * FROM base
         ORDER BY last_tagged_at DESC NULLS LAST, last_message_at DESC NULLS LAST
         LIMIT $${limitIdx}`
      : `
        SELECT c.id::text AS conversation_id,
               c.contact_id::text AS contact_id,
               ct.name AS contact_name,
               ct.phone_number,
               COALESCE(ct.phone_normalized, regexp_replace(COALESCE(ct.phone_number,''), '\\D','','g')) AS phone_norm,
               c.last_message_at,
               c.tag_reactivated_at,
               c.last_tagged_at,
               COALESCE(c.human_taken_over, false) AS human_taken_over,
               c.flow_current_node
          FROM "${schema}".chat_conversations c
          JOIN "${schema}".chat_contacts ct ON ct.id = c.contact_id
         WHERE ${sampleWhere.join(" AND ")}
         ORDER BY c.last_tagged_at DESC NULLS LAST, c.last_message_at DESC NULLS LAST
         LIMIT $${limitIdx}`;

    const sampleRes = await pool.query(sampleSql, sampleParams);

    const now = Date.now();
    const sample_recipients: SampleRecipient[] = sampleRes.rows.map((r) => {
      const lmAt = r.last_message_at ? new Date(r.last_message_at) : null;
      const days_idle = lmAt ? Math.floor((now - lmAt.getTime()) / 86_400_000) : null;
      const phoneNorm = typeof r.phone_norm === "string" ? r.phone_norm : null;
      const reactivated =
        r.tag_reactivated_at &&
        r.last_tagged_at &&
        new Date(r.tag_reactivated_at).getTime() > new Date(r.last_tagged_at).getTime();
      return {
        contact_id: r.contact_id,
        conversation_id: r.conversation_id,
        contact_name: r.contact_name || null,
        phone_number: normalizePhone(r.phone_number),
        phone_normalized: phoneNorm,
        valid_phone: isValidPhoneDigits(phoneNorm),
        last_message_at: lmAt ? lmAt.toISOString() : null,
        days_idle,
        current_tag_code: tagCode,
        current_tag_label: tagRow.label || tagCode,
        has_recent_inbound: false, // ya filtrado en SQL
        tag_reactivated_at: reactivated ? new Date(r.tag_reactivated_at).toISOString() : null,
        human_taken_over: r.human_taken_over === true,
        outside_24h: lmAt ? lmAt.getTime() < now - 86_400_000 : true,
      };
    });

    // Warnings
    const warnings: Array<{ code: string; message: string; meta?: Record<string, unknown> }> = [];
    if (agg.total_conversations === 0) {
      warnings.push({
        code: "audiencia_vacia",
        message: `No hay conversaciones vigentes con la etiqueta "${tagRow.label || tagCode}".`,
      });
    }
    if (agg.invalid_phone_count > 0) {
      warnings.push({
        code: "telefonos_invalidos",
        message: `${agg.invalid_phone_count} contacto(s) tienen teléfono inválido y serán excluidos.`,
        meta: { count: agg.invalid_phone_count },
      });
    }
    if (agg.outside_24h_count > 0) {
      warnings.push({
        code: "fuera_ventana_24h",
        message:
          `${agg.outside_24h_count} contacto(s) están fuera de la ventana de 24h. ` +
          `Es obligatorio usar una plantilla aprobada por Meta.`,
        meta: { count: agg.outside_24h_count },
      });
    }
    if (excludeReactivated && agg.reactivated_count > 0) {
      warnings.push({
        code: "reactivados_excluidos",
        message: `${agg.reactivated_count} contacto(s) reactivados por respuesta del cliente serán excluidos.`,
        meta: { count: agg.reactivated_count },
      });
    }
    if (excludeHuman && agg.human_count > 0) {
      warnings.push({
        code: "humanos_excluidos",
        message: `${agg.human_count} conversación(es) tomadas por humano serán excluidas.`,
        meta: { count: agg.human_count },
      });
    }
    if (agg.recent_inbound_count > 0) {
      warnings.push({
        code: "inbound_reciente_excluido",
        message:
          `${agg.recent_inbound_count} contacto(s) recibieron inbound del cliente en las últimas ` +
          `${excludeRecentInboundHours}h y serán excluidos.`,
        meta: { count: agg.recent_inbound_count, hours: excludeRecentInboundHours },
      });
    }
    if (excludeBuyers && agg.real_purchase_count > 0) {
      warnings.push({
        code: "compra_real_excluida",
        message:
          `${agg.real_purchase_count} contacto(s) con compra real detectada (ticket entregado) ` +
          `serán excluidos de esta audiencia. Ya completaron su compra.`,
        meta: { count: agg.real_purchase_count, tag_code: tagCode },
      });
    }
    if (dedupeByPhone && agg.duplicate_phone_count > 0) {
      warnings.push({
        code: "duplicados_por_telefono",
        message: `${agg.duplicate_phone_count} envío(s) duplicado(s) por mismo teléfono serán deduplicados.`,
        meta: { count: agg.duplicate_phone_count },
      });
    }
    if (!hasOptOutColumn) {
      warnings.push({
        code: "sin_columna_optout",
        message:
          "El tenant aún no tiene columna de opt-out en chat_contacts. Antes del envío masivo " +
          "real se recomienda agregar un mecanismo de baja para cumplir con políticas de marketing.",
      });
    }

    return NextResponse.json({
      ok: true,
      wrote_changes: false,
      tag_code: tagCode,
      tag_label: tagRow.label || tagCode,
      tag_color: tagRow.color || null,
      total_conversations: agg.total_conversations,
      total_unique_phones: agg.total_unique_phones,
      valid_phone_count: agg.valid_phone_count,
      invalid_phone_count: agg.invalid_phone_count,
      outside_24h_count: agg.outside_24h_count,
      reactivated_excluded_count: excludeReactivated ? agg.reactivated_count : 0,
      reactivated_total_count: agg.reactivated_count,
      human_excluded_count: excludeHuman ? agg.human_count : 0,
      human_total_count: agg.human_count,
      recent_inbound_excluded_count: agg.recent_inbound_count,
      compra_real_excluida_count: excludeBuyers ? agg.real_purchase_count : 0,
      compra_real_total_count: agg.real_purchase_count,
      duplicate_phone_count: dedupeByPhone ? agg.duplicate_phone_count : 0,
      sample_recipients,
      warnings,
      recommended_template_required: true,
      filters: {
        tag_code: tagCode,
        limit,
        exclude_reactivated: excludeReactivated,
        exclude_human_taken_over: excludeHuman,
        exclude_recent_inbound_hours: excludeRecentInboundHours,
        dedupe_by_phone: dedupeByPhone,
        exclude_buyers: excludeBuyers,
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error interno";
    console.error("[api/chat/tags/audience-preview]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
