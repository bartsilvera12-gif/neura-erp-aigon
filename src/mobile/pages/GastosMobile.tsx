"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Receipt, Search } from "lucide-react";
import { useGastos } from "@/shared/hooks/useGastos";
import type { Gasto } from "@/lib/gastos/actions";

/**
 * Lista mobile de Gastos. Diseño:
 *  - Header: total del mes y count.
 *  - Búsqueda por categoría o descripción.
 *  - Cards con avatar de categoría coloreado, monto, fecha.
 *  - Tap card → /gastos/{id}/editar.
 */
export default function GastosMobile() {
  const { gastos, isLoading, error } = useGastos();
  const [query, setQuery] = useState("");

  const ordenados = useMemo(
    () => [...gastos].sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? "")),
    [gastos]
  );

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return ordenados;
    return ordenados.filter(
      (g) =>
        g.categoria.toLowerCase().includes(q) ||
        g.descripcion.toLowerCase().includes(q) ||
        String(g.monto).includes(q)
    );
  }, [ordenados, query]);

  const totalMes = useMemo(() => calcTotalMes(gastos), [gastos]);

  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      <header className="mb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Gastos</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {gastos.length === 0 ? "Sin gastos registrados." : `${gastos.length} gastos · ${formatGs(totalMes)} este mes`}
            </p>
          </div>
          <Link
            href="/gastos/nuevo"
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
          placeholder="Categoría o descripción"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#0EA5E9]/40 focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]/30"
        />
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar los gastos.
        </div>
      ) : null}

      {isLoading ? (
        <SkeletonList />
      ) : filtrados.length === 0 ? (
        <EmptyState hayBusqueda={!!query.trim()} total={gastos.length} />
      ) : (
        <ul className="space-y-2">
          {filtrados.map((g) => (
            <GastoCard key={g.id} gasto={g} />
          ))}
        </ul>
      )}
    </div>
  );
}

const CAT_TONES = [
  "bg-[#4FAEB2]/10 text-[#3F8E91]",
  "bg-violet-50 text-violet-700",
  "bg-amber-50 text-amber-700",
  "bg-emerald-50 text-emerald-700",
  "bg-rose-50 text-rose-700",
  "bg-sky-50 text-sky-700",
];

function GastoCard({ gasto }: { gasto: Gasto }) {
  const tone = CAT_TONES[hashStr(gasto.categoria) % CAT_TONES.length];
  const inicial = (gasto.categoria || "?").trim().charAt(0).toUpperCase();
  return (
    <li>
      <Link
        href={`/gastos/${gasto.id}/editar`}
        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-transform active:scale-[0.99]"
      >
        <div className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${tone} text-base font-bold`}>
          {inicial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{gasto.categoria || "Sin categoría"}</p>
          <p className="truncate text-[11px] text-slate-500">{gasto.descripcion || "—"}</p>
          <p className="text-[11px] text-slate-400">{formatFecha(gasto.fecha)}</p>
        </div>
        <p className="shrink-0 text-base font-bold tabular-nums text-slate-900">{formatGs(gasto.monto)}</p>
      </Link>
    </li>
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
        <Receipt className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 text-sm font-medium text-slate-700">Sin gastos registrados</p>
        <p className="mt-1 text-xs text-slate-500">
          Tocá <span className="font-semibold">Nuevo</span> para agregar el primero.
        </p>
      </div>
    );
  }
  return null;
}

function SkeletonList() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
          <div className="h-11 w-11 shrink-0 animate-pulse rounded-xl bg-slate-100" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3.5 w-1/2 animate-pulse rounded bg-slate-100" />
            <div className="h-2.5 w-2/3 animate-pulse rounded bg-slate-100" />
            <div className="h-2.5 w-1/4 animate-pulse rounded bg-slate-100" />
          </div>
          <div className="ml-auto h-4 w-16 shrink-0 animate-pulse rounded bg-slate-100" />
        </li>
      ))}
    </ul>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function hashStr(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h << 5) - h + s.charCodeAt(i);
  return Math.abs(h);
}

function calcTotalMes(gastos: Gasto[]): number {
  const hoy = new Date();
  const ym = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  return gastos.filter((g) => (g.fecha ?? "").startsWith(ym)).reduce((s, g) => s + Number(g.monto ?? 0), 0);
}

function formatGs(n: number): string {
  return `₲ ${Math.round(n).toLocaleString("es-PY")}`;
}

function formatFecha(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric" });
}
