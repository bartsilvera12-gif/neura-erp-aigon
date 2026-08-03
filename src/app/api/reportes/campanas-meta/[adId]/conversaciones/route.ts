import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { inferirRedSocial } from "@/lib/reportes/red-social";

/**
 * GET /api/reportes/campanas-meta/{adId}/conversaciones
 *
 * Detalle de un anuncio CTWA: header del anuncio + lista de conversaciones
 * atribuidas con su contacto, prospecto CRM y cierre (si existe).
 *
 * `adId` puede ser:
 *  - un `meta_ad_id` real (formato `120xxxxxxxxxx`)
 *  - el fallback `url:<source_url>` para anuncios sin `source_id` (p.ej. tipo `post`)
 */

type AnyRow = Record<string, unknown>;

async function selectInBatches<T = AnyRow>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  table: string,
  columns: string,
  col: string,
  ids: string[],
  batchSize = 25
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const slice = ids.slice(i, i + batchSize);
    const { data, error } = await supabase.from(table).select(columns).in(col, slice);
    if (error) {
      console.error(`[api/reportes/campanas-meta/detail] ${table}:`, error.message);
      continue;
    }
    for (const r of (data as T[] | null | undefined) ?? []) rows.push(r);
  }
  return rows;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ adId: string }> }
) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { auth, supabase } = ctx;
    const empresaId = auth.empresa_id;
    const { adId } = await params;
    const decoded = decodeURIComponent(adId).trim();
    if (!decoded) {
      return NextResponse.json(errorResponse("Falta adId."), { status: 400 });
    }

    // Detectar fallback url:<source_url>
    const isUrlFallback = decoded.startsWith("url:");
    const targetAdId = isUrlFallback ? null : decoded;
    const targetSourceUrl = isUrlFallback ? decoded.slice(4) : null;

    // 1) Atribuciones del anuncio
    type AttrRow = {
      conversation_id: string;
      contact_id: string | null;
      channel_id: string | null;
      meta_ad_id: string | null;
      meta_source_type: string | null;
      meta_source_url: string | null;
      meta_headline: string | null;
      meta_body: string | null;
      meta_media_type: string | null;
      meta_image_url: string | null;
      meta_video_url: string | null;
      meta_thumbnail_url: string | null;
      meta_ad_name: string | null;
      first_message_at: string;
    };

    let q = supabase
      .from("chat_conversation_attribution")
      .select(
        "conversation_id, contact_id, channel_id, meta_ad_id, meta_source_type, meta_source_url, meta_headline, meta_body, meta_media_type, meta_image_url, meta_video_url, meta_thumbnail_url, meta_ad_name, first_message_at"
      )
      .eq("empresa_id", empresaId)
      .order("first_message_at", { ascending: false })
      .limit(500);
    if (targetAdId) q = q.eq("meta_ad_id", targetAdId);
    else if (targetSourceUrl) q = q.eq("meta_source_url", targetSourceUrl).is("meta_ad_id", null);

    const { data: attribuciones, error: errAttr } = await q;
    if (errAttr) {
      return NextResponse.json(errorResponse(errAttr.message), { status: 400 });
    }
    const atts = (attribuciones ?? []) as AttrRow[];
    if (atts.length === 0) {
      return NextResponse.json(
        successResponse({
          anuncio: null,
          conversaciones: [],
          totales: { conversaciones: 0, leads: 0, tipificadas: 0, conversiones: 0 },
        })
      );
    }

    // Header del anuncio (primera fila como representativa)
    const first = atts[0]!;
    const anuncio = {
      meta_ad_id: first.meta_ad_id,
      meta_ad_name: first.meta_ad_name,
      headline: first.meta_headline,
      body: first.meta_body,
      source_type: first.meta_source_type,
      source_url: first.meta_source_url,
      media_type: first.meta_media_type,
      image_url: first.meta_image_url,
      video_url: first.meta_video_url,
      thumbnail_url: first.meta_thumbnail_url,
      red_social: inferirRedSocial(first.meta_source_url),
    };

    const conversationIds = atts.map((a) => a.conversation_id);
    const contactIds = [
      ...new Set(atts.map((a) => a.contact_id).filter((x): x is string => Boolean(x))),
    ];

    // 2) Contactos
    const contacts = await selectInBatches<{
      id: string;
      phone_number: string | null;
      name: string | null;
      crm_prospecto_id: string | null;
    }>(supabase, "chat_contacts", "id, phone_number, name, crm_prospecto_id", "id", contactIds);
    const contactById = new Map<
      string,
      { phone_number: string | null; name: string | null; crm_prospecto_id: string | null }
    >();
    for (const c of contacts) {
      contactById.set(c.id, {
        phone_number: c.phone_number,
        name: c.name,
        crm_prospecto_id: c.crm_prospecto_id,
      });
    }

    // 3) Prospectos CRM
    const prospIds = [
      ...new Set(
        Array.from(contactById.values())
          .map((c) => c.crm_prospecto_id)
          .filter((x): x is string => Boolean(x))
      ),
    ];
    const prospectos = prospIds.length
      ? await selectInBatches<{
          id: string;
          numero_control: string | null;
          contacto: string | null;
        }>(supabase, "crm_prospectos", "id, numero_control, contacto", "id", prospIds)
      : [];
    const prospById = new Map(prospectos.map((p) => [p.id, p]));

    // 4) Cierres por conversación
    const cierres = await selectInBatches<{
      conversation_id: string;
      closure_state_label: string | null;
      closure_substate_label: string | null;
      queue_id: string | null;
      closed_at: string | null;
    }>(
      supabase,
      "chat_conversation_closures",
      "conversation_id, closure_state_label, closure_substate_label, queue_id, closed_at",
      "conversation_id",
      conversationIds
    );
    const cierreByConv = new Map<string, (typeof cierres)[number]>();
    for (const c of cierres) {
      const prev = cierreByConv.get(c.conversation_id);
      const t = c.closed_at ? new Date(c.closed_at).getTime() : 0;
      const tp = prev?.closed_at ? new Date(prev.closed_at).getTime() : -1;
      if (!prev || t > tp) cierreByConv.set(c.conversation_id, c);
    }

    // 5) Mapeo outcome
    const { data: mapeosData } = await supabase
      .from("empresa_outcome_mapping")
      .select("queue_id, closure_state_label, closure_substate_label, outcome_type")
      .eq("empresa_id", empresaId);
    const mapeos =
      (mapeosData as Array<{
        queue_id: string | null;
        closure_state_label: string;
        closure_substate_label: string | null;
        outcome_type: string;
      }> | null) ?? [];
    function outcomeFor(c: (typeof cierres)[number] | undefined): string {
      if (!c || !c.closure_state_label) return "pending";
      const key = (st: string, sb: string | null, q: string | null) =>
        `${q ?? "_"}|${st}|${sb ?? "_"}`;
      const candidatos = [
        key(c.closure_state_label, c.closure_substate_label, c.queue_id),
        key(c.closure_state_label, null, c.queue_id),
        key(c.closure_state_label, c.closure_substate_label, null),
        key(c.closure_state_label, null, null),
      ];
      const map = new Map<string, string>();
      for (const m of mapeos) {
        map.set(key(m.closure_state_label, m.closure_substate_label, m.queue_id), m.outcome_type);
      }
      for (const k of candidatos) {
        const v = map.get(k);
        if (v) return v;
      }
      return "other";
    }

    // 6) Mensajes por conversación: count + first/last (sin payload completo)
    const msgs = await selectInBatches<{
      conversation_id: string;
      id: string;
      created_at: string;
      from_me: boolean;
    }>(supabase, "chat_messages", "id, conversation_id, created_at, from_me", "conversation_id", conversationIds);
    const statByConv = new Map<
      string,
      { count: number; first: string | null; last: string | null }
    >();
    for (const m of msgs) {
      const cur = statByConv.get(m.conversation_id) ?? { count: 0, first: null, last: null };
      cur.count += 1;
      if (!cur.first || m.created_at < cur.first) cur.first = m.created_at;
      if (!cur.last || m.created_at > cur.last) cur.last = m.created_at;
      statByConv.set(m.conversation_id, cur);
    }

    // 7) Armado del listado
    const conversaciones = atts.map((a) => {
      const ct = a.contact_id ? contactById.get(a.contact_id) : undefined;
      const prosp = ct?.crm_prospecto_id ? prospById.get(ct.crm_prospecto_id) : undefined;
      const cierre = cierreByConv.get(a.conversation_id);
      const outcome = outcomeFor(cierre);
      const stat = statByConv.get(a.conversation_id);
      return {
        conversation_id: a.conversation_id,
        contact_id: a.contact_id,
        nombre: ct?.name ?? null,
        telefono: ct?.phone_number ?? null,
        prospecto_id: ct?.crm_prospecto_id ?? null,
        numero_control: prosp?.numero_control ?? null,
        prospecto_contacto: prosp?.contacto ?? null,
        first_message_at: stat?.first ?? a.first_message_at,
        last_message_at: stat?.last ?? null,
        message_count: stat?.count ?? 0,
        cierre_estado: cierre?.closure_state_label ?? null,
        cierre_substate: cierre?.closure_substate_label ?? null,
        cerrado_at: cierre?.closed_at ?? null,
        outcome,
      };
    });

    const totales = {
      conversaciones: conversaciones.length,
      leads: conversaciones.filter((c) => c.prospecto_id).length,
      tipificadas: conversaciones.filter((c) => c.cierre_estado).length,
      conversiones: conversaciones.filter((c) => c.outcome === "conversion").length,
    };

    return NextResponse.json(successResponse({ anuncio, conversaciones, totales }));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
