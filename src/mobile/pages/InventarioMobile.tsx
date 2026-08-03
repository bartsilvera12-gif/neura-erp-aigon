"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { AlertTriangle, Plus, Package, Search } from "lucide-react";
import { useProductos } from "@/shared/hooks/useInventario";
import type { Producto } from "@/lib/inventario/types";

/**
 * Lista mobile de productos del inventario. Diseño:
 *  - Header con título + KPIs compactos (total, en stock, críticos).
 *  - Búsqueda por nombre, SKU o código de barras.
 *  - Chips de filtro: Todos / Bajo stock.
 *  - Cards apiladas: imagen-placeholder (inicial), nombre, SKU, precio + stock con
 *    estado visual (rojo si bajo stock).
 *  - Tap en card → /inventario/{id}/editar.
 */

type StockFilter = "todos" | "bajo";

export default function InventarioMobile() {
  const { productos, isLoading, error } = useProductos();
  const [query, setQuery] = useState("");
  const [stockFilter, setStockFilter] = useState<StockFilter>("todos");

  const counts = useMemo(() => {
    const bajos = productos.filter((p) => Number(p.stock_actual ?? 0) <= Number(p.stock_minimo ?? 0)).length;
    return { total: productos.length, bajos };
  }, [productos]);

  const productosFiltrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ordenados = [...productos].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    return ordenados.filter((p) => {
      if (stockFilter === "bajo" && Number(p.stock_actual ?? 0) > Number(p.stock_minimo ?? 0)) return false;
      if (!q) return true;
      return (
        p.nombre.toLowerCase().includes(q) ||
        p.sku.toLowerCase().includes(q) ||
        (p.codigo_barras ?? "").toLowerCase().includes(q)
      );
    });
  }, [productos, query, stockFilter]);

  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      <header className="mb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Inventario</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {counts.total} producto{counts.total === 1 ? "" : "s"} ·{" "}
              {counts.bajos > 0 ? (
                <span className="font-semibold text-red-600">{counts.bajos} bajo stock</span>
              ) : (
                <span className="text-emerald-600">todo en stock</span>
              )}
            </p>
          </div>
          <Link
            href="/inventario/nuevo"
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
          placeholder="Nombre, SKU o código de barras"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#0EA5E9]/40 focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]/30"
        />
      </div>

      <div className="mb-3 flex gap-2">
        <FilterChip active={stockFilter === "todos"} onClick={() => setStockFilter("todos")} label={`Todos (${counts.total})`} />
        <FilterChip
          active={stockFilter === "bajo"}
          onClick={() => setStockFilter("bajo")}
          label={`Bajo stock (${counts.bajos})`}
          tone={counts.bajos > 0 ? "warn" : "default"}
        />
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar los productos.
        </div>
      ) : null}

      {isLoading ? (
        <SkeletonList />
      ) : productosFiltrados.length === 0 ? (
        <EmptyState hayBusqueda={!!query.trim() || stockFilter !== "todos"} total={productos.length} />
      ) : (
        <ul className="space-y-2">
          {productosFiltrados.map((p) => (
            <ProductoCard key={p.id} producto={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProductoCard({ producto }: { producto: Producto }) {
  const bajo = Number(producto.stock_actual ?? 0) <= Number(producto.stock_minimo ?? 0);
  const inicial = producto.nombre.trim().charAt(0).toUpperCase();
  return (
    <li>
      <Link
        href={`/inventario/${producto.id}/editar`}
        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-transform active:scale-[0.99]"
      >
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-base font-bold text-slate-500">
          {producto.imagen_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={producto.imagen_url} alt="" className="h-full w-full rounded-xl object-cover" />
          ) : (
            inicial
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{producto.nombre}</p>
          <p className="truncate text-[11px] text-slate-500">SKU {producto.sku}</p>
          <p className="mt-1 text-xs font-medium tabular-nums text-slate-700">
            ₲ {Math.round(producto.precio_venta).toLocaleString("es-PY")}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p className={`text-sm font-bold tabular-nums ${bajo ? "text-red-600" : "text-slate-900"}`}>
            {Number(producto.stock_actual ?? 0).toLocaleString("es-PY")}
          </p>
          <p className="text-[10px] text-slate-500">{producto.unidad_medida}</p>
          {bajo ? (
            <p className="mt-0.5 inline-flex items-center gap-0.5 rounded-full bg-red-50 px-1.5 py-0.5 text-[9px] font-semibold text-red-700">
              <AlertTriangle className="h-2.5 w-2.5" />
              bajo
            </p>
          ) : null}
        </div>
      </Link>
    </li>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  tone = "default",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tone?: "default" | "warn";
}) {
  const activeBg = tone === "warn" ? "bg-red-500" : "bg-[#0EA5E9]";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? `${activeBg} text-white` : "border border-slate-200 bg-white text-slate-600"
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
        <Package className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 text-sm font-medium text-slate-700">Sin productos cargados</p>
        <p className="mt-1 text-xs text-slate-500">
          Tocá <span className="font-semibold text-slate-700">Nuevo</span> para agregar el primero.
        </p>
      </div>
    );
  }
  return null;
}

function SkeletonList() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
          <div className="h-12 w-12 shrink-0 animate-pulse rounded-xl bg-slate-100" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-1/3 animate-pulse rounded bg-slate-100" />
            <div className="h-2.5 w-1/4 animate-pulse rounded bg-slate-100" />
          </div>
          <div className="shrink-0 space-y-1.5 text-right">
            <div className="ml-auto h-3.5 w-10 animate-pulse rounded bg-slate-100" />
            <div className="ml-auto h-2.5 w-8 animate-pulse rounded bg-slate-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}
