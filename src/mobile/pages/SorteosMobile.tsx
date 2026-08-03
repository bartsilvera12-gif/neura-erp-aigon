"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Search, Ticket } from "lucide-react";
import { useSorteos } from "@/shared/hooks/useSorteos";
import type { Sorteo, SorteoEstado } from "@/lib/sorteos/types";

/** Lista mobile de Sorteos. */
export default function SorteosMobile() {
  const { sorteos, isLoading, error } = useSorteos();
  const [query, setQuery] = useState("");
  const [estado, setEstado] = useState<"todos" | SorteoEstado>("todos");

  const counts = useMemo(() => {
    const c: Record<string, number> = { todos: sorteos.length };
    for (const s of sorteos) c[s.estado] = (c[s.estado] ?? 0) + 1;
    return c;
  }, [sorteos]);

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    return sorteos
      .filter((s) => (estado === "todos" ? true : s.estado === estado))
      .filter((s) => !q || s.nombre.toLowerCase().includes(q))
      .slice()
      .sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
  }, [sorteos, query, estado]);

  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      <header className="mb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Sorteos</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {sorteos.length === 0 ? "Sin sorteos." : `${sorteos.length} sorteos cargados`}
            </p>
          </div>
          <Link
            href="/sorteos/nuevo"
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
          placeholder="Nombre del sorteo"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#0EA5E9]/40 focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]/30"
        />
      </div>

      <div className="mb-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <Chip active={estado === "todos"} onClick={() => setEstado("todos")} label={`Todos (${counts.todos ?? 0})`} />
        <Chip active={estado === "activo"} onClick={() => setEstado("activo")} label={`Activos (${counts.activo ?? 0})`} />
        <Chip active={estado === "pausado"} onClick={() => setEstado("pausado")} label={`Pausados (${counts.pausado ?? 0})`} />
        <Chip active={estado === "finalizado"} onClick={() => setEstado("finalizado")} label={`Finalizados (${counts.finalizado ?? 0})`} />
        <Chip active={estado === "cerrado"} onClick={() => setEstado("cerrado")} label={`Cerrados (${counts.cerrado ?? 0})`} />
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar los sorteos.
        </div>
      ) : null}

      {isLoading ? (
        <SkeletonList />
      ) : filtrados.length === 0 ? (
        <EmptyState total={sorteos.length} />
      ) : (
        <ul className="space-y-2">
          {filtrados.map((s) => (
            <SorteoCard key={s.id} sorteo={s} />
          ))}
        </ul>
      )}
    </div>
  );
}

function SorteoCard({ sorteo }: { sorteo: Sorteo }) {
  const progreso = sorteo.max_boletos > 0
    ? Math.round((sorteo.total_boletos_vendidos / sorteo.max_boletos) * 100)
    : 0;
  return (
    <li>
      <Link
        href={`/sorteos/${sorteo.id}/editar`}
        className="block rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-transform active:scale-[0.99]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{sorteo.nombre}</p>
            <p className="text-[11px] text-slate-500">
              ₲ {sorteo.precio_por_boleto.toLocaleString("es-PY")} / boleto
            </p>
            <div className="mt-1">
              <EstadoBadge estado={sorteo.estado} />
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-base font-bold tabular-nums text-slate-900">
              {sorteo.total_boletos_vendidos.toLocaleString("es-PY")}
              <span className="text-xs text-slate-400">/{sorteo.max_boletos.toLocaleString("es-PY")}</span>
            </p>
            <p className="text-[10px] text-slate-500">{progreso}%</p>
          </div>
        </div>
        {sorteo.max_boletos > 0 ? (
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-[#0EA5E9]" style={{ width: `${Math.min(100, progreso)}%` }} />
          </div>
        ) : null}
      </Link>
    </li>
  );
}

const ESTADO_CFG: Record<SorteoEstado, { cls: string; label: string }> = {
  activo: { cls: "bg-emerald-50 text-emerald-700", label: "Activo" },
  pausado: { cls: "bg-amber-50 text-amber-700", label: "Pausado" },
  cerrado: { cls: "bg-slate-100 text-slate-500", label: "Cerrado" },
  finalizado: { cls: "bg-violet-50 text-violet-700", label: "Finalizado" },
};

function EstadoBadge({ estado }: { estado: SorteoEstado }) {
  const c = ESTADO_CFG[estado] ?? { cls: "bg-slate-100 text-slate-600", label: estado };
  return <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${c.cls}`}>{c.label}</span>;
}

function Chip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
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

function EmptyState({ total }: { total: number }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
      <Ticket className="mx-auto h-8 w-8 text-slate-300" />
      <p className="mt-2 text-sm font-medium text-slate-700">
        {total === 0 ? "Sin sorteos" : "Sin resultados"}
      </p>
    </div>
  );
}

function SkeletonList() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 3 }).map((_, i) => (
        <li key={i} className="rounded-2xl border border-slate-200 bg-white p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-100" />
              <div className="h-2.5 w-1/3 animate-pulse rounded bg-slate-100" />
              <div className="h-2.5 w-1/4 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="ml-auto h-4 w-16 shrink-0 animate-pulse rounded bg-slate-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}
