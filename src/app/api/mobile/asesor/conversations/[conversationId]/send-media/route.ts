import { NextRequest, NextResponse } from "next/server";
import { requireEmpresaTenantServiceRole } from "@/lib/chat/empresa-tenant-service-role";

export const runtime = "nodejs";

/**
 * POST /api/mobile/asesor/conversations/[conversationId]/send-media
 * Envío de media (nota de voz) del asesor móvil. Mismo patrón seguro que el envío de texto:
 *  1) Verifica sesión + que la conversación esté asignada a un chat_agent del asesor logueado (403 si no).
 *  2) Reenvía el multipart a /api/chat/send-media (que sube a Storage `chat-media`, valida ventana 24h,
 *     persiste el mensaje `audio` y despacha a WhatsApp), reenviando la auth del request.
 * Body: FormData { file, caption? }. conversation_id se toma de la URL.
 * NO duplica lógica de media: reutiliza /api/chat/send-media.
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

  // Parseo del multipart entrante.
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || file.size < 1) {
    return NextResponse.json({ ok: false, error: "Se requiere archivo de audio" }, { status: 400 });
  }
  const capRaw = form?.get("caption");
  const caption = typeof capRaw === "string" ? capRaw : "";

  // 1) Ownership en backend (PostgREST, camino soportado para neura) — idéntico al endpoint de texto.
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
    console.error("[mobile send-media] ownership check", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }

  // 2) Reenviar el multipart a /api/chat/send-media (Storage + ventana 24h + persistencia + WhatsApp).
  //    Reenviamos auth/cookie; NO seteamos content-type (fetch arma el boundary del FormData).
  try {
    const fwd = new FormData();
    fwd.set("conversation_id", conversationId);
    fwd.set("file", file, file.name || "nota-voz.webm");
    if (caption) fwd.set("caption", caption);

    const headers: Record<string, string> = {};
    const auth = request.headers.get("authorization");
    const cookie = request.headers.get("cookie");
    if (auth) headers.authorization = auth;
    if (cookie) headers.cookie = cookie;

    const res = await fetch(new URL("/api/chat/send-media", request.url), {
      method: "POST",
      headers,
      body: fwd,
    });
    const data = await res.json().catch(() => ({ ok: false, error: "send_media_failed" }));
    return NextResponse.json(data, { status: res.status });
  } catch (e) {
    console.error("[mobile send-media] forward", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: "No se pudo enviar el audio" }, { status: 502 });
  }
}
