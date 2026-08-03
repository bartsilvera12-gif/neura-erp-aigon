import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * Etiquetas Automáticas - FASE 4A.
 * READ-ONLY: lista filas del snapshot shadow (chat_conversation_tag_history)
 * con filtros y paginación. NO escribe en ninguna tabla.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.trim());
}

function parseIntParam(value: string | null, fallback: number, max?: number): number {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n <= 0) return fallback;
  if (max && n > max) return max;
  return n;
}

/**
 * Parsea fecha del query string. Si el usuario envío solo "YYYY-MM-DD"
 * (sin hora), `boundary` decide si lo interpretamos como inicio o fin de día.
 * Si el valor incluye hora ("T"), respetamos esa hora literal.
 */
function parseDate(value: string | null, boundary: "start" | "end"): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  // FASE 4G: si viene solo como fecha YYYY-MM-DD, ajustar al inicio o fin de día (UTC).
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return boundary === "start" ? `${v}T00:00:00.000Z` : `${v}T23:59:59.999Z`;
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

/**
 * FASE 5B-UX: el módulo Etiquetas necesita el número completo para validar
 * contra Conversaciones y copiarlo. Devolvemos los dígitos normalizados
 * (sin espacios ni símbolos) y mantenemos compatibilidad con el campo
 * `phone_masked` que ahora también contiene el número completo.
 */
function normalizePhone(p: string | null | undefined): string | null {
  if (!p) return null;
  const digits = p.replace(/\D+/g, "");
  return digits || null;
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

    const url = new URL(request.url);
    const runKey = (url.searchParams.get("run_key") || "").trim();
    const tagCode = (url.searchParams.get("tag_code") || "").trim();
    const phoneRaw = (url.searchParams.get("phone") || "").replace(/\D+/g, "");
    const dateFromIso = parseDate(url.searchParams.get("date_from"), "start");
    const dateToIso = parseDate(url.searchParams.get("date_to"), "end");
    const currentNode = (url.searchParams.get("current_node_code") || "").trim();
    const limit = parseIntParam(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Math.max(0, parseIntParam(url.searchParams.get("offset"), 0, 1_000_000));
    const action = (url.searchParams.get("action") || "dry_run").trim();
    // FASE 5B-FIX: filtro adicional por applied_batch_id (solo aplica a view 'applied').
    const appliedBatchIdRaw = (url.searchParams.get("applied_batch_id") || "").trim();
    const appliedBatchId = appliedBatchIdRaw && isUuid(appliedBatchIdRaw) ? appliedBatchIdRaw : null;

    // FASE 4H: si el cliente no pidio un run_key especifico, usamos por defecto el
    // run_key mas reciente (snapshot vigente) para que la tabla principal no
    // mezcle sugerencias historicas.
    // FASE 5B-FIX: el default a "latest run_key" solo aplica para action='dry_run'.
    // Para 'applied'/'replaced'/'cleared' no hay concepto de snapshot agrupado;
    // se filtra por action y opcionalmente applied_batch_id.
    let effectiveRunKey = runKey;
    let runKeyDefaultedToLatest = false;
    if (!effectiveRunKey && action === "dry_run") {
      const latest = await pool.query(
        `SELECT metadata->>'run_key' AS run_key
           FROM "${schema}".chat_conversation_tag_history
          WHERE empresa_id = $1
            AND action = $2
            AND metadata ? 'run_key'
          ORDER BY created_at DESC
          LIMIT 1`,
        [auth.empresa_id, action]
      );
      effectiveRunKey = latest.rows[0]?.run_key ?? "";
      runKeyDefaultedToLatest = !!effectiveRunKey;
    }

    const params: unknown[] = [auth.empresa_id, action];
    const where: string[] = [
      `h.empresa_id = $1`,
      `h.action = $2`,
    ];
    if (effectiveRunKey) {
      params.push(effectiveRunKey);
      where.push(`h.metadata->>'run_key' = $${params.length}`);
    }
    if (appliedBatchId) {
      params.push(appliedBatchId);
      where.push(`h.metadata->>'applied_batch_id' = $${params.length}`);
    }
    if (tagCode) {
      params.push(tagCode);
      where.push(`t.code = $${params.length}`);
    }
    if (phoneRaw && phoneRaw.length >= 3) {
      params.push(`%${phoneRaw}%`);
      where.push(`ct.phone_number LIKE $${params.length}`);
    }
    // FASE 4G: el filtro Desde/Hasta ahora refiere a la última actividad del WhatsApp
    // (chat_conversations.last_message_at) y no a la fecha del snapshot.
    if (dateFromIso) {
      params.push(dateFromIso);
      where.push(`c.last_message_at >= $${params.length}::timestamptz`);
    }
    if (dateToIso) {
      params.push(dateToIso);
      where.push(`c.last_message_at <= $${params.length}::timestamptz`);
    }
    if (currentNode) {
      params.push(currentNode);
      where.push(`h.metadata->>'current_node_code' = $${params.length}`);
    }

    // Total
    // FASE 4G: incluir LEFT JOIN chat_conversations c para que el filtro por
    // last_message_at funcione tambien en total y by_tag (no solo en list).
    const totalSql = `
      SELECT count(*)::int AS n
        FROM "${schema}".chat_conversation_tag_history h
        LEFT JOIN "${schema}".chat_conversation_tags t ON t.id = h.new_tag_id
        LEFT JOIN "${schema}".chat_contacts ct ON ct.id = h.contact_id
        LEFT JOIN "${schema}".chat_conversations c ON c.id = h.conversation_id
       WHERE ${where.join(" AND ")}
    `;
    const totalRes = await pool.query(totalSql, params);
    const total = totalRes.rows[0]?.n ?? 0;

    // by_tag aggregation
    const byTagSql = `
      SELECT COALESCE(t.code, 'sin_tag') AS tag_code,
             COALESCE(t.label, '') AS tag_label,
             count(*)::int AS n
        FROM "${schema}".chat_conversation_tag_history h
        LEFT JOIN "${schema}".chat_conversation_tags t ON t.id = h.new_tag_id
        LEFT JOIN "${schema}".chat_contacts ct ON ct.id = h.contact_id
        LEFT JOIN "${schema}".chat_conversations c ON c.id = h.conversation_id
       WHERE ${where.join(" AND ")}
       GROUP BY t.code, t.label
       ORDER BY n DESC
    `;
    const byTagRes = await pool.query(byTagSql, params);

    // Page
    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;
    const listSql = `
      SELECT h.id::text AS history_id,
             h.conversation_id::text AS conversation_id,
             h.contact_id::text AS contact_id,
             COALESCE(t.code, '') AS tag_code,
             COALESCE(t.label, '') AS tag_label,
             ct.phone_number,
             ct.name AS contact_name,
             c.last_message_at,
             c.flow_current_node,
             h.action,
             h.metadata,
             h.created_at
        FROM "${schema}".chat_conversation_tag_history h
        LEFT JOIN "${schema}".chat_conversation_tags t ON t.id = h.new_tag_id
        LEFT JOIN "${schema}".chat_contacts ct ON ct.id = h.contact_id
        LEFT JOIN "${schema}".chat_conversations c ON c.id = h.conversation_id
       WHERE ${where.join(" AND ")}
       ORDER BY h.created_at DESC, h.id DESC
       LIMIT $${limitIdx} OFFSET $${offsetIdx}
    `;
    const listRes = await pool.query(listSql, params);

    const rows = listRes.rows.map((r) => {
      const meta = (r.metadata ?? {}) as Record<string, unknown>;
      return {
        history_id: r.history_id,
        conversation_id: r.conversation_id,
        contact_id: r.contact_id,
        tag_code: r.tag_code,
        tag_label: r.tag_label,
        phone: normalizePhone(r.phone_number),
        phone_masked: normalizePhone(r.phone_number),
        contact_name: r.contact_name || null,
        last_message_at: r.last_message_at ? new Date(r.last_message_at).toISOString() : null,
        current_node_code: (meta.current_node_code as string) ?? r.flow_current_node ?? null,
        days_idle: typeof meta.days_idle === "number" ? meta.days_idle : null,
        purchase_condition: (meta.purchase_condition as string) ?? null,
        category: (meta.category as string) ?? null,
        run_key: (meta.run_key as string) ?? null,
        applied_batch_id: (meta.applied_batch_id as string) ?? null,
        action: (r.action as string) ?? null,
        created_at: r.created_at ? new Date(r.created_at).toISOString() : null,
      };
    });

    return NextResponse.json({
      ok: true,
      dry_run_only: action === "dry_run",
      wrote_changes: false,
      filters: {
        run_key: runKey || null,
        effective_run_key: effectiveRunKey || null,
        run_key_defaulted_to_latest: runKeyDefaultedToLatest,
        applied_batch_id: appliedBatchId,
        tag_code: tagCode || null,
        phone: phoneRaw || null,
        date_from: dateFromIso,
        date_to: dateToIso,
        current_node_code: currentNode || null,
        action,
      },
      pagination: { limit, offset, total },
      by_tag: byTagRes.rows,
      rows,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error interno";
    console.error("[api/chat/tags/snapshot]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
