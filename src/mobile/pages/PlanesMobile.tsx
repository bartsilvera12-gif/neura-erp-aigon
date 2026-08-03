"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Layers, Plus, Search } from "lucide-react";
import { usePlanes } from "@/shared/hooks/usePlanes";
import type { Plan } from "@/lib/planes/types";

/**
 * Lista mobile de Planes. Diseño:
 *  - Header + KPI: activos/total.
 *  - Búsqueda + filtro por estado.
 *  - Cards: nombre del plan, precio prominente, periodicidad, badges de estado.
 *  - Tap card → /planes/{id}.
 */

type EstadoFilter = "todos" | "activo" | "inactivo";

export default function PlanesMobile() {
  const { planes, isLoading, error } = usePlanes();
  const [query, setQuery] = useState("");
  const [estado, setEstado] = useState<EstadoFilter>("todos");

  const counts = useMemo(() => {
    const activos = planes.filter((p) => p.estado === "activo").length;
    return { total: planes.length, activos, inactivos: planes.length - activos };
  }, [planes]);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    return planes
      .filter((p) => {
        if (estado !== "todos" && p.estado !== estado) return false;
        if (!q) return true;
        return p.nombre.toLowerCase().includes(q) || p.codigo_plan.toLowerCase().includes(q);
      })
      .slice()
      .sort((a, b) => a.precio - b.precio);
  }, [planes, query, estado]);

  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      <header className="mb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Planes</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {counts.total === 0 ? "Sin planes cargados." : `${counts.activos} activos de ${counts.total}`}
            </p>
          </div>
          <Link
            href="/planes/nuevo"
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#0EA5E9] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors active:bg-[#0284C7]"
          >
            <Plus className="h-4 w-4" />
            Nuevo
          </Link>
        </div>
      </header>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Nombre o código del plan"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#0EA5E9]/40 focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]/30"
        />
      </div>

      <div className="mb-3 flex gap-2">
        <FilterChip active={estado === "todos"} onClick={() => setEstado("todos")} label={`Todos (${counts.total})`} />
        <FilterChip active={estado === "activo"} onClick={() => setEstado("activo")} label={`Activos (${counts.activos})`} />
        <FilterChip active={estado === "inactivo"} onClick={() => setEstado("inactivo")} label={`Inactivos (${counts.inactivos})`} />
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar los planes.
        </div>
      ) : null}

      {isLoading ? (
        <SkeletonList />
      ) : filtrados.length === 0 ? (
        <EmptyState hayBusqueda={!!query.trim() || estado !== "todos"} total={planes.length} />
      ) : (
        <ul className="space-y-2">
          {filtrados.map((p) => (
            <PlanCard key={p.id} plan={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

function PlanCard({ plan }: { plan: Plan }) {
  const activo = plan.estado === "activo";
  const periodicidad =
    plan.periodicidad === "mensual" ? "/mes" : plan.periodicidad === "anual" ? "/año" : " único";
  return (
    <li>
      <Link
        href={`/planes/${plan.id}`}
        className="block rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-transform active:scale-[0.99]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-[#0EA5E9]">
              {plan.codigo_plan}
            </p>
            <p className="mt-0.5 truncate text-sm font-semibold text-slate-900">{plan.nombre}</p>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              <EstadoBadge activo={activo} />
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600">
                {plan.periodicidad}
              </span>
              {plan.limite_usuarios === null ? (
                <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                  Ilimitado
                </span>
              ) : (
                <span className="rounded-full bg-violet-50 px-1.5 py-0.5 text-[10px] font-medium text-violet-700">
                  {plan.limite_usuarios} usuarios
                </span>
              )}
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-lg font-bold tabular-nums text-slate-900">
              {plan.moneda === "USD" ? "USD " : "₲ "}
              {plan.precio.toLocaleString(plan.moneda === "USD" ? "en-US" : "es-PY")}
            </p>
            <p className="text-[10px] text-slate-500">{periodicidad}</p>
          </div>
        </div>
      </Link>
    </li>
  );
}

function EstadoBadge({ activo }: { activo: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
        activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      <span className={`h-1 w-1 rounded-full ${activo ? "bg-emerald-500" : "bg-slate-400"}`} />
      {activo ? "Activo" : "Inactivo"}
    </span>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-[#0EA5E9] text-white" : "border border-slate-200 bg-white text-slate-600"
      }`}
    >
      {label}
    </button>
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
        <Layers className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 text-sm font-medium text-slate-700">Sin planes cargados</p>
        <p className="mt-1 text-xs text-slate-500">Tocá <span className="font-semibold">Nuevo</span> para crear el primero.</p>
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
              <div className="h-2.5 w-1/4 animate-pulse rounded bg-slate-100" />
              <div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-100" />
              <div className="h-2.5 w-3/4 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="ml-auto h-5 w-20 shrink-0 animate-pulse rounded bg-slate-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}
