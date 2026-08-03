"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Megaphone,
  Users,
  Tag,
  Star,
  CheckCircle2,
  TrendingUp,
  Inbox,
  AlertTriangle,
  X,
  Instagram,
  Facebook,
  HelpCircle,
  MessageSquare,
  ExternalLink,
} from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { ymdInicioFinMesLocal, toCalendarDateStr } from "@/lib/fechas/calendario";

const INPUT_CLS =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";
const LABEL_CLS = "block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 mb-1.5";

type RedSocial = "instagram" | "facebook" | "no_identificado";

type Kpis = {
  conversaciones_atribuidas: number;
  leads_nuevos: number;
  tipificadas: number;
  calificadas: number;
  conversiones: number;
  tasa_conversion: number;
  tasa_conversion_tipificadas: number;
  mejor_campana: {
    meta_ad_id: string | null;
    headline: string | null;
    tasa: number;
    conversaciones: number;
    conversiones: number;
    red_social: RedSocial;
  } | null;
  mensajes_atribuidos: number;
};
type Breakdown = { instagram: number; facebook: number; no_identificado: number };
type Campana = {
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
  conversaciones: number;
  leads_nuevos: number;
  tipificadas: number;
  calificadas: number;
  conversiones: number;
  perdidas: number;
  no_respuesta: number;
  reclamos: number;
  mensajes: number;
  ultima_actividad: string | null;
  tasa_conversion: number;
};
type Reporte = {
  periodo: { desde: string; hasta: string };
  kpis: Kpis;
  breakdown_red_social: Breakdown;
  campanas: Campana[];
  meta: {
    tabla_atribucion_disponible: boolean;
    outcome_mapping_definido: boolean;
    canales_meta_count: number;
    red_social_signal: string;
    red_social_doc: string;
    conteos: { atribuciones_periodo: number; cierres_encontrados: number; mapeos_configurados: number };
    warnings: string[];
  };
};

type Detalle = {
  anuncio: Campana | null;
  conversaciones: Array<{
    conversation_id: string;
    contact_id: string | null;
    nombre: string | null;
    telefono: string | null;
    prospecto_id: string | null;
    numero_control: string | null;
    prospecto_contacto: string | null;
    first_message_at: string;
    last_message_at: string | null;
    message_count: number;
    cierre_estado: string | null;
    cierre_substate: string | null;
    cerrado_at: string | null;
    outcome: string;
  }>;
  totales: { conversaciones: number; leads: number; tipificadas: number; conversiones: number };
};

const OUTCOMES = [
  { v: "", l: "Todos" },
  { v: "conversion", l: "Conversiones" },
  { v: "qualified_lead", l: "Calificados" },
  { v: "lost", l: "Perdidos" },
  { v: "no_response", l: "Sin respuesta" },
  { v: "claim", l: "Reclamos" },
];

const REDES = [
  { v: "", l: "Todas las redes" },
  { v: "instagram", l: "Instagram" },
  { v: "facebook", l: "Facebook" },
  { v: "no_identificado", l: "No identificado" },
];

function pct(n: number): string {
  if (!Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}
function fmt(n: number): string {
  return String(Math.round(Number(n) || 0).toLocaleString("es-PY"));
}
function fFecha(s: string | null): string {
  if (!s) return "—";
  const d = String(s).slice(0, 10);
  const [y, m, dd] = d.split("-");
  return dd ? `${dd}/${m}/${y}` : d;
}
function truncId(s: string | null, n = 10): string {
  if (!s) return "—";
  return s.length > n + 3 ? `${s.slice(0, n)}…` : s;
}

function RedSocialBadge({ red }: { red: RedSocial }) {
  if (red === "instagram") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-pink-200 bg-pink-50 px-2 py-0.5 text-[10px] font-semibold text-pink-700">
        <Instagram className="h-3 w-3" />
        Instagram
      </span>
    );
  }
  if (red === "facebook") {
    return (
      <span className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
        <Facebook className="h-3 w-3" />
        Facebook
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
      <HelpCircle className="h-3 w-3" />
      No identificado
    </span>
  );
}

function AdImage({ meta_ad_id, size = 44 }: { meta_ad_id: string | null; size?: number }) {
  // Siempre apunta al proxy → sin íconos rotos (server-side fallback a SVG)
  if (!meta_ad_id) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-lg border border-[#4FAEB2]/30 bg-[#4FAEB2]/10 text-[#4FAEB2]"
        style={{ width: size, height: size }}
      >
        <Megaphone className="h-4 w-4" />
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/api/reportes/campanas-meta/ad-thumb?ad_id=${encodeURIComponent(meta_ad_id)}`}
      alt=""
      className="shrink-0 rounded-lg object-cover ring-1 ring-slate-200"
      style={{ width: size, height: size }}
      loading="lazy"
    />
  );
}

export default function ReporteCampanasMetaPage() {
  const mesActual = ymdInicioFinMesLocal();
  const [desde, setDesde] = useState(mesActual.inicioYmd);
  const [hasta, setHasta] = useState(mesActual.finYmd);
  const [outcome, setOutcome] = useState("");
  const [redFilter, setRedFilter] = useState("");
  const [adId, setAdId] = useState("");
  const [data, setData] = useState<Reporte | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [drill, setDrill] = useState<{ campana: Campana; detalle: Detalle | null; loading: boolean } | null>(null);

  const cargar = useCallback(async (d: string, h: string, oc: string, ad: string, red: string) => {
    setCargando(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (d) qs.set("desde", d);
      if (h) qs.set("hasta", h);
      if (oc) qs.set("outcome", oc);
      if (ad) qs.set("meta_ad_id", ad);
      if (red) qs.set("red_social", red);
      const res = await fetchWithSupabaseSession(`/api/reportes/campanas-meta?${qs.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (json?.success && json.data) setData(json.data as Reporte);
      else {
        setData(null);
        setError(json?.error ?? "No se pudo cargar el reporte.");
      }
    } catch {
      setData(null);
      setError("No se pudo cargar el reporte.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar(mesActual.inicioYmd, mesActual.finYmd, "", "", "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function abrirDrill(c: Campana) {
    setDrill({ campana: c, detalle: null, loading: true });
    try {
      const adKey = c.meta_ad_id ?? c.key;
      const res = await fetchWithSupabaseSession(
        `/api/reportes/campanas-meta/${encodeURIComponent(adKey)}/conversaciones`,
        { cache: "no-store" }
      );
      const json = await res.json();
      if (json?.success && json.data) {
        setDrill({ campana: c, detalle: json.data as Detalle, loading: false });
      } else {
        setDrill({ campana: c, detalle: null, loading: false });
      }
    } catch {
      setDrill({ campana: c, detalle: null, loading: false });
    }
  }

  function aplicar() {
    cargar(toCalendarDateStr(desde), toCalendarDateStr(hasta), outcome, adId.trim(), redFilter);
  }
  function limpiar() {
    const m = ymdInicioFinMesLocal();
    setDesde(m.inicioYmd);
    setHasta(m.finYmd);
    setOutcome("");
    setRedFilter("");
    setAdId("");
    cargar(m.inicioYmd, m.finYmd, "", "", "");
  }

  const k = data?.kpis;
  const b = data?.breakdown_red_social;
  const totalConv = b ? b.instagram + b.facebook + b.no_identificado : 0;

  return (
    <div className="w-full min-w-0 max-w-full space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
          />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Reportes · Marketing</p>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Campañas Meta</h1>
        <p className="mt-1 text-sm text-slate-500">
          Efectividad por anuncio Click-to-WhatsApp: <strong>conversaciones únicas, leads, tipificaciones y conversiones</strong>.
        </p>
        <p className="mt-1 text-[11px] text-slate-400">
          Red social inferida desde dominio del anuncio. Para precisión total (breakdown costo / ROAS / audience network) hay que integrar Meta Marketing API.
        </p>
      </div>

      {/* Warnings */}
      {data?.meta.warnings?.length ? (
        <div className="space-y-2">
          {data.meta.warnings.map((w, i) => (
            <div key={i} className="flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-800">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      ) : null}

      {/* Filtros */}
      <div className="rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[10rem]">
            <label className={LABEL_CLS}>Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={INPUT_CLS} />
          </div>
          <div className="min-w-[10rem]">
            <label className={LABEL_CLS}>Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={INPUT_CLS} />
          </div>
          <div className="min-w-[10rem]">
            <label className={LABEL_CLS}>Outcome</label>
            <select value={outcome} onChange={(e) => setOutcome(e.target.value)} className={INPUT_CLS}>
              {OUTCOMES.map((o) => (
                <option key={o.v} value={o.v}>
                  {o.l}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[10rem]">
            <label className={LABEL_CLS}>Red social</label>
            <select value={redFilter} onChange={(e) => setRedFilter(e.target.value)} className={INPUT_CLS}>
              {REDES.map((r) => (
                <option key={r.v} value={r.v}>
                  {r.l}
                </option>
              ))}
            </select>
          </div>
          <div className="min-w-[12rem] flex-1">
            <label className={LABEL_CLS}>Anuncio (meta_ad_id)</label>
            <input
              type="text"
              value={adId}
              onChange={(e) => setAdId(e.target.value)}
              placeholder="120…"
              className={INPUT_CLS}
            />
          </div>
          <button
            type="button"
            onClick={aplicar}
            className="rounded-xl bg-[#4FAEB2] px-4 py-2.5 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91]"
          >
            Aplicar filtros
          </button>
          <button
            type="button"
            onClick={limpiar}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/5 hover:text-[#3F8E91]"
          >
            Limpiar filtros
          </button>
          <Link
            href="/reportes"
            className="ml-auto inline-flex items-center gap-1.5 self-center text-xs font-semibold text-[#4FAEB2] hover:text-[#3F8E91] hover:underline"
          >
            ← Volver a Reportes
          </Link>
        </div>
        {data ? (
          <p className="mt-3 text-[11px] text-slate-500">
            Período: {fFecha(data.periodo.desde)} — {fFecha(data.periodo.hasta)} · {data.meta.canales_meta_count} canal
            {data.meta.canales_meta_count === 1 ? "" : "es"} activos
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">{error}</div>
      ) : null}

      {/* KPIs centrados en únicos */}
      <Section title="Resumen del período">
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          <Kpi icon={<Megaphone className="h-4 w-4" />} label="Conversaciones únicas" value={cargando ? "…" : fmt(k?.conversaciones_atribuidas ?? 0)} accent="featured" />
          <Kpi icon={<Users className="h-4 w-4" />} label="Leads únicos" value={cargando ? "…" : fmt(k?.leads_nuevos ?? 0)} accent="featured" />
          <Kpi icon={<Tag className="h-4 w-4" />} label="Tipificadas" value={cargando ? "…" : fmt(k?.tipificadas ?? 0)} />
          <Kpi icon={<Star className="h-4 w-4" />} label="Calificados" value={cargando ? "…" : fmt(k?.calificadas ?? 0)} accent="qualified" />
          <Kpi icon={<CheckCircle2 className="h-4 w-4" />} label="Conversiones" value={cargando ? "…" : fmt(k?.conversiones ?? 0)} accent="featured" />
          <Kpi
            icon={<TrendingUp className="h-4 w-4" />}
            label="Tasa de conversión"
            value={cargando ? "…" : pct(k?.tasa_conversion ?? 0)}
            sub={k && k.tipificadas > 0 ? `Sobre tipificadas: ${pct(k.tasa_conversion_tipificadas)}` : undefined}
            accent="featured"
          />
          <Kpi
            icon={<Megaphone className="h-4 w-4" />}
            label="Mejor anuncio"
            value={cargando ? "…" : k?.mejor_campana ? pct(k.mejor_campana.tasa) : "—"}
            sub={k?.mejor_campana ? (k.mejor_campana.headline ?? truncId(k.mejor_campana.meta_ad_id, 10)) : undefined}
            accent="qualified"
          />
          {/* Mensajes como dato secundario */}
          <Kpi icon={<MessageSquare className="h-4 w-4" />} label="Mensajes (secundario)" value={cargando ? "…" : fmt(k?.mensajes_atribuidos ?? 0)} />
        </div>
      </Section>

      {/* Breakdown por red social */}
      {b && totalConv > 0 ? (
        <Section title="Conversaciones por red social" subtitle="Inferido por dominio del anuncio (source_url).">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <RedCard
              icon={<Instagram className="h-5 w-5" />}
              label="Instagram"
              value={b.instagram}
              pct={totalConv > 0 ? b.instagram / totalConv : 0}
              color="bg-pink-50 border-pink-200 text-pink-700"
              barColor="bg-pink-500"
              onClick={() => {
                setRedFilter("instagram");
                cargar(toCalendarDateStr(desde), toCalendarDateStr(hasta), outcome, adId.trim(), "instagram");
              }}
            />
            <RedCard
              icon={<Facebook className="h-5 w-5" />}
              label="Facebook"
              value={b.facebook}
              pct={totalConv > 0 ? b.facebook / totalConv : 0}
              color="bg-blue-50 border-blue-200 text-blue-700"
              barColor="bg-blue-500"
              onClick={() => {
                setRedFilter("facebook");
                cargar(toCalendarDateStr(desde), toCalendarDateStr(hasta), outcome, adId.trim(), "facebook");
              }}
            />
            <RedCard
              icon={<HelpCircle className="h-5 w-5" />}
              label="No identificado"
              value={b.no_identificado}
              pct={totalConv > 0 ? b.no_identificado / totalConv : 0}
              color="bg-slate-50 border-slate-200 text-slate-600"
              barColor="bg-slate-400"
              onClick={() => {
                setRedFilter("no_identificado");
                cargar(toCalendarDateStr(desde), toCalendarDateStr(hasta), outcome, adId.trim(), "no_identificado");
              }}
            />
          </div>
        </Section>
      ) : null}

      {/* Tabla por anuncio */}
      <Section title="Detalle por anuncio" subtitle="Ordenado por conversiones, luego conversaciones únicas. Click en una fila para ver el detalle.">
        {cargando ? (
          <Cargando />
        ) : !data || data.campanas.length === 0 ? (
          <Vacio msg="Todavía no hay conversaciones atribuidas a campañas Meta en este período." />
        ) : (
          <div className="overflow-hidden rounded-2xl border border-[#4FAEB2]/45 bg-white shadow-sm">
            <div className="overflow-x-auto overscroll-x-contain">
              <table className="w-full table-auto border-separate border-spacing-0 text-sm" style={{ minWidth: "1100px" }}>
                <thead className="bg-slate-50/80">
                  <tr>
                    {[
                      "Anuncio / Referral",
                      "Red social",
                      "Convs. únicas",
                      "Leads",
                      "Tipif.",
                      "Calif.",
                      "Conv.",
                      "Tasa",
                      "Última actividad",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 first:pl-5 last:pr-5 sm:px-4"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {data.campanas.map((c) => (
                    <tr
                      key={c.key}
                      className="cursor-pointer transition-colors hover:bg-[#4FAEB2]/5"
                      onClick={() => abrirDrill(c)}
                    >
                      <td className="min-w-[16rem] px-3 py-3 first:pl-5 sm:px-4">
                        <div className="flex items-start gap-3">
                          <AdImage meta_ad_id={c.meta_ad_id} size={40} />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-slate-900">
                              {c.headline ?? c.meta_ad_name ?? truncId(c.meta_ad_id, 10) ?? "Anuncio sin id"}
                            </p>
                            <p className="mt-0.5 truncate text-[11px] text-slate-500">
                              {c.source_type ?? "ad"} · {truncId(c.meta_ad_id, 14)}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 sm:px-4">
                        <RedSocialBadge red={c.red_social} />
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm font-semibold tabular-nums text-slate-900 sm:px-4">{fmt(c.conversaciones)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm tabular-nums text-slate-700 sm:px-4">{fmt(c.leads_nuevos)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm tabular-nums text-slate-700 sm:px-4">{fmt(c.tipificadas)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm tabular-nums text-emerald-700 sm:px-4">{fmt(c.calificadas)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm font-semibold tabular-nums text-[#3F8E91] sm:px-4">{fmt(c.conversiones)}</td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm font-semibold tabular-nums sm:px-4">
                        <span className={c.tasa_conversion >= 0.2 ? "text-[#3F8E91]" : "text-slate-700"}>{pct(c.tasa_conversion)}</span>
                      </td>
                      <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-500 last:pr-5 sm:px-4">{fFecha(c.ultima_actividad)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </Section>

      {/* Drawer detalle */}
      {drill ? <Drawer drill={drill} onClose={() => setDrill(null)} /> : null}
    </div>
  );
}

// ── Subcomponentes ──────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">{title}</h2>
        </div>
        {subtitle ? <p className="mt-1 pl-3 text-[11px] text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  accent = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: "neutral" | "featured" | "qualified";
}) {
  const chip =
    accent === "featured"
      ? "border-[#4FAEB2]/30 bg-[#4FAEB2]/12 text-[#4FAEB2]"
      : accent === "qualified"
        ? "border-emerald-200 bg-emerald-50 text-emerald-600"
        : "border-slate-200 bg-slate-50 text-slate-500";
  const valueCls =
    accent === "featured" ? "text-[#3F8E91]" : accent === "qualified" ? "text-emerald-700" : "text-slate-900";
  return (
    <div className="relative overflow-hidden rounded-xl border border-[#4FAEB2]/45 bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start gap-2.5">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${chip}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className={`mt-0.5 truncate text-lg font-semibold tabular-nums leading-tight tracking-tight ${valueCls}`}>{value}</p>
          {sub ? <p className="mt-0.5 truncate text-[10px] text-slate-500">{sub}</p> : null}
        </div>
      </div>
    </div>
  );
}

function RedCard({
  icon,
  label,
  value,
  pct,
  color,
  barColor,
  onClick,
}: {
  icon: React.ReactNode;
  label: string;
  value: number;
  pct: number;
  color: string;
  barColor: string;
  onClick?: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`group relative overflow-hidden rounded-xl border bg-white p-4 text-left shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all hover:-translate-y-0.5 hover:shadow-md`}
    >
      <div className="flex items-center gap-3">
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${color}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-0.5 text-xl font-semibold tabular-nums leading-tight text-slate-900">
            {value.toLocaleString("es-PY")}
            <span className="ml-2 text-xs font-medium text-slate-500">({(pct * 100).toFixed(0)}%)</span>
          </p>
        </div>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full ${barColor}`} style={{ width: `${Math.max(2, pct * 100)}%` }} />
      </div>
    </button>
  );
}

function Cargando() {
  return (
    <div className="flex items-center justify-center gap-3 rounded-2xl border border-[#4FAEB2]/45 bg-white py-14 text-sm text-slate-500 shadow-sm">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#4FAEB2]" />
      Cargando…
    </div>
  );
}

function Vacio({ msg }: { msg: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-[#4FAEB2]/45 bg-white px-6 py-14 text-center shadow-sm">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#4FAEB2]/25 bg-[#4FAEB2]/8 text-[#4FAEB2]">
        <Inbox className="h-6 w-6" />
      </span>
      <p className="max-w-md text-sm font-medium text-slate-600">{msg}</p>
    </div>
  );
}

function Drawer({
  drill,
  onClose,
}: {
  drill: { campana: Campana; detalle: Detalle | null; loading: boolean };
  onClose: () => void;
}) {
  const { campana: c, detalle, loading } = drill;
  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex justify-end bg-slate-900/40"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-2xl flex-col overflow-y-auto bg-white shadow-2xl"
      >
        {/* Header anuncio */}
        <div className="sticky top-0 z-10 border-b border-slate-100 bg-white px-5 py-4">
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 items-start gap-3">
              <AdImage meta_ad_id={c.meta_ad_id} size={56} />
              <div className="min-w-0">
                <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4FAEB2]">Anuncio Meta</p>
                <h3 className="mt-0.5 truncate text-base font-semibold text-slate-900">
                  {c.headline ?? c.meta_ad_name ?? truncId(c.meta_ad_id, 16) ?? "Anuncio sin id"}
                </h3>
                <div className="mt-1 flex items-center gap-2 text-[11px] text-slate-500">
                  <RedSocialBadge red={c.red_social} />
                  <span>·</span>
                  <span>{c.source_type ?? "ad"}</span>
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          {/* Mini-stats del anuncio */}
          <div className="mt-4 grid grid-cols-4 gap-2 text-center">
            <MiniStat label="Convs." value={c.conversaciones} />
            <MiniStat label="Leads" value={c.leads_nuevos} />
            <MiniStat label="Tipif." value={c.tipificadas} />
            <MiniStat label="Conv." value={c.conversiones} accent="featured" />
          </div>
        </div>

        {/* Body */}
        <div className="space-y-4 px-5 py-4">
          {c.body ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-3 text-[12px] text-slate-700">
              <p className="line-clamp-4 whitespace-pre-line">{c.body}</p>
            </div>
          ) : null}
          <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[12px]">
            <dt className="text-slate-500">meta_ad_id</dt>
            <dd className="break-all font-mono text-slate-800">{c.meta_ad_id ?? "—"}</dd>
            {c.source_url ? (
              <>
                <dt className="text-slate-500">source_url</dt>
                <dd className="break-all">
                  <a href={c.source_url} target="_blank" rel="noreferrer" className="text-[#3F8E91] hover:underline">
                    {c.source_url}
                  </a>
                </dd>
              </>
            ) : null}
            <dt className="text-slate-500">Mensajes (secundario)</dt>
            <dd className="font-semibold tabular-nums text-slate-700">{fmt(c.mensajes)}</dd>
          </dl>

          {/* Lista de conversaciones */}
          <div>
            <div className="flex items-center gap-2 pb-2">
              <span aria-hidden="true" className="block h-4 w-1 rounded-full bg-[#4FAEB2]" />
              <h4 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                Leads / Conversaciones
              </h4>
              {detalle ? (
                <span className="ml-auto rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                  {detalle.conversaciones.length}
                </span>
              ) : null}
            </div>

            {loading ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs text-slate-500">
                Cargando conversaciones…
              </div>
            ) : !detalle || detalle.conversaciones.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-8 text-center text-xs text-slate-500">
                Sin conversaciones detalladas.
              </div>
            ) : (
              <ul className="space-y-2">
                {detalle.conversaciones.map((conv) => (
                  <ConversacionItem key={conv.conversation_id} conv={conv} />
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type ConvItem = Detalle["conversaciones"][number];
type MensajePreview = {
  id: string;
  from_me: boolean;
  sender_type: string | null;
  message_type: string | null;
  content: string | null;
  created_at: string;
};

function ConversacionItem({ conv }: { conv: ConvItem }) {
  const [open, setOpen] = useState(false);
  const [mensajes, setMensajes] = useState<MensajePreview[] | null>(null);
  const [loadingMsgs, setLoadingMsgs] = useState(false);

  async function toggleMensajes() {
    const next = !open;
    setOpen(next);
    if (next && mensajes === null && !loadingMsgs) {
      setLoadingMsgs(true);
      try {
        const res = await fetchWithSupabaseSession(
          `/api/reportes/campanas-meta/mensajes?conversation_id=${encodeURIComponent(conv.conversation_id)}&limit=20`,
          { cache: "no-store" }
        );
        const json = await res.json();
        setMensajes(json?.success && json.data ? (json.data.mensajes as MensajePreview[]) : []);
      } catch {
        setMensajes([]);
      } finally {
        setLoadingMsgs(false);
      }
    }
  }

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm transition-colors hover:border-[#4FAEB2]/60">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">
            {conv.nombre || conv.prospecto_contacto || conv.telefono || "Contacto sin nombre"}
          </p>
          <p className="mt-0.5 truncate text-[11px] text-slate-500">
            {conv.telefono ? `${conv.telefono} · ` : ""}
            {conv.numero_control ? <span className="font-mono">{conv.numero_control}</span> : "Sin prospecto CRM"}
          </p>
        </div>
        <OutcomeBadge outcome={conv.outcome} estado={conv.cierre_estado} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 text-[11px] text-slate-500">
        <span>
          <span className="block text-[9px] uppercase tracking-wide">Primer msg</span>
          {fFecha(conv.first_message_at)}
        </span>
        <span>
          <span className="block text-[9px] uppercase tracking-wide">Último msg</span>
          {fFecha(conv.last_message_at)}
        </span>
        <span>
          <span className="block text-[9px] uppercase tracking-wide">Mensajes</span>
          {conv.message_count}
        </span>
      </div>
      {conv.cierre_estado ? (
        <p className="mt-2 text-[11px] text-slate-500">
          Tipificación: <span className="font-medium text-slate-700">{conv.cierre_estado}</span>
          {conv.cierre_substate ? ` / ${conv.cierre_substate}` : ""}
        </p>
      ) : null}
      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          onClick={toggleMensajes}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
        >
          <MessageSquare className="h-3 w-3" />
          {open ? "Ocultar mensajes" : "Ver mensajes"}
        </button>
        <Link
          href={`/dashboard/conversaciones?conversationId=${encodeURIComponent(conv.conversation_id)}`}
          className="inline-flex items-center gap-1.5 rounded-lg border border-[#4FAEB2]/30 bg-[#4FAEB2]/5 px-3 py-1.5 text-[11px] font-semibold text-[#3F8E91] transition-colors hover:bg-[#4FAEB2]/10"
        >
          <ExternalLink className="h-3 w-3" />
          Abrir conversación
        </Link>
        {conv.prospecto_id ? (
          <Link
            href={`/crm/${conv.prospecto_id}`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Ver lead CRM
          </Link>
        ) : null}
      </div>

      {open ? (
        <div className="mt-3 rounded-lg border border-slate-100 bg-slate-50/60 p-2">
          {loadingMsgs ? (
            <p className="px-2 py-3 text-center text-[11px] text-slate-500">Cargando mensajes…</p>
          ) : !mensajes || mensajes.length === 0 ? (
            <p className="px-2 py-3 text-center text-[11px] text-slate-500">Sin mensajes para mostrar.</p>
          ) : (
            <div className="max-h-64 space-y-1.5 overflow-y-auto px-1 py-1">
              {mensajes.map((m) => (
                <div
                  key={m.id}
                  className={`flex ${m.from_me ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-2.5 py-1.5 text-[11px] ${
                      m.from_me
                        ? "bg-[#4FAEB2]/12 text-slate-800"
                        : "border border-slate-200 bg-white text-slate-700"
                    }`}
                  >
                    <p className="whitespace-pre-line break-words">{m.content}</p>
                    <p className="mt-0.5 text-right text-[9px] text-slate-400">
                      {new Date(m.created_at).toLocaleString("es-PY", {
                        day: "2-digit",
                        month: "2-digit",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </li>
  );
}

function MiniStat({
  label,
  value,
  accent = "neutral",
}: {
  label: string;
  value: number;
  accent?: "neutral" | "featured";
}) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50/50 p-2">
      <p className="text-[9px] font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p
        className={`mt-0.5 text-base font-semibold tabular-nums ${
          accent === "featured" ? "text-[#3F8E91]" : "text-slate-900"
        }`}
      >
        {value.toLocaleString("es-PY")}
      </p>
    </div>
  );
}

function OutcomeBadge({ outcome, estado }: { outcome: string; estado: string | null }) {
  if (!estado) {
    return (
      <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
        Sin tipificar
      </span>
    );
  }
  const map: Record<string, string> = {
    conversion: "border-emerald-200 bg-emerald-50 text-emerald-700",
    qualified_lead: "border-blue-200 bg-blue-50 text-blue-700",
    lost: "border-rose-200 bg-rose-50 text-rose-700",
    no_response: "border-slate-200 bg-slate-50 text-slate-600",
    claim: "border-amber-200 bg-amber-50 text-amber-700",
    other: "border-slate-200 bg-slate-50 text-slate-600",
    pending: "border-slate-200 bg-slate-50 text-slate-500",
  };
  const label: Record<string, string> = {
    conversion: "Conversión",
    qualified_lead: "Calificado",
    lost: "Perdido",
    no_response: "Sin respuesta",
    claim: "Reclamo",
    other: "Otro",
    pending: "Pendiente",
  };
  const cls = map[outcome] ?? "border-slate-200 bg-slate-50 text-slate-600";
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${cls}`}>
      {label[outcome] ?? outcome}
    </span>
  );
}
