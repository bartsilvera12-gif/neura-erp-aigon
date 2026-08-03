import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * GET /api/reportes/campanas-meta/mensajes?conversation_id=<uuid>&limit=20
 *
 * Preview de los últimos mensajes de una conversación atribuida, para el acordeón
 * "Ver mensajes" del drawer de Campañas Meta. Read-only, acotado por empresa_id.
 * Devuelve solo lo necesario para render (sin raw_payload completo).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { auth, supabase } = ctx;
    const { searchParams } = new URL(request.url);
    const conversationId = (searchParams.get("conversation_id") ?? "").trim();
    if (!conversationId) {
      return NextResponse.json(errorResponse("Falta conversation_id."), { status: 400 });
    }
    const limitRaw = parseInt(searchParams.get("limit") ?? "20", 10);
    const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 50) : 20;

    const { data, error } = await supabase
      .from("chat_messages")
      .select("id, from_me, sender_type, message_type, content, created_at")
      .eq("empresa_id", auth.empresa_id)
      .eq("conversation_id", conversationId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (error) {
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }

    type Row = {
      id: string;
      from_me: boolean;
      sender_type: string | null;
      message_type: string | null;
      content: string | null;
      created_at: string;
    };
    const rows = ((data as Row[] | null) ?? [])
      .map((m) => ({
        id: m.id,
        from_me: Boolean(m.from_me),
        sender_type: m.sender_type,
        message_type: m.message_type,
        // Acotar contenido para preview; si no es texto, etiqueta del tipo
        content:
          m.message_type === "text"
            ? (m.content ?? "").slice(0, 500)
            : `[${m.message_type ?? "media"}]`,
        created_at: m.created_at,
      }))
      // Devolver en orden cronológico ascendente para lectura natural
      .reverse();

    return NextResponse.json(successResponse({ conversation_id: conversationId, mensajes: rows }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
