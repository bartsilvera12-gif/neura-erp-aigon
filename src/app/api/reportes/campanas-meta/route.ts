import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { toCalendarDateStr } from "@/lib/fechas/calendario";
import {
  inferirRedSocial,
  type RedSocial,
  type RedSocialBreakdown,
} from "@/lib/reportes/red-social";

/**
 * GET /api/reportes/campanas-meta?desde=YYYY-MM-DD&hasta=YYYY-MM-DD&meta_ad_id=&outcome=&channel_id=&red_social=
 *
 * KPIs y tabla por anuncio CTWA. La métrica principal son CONVERSACIONES ÚNICAS
 * (no mensajes). La tabla `chat_conversation_attribution` ya es 1:1 con
 * conversaciones — cada fila = 1 conversación atribuida — por lo que el conteo
 * es directo.
 *
 * Soporta provider `meta` y `ycloud` (cada fila ya implica que la campaña es
 * Meta; el `provider` solo distingue el canal de entrega del mensaje).
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function defaultRange(): { desde: string; hasta: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const mm = String(m + 1).padStart(2, "0");
  const lastDay = new Date(y, m + 1, 0).getDate();
  return { desde: `${y}-${mm}-01`, hasta: `${y}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

function plusOneDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

type AnyRow = Record<string, unknown>;

async function safe<T = AnyRow[]>(
  run: () => Promise<{ data: unknown; error: unknown }>,
  fallback: T
): Promise<{ rows: T; err: string | null }> {
  try {
    const { data, error } = await run();
    if (error) {
      const msg = (error as { message?: string })?.message ?? "unknown";
      return { rows: fallback, err: msg };
    }
    return { rows: (data as T) ?? fallback, err: null };
  } catch (e) {
    return { rows: fallback, err: e instanceof Error ? e.message : "unknown" };
  }
}

/** `.in()` batcheado anti-502 Cloudflare (mismo patrón de /api/pagos). */
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
      console.error(`[api/reportes/campanas-meta] ${table} batch ${i / batchSize}:`, error.message);
      continue;
    }
    for (const r of (data as T[] | null | undefined) ?? []) rows.push(r);
  }
  return rows;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { auth, supabase } = ctx;
    const empresaId = auth.empresa_id;

    const { searchParams } = new URL(request.url);
    const def = defaultRange();
    const dRaw = toCalendarDateStr(searchParams.get("desde") ?? "");
    const hRaw = toCalendarDateStr(searchParams.get("hasta") ?? "");
    const desde = DATE_RE.test(dRaw) ? dRaw : def.desde;
    const hasta = DATE_RE.test(hRaw) ? hRaw : def.hasta;
    const hastaEx = plusOneDay(hasta);

    const fAdId = (searchParams.get("meta_ad_id") ?? "").trim() || null;
    const fOutcome = (searchParams.get("outcome") ?? "").trim() || null;
    const fChannel = (searchParams.get("channel_id") ?? "").trim() || null;
    const fRed = (searchParams.get("red_social") ?? "").trim() || null;

    // 1) Atribuciones del período (1 fila = 1 conversación)
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
      meta_campaign_id: string | null;
      meta_campaign_name: string | null;
      meta_ad_name: string | null;
      first_message_at: string;
    };

    let attrQuery = supabase
      .from("chat_conversation_attribution")
      .select(
        "conversation_id, contact_id, channel_id, meta_ad_id, meta_source_type, meta_source_url, meta_headline, meta_body, meta_media_type, meta_image_url, meta_video_url, meta_thumbnail_url, meta_campaign_id, meta_campaign_name, meta_ad_name, first_message_at"
      )
      .eq("empresa_id", empresaId)
      .gte("first_message_at", `${desde}T00:00:00Z`)
      .lt("first_message_at", `${hastaEx}T00:00:00Z`);
    if (fAdId) attrQuery = attrQuery.eq("meta_ad_id", fAdId);
    if (fChannel) attrQuery = attrQuery.eq("channel_id", fChannel);

    const { rows: attribucionesRaw, err: errAttr } = await safe<AttrRow[]>(() => attrQuery, []);

    const tablaPendiente =
      Boolean(errAttr) &&
      String(errAttr).toLowerCase().match(/does not exist|relation|404|not found/);

    // Filtro por red social: aplicado sobre las atribuciones base (red_social no es
    // columna, se infiere de source_url) para que TODOS los derivados —KPIs,
    // breakdown y tabla— queden consistentes con el filtro.
    const attribuciones =
      fRed && (fRed === "instagram" || fRed === "facebook" || fRed === "no_identificado")
        ? attribucionesRaw.filter((a) => inferirRedSocial(a.meta_source_url) === fRed)
        : attribucionesRaw;

    const conversationIds = attribuciones.map((a) => a.conversation_id);

    // 2) Mensajes (solo para mostrar como dato secundario en drill-down — NO es KPI principal)
    let totalMensajes = 0;
    const mensajesPorConv = new Map<string, number>();
    const lastMsgByConv = new Map<string, string>();
    if (conversationIds.length > 0) {
      const msgs = await selectInBatches<{ conversation_id: string; id: string; created_at: string }>(
        supabase,
        "chat_messages",
        "id, conversation_id, created_at",
        "conversation_id",
        conversationIds
      );
      for (const m of msgs) {
        totalMensajes++;
        mensajesPorConv.set(m.conversation_id, (mensajesPorConv.get(m.conversation_id) ?? 0) + 1);
        const prev = lastMsgByConv.get(m.conversation_id);
        if (!prev || m.created_at > prev) lastMsgByConv.set(m.conversation_id, m.created_at);
      }
    }

    // 3) Cierres
    type ClosureRow = {
      conversation_id: string;
      closure_state_label: string | null;
      closure_substate_label: string | null;
      queue_id: string | null;
      closed_at: string | null;
    };
    let cierres: ClosureRow[] = [];
    if (conversationIds.length > 0) {
      cierres = await selectInBatches<ClosureRow>(
        supabase,
        "chat_conversation_closures",
        "conversation_id, closure_state_label, closure_substate_label, queue_id, closed_at",
        "conversation_id",
        conversationIds
      );
    }
    const cierrePorConv = new Map<string, ClosureRow>();
    for (const c of cierres) {
      const prev = cierrePorConv.get(c.conversation_id);
      const t = c.closed_at ? new Date(c.closed_at).getTime() : 0;
      const tp = prev?.closed_at ? new Date(prev.closed_at).getTime() : -1;
      if (!prev || t > tp) cierrePorConv.set(c.conversation_id, c);
    }

    // 4) Mapeo outcome
    const { rows: mapeos } = await safe<
      Array<{
        queue_id: string | null;
        closure_state_label: string;
        closure_substate_label: string | null;
        outcome_type: string;
      }>
    >(
      () =>
        supabase
          .from("empresa_outcome_mapping")
          .select("queue_id, closure_state_label, closure_substate_label, outcome_type")
          .eq("empresa_id", empresaId),
      []
    );

    function outcomeFor(c: ClosureRow | undefined): string {
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

    // 5) Leads únicos: prospecto por first_conversation_id + fallback por teléfono
    const prospFromConv = await selectInBatches<{
      id: string;
      first_conversation_id: string;
      fecha_creacion: string;
    }>(
      supabase,
      "crm_prospectos",
      "id, first_conversation_id, fecha_creacion",
      "first_conversation_id",
      conversationIds
    );
    const leadsNuevosSet = new Set<string>();
    for (const p of prospFromConv) {
      if (!p.fecha_creacion) continue;
      const t = new Date(p.fecha_creacion).getTime();
      const i = new Date(`${desde}T00:00:00Z`).getTime();
      const f = new Date(`${hastaEx}T00:00:00Z`).getTime();
      if (t >= i && t < f) leadsNuevosSet.add(p.first_conversation_id);
    }

    type ContactRow = { id: string; phone_number: string | null };
    const contactIds = [
      ...new Set(attribuciones.map((a) => a.contact_id).filter((x): x is string => Boolean(x))),
    ];
    const contacts = contactIds.length
      ? await selectInBatches<ContactRow>(
          supabase,
          "chat_contacts",
          "id, phone_number",
          "id",
          contactIds
        )
      : [];
    const phoneByContact = new Map<string, string>();
    for (const c of contacts) {
      if (c.phone_number) phoneByContact.set(c.id, String(c.phone_number).replace(/\D/g, ""));
    }
    const phonesAtribuidos = new Set(
      attribuciones
        .map((a) => (a.contact_id ? phoneByContact.get(a.contact_id) : null))
        .filter((x): x is string => Boolean(x))
    );
    if (phonesAtribuidos.size > 0) {
      const { rows: prospWhats } = await safe<
        Array<{ id: string; telefono: string | null; fecha_creacion: string }>
      >(
        () =>
          supabase
            .from("crm_prospectos")
            .select("id, telefono, fecha_creacion")
            .eq("empresa_id", empresaId)
            .eq("origen_creacion", "whatsapp")
            .gte("fecha_creacion", `${desde}T00:00:00Z`)
            .lt("fecha_creacion", `${hastaEx}T00:00:00Z`),
        []
      );
      const phonesProsp = new Set<string>();
      for (const p of prospWhats) {
        const ph = String(p.telefono ?? "").replace(/\D/g, "");
        if (ph) phonesProsp.add(ph);
      }
      for (const a of attribuciones) {
        const ph = a.contact_id ? phoneByContact.get(a.contact_id) : null;
        if (ph && phonesProsp.has(ph)) leadsNuevosSet.add(a.conversation_id);
      }
    }

    // 6) Agregado por anuncio (clave = meta_ad_id, fallback source_url para post tipo)
    type Agg = {
      key: string;
      meta_ad_id: string | null;
      meta_ad_name: string | null;
      meta_campaign_id: string | null;
      meta_campaign_name: string | null;
      headline: string | null;
      body: string | null;
      source_type: string | null;
      source_url: string | null;
      media_type: string | null;
      image_url: string | null;
      thumbnail_url: string | null;
      red_social: RedSocial;
      // Métricas centradas en únicos
      conversaciones: number;
      leads_nuevos: number;
      tipificadas: number;
      calificadas: number;
      conversiones: number;
      perdidas: number;
      no_respuesta: number;
      reclamos: number;
      // Mensajes como dato secundario (no se ordena por esto)
      mensajes: number;
      ultima_actividad: string | null;
    };
    const aggs = new Map<string, Agg>();
    const outcomesPorConv = new Map<string, string>();
    for (const a of attribuciones) {
      const key = a.meta_ad_id ?? `url:${a.meta_source_url ?? ""}`;
      let agg = aggs.get(key);
      if (!agg) {
        agg = {
          key,
          meta_ad_id: a.meta_ad_id,
          meta_ad_name: a.meta_ad_name,
          meta_campaign_id: a.meta_campaign_id,
          meta_campaign_name: a.meta_campaign_name,
          headline: a.meta_headline,
          body: a.meta_body,
          source_type: a.meta_source_type,
          source_url: a.meta_source_url,
          media_type: a.meta_media_type,
          image_url: a.meta_image_url,
          thumbnail_url: a.meta_thumbnail_url,
          red_social: inferirRedSocial(a.meta_source_url),
          conversaciones: 0,
          leads_nuevos: 0,
          tipificadas: 0,
          calificadas: 0,
          conversiones: 0,
          perdidas: 0,
          no_respuesta: 0,
          reclamos: 0,
          mensajes: 0,
          ultima_actividad: null,
        };
        aggs.set(key, agg);
      }
      agg.conversaciones += 1;
      agg.mensajes += mensajesPorConv.get(a.conversation_id) ?? 0;
      if (leadsNuevosSet.has(a.conversation_id)) agg.leads_nuevos += 1;
      const cierre = cierrePorConv.get(a.conversation_id);
      const oc = outcomeFor(cierre);
      outcomesPorConv.set(a.conversation_id, oc);
      if (cierre) {
        agg.tipificadas += 1;
        const t = cierre.closed_at ? new Date(cierre.closed_at).getTime() : 0;
        const ta = agg.ultima_actividad ? new Date(agg.ultima_actividad).getTime() : 0;
        if (t > ta) agg.ultima_actividad = cierre.closed_at;
      }
      // Última actividad: máximo entre cierre y último mensaje de la conv
      const lm = lastMsgByConv.get(a.conversation_id);
      if (lm) {
        const t = new Date(lm).getTime();
        const ta = agg.ultima_actividad ? new Date(agg.ultima_actividad).getTime() : 0;
        if (t > ta) agg.ultima_actividad = lm;
      }
      if (oc === "qualified_lead") agg.calificadas += 1;
      if (oc === "conversion") agg.conversiones += 1;
      if (oc === "lost") agg.perdidas += 1;
      if (oc === "no_response") agg.no_respuesta += 1;
      if (oc === "claim") agg.reclamos += 1;
    }

    // Filtros finales aplicados al agregado
    let campanasArr = [...aggs.values()];
    if (fOutcome) {
      const k =
        fOutcome === "qualified_lead"
          ? "calificadas"
          : fOutcome === "conversion"
            ? "conversiones"
            : fOutcome === "lost"
              ? "perdidas"
              : fOutcome === "no_response"
                ? "no_respuesta"
                : fOutcome === "claim"
                  ? "reclamos"
                  : null;
      if (k)
        campanasArr = campanasArr.filter(
          (c) => (c as unknown as Record<string, number>)[k] > 0
        );
    }
    // (El filtro red_social ya se aplicó sobre `attribuciones` base — no re-filtrar acá.)

    // Orden por conversaciones únicas desc (no por mensajes)
    const campanas = campanasArr
      .map((c) => ({
        ...c,
        tasa_conversion: c.conversaciones > 0 ? c.conversiones / c.conversaciones : 0,
      }))
      .sort(
        (a, b) =>
          b.conversiones - a.conversiones ||
          b.conversaciones - a.conversaciones ||
          b.tasa_conversion - a.tasa_conversion
      );

    // 7) KPIs centrados en únicos
    const conversaciones_atribuidas = attribuciones.length;
    const tipificadas = [...outcomesPorConv.values()].filter((o) => o !== "pending").length;
    const calificadas = [...outcomesPorConv.values()].filter((o) => o === "qualified_lead").length;
    const conversiones = [...outcomesPorConv.values()].filter((o) => o === "conversion").length;
    const tasa_conversion =
      conversaciones_atribuidas > 0 ? conversiones / conversaciones_atribuidas : 0;
    const tasa_conversion_tipificadas = tipificadas > 0 ? conversiones / tipificadas : 0;
    const mejor = campanas[0] ?? null;

    // 8) Breakdown por red social — siempre sobre el total del período (attribucionesRaw),
    //    independiente del filtro red_social activo, para mostrar la distribución completa.
    const breakdown_red_social: RedSocialBreakdown = {
      instagram: 0,
      facebook: 0,
      no_identificado: 0,
    };
    for (const a of attribucionesRaw) {
      const r = inferirRedSocial(a.meta_source_url);
      breakdown_red_social[r] += 1;
    }

    return NextResponse.json(
      successResponse({
        periodo: { desde, hasta },
        kpis: {
          // Conversaciones únicas como métrica principal
          conversaciones_atribuidas,
          leads_nuevos: leadsNuevosSet.size,
          tipificadas,
          calificadas,
          conversiones,
          tasa_conversion,
          tasa_conversion_tipificadas,
          mejor_campana: mejor
            ? {
                meta_ad_id: mejor.meta_ad_id,
                headline: mejor.headline,
                tasa: mejor.tasa_conversion,
                conversaciones: mejor.conversaciones,
                conversiones: mejor.conversiones,
                red_social: mejor.red_social,
              }
            : null,
          // Mensajes queda como dato secundario (útil para drill-down)
          mensajes_atribuidos: totalMensajes,
        },
        breakdown_red_social,
        campanas,
        meta: {
          tabla_atribucion_disponible: !tablaPendiente,
          outcome_mapping_definido: mapeos.length > 0,
          canales_meta_count: new Set(
            attribuciones.map((a) => a.channel_id).filter(Boolean)
          ).size,
          red_social_signal: "source_url_domain",
          red_social_doc:
            "Inferido por dominio de meta_source_url. YCloud no entrega publisher_platform/placement. Para precisión total (audience network, breakdown costo/ROAS) hay que integrar Meta Marketing API.",
          conteos: {
            atribuciones_periodo: conversaciones_atribuidas,
            cierres_encontrados: cierres.length,
            mapeos_configurados: mapeos.length,
          },
          warnings: [
            ...(tablaPendiente
              ? ["Aplicá la migración chat_conversation_attribution para empezar a registrar atribución."]
              : []),
            ...(mapeos.length === 0
              ? ["No hay mapeo de tipificaciones a outcome. Las conversaciones tipificadas se reportarán como 'other'."]
              : []),
          ],
        },
      })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
