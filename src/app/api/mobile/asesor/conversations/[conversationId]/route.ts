import { NextRequest, NextResponse } from "next/server";
import { requireEmpresaTenantServiceRole } from "@/lib/chat/empresa-tenant-service-role";

export const runtime = "nodejs";

/**
 * GET /api/mobile/asesor/conversations/[conversationId]
 * Detalle + mensajes recientes de UNA conversación, SOLO si está asignada al asesor
 * logueado. Si no es suya → 403 (no puede abrir chats de otro por URL directa).
 *
 * Usa el cliente PostgREST scopeado al schema del tenant (igual que /api/chat/mobile-inbox),
 * que es el camino soportado para neura. (Antes usaba el pool PG crudo → "Error interno".)
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ conversationId: string }> }
) {
  const { conversationId } = await params;
  let ctx;
  try {
    ctx = await requireEmpresaTenantServiceRole();
  } catch {
    return NextResponse.json(
      { ok: false, error: "Iniciá sesión", code: "unauthenticated" },
      { status: 401 }
    );
  }
  const { supabase, empresa_id, usuario_id } = ctx;

  try {
    // Agentes (chat_agents.id) del usuario logueado.
    const { data: agRows } = await supabase
      .from("chat_agents")
      .select("id")
      .eq("empresa_id", empresa_id)
      .eq("usuario_id", usuario_id);
    const agentIds = new Set((agRows ?? []).map((r) => String((r as { id: string }).id)));

    const { data: conv } = await supabase
      .from("chat_conversations")
      .select("id, status, assigned_agent_id, whatsapp_window_expires_at, contact_id")
      .eq("id", conversationId)
      .eq("empresa_id", empresa_id)
      .maybeSingle();

    if (!conv) {
      return NextResponse.json({ ok: false, error: "Conversación no encontrada" }, { status: 404 });
    }
    const assignedAgentId = (conv as { assigned_agent_id: string | null }).assigned_agent_id;
    // Seguridad: solo si está asignada a un agent_id del usuario.
    if (!assignedAgentId || !agentIds.has(String(assignedAgentId))) {
      return NextResponse.json(
        { ok: false, error: "No autorizado para esta conversación", code: "forbidden" },
        { status: 403 }
      );
    }

    const contactId = (conv as { contact_id: string | null }).contact_id;
    let contactNombre: string | null = null;
    let contactTelefono: string | null = null;
    if (contactId) {
      const { data: ct } = await supabase
        .from("chat_contacts")
        .select("nombre, telefono, raw_telefono")
        .eq("id", contactId)
        .eq("empresa_id", empresa_id)
        .maybeSingle();
      if (ct) {
        contactNombre = (ct as { nombre: string | null }).nombre ?? null;
        contactTelefono =
          (ct as { telefono: string | null }).telefono ??
          (ct as { raw_telefono: string | null }).raw_telefono ??
          null;
      }
    }

    const { data: msgRows } = await supabase
      .from("chat_messages")
      .select("id, from_me, sender_type, content, message_type, created_at, raw_payload, whatsapp_delivery_status")
      .eq("conversation_id", conversationId)
      .eq("empresa_id", empresa_id)
      .order("created_at", { ascending: false })
      .limit(80);

    const messages = ((msgRows ?? []) as Array<Record<string, unknown>>)
      .map((m) => ({
        id: m.id as string,
        from_me: Boolean(m.from_me),
        sender_type: (m.sender_type as string | null) ?? null,
        content: (m.content as string | null) ?? "",
        message_type: (m.message_type as string | null) ?? "text",
        created_at: (m.created_at as string | null) ?? null,
        raw_payload: (m.raw_payload as Record<string, unknown> | null) ?? null,
        whatsapp_delivery_status: (m.whatsapp_delivery_status as string | null) ?? null,
      }))
      .reverse();

    const expiresAt = (conv as { whatsapp_window_expires_at: string | null }).whatsapp_window_expires_at;
    // YCloud coexistence: no señalamos "ventana cerrada" preventivamente (el ERP ya no
    // pre-bloquea envíos; si YCloud rechaza, se ve el error real). Reportamos `true` solo
    // como indicador positivo cuando está abierta; nunca `false` (así el composer mobile no
    // muestra el banner de "24 h cerrada"). `whatsapp_window_expires_at` queda informativo.
    const windowOpen = expiresAt && new Date(expiresAt).getTime() > Date.now() ? true : null;

    return NextResponse.json({
      ok: true,
      conversation: {
        id: (conv as { id: string }).id,
        status: (conv as { status: string }).status,
        contact_nombre: contactNombre,
        contact_telefono: contactTelefono,
        window_open: windowOpen,
        whatsapp_window_expires_at: expiresAt,
      },
      messages,
    });
  } catch (e) {
    console.error("[mobile/asesor/conversations/:id]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
