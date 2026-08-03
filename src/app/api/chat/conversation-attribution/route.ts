import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { inferirRedSocial } from "@/lib/reportes/red-social";

/**
 * GET /api/chat/conversation-attribution?conversation_id=…
 * Atribución Meta (Click-to-WhatsApp) de la conversación: link al anuncio, red social y headline.
 * Para el chip "Pauta ↗" del inbox. Devuelve null si la conversación no vino de un anuncio
 * (contacto orgánico) o si la tabla no existe en el tenant → el chip simplemente no se muestra.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const conversationId = request.nextUrl.searchParams.get("conversation_id")?.trim() ?? "";
    if (!conversationId) {
      return NextResponse.json(errorResponse("conversation_id requerido"), { status: 400 });
    }
    const { supabase, auth } = ctx;

    const { data, error } = await supabase
      .from("chat_conversation_attribution")
      .select("meta_source_url, meta_headline, meta_source_type, meta_ad_name, meta_campaign_name")
      .eq("empresa_id", auth.empresa_id)
      .eq("conversation_id", conversationId)
      .maybeSingle();

    // Degradación segura: tabla ausente / error de lectura → sin chip.
    if (error) {
      return NextResponse.json(successResponse(null));
    }
    const row = data as
      | {
          meta_source_url?: string | null;
          meta_headline?: string | null;
          meta_source_type?: string | null;
          meta_ad_name?: string | null;
          meta_campaign_name?: string | null;
        }
      | null;
    const sourceUrl = row?.meta_source_url?.trim();
    if (!sourceUrl) {
      return NextResponse.json(successResponse(null));
    }

    return NextResponse.json(
      successResponse({
        source_url: sourceUrl,
        headline: row?.meta_headline?.trim() || null,
        source_type: row?.meta_source_type?.trim() || null,
        red: inferirRedSocial(sourceUrl), // "instagram" | "facebook" | "no_identificado"
        ad_name: row?.meta_ad_name?.trim() || null,
        campaign_name: row?.meta_campaign_name?.trim() || null,
      })
    );
  } catch (e) {
    console.error("[api/chat/conversation-attribution]", e instanceof Error ? e.message : String(e));
    return NextResponse.json(errorResponse("Error interno"), { status: 500 });
  }
}
