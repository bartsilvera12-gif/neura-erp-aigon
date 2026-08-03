import { NextRequest, NextResponse } from "next/server";
import { requireEmpresaTenantServiceRole } from "@/lib/chat/empresa-tenant-service-role";

export const runtime = "nodejs";

/**
 * POST /api/mobile/asesor/conversations/[conversationId]/send
 * Wrapper SEGURO de envío para el asesor móvil:
 *  1) Verifica en backend (PostgREST) que la conversación esté asignada al asesor
 *     logueado (403 si no). Antes la verificación usaba el pool PG crudo → "Error interno".
 *  2) Delega en /api/chat/send (que valida empresa, ventana WhatsApp 24h y persiste +
 *     marca last_agent_message_at), reenviando la auth del request.
 * Body: { message }
 */
export async function POST(
  request: NextRequest,
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

  const body = (await request.json().catch(() => null)) as { message?: string } | null;
  const message = typeof body?.message === "string" ? body.message.trim() : "";
  if (!message) return NextResponse.json({ ok: false, error: "message requerido" }, { status: 400 });

  // 1) Ownership en backend (PostgREST, camino soportado para neura).
  try {
    const { data: agRows } = await supabase
      .from("chat_agents")
      .select("id")
      .eq("empresa_id", empresa_id)
      .eq("usuario_id", usuario_id);
    const agentIds = new Set((agRows ?? []).map((r) => String((r as { id: string }).id)));

    const { data: conv } = await supabase
      .from("chat_conversations")
      .select("assigned_agent_id")
      .eq("id", conversationId)
      .eq("empresa_id", empresa_id)
      .maybeSingle();

    if (!conv) return NextResponse.json({ ok: false, error: "Conversación no encontrada" }, { status: 404 });
    const assignedAgentId = (conv as { assigned_agent_id: string | null }).assigned_agent_id;
    if (!assignedAgentId || !agentIds.has(String(assignedAgentId))) {
      return NextResponse.json(
        { ok: false, error: "No autorizado para esta conversación", code: "forbidden" },
        { status: 403 }
      );
    }
  } catch (e) {
    console.error("[mobile send] ownership check", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }

  // 2) Delegar en /api/chat/send (ventana 24h + persistencia + markers), reenviando auth.
  const headers: Record<string, string> = { "content-type": "application/json" };
  const auth = request.headers.get("authorization");
  const cookie = request.headers.get("cookie");
  if (auth) headers.authorization = auth;
  if (cookie) headers.cookie = cookie;
  try {
    const res = await fetch(new URL("/api/chat/send", request.url), {
      method: "POST",
      headers,
      body: JSON.stringify({ conversation_id: conversationId, message }),
    });
    const data = await res.json().catch(() => ({ ok: false, error: "send_failed" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    console.error("[mobile send] forward", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: "No se pudo enviar" }, { status: 502 });
  }
}
