"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Search, ShoppingBasket } from "lucide-react";
import { useCompras } from "@/shared/hooks/useCompras";
import type { Compra, TipoPago } from "@/lib/compras/types";

/**
 * Lista mobile de Compras.
 *  - Header con título + botón "Nueva".
 *  - KPI: facturación total + cantidad.
 *  - Búsqueda por proveedor, producto o número.
 *  - Cards con proveedor, producto, fecha, total y tipo de pago.
 */
export default function ComprasMobile() {
  const { compras, isLoading, error } = useCompras();
  const [query, setQuery] = useState("");

  const totalMonto = useMemo(() => compras.reduce((s, c) => s + Number(c.total ?? 0), 0), [compras]);

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ordenadas = [...compras].sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
    if (!q) return ordenadas;
    return ordenadas.filter(
      (c) =>
        c.proveedor_nombre.toLowerCase().includes(q) ||
        c.producto_nombre.toLowerCase().includes(q) ||
        c.numero_control.toLowerCase().includes(q)
    );
  }, [compras, query]);

  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      <header className="mb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Compras</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {compras.length === 0 ? "Sin compras registradas." : `${compras.length} compras · ${formatGs(totalMonto)} total`}
            </p>
          </div>
          <Link
            href="/compras/nueva"
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
          placeholder="Proveedor, producto o número"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#0EA5E9]/40 focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]/30"
        />
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar las compras.
        </div>
      ) : null}

      {isLoading ? (
        <SkeletonList />
      ) : filtradas.length === 0 ? (
        <EmptyState hayBusqueda={!!query.trim()} total={compras.length} />
      ) : (
        <ul className="space-y-2">
          {filtradas.map((c) => (
            <CompraCard key={c.id} compra={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CompraCard({ compra }: { compra: Compra }) {
  return (
    <li>
      <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#0EA5E9]">
                {compra.numero_control}
              </span>
              <TipoPagoBadge tipo={compra.tipo_pago} />
            </div>
            <p className="mt-1 truncate text-sm font-semibold text-slate-900">{compra.proveedor_nombre}</p>
            <p className="truncate text-[11px] text-slate-500">
              {compra.producto_nombre} · {compra.cantidad}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">{formatFecha(compra.fecha)}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-base font-bold tabular-nums text-slate-900">{formatGs(compra.total)}</p>
            <p className="text-[10px] text-slate-500">{compra.iva_tipo === "exenta" ? "Exenta" : `IVA ${compra.iva_tipo}%`}</p>
          </div>
        </div>
      </div>
    </li>
  );
}

function TipoPagoBadge({ tipo }: { tipo: TipoPago }) {
  const styles: Record<TipoPago, string> = {
    contado: "bg-blue-50 text-blue-700",
    credito: "bg-orange-50 text-orange-700",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles[tipo]}`}>
      {tipo === "contado" ? "Contado" : "Crédito"}
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
        <ShoppingBasket className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 text-sm font-medium text-slate-700">Sin compras registradas</p>
        <p className="mt-1 text-xs text-slate-500">Tocá <span className="font-semibold">Nueva</span> para registrar la primera.</p>
      </div>
    );
  }
  return null;
}

function SkeletonList() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
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

function formatGs(n: number): string {
  return `₲ ${Math.round(n).toLocaleString("es-PY")}`;
}

function formatFecha(iso: string): string {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${dd}/${mm}/${d.getFullYear()}`;
  } catch {
    return iso;
  }
}
