"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Search, Sparkles, TrendingUp } from "lucide-react";
import { useEtapasCrm, useProspectos } from "@/shared/hooks/useCrm";
import { normalizeEtapaCodigo } from "@/lib/crm/etapas";
import type { Prospecto } from "@/lib/crm/types";

/**
 * CRM funnel mobile — vista por etapa.
 *  - Header con KPI: pipeline total (suma de valor_estimado).
 *  - Tabs scrollables horizontales por etapa con count.
 *  - Búsqueda dentro de la etapa.
 *  - Cards apiladas: empresa, contacto, valor estimado, fecha.
 *  - Tap → /crm/{id}.
 */
export default function CrmMobile() {
  const { prospectos, isLoading: loadingP, error } = useProspectos();
  const { etapas, isLoading: loadingE } = useEtapasCrm();
  const [etapaActivaCodigo, setEtapaActivaCodigo] = useState<string | null>(null);
  const [query, setQuery] = useState("");

  const isLoading = loadingP || loadingE;

  const conteoPorEtapa = useMemo(() => {
    const map = new Map<string, { count: number; total: number }>();
    for (const p of prospectos) {
      const code = normalizeEtapaCodigo(p.etapa);
      const acc = map.get(code) ?? { count: 0, total: 0 };
      acc.count += 1;
      acc.total += Number(p.valor_estimado ?? 0);
      map.set(code, acc);
    }
    return map;
  }, [prospectos]);

  const pipelineTotal = useMemo(
    () => prospectos.reduce((s, p) => s + Number(p.valor_estimado ?? 0), 0),
    [prospectos]
  );

  const etapasOrdenadas = useMemo(
    () => [...etapas].sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0)),
    [etapas]
  );

  const etapaActiva =
    etapasOrdenadas.find((e) => normalizeEtapaCodigo(e.codigo) === etapaActivaCodigo) ??
    etapasOrdenadas.find((e) => (conteoPorEtapa.get(normalizeEtapaCodigo(e.codigo))?.count ?? 0) > 0) ??
    etapasOrdenadas[0];

  const filtrados = useMemo(() => {
    if (!etapaActiva) return [];
    const q = query.trim().toLowerCase();
    const codeActiva = normalizeEtapaCodigo(etapaActiva.codigo);
    return prospectos
      .filter((p) => normalizeEtapaCodigo(p.etapa) === codeActiva)
      .filter((p) => {
        if (!q) return true;
        return (
          p.empresa.toLowerCase().includes(q) ||
          (p.contacto ?? "").toLowerCase().includes(q)
        );
      })
      .slice()
      .sort((a, b) => (b.fecha_actualizacion ?? "").localeCompare(a.fecha_actualizacion ?? ""));
  }, [prospectos, etapaActiva, query]);

  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      <header className="mb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">CRM</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {prospectos.length === 0 ? "Sin prospectos." : `${prospectos.length} prospectos activos`}
            </p>
          </div>
          <Link
            href="/crm/nuevo"
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#0EA5E9] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors active:bg-[#0284C7]"
          >
            <Plus className="h-4 w-4" />
            Nuevo
          </Link>
        </div>
      </header>

      {/* KPI pipeline */}
      <div className="mb-4 rounded-2xl border border-violet-200 bg-gradient-to-br from-white to-violet-50 p-4">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-violet-100 text-violet-700">
            <TrendingUp className="h-4 w-4" />
          </div>
          <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">Pipeline total</p>
        </div>
        <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{formatGsCompact(pipelineTotal)}</p>
        <p className="mt-0.5 text-xs text-slate-600">{prospectos.length} oportunidades</p>
      </div>

      {/* Tabs de etapa */}
      <div className="mb-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {etapasOrdenadas.map((e) => {
          const code = normalizeEtapaCodigo(e.codigo);
          const conteo = conteoPorEtapa.get(code);
          const active = etapaActiva ? normalizeEtapaCodigo(etapaActiva.codigo) === code : false;
          return (
            <button
              key={e.codigo}
              type="button"
              onClick={() => setEtapaActivaCodigo(code)}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                active ? "bg-violet-600 text-white" : "border border-slate-200 bg-white text-slate-600"
              }`}
            >
              {e.nombre}
              {conteo && conteo.count > 0 ? (
                <span className={`ml-1.5 text-[10px] ${active ? "text-white/85" : "text-slate-400"}`}>
                  {conteo.count}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Buscar en esta etapa…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#0EA5E9]/40 focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]/30"
        />
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo cargar el CRM.
        </div>
      ) : null}

      {isLoading ? (
        <SkeletonList />
      ) : prospectos.length === 0 ? (
        <EmptyState />
      ) : filtrados.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
          <Sparkles className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-2 text-sm font-medium text-slate-700">
            {query.trim() ? "Sin resultados" : "Esta etapa está vacía"}
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtrados.map((p) => (
            <ProspectoCard key={p.id} prospecto={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProspectoCard({ prospecto }: { prospecto: Prospecto }) {
  return (
    <li>
      <Link
        href={`/crm/${prospecto.id}`}
        className="block rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-transform active:scale-[0.99]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{prospecto.empresa}</p>
            {prospecto.contacto ? (
              <p className="truncate text-[11px] text-slate-500">{prospecto.contacto}</p>
            ) : null}
            <p className="mt-0.5 text-[11px] text-slate-400">
              Actualizado {formatFecha(prospecto.fecha_actualizacion)}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-base font-bold tabular-nums text-violet-700">
              {formatGsCompact(prospecto.valor_estimado)}
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
      <Sparkles className="mx-auto h-8 w-8 text-slate-300" />
      <p className="mt-2 text-sm font-medium text-slate-700">Sin prospectos</p>
      <p className="mt-1 text-xs text-slate-500">Tocá <span className="font-semibold">Nuevo</span> para sumar el primero.</p>
    </div>
  );
}

function SkeletonList() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="rounded-2xl border border-slate-200 bg-white p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-100" />
              <div className="h-2.5 w-1/2 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="ml-auto h-4 w-16 shrink-0 animate-pulse rounded bg-slate-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatGsCompact(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000_000) return `₲ ${(n / 1_000_000_000).toFixed(1)}MM`;
  if (abs >= 1_000_000) return `₲ ${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `₲ ${(n / 1_000).toFixed(0)}k`;
  return `₲ ${n.toLocaleString("es-PY")}`;
}

function formatFecha(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-PY", { day: "2-digit", month: "short" });
}
