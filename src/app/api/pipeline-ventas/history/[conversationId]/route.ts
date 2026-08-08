import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";

export const runtime = "nodejs";

/**
 * GET /api/pipeline-ventas/history/:conversationId
 * Devuelve el historial completo de cambios de estado (más nuevo primero).
 * Solo admin. Scope por empresa.
 */
export async function GET(
  request: NextRequest,
  ctx: { params: Promise<{ conversationId: string }> }
) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth?.empresa_id) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    if (!isAdmin(auth)) {
      return NextResponse.json({ ok: false, error: "Solo admin" }, { status: 403 });
    }
    const { conversationId } = await ctx.params;
    if (!conversationId) {
      return NextResponse.json({ ok: false, error: "conversationId requerido" }, { status: 400 });
    }

    const supabase = await getChatServiceClientForEmpresa(auth.empresa_id);

    const { data, error } = await supabase
      .from("chat_conversation_pipeline_events")
      .select(
        "id, estado_anterior, estado_nuevo, cambiado_por, cambiado_por_nombre, seguimiento_fecha, venta_monto, notas, created_at"
      )
      .eq("empresa_id", auth.empresa_id)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    return NextResponse.json({ ok: true, events: data ?? [] });
  } catch (e) {
    console.error("[api/pipeline-ventas/history]", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
