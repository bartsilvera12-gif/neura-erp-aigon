import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";

/**
 * GET /api/reportes/campanas-meta/ad-thumb?ad_id=<meta_ad_id>
 *
 * Proxy de la imagen/thumbnail del anuncio. Las URLs Facebook CDN
 * (`scontent.xx.fbcdn.net`) caducan por firma `oe=<epoch>`. Si la URL ya venció
 * (4xx/5xx/error de red) devolvemos un SVG placeholder. Así la UI nunca muestra
 * ícono roto.
 *
 * Prioridad de URL:
 *  1. meta_thumbnail_url (mejor para video, más liviano)
 *  2. meta_image_url
 *  3. payload.thumbnail_url
 *  4. payload.image_url
 *
 * Auth: misma resolución que el resto de /api (cookie o Bearer del usuario).
 */

export const dynamic = "force-dynamic";

const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
  <rect width="200" height="200" fill="#F1F5F9"/>
  <g fill="none" stroke="#4FAEB2" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" transform="translate(70,70)">
    <path d="M30 30L52 20l-10 30z"/>
    <path d="M30 30v-12"/>
    <path d="M5 25h25v10H5z" fill="#4FAEB2" fill-opacity="0.15"/>
    <path d="M12 35v6"/>
  </g>
  <text x="100" y="170" font-family="system-ui,sans-serif" font-size="11" fill="#94A3B8" text-anchor="middle">Anuncio</text>
</svg>`;

function placeholderResponse(reason: string): Response {
  return new Response(PLACEHOLDER_SVG, {
    status: 200,
    headers: {
      "Content-Type": "image/svg+xml",
      "Cache-Control": "public, max-age=300",
      "X-Placeholder-Reason": reason,
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return placeholderResponse("unauthorized");
    const { auth, supabase } = ctx;

    const { searchParams } = new URL(request.url);
    const adId = (searchParams.get("ad_id") ?? "").trim();
    if (!adId) return placeholderResponse("no_ad_id");

    // Buscar la atribución más reciente para ese meta_ad_id
    const { data, error } = await supabase
      .from("chat_conversation_attribution")
      .select(
        "meta_thumbnail_url, meta_image_url, meta_video_url, first_attribution_payload"
      )
      .eq("empresa_id", auth.empresa_id)
      .eq("meta_ad_id", adId)
      .order("first_message_at", { ascending: false })
      .limit(1);

    if (error) return placeholderResponse("db_error");

    const row = (data ?? [])[0] as
      | {
          meta_thumbnail_url: string | null;
          meta_image_url: string | null;
          meta_video_url: string | null;
          first_attribution_payload: Record<string, unknown> | null;
        }
      | undefined;
    if (!row) return placeholderResponse("ad_not_found");

    const payload = row.first_attribution_payload ?? {};
    const url =
      row.meta_thumbnail_url?.trim() ||
      row.meta_image_url?.trim() ||
      (typeof payload["thumbnail_url"] === "string"
        ? (payload["thumbnail_url"] as string).trim()
        : "") ||
      (typeof payload["image_url"] === "string"
        ? (payload["image_url"] as string).trim()
        : "") ||
      "";

    if (!url) return placeholderResponse("no_url");
    if (!/^https:\/\//i.test(url)) return placeholderResponse("invalid_scheme");

    // Fetch server-side (sin pasar cookies del usuario, evita CORS y firmas)
    let upstream: Response;
    try {
      upstream = await fetch(url, {
        method: "GET",
        cache: "no-store",
        redirect: "follow",
        signal: AbortSignal.timeout(8000),
      });
    } catch {
      return placeholderResponse("fetch_failed");
    }

    if (!upstream.ok) return placeholderResponse(`upstream_${upstream.status}`);

    const ct = upstream.headers.get("content-type") ?? "image/jpeg";
    const buf = await upstream.arrayBuffer();
    return new Response(buf, {
      status: 200,
      headers: {
        "Content-Type": ct,
        // Cache corto: las URLs Meta CDN ya tienen expire propio; permitimos
        // re-fetch del navegador a 10 min para no martillar.
        "Cache-Control": "private, max-age=600",
      },
    });
  } catch {
    return placeholderResponse("internal_error");
  }
}
