import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * Etiquetas Automáticas - FASE 4A.
 * READ-ONLY: devuelve los últimos N mensajes (default 50) de una conversación.
 * NO modifica ninguna tabla.
 */

const DEFAULT_LIMIT = 50;
const MAX_LIMIT = 100;

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v.trim());
}

/**
 * FASE 5B-UX: el módulo Etiquetas requiere el número completo. Devolvemos
 * los dígitos normalizados (sin espacios/símbolos) y mantenemos el campo
 * `phone_masked` por compatibilidad con clientes anteriores; ahora también
 * contiene el número completo.
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
    const convId = (url.searchParams.get("conversation_id") || "").trim();
    if (!convId || !isUuid(convId)) {
      return NextResponse.json({ ok: false, error: "conversation_id inválido" }, { status: 400 });
    }
    const limitRaw = parseInt(url.searchParams.get("limit") || `${DEFAULT_LIMIT}`, 10);
    const limit = Math.min(MAX_LIMIT, Math.max(1, Number.isFinite(limitRaw) ? limitRaw : DEFAULT_LIMIT));

    // Header
    const headerRes = await pool.query(
      `SELECT c.id::text AS conversation_id,
              c.status,
              c.flow_status,
              c.flow_current_node,
              c.human_taken_over,
              c.last_message_at,
              c.hidden_by_tag,
              c.current_tag_id::text AS current_tag_id,
              ct.id::text AS contact_id,
              ct.name AS contact_name,
              ct.phone_number
         FROM "${schema}".chat_conversations c
         LEFT JOIN "${schema}".chat_contacts ct ON ct.id = c.contact_id
        WHERE c.empresa_id = $1 AND c.id = $2
        LIMIT 1`,
      [auth.empresa_id, convId]
    );
    if (headerRes.rows.length === 0) {
      return NextResponse.json({ ok: false, error: "Conversación no encontrada" }, { status: 404 });
    }
    const h = headerRes.rows[0];

    // Last N messages
    const msgRes = await pool.query(
      `SELECT id::text AS id,
              from_me,
              sender_type,
              message_type,
              content,
              created_at,
              whatsapp_delivery_status
         FROM "${schema}".chat_messages
        WHERE empresa_id = $1 AND conversation_id = $2
        ORDER BY created_at DESC, id DESC
        LIMIT $3`,
      [auth.empresa_id, convId, limit]
    );

    const messages = msgRes.rows
      .map((m) => ({
        id: m.id,
        from_me: m.from_me === true,
        sender_type: m.sender_type ?? null,
        message_type: m.message_type ?? null,
        content: typeof m.content === "string" ? m.content.slice(0, 4000) : m.content,
        created_at: m.created_at ? new Date(m.created_at).toISOString() : null,
        whatsapp_delivery_status: m.whatsapp_delivery_status ?? null,
      }))
      // ascendente para visualización tipo chat
      .reverse();

    return NextResponse.json({
      ok: true,
      wrote_changes: false,
      conversation: {
        conversation_id: h.conversation_id,
        status: h.status,
        flow_status: h.flow_status,
        flow_current_node: h.flow_current_node,
        human_taken_over: h.human_taken_over === true,
        last_message_at: h.last_message_at ? new Date(h.last_message_at).toISOString() : null,
        hidden_by_tag: h.hidden_by_tag === true,
        current_tag_id: h.current_tag_id ?? null,
        contact: {
          contact_id: h.contact_id,
          name: h.contact_name ?? null,
          phone: normalizePhone(h.phone_number),
          phone_masked: normalizePhone(h.phone_number),
        },
      },
      messages,
      message_count: messages.length,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error interno";
    console.error("[api/chat/tags/conversation-preview]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
