import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";

export const runtime = "nodejs";

/**
 * POST /api/pipeline-ventas/reassign
 * Body: { conversation_id, agent_id }  (agent_id = chat_agents.id, no usuario_id)
 *
 * Cambia assigned_agent_id de la conversación. Solo admin.
 * Verifica que el agent pertenezca a la misma empresa.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth?.empresa_id) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    if (!isAdmin(auth)) {
      return NextResponse.json({ ok: false, error: "Solo admin" }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as {
      conversation_id?: string;
      agent_id?: string | null;
    } | null;
    const conversationId = typeof body?.conversation_id === "string" ? body.conversation_id.trim() : "";
    const agentIdRaw = body?.agent_id;
    const agentId = typeof agentIdRaw === "string" && agentIdRaw.trim() ? agentIdRaw.trim() : null;

    if (!conversationId) {
      return NextResponse.json({ ok: false, error: "conversation_id requerido" }, { status: 400 });
    }

    const supabase = await getChatServiceClientForEmpresa(auth.empresa_id);

    // Validar conversación.
    const { data: conv, error: cErr } = await supabase
      .from("chat_conversations")
      .select("id, empresa_id")
      .eq("id", conversationId)
      .maybeSingle();
    if (cErr || !conv) {
      return NextResponse.json({ ok: false, error: "Conversación no encontrada" }, { status: 404 });
    }
    if ((conv as { empresa_id: string }).empresa_id !== auth.empresa_id) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 403 });
    }

    // Validar agente (si no es null).
    if (agentId) {
      const { data: ag } = await supabase
        .from("chat_agents")
        .select("id, empresa_id")
        .eq("id", agentId)
        .maybeSingle();
      if (!ag || (ag as { empresa_id: string }).empresa_id !== auth.empresa_id) {
        return NextResponse.json({ ok: false, error: "Agente inválido" }, { status: 400 });
      }
    }

    const { error: uErr } = await supabase
      .from("chat_conversations")
      .update({
        assigned_agent_id: agentId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", conversationId)
      .eq("empresa_id", auth.empresa_id);

    if (uErr) {
      return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, agent_id: agentId });
  } catch (e) {
    console.error("[api/pipeline-ventas/reassign]", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
