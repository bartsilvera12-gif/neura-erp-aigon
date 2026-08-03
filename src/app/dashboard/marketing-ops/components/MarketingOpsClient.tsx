"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { MarketingOpsDashboard, MarketingOpsPieza } from "@/lib/marketing-ops/types";
import {
  ESTADO_CLIENTE_OPTIONS,
  ESTADO_PRODUCCION_OPTIONS,
  ESTADO_PUBLICACION_OPTIONS,
  PRIORIDAD_OPTIONS,
  clienteLabel,
  estadoBadgeClass,
  estadoBadgeDotClass,
  fmtDate,
  labelFor,
  prioridadBadgeClass,
  prioridadDotClass,
} from "./marketingOpsUi";
import MarketingOpsPiezaDetalleModal from "./MarketingOpsPiezaDetalleModal";

type ClienteOption = { id: string; empresa?: string | null; nombre_contacto?: string | null; nombre?: string | null };
type UsuarioOption = { id: string; nombre?: string | null; email?: string | null };

type PiezaDraft = {
  id?: string;
  titulo: string;
  cliente_id: string;
  tipo_pieza: string;
  canal: string;
  responsable_id: string;
  fecha_limite: string;
  fecha_publicacion: string;
  prioridad: string;
  estado_produccion: string;
  estado_cliente: string;
  estado_publicacion: string;
  link_archivo: string;
  observaciones: string;
};

const EMPTY_DRAFT: PiezaDraft = {
  titulo: "",
  cliente_id: "",
  tipo_pieza: "",
  canal: "",
  responsable_id: "",
  fecha_limite: "",
  fecha_publicacion: "",
  prioridad: "media",
  estado_produccion: "por_hacer",
  estado_cliente: "no_enviado",
  estado_publicacion: "pendiente",
  link_archivo: "",
  observaciones: "",
};

function draftFromPieza(p: MarketingOpsPieza): PiezaDraft {
  return {
    id: p.id,
    titulo: p.titulo,
    cliente_id: p.cliente_id ?? "",
    tipo_pieza: p.tipo_pieza ?? "",
    canal: p.canal ?? "",
    responsable_id: p.responsable_id ?? "",
    fecha_limite: p.fecha_limite ?? "",
    fecha_publicacion: p.fecha_publicacion ?? "",
    prioridad: p.prioridad,
    estado_produccion: p.estado_produccion,
    estado_cliente: p.estado_cliente,
    estado_publicacion: p.estado_publicacion,
    link_archivo: p.link_archivo ?? "",
    observaciones: p.observaciones ?? "",
  };
}

// ── Estilos compartidos ──────────────────────────────────────────────────────

const INPUT_CLS =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";
const SELECT_CLS =
  "w-full appearance-none rounded-xl border border-slate-200 bg-white bg-[length:14px_14px] bg-[right_0.7rem_center] bg-no-repeat px-3 py-2 pr-8 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";
const CHEVRON_STYLE = {
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%234FAEB2' stroke-width='2.5'><path stroke-linecap='round' stroke-linejoin='round' d='M6 9l6 6 6-6'/></svg>\")",
} as const;

// ── Iconos ────────────────────────────────────────────────────────────────────

type IconProps = { className?: string };

const IconPlus = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M12 5v14M5 12h14" />
  </svg>
);

const IconClock = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);

const IconAlert = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
    <line x1="12" y1="9" x2="12" y2="13" />
    <line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

const IconPlay = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <polygon points="5 3 19 12 5 21 5 3" />
  </svg>
);

const IconEye = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconSend = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <line x1="22" y1="2" x2="11" y2="13" />
    <polygon points="22 2 15 22 11 13 2 9 22 2" />
  </svg>
);

const IconCheck = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const IconCalendar = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const IconMegaphone = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
  </svg>
);

const IconHash = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <line x1="4" y1="9" x2="20" y2="9" />
    <line x1="4" y1="15" x2="20" y2="15" />
    <line x1="10" y1="3" x2="8" y2="21" />
    <line x1="16" y1="3" x2="14" y2="21" />
  </svg>
);

const IconSearch = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <circle cx="11" cy="11" r="7" />
    <path d="m20 20-3.5-3.5" />
  </svg>
);

// ── Componente principal ──────────────────────────────────────────────────────

type KpiAccent = "neutral" | "featured" | "warning" | "danger";

export default function MarketingOpsClient() {
  const [dashboard, setDashboard] = useState<MarketingOpsDashboard | null>(null);
  const [piezas, setPiezas] = useState<MarketingOpsPieza[]>([]);
  const [clientes, setClientes] = useState<ClienteOption[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [draft, setDraft] = useState<PiezaDraft | null>(null);
  const [detalleId, setDetalleId] = useState<string | null>(null);

  const [filters, setFilters] = useState({
    q: "",
    cliente_id: "",
    responsable_id: "",
    prioridad: "",
    estado_produccion: "",
    estado_cliente: "",
    estado_publicacion: "",
    vencidas: false,
  });

  const query = useMemo(() => {
    const sp = new URLSearchParams();
    for (const [key, value] of Object.entries(filters)) {
      if (typeof value === "boolean") {
        if (value) sp.set(key, "true");
      } else if (value.trim()) {
        sp.set(key, value.trim());
      }
    }
    return sp.toString();
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const [rDash, rPiezas, rClientes, rUsers] = await Promise.all([
      fetchWithSupabaseSession("/api/marketing-ops/dashboard", { cache: "no-store" }),
      fetchWithSupabaseSession(`/api/marketing-ops/piezas${query ? `?${query}` : ""}`, { cache: "no-store" }),
      fetchWithSupabaseSession("/api/clientes", { cache: "no-store" }),
      fetchWithSupabaseSession("/api/usuarios/empresa-activos", { cache: "no-store" }),
    ]);

    const [jDash, jPiezas, jClientes, jUsers] = await Promise.all([
      rDash.json().catch(() => ({})),
      rPiezas.json().catch(() => ({})),
      rClientes.json().catch(() => ({})),
      rUsers.json().catch(() => ({})),
    ]);

    if (!rDash.ok || !jDash.success) {
      setErr(typeof jDash.error === "string" ? jDash.error : "No se pudo cargar Marketing Ops");
      setLoading(false);
      return;
    }
    if (!rPiezas.ok || !jPiezas.success) {
      setErr(typeof jPiezas.error === "string" ? jPiezas.error : "No se pudieron cargar piezas");
      setLoading(false);
      return;
    }

    setDashboard(jDash.data as MarketingOpsDashboard);
    setPiezas(Array.isArray(jPiezas.data) ? (jPiezas.data as MarketingOpsPieza[]) : []);
    setClientes(Array.isArray(jClientes.data) ? (jClientes.data as ClienteOption[]) : []);
    setUsuarios(Array.isArray(jUsers.usuarios) ? (jUsers.usuarios as UsuarioOption[]) : []);
    setLoading(false);
  }, [query]);

  useEffect(() => {
    void load();
  }, [load]);

  async function saveDraft() {
    if (!draft) return;
    setSaving(true);
    setErr(null);
    const isEdit = Boolean(draft.id);
    const payload = {
      titulo: draft.titulo,
      cliente_id: draft.cliente_id || null,
      tipo_pieza: draft.tipo_pieza || null,
      canal: draft.canal || null,
      responsable_id: draft.responsable_id || null,
      fecha_limite: draft.fecha_limite || null,
      fecha_publicacion: draft.fecha_publicacion || null,
      prioridad: draft.prioridad,
      estado_produccion: draft.estado_produccion,
      estado_cliente: draft.estado_cliente,
      estado_publicacion: draft.estado_publicacion,
      link_archivo: draft.link_archivo || null,
      observaciones: draft.observaciones || null,
    };
    const res = await fetchWithSupabaseSession(
      isEdit ? `/api/marketing-ops/piezas/${draft.id}` : "/api/marketing-ops/piezas",
      {
        method: isEdit ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      },
    );
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok || !json.success) {
      setErr(typeof json.error === "string" ? json.error : "No se pudo guardar");
      return;
    }
    setDraft(null);
    await load();
  }

  const kpis: { label: string; value: number; icon: React.ReactNode; accent: KpiAccent }[] = [
    { label: "Piezas pendientes", value: dashboard?.pendientes ?? 0, icon: <IconClock />, accent: "neutral" },
    { label: "Vencidas", value: dashboard?.vencidas ?? 0, icon: <IconAlert />, accent: (dashboard?.vencidas ?? 0) > 0 ? "danger" : "neutral" },
    { label: "En producción", value: dashboard?.en_produccion ?? 0, icon: <IconPlay />, accent: "neutral" },
    { label: "En revisión", value: dashboard?.en_revision ?? 0, icon: <IconEye />, accent: "neutral" },
    { label: "Enviadas al cliente", value: dashboard?.enviadas_cliente ?? 0, icon: <IconSend />, accent: "neutral" },
    { label: "Aprobadas", value: dashboard?.aprobadas ?? 0, icon: <IconCheck />, accent: "neutral" },
    { label: "Programadas", value: dashboard?.programadas ?? 0, icon: <IconCalendar />, accent: "neutral" },
    { label: "Publicadas", value: dashboard?.publicadas ?? 0, icon: <IconMegaphone />, accent: "featured" },
  ];

  const hasFilters = Boolean(
    filters.q ||
      filters.cliente_id ||
      filters.responsable_id ||
      filters.prioridad ||
      filters.estado_produccion ||
      filters.estado_cliente ||
      filters.estado_publicacion ||
      filters.vencidas,
  );

  return (
    <div className="mx-auto max-w-[1600px] space-y-6 p-4 md:p-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Marketing · OPS
            </p>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Marketing Ops</h1>
          <p className="mt-1 text-sm text-slate-500">
            Operación de piezas por cliente, responsable, prioridad, aprobación y publicación.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setDraft({ ...EMPTY_DRAFT })}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91]"
        >
          <IconPlus />
          Nueva pieza
        </button>
      </div>

      {err ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{err}</div>
      ) : null}

      {/* KPIs */}
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
        {kpis.map((k) => (
          <KpiCard key={k.label} {...k} />
        ))}
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
          <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]" />
            Filtros
          </h3>
        </div>
        <div className="mt-4 grid gap-3 md:grid-cols-4 xl:grid-cols-8">
          <div className="relative md:col-span-2">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[#4FAEB2]"
            >
              <IconSearch />
            </span>
            <input
              className={`${INPUT_CLS} pl-9`}
              placeholder="Buscar título…"
              value={filters.q}
              onChange={(e) => setFilters((f) => ({ ...f, q: e.target.value }))}
            />
          </div>
          <FilterSelect label="Cliente" value={filters.cliente_id} onChange={(v) => setFilters((f) => ({ ...f, cliente_id: v }))}>
            {clientes.map((c) => (
              <option key={c.id} value={c.id}>
                {clienteLabel(c)}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Responsable" value={filters.responsable_id} onChange={(v) => setFilters((f) => ({ ...f, responsable_id: v }))}>
            {usuarios.map((u) => (
              <option key={u.id} value={u.id}>
                {u.nombre || u.email || u.id.slice(0, 8)}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Prioridad" value={filters.prioridad} onChange={(v) => setFilters((f) => ({ ...f, prioridad: v }))}>
            {PRIORIDAD_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Producción" value={filters.estado_produccion} onChange={(v) => setFilters((f) => ({ ...f, estado_produccion: v }))}>
            {ESTADO_PRODUCCION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Cliente (estado)" value={filters.estado_cliente} onChange={(v) => setFilters((f) => ({ ...f, estado_cliente: v }))}>
            {ESTADO_CLIENTE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </FilterSelect>
          <FilterSelect label="Publicación" value={filters.estado_publicacion} onChange={(v) => setFilters((f) => ({ ...f, estado_publicacion: v }))}>
            {ESTADO_PUBLICACION_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </FilterSelect>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          <label className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60">
            <input
              type="checkbox"
              checked={filters.vencidas}
              onChange={(e) => setFilters((f) => ({ ...f, vencidas: e.target.checked }))}
              className="h-4 w-4 rounded border-slate-300 text-[#4FAEB2] accent-[#4FAEB2] focus:ring-[#4FAEB2]/30"
            />
            Solo vencidas
          </label>
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91]"
          >
            Aplicar filtros
          </button>
          {hasFilters ? (
            <button
              type="button"
              onClick={() =>
                setFilters({
                  q: "",
                  cliente_id: "",
                  responsable_id: "",
                  prioridad: "",
                  estado_produccion: "",
                  estado_cliente: "",
                  estado_publicacion: "",
                  vencidas: false,
                })
              }
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/5 hover:text-[#3F8E91]"
            >
              Limpiar
            </button>
          ) : null}
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-2xl border border-[#4FAEB2]/45 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
            <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]" />
              Piezas
            </h3>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-[#4FAEB2]/30 bg-[#4FAEB2]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#3F8E91]">
            <IconHash className="h-3 w-3" /> {piezas.length}
          </span>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50/80 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              <tr>
                <th className="px-4 py-3">Título</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Responsable</th>
                <th className="px-4 py-3">Prioridad</th>
                <th className="px-4 py-3">Producción</th>
                <th className="px-4 py-3">Cliente</th>
                <th className="px-4 py-3">Publicación</th>
                <th className="px-4 py-3">Límite</th>
                <th className="px-4 py-3">Publicar</th>
                <th className="px-4 py-3 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center">
                    <div className="inline-flex items-center gap-2 text-sm text-slate-500">
                      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#4FAEB2]" />
                      Cargando piezas…
                    </div>
                  </td>
                </tr>
              ) : piezas.length === 0 ? (
                <tr>
                  <td colSpan={10} className="px-4 py-12 text-center text-sm text-slate-500">
                    Sin piezas para los filtros actuales.
                  </td>
                </tr>
              ) : (
                piezas.map((p) => (
                  <tr key={p.id} className="transition-colors hover:bg-[#4FAEB2]/5">
                    <td className="max-w-[280px] px-4 py-3">
                      <p className="font-semibold text-slate-900">{p.titulo}</p>
                      <p className="text-xs text-slate-500">
                        {[p.tipo_pieza, p.canal].filter(Boolean).join(" · ") || "—"}
                      </p>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{clienteLabel(p.cliente)}</td>
                    <td className="px-4 py-3 text-slate-700">{p.responsable?.nombre ?? p.responsable?.email ?? "—"}</td>
                    <td className="px-4 py-3">
                      <Badge className={prioridadBadgeClass(p.prioridad)}>
                        <span aria-hidden="true" className={`h-1 w-1 rounded-full ${prioridadDotClass(p.prioridad)}`} />
                        {labelFor(PRIORIDAD_OPTIONS, p.prioridad)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={estadoBadgeClass(p.estado_produccion)}>
                        <span aria-hidden="true" className={`h-1 w-1 rounded-full ${estadoBadgeDotClass(p.estado_produccion)}`} />
                        {labelFor(ESTADO_PRODUCCION_OPTIONS, p.estado_produccion)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={estadoBadgeClass(p.estado_cliente)}>
                        <span aria-hidden="true" className={`h-1 w-1 rounded-full ${estadoBadgeDotClass(p.estado_cliente)}`} />
                        {labelFor(ESTADO_CLIENTE_OPTIONS, p.estado_cliente)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3">
                      <Badge className={estadoBadgeClass(p.estado_publicacion)}>
                        <span aria-hidden="true" className={`h-1 w-1 rounded-full ${estadoBadgeDotClass(p.estado_publicacion)}`} />
                        {labelFor(ESTADO_PUBLICACION_OPTIONS, p.estado_publicacion)}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-slate-700">{fmtDate(p.fecha_limite)}</td>
                    <td className="px-4 py-3 text-slate-700">{fmtDate(p.fecha_publicacion)}</td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setDraft(draftFromPieza(p))}
                          className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/5 hover:text-[#3F8E91]"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => setDetalleId(p.id)}
                          className="rounded-xl bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91]"
                        >
                          Detalle
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {draft ? (
        <PiezaModal
          draft={draft}
          clientes={clientes}
          usuarios={usuarios}
          saving={saving}
          onChange={setDraft}
          onClose={() => setDraft(null)}
          onSave={() => void saveDraft()}
        />
      ) : null}

      <MarketingOpsPiezaDetalleModal
        piezaId={detalleId}
        open={detalleId != null}
        onClose={() => {
          setDetalleId(null);
          // Refresca el listado por si cambió un estado/comentario desde el modal
          void load();
        }}
      />
    </div>
  );
}

// ── Sub-componentes ───────────────────────────────────────────────────────────

function KpiCard({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  accent: KpiAccent;
}) {
  const chipCls =
    accent === "featured"
      ? "border-[#4FAEB2]/30 bg-[#4FAEB2]/12 text-[#4FAEB2]"
      : accent === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-600"
        : accent === "danger"
          ? "border-rose-200 bg-rose-50 text-rose-600"
          : "border-slate-200 bg-slate-50 text-slate-500";

  const cardCls =
    accent === "featured"
      ? "relative overflow-hidden rounded-2xl border border-[#4FAEB2]/55 bg-gradient-to-br from-white via-white to-[#4FAEB2]/8 p-4 shadow-[0_4px_18px_rgba(79,174,178,0.08)]"
      : "relative overflow-hidden rounded-2xl border border-[#4FAEB2]/45 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

  const valueCls =
    accent === "featured"
      ? "text-[#3F8E91]"
      : accent === "danger"
        ? "text-rose-600"
        : accent === "warning"
          ? "text-amber-600"
          : "text-slate-900";

  return (
    <div className={cardCls}>
      {accent === "featured" ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#4FAEB2] via-[#4FAEB2]/70 to-[#4FAEB2]/30"
        />
      ) : null}
      <div className="flex items-start justify-between gap-2">
        <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${chipCls}`}>
          {icon}
        </span>
      </div>
      <p className={`mt-2 text-2xl font-semibold tabular-nums tracking-tight ${valueCls}`}>{value}</p>
    </div>
  );
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${className}`}>
      {children}
    </span>
  );
}

function FilterSelect({
  label,
  value,
  onChange,
  children,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  children: React.ReactNode;
}) {
  return (
    <select
      className={SELECT_CLS}
      style={CHEVRON_STYLE}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label={label}
    >
      <option value="">{label}</option>
      {children}
    </select>
  );
}

function PiezaModal({
  draft,
  clientes,
  usuarios,
  saving,
  onChange,
  onClose,
  onSave,
}: {
  draft: PiezaDraft;
  clientes: ClienteOption[];
  usuarios: UsuarioOption[];
  saving: boolean;
  onChange: (draft: PiezaDraft) => void;
  onClose: () => void;
  onSave: () => void;
}) {
  const set = (patch: Partial<PiezaDraft>) => onChange({ ...draft, ...patch });
  const isEdit = Boolean(draft.id);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6">
      <button
        type="button"
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm"
        aria-label="Cerrar"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        className="relative flex h-[88vh] max-h-[920px] w-full max-w-3xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl shadow-[#4FAEB2]/10 ring-1 ring-[#4FAEB2]/15"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#4FAEB2] via-[#4FAEB2]/80 to-[#4FAEB2]/40"
        />
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-br from-white via-white to-[#4FAEB2]/5 px-6 pb-5 pt-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
              />
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4FAEB2]">
                {isEdit ? "Editar" : "Nueva"}
              </p>
            </div>
            <h2 className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-900">
              {isEdit ? "Editar pieza" : "Nueva pieza"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Datos operativos de Marketing Ops.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#4FAEB2]"
          >
            Cerrar
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50 px-6 py-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Título" className="sm:col-span-2">
              <input className={INPUT_CLS} value={draft.titulo} onChange={(e) => set({ titulo: e.target.value })} />
            </Field>
            <Field label="Cliente">
              <select className={SELECT_CLS} style={CHEVRON_STYLE} value={draft.cliente_id} onChange={(e) => set({ cliente_id: e.target.value })}>
                <option value="">Sin cliente</option>
                {clientes.map((c) => (
                  <option key={c.id} value={c.id}>
                    {clienteLabel(c)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Responsable">
              <select className={SELECT_CLS} style={CHEVRON_STYLE} value={draft.responsable_id} onChange={(e) => set({ responsable_id: e.target.value })}>
                <option value="">Sin responsable</option>
                {usuarios.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.nombre || u.email || u.id.slice(0, 8)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Tipo de pieza">
              <input className={INPUT_CLS} value={draft.tipo_pieza} onChange={(e) => set({ tipo_pieza: e.target.value })} placeholder="Post, reel, historia…" />
            </Field>
            <Field label="Canal">
              <input className={INPUT_CLS} value={draft.canal} onChange={(e) => set({ canal: e.target.value })} placeholder="Instagram, Meta Ads…" />
            </Field>
            <Field label="Prioridad">
              <select className={SELECT_CLS} style={CHEVRON_STYLE} value={draft.prioridad} onChange={(e) => set({ prioridad: e.target.value })}>
                {PRIORIDAD_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Estado producción">
              <select className={SELECT_CLS} style={CHEVRON_STYLE} value={draft.estado_produccion} onChange={(e) => set({ estado_produccion: e.target.value })}>
                {ESTADO_PRODUCCION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Estado cliente">
              <select className={SELECT_CLS} style={CHEVRON_STYLE} value={draft.estado_cliente} onChange={(e) => set({ estado_cliente: e.target.value })}>
                {ESTADO_CLIENTE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Estado publicación">
              <select className={SELECT_CLS} style={CHEVRON_STYLE} value={draft.estado_publicacion} onChange={(e) => set({ estado_publicacion: e.target.value })}>
                {ESTADO_PUBLICACION_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Fecha límite">
              <input type="date" className={INPUT_CLS} value={draft.fecha_limite} onChange={(e) => set({ fecha_limite: e.target.value })} />
            </Field>
            <Field label="Fecha publicación">
              <input type="date" className={INPUT_CLS} value={draft.fecha_publicacion} onChange={(e) => set({ fecha_publicacion: e.target.value })} />
            </Field>
            <Field label="Link archivo" className="sm:col-span-2">
              <input className={INPUT_CLS} value={draft.link_archivo} onChange={(e) => set({ link_archivo: e.target.value })} placeholder="https://…" />
            </Field>
            <Field label="Observaciones" className="sm:col-span-2">
              <textarea className={`${INPUT_CLS} min-h-[96px]`} value={draft.observaciones} onChange={(e) => set({ observaciones: e.target.value })} />
            </Field>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-white px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#4FAEB2]"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onSave}
            className="rounded-xl bg-[#4FAEB2] px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, className = "", children }: { label: string; className?: string; children: React.ReactNode }) {
  return (
    <label className={`block text-sm ${className}`}>
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      {children}
    </label>
  );
}
