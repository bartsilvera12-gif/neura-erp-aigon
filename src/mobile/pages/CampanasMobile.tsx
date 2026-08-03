"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Search, SendHorizontal } from "lucide-react";
import { useCampanas, type CampaignRow } from "@/shared/hooks/useCampanas";

/**
 * Lista mobile de Campañas.
 *  - Header + botón Nueva.
 *  - Búsqueda.
 *  - Cards con: nombre, estado, métricas básicas (enviados/total, fallas).
 */
export default function CampanasMobile() {
  const { campanas, isLoading, error } = useCampanas();
  const [query, setQuery] = useState("");

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ord = [...campanas].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    if (!q) return ord;
    return ord.filter((c) =>
      c.name.toLowerCase().includes(q) ||
      c.template_name.toLowerCase().includes(q) ||
      c.status.toLowerCase().includes(q)
    );
  }, [campanas, query]);

  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      <header className="mb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Campañas</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {campanas.length === 0 ? "Sin campañas." : `${campanas.length} campañas`}
            </p>
          </div>
          <Link
            href="/dashboard/campanas/nuevo"
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#0EA5E9] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors active:bg-[#0284C7]"
          >
            <Plus className="h-4 w-4" />
            Nueva
          </Link>
        </div>
      </header>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Nombre, template o estado"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#0EA5E9]/40 focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]/30"
        />
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar las campañas.
        </div>
      ) : null}

      {isLoading ? (
        <SkeletonList />
      ) : filtradas.length === 0 ? (
        <EmptyState hayBusqueda={!!query.trim()} total={campanas.length} />
      ) : (
        <ul className="space-y-2">
          {filtradas.map((c) => (
            <CampanaCard key={c.id} campana={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CampanaCard({ campana }: { campana: CampaignRow }) {
  const enviados = campana.sent_count + campana.failed_count;
  const totalPct = campana.total_count > 0 ? Math.round((enviados / campana.total_count) * 100) : 0;
  return (
    <li>
      <Link
        href={`/dashboard/campanas/${campana.id}`}
        className="block rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-transform active:scale-[0.99]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{campana.name}</p>
            <p className="truncate text-[11px] text-slate-500">{campana.template_name}</p>
            <div className="mt-1">
              <EstadoBadge status={campana.status} />
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-base font-bold tabular-nums text-slate-900">
              {campana.sent_count.toLocaleString("es-PY")}
              <span className="text-xs text-slate-400">/{campana.total_count.toLocaleString("es-PY")}</span>
            </p>
            {campana.failed_count > 0 ? (
              <p className="text-[10px] text-rose-600">{campana.failed_count} fallas</p>
            ) : campana.replied_count > 0 ? (
              <p className="text-[10px] text-emerald-600">{campana.replied_count} respuestas</p>
            ) : (
              <p className="text-[10px] text-slate-500">{totalPct}% enviadas</p>
            )}
          </div>
        </div>

        {/* Barra de progreso */}
        {campana.total_count > 0 ? (
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-slate-100">
            <div
              className="h-full rounded-full bg-[#0EA5E9] transition-[width] duration-300"
              style={{ width: `${Math.min(100, totalPct)}%` }}
            />
          </div>
        ) : null}
      </Link>
    </li>
  );
}

function EstadoBadge({ status }: { status: string }) {
  const s = (status ?? "").toLowerCase();
  const cfg: Record<string, { cls: string; label: string }> = {
    completed: { cls: "bg-emerald-50 text-emerald-700", label: "Completada" },
    sending: { cls: "bg-[#4FAEB2]/10 text-[#3F8E91]", label: "Enviando" },
    ready: { cls: "bg-amber-50 text-amber-700", label: "Lista" },
    draft: { cls: "bg-slate-100 text-slate-600", label: "Borrador" },
    failed: { cls: "bg-rose-50 text-rose-700", label: "Falló" },
    canceled: { cls: "bg-slate-100 text-slate-500", label: "Cancelada" },
  };
  const c = cfg[s] ?? { cls: "bg-slate-100 text-slate-600", label: status };
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${c.cls}`}>
      {c.label}
    </span>
  );
}

function EmptyState({ hayBusqueda, total }: { hayBusqueda: boolean; total: number }) {
  if (hayBusqueda) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <Search className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 text-sm font-medium text-slate-700">Sin resultados</p>
      </div>
    );
  }
  if (total === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <SendHorizontal className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 text-sm font-medium text-slate-700">Sin campañas</p>
        <p className="mt-1 text-xs text-slate-500">Tocá <span className="font-semibold">Nueva</span> para lanzar una.</p>
      </div>
    );
  }
  return null;
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
              <div className="h-2.5 w-1/4 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="ml-auto h-4 w-16 shrink-0 animate-pulse rounded bg-slate-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}
