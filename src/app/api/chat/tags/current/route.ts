import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * Etiquetas Automáticas - FASE 6D.
 * Endpoint productivo: lista de conversaciones ACTUALMENTE etiquetadas.
 * Fuente única: chat_conversations.current_tag_id IS NOT NULL.
 * No expone snapshots dry_run, run_keys, batches ni acciones técnicas.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function parseIntCap(value: string | null, fallback: number, max?: number): number {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n <= 0) return fallback;
  if (max && n > max) return max;
  return n;
}

function parseDate(value: string | null, boundary: "start" | "end"): string | null {
  if (!value) return null;
  const v = value.trim();
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    return boundary === "start" ? `${v}T00:00:00.000Z` : `${v}T23:59:59.999Z`;
  }
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

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
    const tagCode = (url.searchParams.get("tag_code") || "").trim();
    const phoneRaw = (url.searchParams.get("phone") || "").replace(/\D+/g, "");
    const dateFromIso = parseDate(url.searchParams.get("date_from"), "start");
    const dateToIso = parseDate(url.searchParams.get("date_to"), "end");
    const limit = parseIntCap(url.searchParams.get("limit"), DEFAULT_LIMIT, MAX_LIMIT);
    const offset = Math.max(0, parseIntCap(url.searchParams.get("offset"), 0, 1_000_000));

    const params: unknown[] = [auth.empresa_id];
    const where: string[] = [
      `c.empresa_id = $1`,
      `c.current_tag_id IS NOT NULL`,
    ];
    if (tagCode) {
      params.push(tagCode);
      where.push(`t.code = $${params.length}`);
    }
    if (phoneRaw && phoneRaw.length >= 3) {
      params.push(`%${phoneRaw}%`);
      where.push(`ct.phone_number LIKE $${params.length}`);
    }
    if (dateFromIso) {
      params.push(dateFromIso);
      where.push(`c.last_message_at >= $${params.length}::timestamptz`);
    }
    if (dateToIso) {
      params.push(dateToIso);
      where.push(`c.last_message_at <= $${params.length}::timestamptz`);
    }

    // Total
    const totalRes = await pool.query(
      `SELECT count(*)::int AS n
         FROM "${schema}".chat_conversations c
         LEFT JOIN "${schema}".chat_conversation_tags t ON t.id = c.current_tag_id
         LEFT JOIN "${schema}".chat_contacts ct ON ct.id = c.contact_id
        WHERE ${where.join(" AND ")}`,
      params
    );
    const total = totalRes.rows[0]?.n ?? 0;

    // Page
    params.push(limit);
    const limitIdx = params.length;
    params.push(offset);
    const offsetIdx = params.length;
    const listRes = await pool.query(
      `SELECT c.id::text AS conversation_id,
              c.contact_id::text AS contact_id,
              COALESCE(t.code, '') AS tag_code,
              COALESCE(t.label, '') AS tag_label,
              ct.phone_number,
              ct.name AS contact_name,
              c.last_message_at,
              c.last_tagged_at,
              c.flow_current_node
         FROM "${schema}".chat_conversations c
         LEFT JOIN "${schema}".chat_conversation_tags t ON t.id = c.current_tag_id
         LEFT JOIN "${schema}".chat_contacts ct ON ct.id = c.contact_id
        WHERE ${where.join(" AND ")}
        ORDER BY c.last_tagged_at DESC NULLS LAST, c.last_message_at DESC NULLS LAST
        LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      params
    );

    const now = Date.now();
    const rows = listRes.rows.map((r) => {
      const lmAt = r.last_message_at ? new Date(r.last_message_at) : null;
      const days_idle = lmAt ? Math.floor((now - lmAt.getTime()) / 86_400_000) : null;
      return {
        conversation_id: r.conversation_id,
        contact_id: r.contact_id,
        tag_code: r.tag_code,
        tag_label: r.tag_label,
        phone: normalizePhone(r.phone_number),
        contact_name: r.contact_name || null,
        last_message_at: lmAt ? lmAt.toISOString() : null,
        last_tagged_at: r.last_tagged_at ? new Date(r.last_tagged_at).toISOString() : null,
        days_idle,
      };
    });

    return NextResponse.json({
      ok: true,
      filters: {
        tag_code: tagCode || null,
        phone: phoneRaw || null,
        date_from: dateFromIso,
        date_to: dateToIso,
      },
      pagination: { limit, offset, total },
      rows,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error interno";
    console.error("[api/chat/tags/current]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
