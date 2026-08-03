"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Search, X, RefreshCw, Filter, Copy, Tag as TagIcon, Send, ChevronRight, ChevronLeft, AlertTriangle } from "lucide-react";

/**
 * Etiquetas Automáticas - Pantalla productiva.
 * Fuente única: conversaciones con `current_tag_id` vigente (estado real).
 * No expone snapshots, dry_run, run_keys, batches ni acciones técnicas.
 */

interface AvailableTag {
  tag_code: string;
  tag_label: string;
  color: string | null;
  sort_order: number;
}

interface ByCurrentTagRow {
  tag_code: string;
  tag_label: string;
  n: number;
}

interface CountersResponse {
  ok: boolean;
  counters?: {
    hidden_by_tag_total: number;
    current_tag_total: number;
  };
  by_current_tag?: ByCurrentTagRow[];
  available_tags?: AvailableTag[];
}

interface CurrentTagRow {
  conversation_id: string;
  contact_id: string | null;
  tag_code: string;
  tag_label: string;
  phone: string | null;
  contact_name: string | null;
  last_message_at: string | null;
  last_tagged_at: string | null;
  days_idle: number | null;
}

interface CurrentResponse {
  ok: boolean;
  error?: string;
  pagination?: { limit: number; offset: number; total: number };
  rows?: CurrentTagRow[];
}

interface ConversationPreviewMessage {
  id: string;
  from_me: boolean;
  sender_type: string | null;
  message_type: string | null;
  content: string | null;
  created_at: string | null;
  whatsapp_delivery_status: string | null;
}

interface ConversationPreviewResponse {
  ok: boolean;
  error?: string;
  conversation?: {
    conversation_id: string;
    status: string | null;
    flow_current_node: string | null;
    last_message_at: string | null;
    contact: {
      contact_id: string | null;
      name: string | null;
      phone: string | null;
      phone_masked: string | null;
    };
  };
  messages?: ConversationPreviewMessage[];
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("es-PY", { dateStyle: "short", timeStyle: "short" });
}

const TAG_COLOR: Record<string, string> = {
  compro_varias: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  compro_boleta: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  comprobante_pendiente: "bg-amber-50 text-amber-800 ring-1 ring-amber-200",
  datos_incompletos: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
  no_compro: "bg-rose-50 text-rose-700 ring-1 ring-rose-200",
  recomprador: "bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200",
  abandonado: "bg-slate-100 text-slate-700 ring-1 ring-slate-200",
};

function tagPillClass(code: string): string {
  return TAG_COLOR[code] ?? "bg-slate-100 text-slate-700 ring-1 ring-slate-200";
}

const INPUT_CN =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";
const SELECT_CN =
  "w-full appearance-none rounded-xl border border-slate-200 bg-white px-3 py-2 pr-8 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";
const BTN_PRIMARY_CN =
  "inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91] disabled:opacity-50";
const BTN_SECONDARY_CN =
  "inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/5 hover:text-[#3F8E91] disabled:opacity-50";

// ETQ-CAMP-3: tipos del modal de campaña.
interface CampanaTemplate {
  id: string;
  channel_id: string;
  provider: string;
  name: string;
  language: string;
  category: string | null;
  status: string;
  components_json?: unknown;
}

interface AudiencePreviewResp {
  ok: boolean;
  error?: string;
  tag_code: string;
  tag_label: string;
  total_conversations: number;
  total_unique_phones: number;
  valid_phone_count: number;
  invalid_phone_count: number;
  outside_24h_count: number;
  reactivated_excluded_count: number;
  human_excluded_count: number;
  recent_inbound_excluded_count: number;
  duplicate_phone_count: number;
  sample_recipients: Array<{
    contact_id: string | null;
    conversation_id: string;
    contact_name: string | null;
    phone_number: string | null;
    days_idle: number | null;
  }>;
  warnings: Array<{ code: string; message: string }>;
}

function templateHasHeaderImage(components: unknown): boolean {
  if (!Array.isArray(components)) return false;
  for (const c of components) {
    if (
      c &&
      typeof c === "object" &&
      String((c as Record<string, unknown>).type ?? "").toUpperCase() === "HEADER" &&
      String((c as Record<string, unknown>).format ?? "").toUpperCase() === "IMAGE"
    ) {
      return true;
    }
  }
  return false;
}

export default function EtiquetasClient() {
  // Filtros (estado de inputs).
  const [tagCode, setTagCode] = useState("");
  const [phone, setPhone] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const [limit] = useState(50);
  const [offset, setOffset] = useState(0);

  // Data
  const [availableTags, setAvailableTags] = useState<AvailableTag[]>([]);
  const [byCurrentTag, setByCurrentTag] = useState<ByCurrentTagRow[]>([]);
  const [totalEtiquetadas, setTotalEtiquetadas] = useState(0);
  const [rows, setRows] = useState<CurrentTagRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [hasSearched, setHasSearched] = useState(false);
  const [appliedFilters, setAppliedFilters] = useState<{
    tagCode: string; phone: string; dateFrom: string; dateTo: string;
  } | null>(null);

  // Modal
  const [modalConvId, setModalConvId] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalData, setModalData] = useState<ConversationPreviewResponse | null>(null);

  // ETQ-CAMP-3: Modal "Crear campaña desde etiqueta".
  const router = useRouter();
  const [campModalOpen, setCampModalOpen] = useState(false);
  const [campStep, setCampStep] = useState<1 | 2 | 3>(1);
  const [campTagCode, setCampTagCode] = useState("");
  const [campTemplates, setCampTemplates] = useState<CampanaTemplate[]>([]);
  const [campTemplatesLoading, setCampTemplatesLoading] = useState(false);
  const [campTemplatesSyncing, setCampTemplatesSyncing] = useState(false);
  const [campTemplatesSyncNotice, setCampTemplatesSyncNotice] = useState<string | null>(null);
  const [campTemplateId, setCampTemplateId] = useState("");
  const [campHeaderImageUrl, setCampHeaderImageUrl] = useState("");
  const [campCampaignName, setCampCampaignName] = useState("");
  const [campAudience, setCampAudience] = useState<AudiencePreviewResp | null>(null);
  const [campAudienceLoading, setCampAudienceLoading] = useState(false);
  const [campError, setCampError] = useState<string | null>(null);
  const [campSubmitting, setCampSubmitting] = useState(false);
  const [campSuccess, setCampSuccess] = useState<{
    campaign_id: string;
    redirect_to: string;
    total_recipients: number;
    valid_recipients: number;
    invalid_recipients: number;
  } | null>(null);

  const filtersActiveCount = useMemo(() => {
    let n = 0;
    if (tagCode) n++;
    if (phone) n++;
    if (dateFrom) n++;
    if (dateTo) n++;
    return n;
  }, [tagCode, phone, dateFrom, dateTo]);

  // Counters (live)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/chat/tags/counters`, { cache: "no-store" });
        const json: CountersResponse = await res.json();
        if (cancelled || !json.ok) return;
        setAvailableTags(json.available_tags ?? []);
        setByCurrentTag(json.by_current_tag ?? []);
        setTotalEtiquetadas(json.counters?.current_tag_total ?? json.counters?.hidden_by_tag_total ?? 0);
      } catch {
        /* counters opcionales */
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const buildQuery = useCallback(
    (f: { tagCode: string; phone: string; dateFrom: string; dateTo: string }, off: number) => {
      const sp = new URLSearchParams();
      if (f.tagCode) sp.set("tag_code", f.tagCode);
      if (f.phone) sp.set("phone", f.phone);
      if (f.dateFrom) sp.set("date_from", f.dateFrom);
      if (f.dateTo) sp.set("date_to", f.dateTo);
      sp.set("limit", String(limit));
      sp.set("offset", String(off));
      return sp.toString();
    },
    [limit]
  );

  const fetchData = useCallback(
    async (f: { tagCode: string; phone: string; dateFrom: string; dateTo: string }, off: number) => {
      setLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/chat/tags/current?${buildQuery(f, off)}`, { cache: "no-store" });
        const json: CurrentResponse = await res.json();
        if (!json.ok) {
          setError(json.error || "Error al cargar");
          setRows([]);
          setTotal(0);
          return;
        }
        setRows(json.rows ?? []);
        setTotal(json.pagination?.total ?? 0);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error inesperado");
      } finally {
        setLoading(false);
      }
    },
    [buildQuery]
  );

  const handleSearch = useCallback(() => {
    if (filtersActiveCount === 0) {
      setError("Elegí al menos un filtro para consultar.");
      return;
    }
    const next = { tagCode, phone, dateFrom, dateTo };
    setAppliedFilters(next);
    setOffset(0);
    setHasSearched(true);
    void fetchData(next, 0);
  }, [filtersActiveCount, tagCode, phone, dateFrom, dateTo, fetchData]);

  const handleReload = useCallback(() => {
    if (!appliedFilters) {
      setError("Aplicá un filtro primero.");
      return;
    }
    void fetchData(appliedFilters, offset);
  }, [appliedFilters, offset, fetchData]);

  const handlePage = useCallback(
    (newOffset: number) => {
      if (!appliedFilters) return;
      setOffset(newOffset);
      void fetchData(appliedFilters, newOffset);
    },
    [appliedFilters, fetchData]
  );

  const resetFilters = useCallback(() => {
    setTagCode("");
    setPhone("");
    setDateFrom("");
    setDateTo("");
    setOffset(0);
    setAppliedFilters(null);
    setRows([]);
    setTotal(0);
    setHasSearched(false);
    setError(null);
  }, []);

  const openModal = useCallback(async (conversationId: string) => {
    setModalConvId(conversationId);
    setModalData(null);
    setModalError(null);
    setModalLoading(true);
    try {
      const res = await fetch(
        `/api/chat/tags/conversation-preview?conversation_id=${encodeURIComponent(conversationId)}&limit=50`,
        { cache: "no-store" }
      );
      const json: ConversationPreviewResponse = await res.json();
      if (!json.ok) setModalError(json.error || "Error al cargar conversación");
      else setModalData(json);
    } catch (e) {
      setModalError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setModalLoading(false);
    }
  }, []);

  const closeModal = useCallback(() => {
    setModalConvId(null);
    setModalData(null);
    setModalError(null);
  }, []);

  // Conteo por tag para cards (merge con catálogo).
  const cardData = useMemo(() => {
    const byCode = new Map(byCurrentTag.map((r) => [r.tag_code, r]));
    const cards: Array<{ tag_code: string; tag_label: string; n: number }> = [];
    // Orden estable según availableTags (sort_order del catálogo).
    for (const t of availableTags) {
      const found = byCode.get(t.tag_code);
      cards.push({ tag_code: t.tag_code, tag_label: t.tag_label, n: found?.n ?? 0 });
    }
    // Tags vigentes sin entrada en availableTags (raro): agregar al final.
    for (const r of byCurrentTag) {
      if (!availableTags.find((t) => t.tag_code === r.tag_code)) {
        cards.push(r);
      }
    }
    return cards;
  }, [byCurrentTag, availableTags]);

  // ETQ-CAMP-3: handlers del modal Crear campaña.
  const openCampaignModal = useCallback(() => {
    setCampStep(1);
    setCampTagCode(tagCode || "");
    setCampTemplateId("");
    setCampHeaderImageUrl("");
    setCampCampaignName("");
    setCampAudience(null);
    setCampError(null);
    setCampSuccess(null);
    setCampModalOpen(true);
  }, [tagCode]);

  const closeCampaignModal = useCallback(() => {
    setCampModalOpen(false);
  }, []);

  // Cuando entrás al paso 2, cargar templates aprobadas (cualquier canal Meta del tenant).
  // El backend filtra por channel_id; acá pedimos sin channel_id y filtramos client-side.
  // Templates ya vienen con channel_id; usamos el canal del template seleccionado al crear.
  // Estrategia: traer templates de todos los canales WhatsApp activos vía /api/campanas/options + /api/campanas/templates.
  const loadTemplates = useCallback(async () => {
    setCampTemplatesLoading(true);
    setCampError(null);
    try {
      // 1) Canales WhatsApp activos.
      const optsRes = await fetch(`/api/campanas/options`, { cache: "no-store" });
      const optsJson = (await optsRes.json()) as {
        ok?: boolean;
        data?: { channels?: Array<{ id: string; provider: string }> };
        error?: string;
      };
      if (!optsRes.ok || optsJson.ok === false) {
        setCampError(optsJson.error || "No se pudieron cargar los canales");
        return;
      }
      const channels = optsJson.data?.channels ?? [];
      if (channels.length === 0) {
        setCampError("No hay canales WhatsApp activos");
        return;
      }
      // 2) Templates aprobadas por cada canal (en paralelo, dedupe por template.id).
      const all = await Promise.all(
        channels.map(async (c) => {
          const r = await fetch(
            `/api/campanas/templates?channel_id=${encodeURIComponent(c.id)}`,
            { cache: "no-store" }
          );
          const j = (await r.json()) as { ok?: boolean; data?: CampanaTemplate[]; error?: string };
          return j.ok === false ? [] : j.data ?? [];
        })
      );
      const seen = new Set<string>();
      const merged: CampanaTemplate[] = [];
      for (const arr of all) {
        for (const t of arr) {
          if (!seen.has(t.id) && String(t.status).toUpperCase() === "APPROVED") {
            seen.add(t.id);
            merged.push(t);
          }
        }
      }
      setCampTemplates(merged);
    } catch (e) {
      setCampError(e instanceof Error ? e.message : "Error al cargar templates");
    } finally {
      setCampTemplatesLoading(false);
    }
  }, []);

  // ETQ-CAMP-FIX-1: refrescar plantillas pulleando de Meta para que aparezcan
  // las nuevas aprobaciones (sin esto, la DB local solo tiene las del último sync).
  const syncTemplatesFromMeta = useCallback(async () => {
    setCampTemplatesSyncing(true);
    setCampError(null);
    setCampTemplatesSyncNotice(null);
    try {
      const optsRes = await fetch(`/api/campanas/options`, { cache: "no-store" });
      const optsJson = (await optsRes.json()) as {
        ok?: boolean;
        data?: { channels?: Array<{ id: string; provider: string }> };
        error?: string;
      };
      if (!optsRes.ok || optsJson.ok === false) {
        setCampError(optsJson.error || "No se pudieron cargar los canales");
        return;
      }
      const channels = optsJson.data?.channels ?? [];
      if (channels.length === 0) {
        setCampError("No hay canales WhatsApp activos");
        return;
      }
      let totalFetched = 0;
      let totalInserted = 0;
      for (const c of channels) {
        const r = await fetch(`/api/campanas/templates/sync`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ channel_id: c.id }),
          cache: "no-store",
        });
        const j = (await r.json()) as {
          ok?: boolean;
          data?: { fetched?: number; inserted?: number };
          error?: string;
        };
        if (!r.ok || j.ok === false) {
          setCampError(j.error || `Error al sincronizar canal ${c.id.slice(0, 8)}`);
          return;
        }
        totalFetched += j.data?.fetched ?? 0;
        totalInserted += j.data?.inserted ?? 0;
      }
      setCampTemplatesSyncNotice(
        `Sincronizado: ${totalFetched} plantilla(s) encontrada(s), ${totalInserted} actualizada(s)/nueva(s).`
      );
      // Recargar la lista local de plantillas tras el sync.
      setCampTemplates([]);
    } catch (e) {
      setCampError(e instanceof Error ? e.message : "Error al sincronizar plantillas");
    } finally {
      setCampTemplatesSyncing(false);
    }
  }, []);

  const loadAudiencePreview = useCallback(async () => {
    if (!campTagCode) return;
    setCampAudienceLoading(true);
    setCampError(null);
    try {
      const sp = new URLSearchParams({
        tag_code: campTagCode,
        limit: "10",
        exclude_reactivated: "true",
        exclude_human_taken_over: "true",
        exclude_recent_inbound_hours: "24",
        dedupe_by_phone: "true",
      });
      const r = await fetch(`/api/chat/tags/audience-preview?${sp.toString()}`, { cache: "no-store" });
      const j = (await r.json()) as AudiencePreviewResp;
      if (!r.ok || (j as { ok?: boolean }).ok === false) {
        setCampError((j as { error?: string }).error || "No se pudo cargar audiencia");
        return;
      }
      setCampAudience(j);
    } catch (e) {
      setCampError(e instanceof Error ? e.message : "Error cargando audiencia");
    } finally {
      setCampAudienceLoading(false);
    }
  }, [campTagCode]);

  const selectedTemplate = useMemo(
    () => campTemplates.find((t) => t.id === campTemplateId) || null,
    [campTemplates, campTemplateId]
  );
  const selectedTemplateNeedsHeader = useMemo(
    () => (selectedTemplate ? templateHasHeaderImage(selectedTemplate.components_json) : false),
    [selectedTemplate]
  );

  const submitCampaign = useCallback(async () => {
    // ETQ-CAMP-FIX-3: guard contra doble-submit. Si ya hay success, no reintenta.
    if (campSubmitting || campSuccess) return;
    setCampSubmitting(true);
    setCampError(null);
    try {
      const body: Record<string, unknown> = {
        tag_code: campTagCode,
        template_id: campTemplateId,
        exclude_reactivated: true,
        exclude_human_taken_over: true,
        exclude_recent_inbound_hours: 24,
        dedupe_by_phone: true,
      };
      if (campCampaignName.trim()) body.campaign_name = campCampaignName.trim();
      if (selectedTemplateNeedsHeader) body.header_image_url = campHeaderImageUrl.trim();

      let r: Response;
      try {
        r = await fetch(`/api/chat/tags/create-campaign-from-tag`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        });
      } catch (netErr) {
        setCampError(netErr instanceof Error ? `Error de red: ${netErr.message}` : "Error de red");
        return;
      }

      let parsed: unknown;
      try {
        parsed = await r.json();
      } catch {
        setCampError(`Respuesta inválida del servidor (HTTP ${r.status}).`);
        return;
      }
      const j = (parsed ?? {}) as {
        ok?: boolean;
        data?: {
          campaign_id?: string;
          redirect_to?: string;
          total_recipients?: number;
          valid_recipients?: number;
          invalid_recipients?: number;
        };
        error?: string;
      };

      if (!r.ok || j.ok === false) {
        setCampError(j.error || `No se pudo crear la campaña (HTTP ${r.status}).`);
        return;
      }

      const campaignId = typeof j.data?.campaign_id === "string" ? j.data.campaign_id : "";
      if (!campaignId) {
        setCampError(
          "La campaña pudo haberse creado pero el servidor no devolvió ID. Revisá en /dashboard/campanas."
        );
        return;
      }
      const redirectTo =
        typeof j.data?.redirect_to === "string" && j.data.redirect_to
          ? j.data.redirect_to
          : `/dashboard/campanas/${campaignId}`;

      // Marcar éxito ANTES de navegar para que el link manual quede disponible si router.push falla.
      setCampSuccess({
        campaign_id: campaignId,
        redirect_to: redirectTo,
        total_recipients: Number(j.data?.total_recipients ?? 0),
        valid_recipients: Number(j.data?.valid_recipients ?? 0),
        invalid_recipients: Number(j.data?.invalid_recipients ?? 0),
      });

      // Navegar con try/catch; si falla, el banner muestra link manual.
      try {
        router.push(redirectTo);
      } catch (navErr) {
        // Sin throw: el usuario igual ve el banner con link.
        console.warn("[etiquetas] router.push falló, link manual disponible", navErr);
      }
    } catch (e) {
      // Catch-all: cualquier error inesperado lo mostramos como mensaje, no como crash.
      setCampError(e instanceof Error ? e.message : "Error al crear campaña");
    } finally {
      setCampSubmitting(false);
    }
  }, [
    campTagCode,
    campTemplateId,
    campCampaignName,
    campHeaderImageUrl,
    selectedTemplateNeedsHeader,
    router,
    campSubmitting,
    campSuccess,
  ]);

  // Auto-trigger: paso 2 → cargar templates; paso 3 → cargar audiencia.
  useEffect(() => {
    if (campModalOpen && campStep === 2 && campTemplates.length === 0 && !campTemplatesLoading) {
      void loadTemplates();
    }
    if (campModalOpen && campStep === 3 && !campAudience && !campAudienceLoading) {
      void loadAudiencePreview();
    }
  }, [campModalOpen, campStep, campTemplates.length, campTemplatesLoading, campAudience, campAudienceLoading, loadTemplates, loadAudiencePreview]);

  return (
    <div className="min-h-screen bg-slate-50 p-6">
      <header className="mb-5 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <span aria-hidden="true" className="block h-7 w-1.5 rounded-full bg-[#4FAEB2]" />
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Etiquetas Automáticas</h1>
            <p className="mt-1 text-sm text-slate-500">
              Consultá las conversaciones clasificadas automáticamente según el estado del WhatsApp.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="inline-flex max-w-md items-start gap-2 rounded-xl border border-[#4FAEB2]/30 bg-[#4FAEB2]/5 px-3 py-2 text-xs font-medium text-slate-700 shadow-sm">
            <TagIcon size={14} className="mt-0.5 shrink-0 text-[#4FAEB2]" />
            <span>
              Las conversaciones etiquetadas salen de Conversaciones. Si el cliente vuelve a escribir, reaparecen automáticamente.
            </span>
          </div>
          <button
            type="button"
            onClick={openCampaignModal}
            className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-600/25 transition-colors hover:bg-emerald-700"
            title="Crear campaña WhatsApp a partir de una etiqueta"
          >
            <Send size={14} />
            Crear campaña
          </button>
        </div>
      </header>

      {/* Cards: total + por etiqueta */}
      <section className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-2xl border border-[#4FAEB2]/45 bg-white p-4 shadow-sm">
          <div className="text-[11px] uppercase tracking-[0.1em] text-slate-500">Total etiquetadas</div>
          <div className="mt-1.5 text-2xl font-semibold text-slate-900">
            {totalEtiquetadas.toLocaleString("es-PY")}
          </div>
        </div>
        {cardData.map((c) => {
          const active = tagCode === c.tag_code;
          return (
            <button
              key={c.tag_code}
              onClick={() => {
                const next = c.tag_code === tagCode ? "" : c.tag_code;
                setTagCode(next);
                if (appliedFilters) {
                  const applied = { ...appliedFilters, tagCode: next };
                  setAppliedFilters(applied);
                  setOffset(0);
                  void fetchData(applied, 0);
                }
              }}
              className={`rounded-2xl border bg-white p-4 text-left shadow-sm transition-colors ${
                active
                  ? "border-[#4FAEB2] ring-2 ring-[#4FAEB2]/25"
                  : "border-slate-200 hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/5"
              }`}
              type="button"
            >
              <div className="text-[11px] uppercase tracking-[0.1em] text-slate-500">
                {c.tag_label || c.tag_code}
              </div>
              <div className="mt-1.5 text-2xl font-semibold text-slate-900">
                {c.n.toLocaleString("es-PY")}
              </div>
            </button>
          );
        })}
      </section>

      {/* Filtros */}
      <section className="mb-4 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="mb-3 flex items-center gap-2">
          <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]" />
          <h2 className="text-sm font-semibold text-slate-700">Filtros</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Etiqueta</label>
            <select
              value={tagCode}
              onChange={(e) => setTagCode(e.target.value)}
              className={SELECT_CN}
            >
              <option value="">Todas las etiquetas</option>
              {availableTags.map((t) => (
                <option key={t.tag_code} value={t.tag_code}>{t.tag_label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Teléfono / Número (parcial)</label>
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="Ej. 2713"
              className={INPUT_CN}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Último mensaje desde</label>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className={INPUT_CN}
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-600">Último mensaje hasta</label>
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className={INPUT_CN}
            />
          </div>
        </div>
      </section>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        <button
          onClick={handleSearch}
          className={BTN_PRIMARY_CN}
          type="button"
          disabled={loading || filtersActiveCount === 0}
          title={filtersActiveCount === 0 ? "Elegí al menos un filtro para consultar." : undefined}
        >
          <Filter size={14} />
          Buscar
        </button>
        <button
          onClick={handleReload}
          className={BTN_SECONDARY_CN}
          type="button"
          disabled={loading || !appliedFilters}
          title={!appliedFilters ? "Aplicá un filtro primero." : undefined}
        >
          <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          Recargar
        </button>
        <button
          onClick={resetFilters}
          className={BTN_SECONDARY_CN}
          type="button"
        >
          Limpiar filtros
        </button>
        <div className="ml-auto text-xs text-slate-500">
          {loading
            ? "Cargando…"
            : !hasSearched
              ? filtersActiveCount === 0
                ? "Elegí al menos un filtro y presioná Buscar."
                : `${filtersActiveCount} filtro(s) listos. Presioná Buscar.`
              : `Mostrando ${rows.length} de ${total.toLocaleString("es-PY")}`}
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">{error}</div>
      )}

      {/* Tabla */}
      {!hasSearched ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <Filter className="mx-auto mb-3 h-8 w-8 text-[#4FAEB2]" />
          <h3 className="text-base font-semibold text-slate-800">Aplicá un filtro para consultar etiquetas.</h3>
          <p className="mt-1 text-sm text-slate-500">
            Elegí una etiqueta, número o rango de fechas y presioná
            <span className="mx-1 font-medium text-slate-700">Buscar</span>.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-[#4FAEB2]/45 bg-white shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-slate-50/80 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Etiqueta</th>
                <th className="px-4 py-3">Contacto</th>
                <th className="px-4 py-3">Teléfono / Número</th>
                <th className="px-4 py-3">Último mensaje</th>
                <th className="px-4 py-3">Días inactivo</th>
                <th className="px-4 py-3">Fecha etiquetada</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rows.length === 0 && !loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-slate-500">
                    Sin resultados para los filtros seleccionados.
                  </td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.conversation_id} className="transition-colors hover:bg-[#4FAEB2]/5">
                  <td className="px-4 py-2.5">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${tagPillClass(r.tag_code)}`}>
                      {r.tag_label || r.tag_code}
                    </span>
                  </td>
                  <td className="px-4 py-2.5 text-slate-700">
                    {r.contact_name || <span className="text-slate-400">—</span>}
                  </td>
                  <td className="px-4 py-2.5 font-mono text-sm font-semibold text-slate-800 tracking-wider">
                    {r.phone || "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{formatDate(r.last_message_at)}</td>
                  <td className="px-4 py-2.5 text-slate-700">
                    {r.days_idle != null ? `${r.days_idle}d` : "—"}
                  </td>
                  <td className="px-4 py-2.5 text-slate-500">{formatDate(r.last_tagged_at)}</td>
                  <td className="px-4 py-2.5 text-right">
                    <div className="inline-flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          const full = (r.phone || "").replace(/\D+/g, "");
                          if (full) void navigator.clipboard.writeText(full);
                        }}
                        className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/5 hover:text-[#3F8E91]"
                        title="Copiar número completo"
                      >
                        <Copy size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => openModal(r.conversation_id)}
                        className="inline-flex items-center justify-center rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/5 hover:text-[#3F8E91]"
                        title="Ver últimos mensajes"
                      >
                        <Search size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Paginación */}
      {hasSearched && (
        <div className="mt-3 flex items-center justify-between text-xs text-slate-500">
          <span>Offset: {offset}</span>
          <div className="flex gap-2">
            <button
              type="button"
              disabled={offset === 0 || loading}
              onClick={() => handlePage(Math.max(0, offset - limit))}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/5 hover:text-[#3F8E91] disabled:opacity-40"
            >
              Anterior
            </button>
            <button
              type="button"
              disabled={offset + limit >= total || loading}
              onClick={() => handlePage(offset + limit)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/5 hover:text-[#3F8E91] disabled:opacity-40"
            >
              Siguiente
            </button>
          </div>
        </div>
      )}

      {/* Modal */}
      {modalConvId && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          onClick={closeModal}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-[#4FAEB2]/45 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white p-4">
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-900">
                  {modalData?.conversation?.contact?.name || "Conversación"}
                </div>
                <div className="truncate font-mono text-xs text-slate-500">
                  {modalData?.conversation?.contact?.phone || modalData?.conversation?.contact?.phone_masked || modalConvId.slice(0, 8)}
                </div>
              </div>
              <button
                onClick={closeModal}
                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/5 hover:text-[#3F8E91]"
                type="button"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </header>
            <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 p-4">
              {modalLoading && (
                <div className="text-center text-sm text-slate-500">
                  Cargando últimos 50 mensajes…
                </div>
              )}
              {modalError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm text-rose-700">
                  {modalError}
                </div>
              )}
              {modalData?.messages?.length === 0 && !modalLoading && (
                <div className="text-center text-sm text-slate-500">Sin mensajes.</div>
              )}
              {modalData?.messages?.map((m) => (
                <div
                  key={m.id}
                  className={`max-w-[80%] rounded-2xl border px-3 py-2 shadow-sm ${
                    m.from_me
                      ? "ml-auto border-[#4FAEB2]/30 bg-[#4FAEB2]/10 text-slate-800"
                      : "mr-auto border-slate-200 bg-white text-slate-800"
                  }`}
                >
                  <div className="mb-0.5 text-[10px] uppercase tracking-wide text-slate-500">
                    {m.from_me ? "Saliente" : "Entrante"} · {m.message_type || "text"}
                  </div>
                  <div className="whitespace-pre-wrap break-words text-sm">
                    {m.content || <span className="italic text-slate-400">(sin contenido)</span>}
                  </div>
                  <div className="mt-1 text-[10px] text-slate-400">{formatDate(m.created_at)}</div>
                </div>
              ))}
            </div>
            <footer className="border-t border-slate-200 bg-white p-3 text-[11px] text-slate-500">
              Vista de conversación. No envía mensajes ni modifica el chat.
            </footer>
          </div>
        </div>
      )}

      {/* ETQ-CAMP-3: Modal "Crear campaña desde etiqueta" */}
      {campModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          onClick={closeCampaignModal}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-emerald-600/40 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <header className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white p-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Send size={16} className="text-emerald-600" />
                  Crear campaña desde etiqueta
                </div>
                <div className="text-xs text-slate-500">Paso {campStep} de 3 · La campaña queda en borrador</div>
              </div>
              <button
                onClick={closeCampaignModal}
                className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 shadow-sm transition-colors hover:border-emerald-500/40 hover:bg-emerald-50 hover:text-emerald-700"
                type="button"
                aria-label="Cerrar"
              >
                <X size={16} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto bg-slate-50 p-5">
              {campError && (
                <div className="mb-3 inline-flex items-start gap-2 rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
                  <AlertTriangle size={14} className="mt-0.5 shrink-0 text-rose-600" />
                  <span>{campError}</span>
                </div>
              )}

              {/* ETQ-CAMP-FIX-3: banner de éxito con link manual a la campaña */}
              {campSuccess && (
                <div className="mb-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3 text-sm text-emerald-800">
                  <div className="flex items-start gap-2">
                    <Send size={14} className="mt-0.5 shrink-0 text-emerald-600" />
                    <div className="space-y-1">
                      <div className="font-semibold">Campaña borrador creada correctamente.</div>
                      <div className="text-xs">
                        ID: <span className="font-mono">{campSuccess.campaign_id}</span>
                      </div>
                      <div className="text-xs">
                        Destinatarios cargados: {campSuccess.valid_recipients} válidos
                        {campSuccess.invalid_recipients > 0
                          ? ` · ${campSuccess.invalid_recipients} inválidos`
                          : ""}{" "}
                        (status <span className="font-semibold">draft</span>, sin envío).
                      </div>
                      <div className="pt-1.5">
                        <a
                          href={campSuccess.redirect_to}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white shadow-sm hover:bg-emerald-700"
                        >
                          Abrir campaña en /dashboard/campanas
                          <ChevronRight size={12} />
                        </a>
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {campStep === 1 && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-700">
                    Elegí la etiqueta cuyas conversaciones querés usar como audiencia.
                  </p>
                  <select
                    value={campTagCode}
                    onChange={(e) => {
                      setCampTagCode(e.target.value);
                      setCampAudience(null);
                    }}
                    className={SELECT_CN}
                  >
                    <option value="">— elegí una etiqueta —</option>
                    {availableTags.map((t) => (
                      <option key={t.tag_code} value={t.tag_code}>{t.tag_label}</option>
                    ))}
                  </select>
                </div>
              )}

              {campStep === 2 && (
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm text-slate-700">Elegí la plantilla aprobada por Meta.</p>
                    <button
                      type="button"
                      onClick={syncTemplatesFromMeta}
                      disabled={campTemplatesSyncing || campTemplatesLoading}
                      className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-emerald-400/60 hover:bg-emerald-50/30 hover:text-emerald-700 disabled:opacity-50"
                      title="Pull desde Meta y refrescar lista de plantillas"
                    >
                      <RefreshCw size={12} className={campTemplatesSyncing ? "animate-spin" : ""} />
                      {campTemplatesSyncing ? "Sincronizando…" : "Sincronizar con Meta"}
                    </button>
                  </div>
                  {campTemplatesSyncNotice && (
                    <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
                      {campTemplatesSyncNotice}
                    </div>
                  )}
                  {campTemplatesLoading && (
                    <div className="text-sm text-slate-500">Cargando plantillas…</div>
                  )}
                  {!campTemplatesLoading && campTemplates.length === 0 && (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                      No hay plantillas aprobadas. Tocá <span className="font-semibold">Sincronizar con Meta</span> para traer las últimas aprobaciones.
                    </div>
                  )}
                  <div className="grid gap-2">
                    {campTemplates.map((t) => {
                      const selected = campTemplateId === t.id;
                      const needsHeader = templateHasHeaderImage(t.components_json);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => setCampTemplateId(t.id)}
                          className={`rounded-xl border bg-white p-3 text-left shadow-sm transition-colors ${
                            selected
                              ? "border-emerald-500 ring-2 ring-emerald-500/25"
                              : "border-slate-200 hover:border-emerald-400/60 hover:bg-emerald-50/30"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <div className="text-sm font-semibold text-slate-900">{t.name}</div>
                              <div className="text-xs text-slate-500">
                                {t.language} · {t.category ?? "—"} · {t.provider}
                              </div>
                            </div>
                            <div className="flex shrink-0 items-center gap-1.5">
                              <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 ring-1 ring-emerald-200">
                                APPROVED
                              </span>
                              {needsHeader && (
                                <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 ring-1 ring-amber-200">
                                  Necesita imagen
                                </span>
                              )}
                            </div>
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  {selectedTemplateNeedsHeader && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-medium text-slate-600">
                        Header image URL (HTTPS, obligatoria)
                      </label>
                      <input
                        value={campHeaderImageUrl}
                        onChange={(e) => setCampHeaderImageUrl(e.target.value)}
                        placeholder="https://ejemplo.com/banner.jpg"
                        className={INPUT_CN}
                      />
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-slate-600">
                      Nombre de la campaña (opcional)
                    </label>
                    <input
                      value={campCampaignName}
                      onChange={(e) => setCampCampaignName(e.target.value)}
                      placeholder={`Etiqueta ${campTagCode} — ${new Date().toISOString().slice(0, 10)}`}
                      className={INPUT_CN}
                    />
                  </div>
                </div>
              )}

              {campStep === 3 && (
                <div className="space-y-3">
                  {campAudienceLoading && (
                    <div className="text-sm text-slate-500">Calculando audiencia…</div>
                  )}
                  {!campAudienceLoading && campAudience && (
                    <>
                      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">Total conversaciones</div>
                          <div className="mt-1 text-xl font-semibold text-slate-900">{campAudience.total_conversations}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">Únicos por teléfono</div>
                          <div className="mt-1 text-xl font-semibold text-slate-900">{campAudience.total_unique_phones}</div>
                        </div>
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 shadow-sm">
                          <div className="text-[10px] uppercase tracking-wide text-emerald-700">Teléfonos válidos</div>
                          <div className="mt-1 text-xl font-semibold text-emerald-800">{campAudience.valid_phone_count}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">Excluidos: inbound reciente</div>
                          <div className="mt-1 text-sm font-semibold text-slate-700">{campAudience.recent_inbound_excluded_count}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">Excluidos: humano</div>
                          <div className="mt-1 text-sm font-semibold text-slate-700">{campAudience.human_excluded_count}</div>
                        </div>
                        <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                          <div className="text-[10px] uppercase tracking-wide text-slate-500">Excluidos: reactivados</div>
                          <div className="mt-1 text-sm font-semibold text-slate-700">{campAudience.reactivated_excluded_count}</div>
                        </div>
                      </div>

                      {Array.isArray(campAudience.warnings) && campAudience.warnings.length > 0 && (
                        <div className="space-y-1.5">
                          {campAudience.warnings.map((w, i) => (
                            <div
                              key={`${w.code}-${i}`}
                              className="inline-flex w-full items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
                            >
                              <AlertTriangle size={12} className="mt-0.5 shrink-0 text-amber-600" />
                              <span>{w.message}</span>
                            </div>
                          ))}
                        </div>
                      )}

                      {Array.isArray(campAudience.sample_recipients) && campAudience.sample_recipients.length > 0 && (
                        <div>
                          <div className="mb-1 text-[10px] uppercase tracking-wide text-slate-500">
                            Muestra (10 primeros)
                          </div>
                          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                            <table className="w-full text-xs">
                              <thead className="bg-slate-50 text-left text-[10px] uppercase tracking-wide text-slate-500">
                                <tr>
                                  <th className="px-3 py-1.5">Contacto</th>
                                  <th className="px-3 py-1.5">Teléfono</th>
                                  <th className="px-3 py-1.5">Días inactivo</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {campAudience.sample_recipients.map((r) => (
                                  <tr key={r.conversation_id}>
                                    <td className="px-3 py-1.5">{r.contact_name || "—"}</td>
                                    <td className="px-3 py-1.5 font-mono">{r.phone_number || "—"}</td>
                                    <td className="px-3 py-1.5">{r.days_idle != null ? `${r.days_idle}d` : "—"}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}
            </div>

            <footer className="flex items-center justify-between gap-2 border-t border-slate-200 bg-white p-3">
              <button
                type="button"
                onClick={() => setCampStep((s) => (s > 1 ? ((s - 1) as 1 | 2 | 3) : s))}
                disabled={campStep === 1 || campSubmitting}
                className={`${BTN_SECONDARY_CN} disabled:opacity-40`}
              >
                <ChevronLeft size={14} />
                Anterior
              </button>
              <div className="text-[11px] text-slate-500">
                {campStep === 3
                  ? "Al confirmar, la campaña queda como borrador para revisión en Campañas."
                  : ""}
              </div>
              {campStep < 3 ? (
                <button
                  type="button"
                  onClick={() => {
                    setCampError(null);
                    if (campStep === 1 && !campTagCode) {
                      setCampError("Elegí una etiqueta antes de continuar");
                      return;
                    }
                    if (campStep === 2 && !campTemplateId) {
                      setCampError("Elegí una plantilla aprobada antes de continuar");
                      return;
                    }
                    if (campStep === 2 && selectedTemplateNeedsHeader && !campHeaderImageUrl.trim()) {
                      setCampError("Esta plantilla requiere una imagen de header HTTPS");
                      return;
                    }
                    setCampStep((s) => ((s + 1) as 1 | 2 | 3));
                  }}
                  disabled={campSubmitting}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-600/25 transition-colors hover:bg-emerald-700 disabled:opacity-40"
                >
                  Siguiente
                  <ChevronRight size={14} />
                </button>
              ) : (
                <button
                  type="button"
                  onClick={submitCampaign}
                  disabled={
                    campSubmitting ||
                    !!campSuccess ||
                    !campAudience ||
                    (campAudience.valid_phone_count ?? 0) === 0
                  }
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-emerald-600/25 transition-colors hover:bg-emerald-700 disabled:opacity-40"
                >
                  <Send size={14} />
                  {campSuccess
                    ? "Campaña creada"
                    : campSubmitting
                      ? "Creando…"
                      : "Crear campaña borrador"}
                </button>
              )}
            </footer>
          </div>
        </div>
      )}
    </div>
  );
}
