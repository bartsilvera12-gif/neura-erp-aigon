import { NextResponse } from "next/server";
import { requireEmpresaTenantServiceRole } from "@/lib/chat/empresa-tenant-service-role";
import { fetchChatConversations } from "@/lib/chat/actions";
import { getMyAgentOperationalPresence } from "@/lib/chat/chat-ops-actions";

export const runtime = "nodejs";

/**
 * GET /api/mobile/asesor/conversations
 * Lista ESTRICTAMENTE las conversaciones open/pending asignadas al asesor logueado
 * (assigned_agent_id ∈ sus chat_agents). Seguridad en backend.
 *
 * Reusa el MISMO camino que el inbox desktop (`fetchChatConversations` con assignment="mine"),
 * que internamente elige PostgREST (neura) o pool PG (tenants no expuestos) según el schema.
 * Antes este endpoint consultaba el pool PG crudo, que para neura (PostgREST) no es el camino
 * soportado → fallaba con "Error interno".
 */
export async function GET() {
  // 1) Sesión.
  try {
    await requireEmpresaTenantServiceRole();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Iniciá sesión", code: "unauthenticated" },
      { status: 401 }
    );
  }

  try {
    // 2) ¿Es agente en cola? Si no, lista vacía con flag (no error).
    const presence = await getMyAgentOperationalPresence();
    if (!presence.in_queues) {
      return NextResponse.json({ ok: true, is_agent: false, conversations: [] });
    }

    // 3) Solo sus asignadas (assignment="mine" aplica scope + filtro por su agent_id).
    const { conversations } = await fetchChatConversations("inbox", {
      assignment: "mine",
      limit: 200,
    });

    const mapped = conversations.map((c) => ({
      id: c.id,
      status: c.status,
      last_message_at: c.last_message_at,
      last_message_preview: c.last_message_preview,
      unread_count: c.unread_count,
      contact_nombre: c.contact?.name ?? null,
      contact_telefono: c.contact?.phone_number ?? null,
      window_open: null as boolean | null,
    }));

    return NextResponse.json({ ok: true, is_agent: true, conversations: mapped });
  } catch (e) {
    console.error("[mobile/asesor/conversations]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
