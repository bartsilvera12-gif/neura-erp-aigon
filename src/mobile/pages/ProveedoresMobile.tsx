"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Search, Truck } from "lucide-react";
import { useProveedores } from "@/shared/hooks/useProveedores";
import type { Proveedor } from "@/lib/proveedores/types";

/**
 * Lista mobile de Proveedores. Diseño:
 *  - Header + botón Nuevo.
 *  - Búsqueda: nombre, RUC, email, categorías.
 *  - Cards: avatar+inicial, nombre, RUC/email/teléfono, chips de categorías.
 */
export default function ProveedoresMobile() {
  const { proveedores, isLoading, error } = useProveedores();
  const [query, setQuery] = useState("");

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ord = [...proveedores].sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    if (!q) return ord;
    return ord.filter((p) => {
      const cats = (p.categorias ?? []).map((c) => c.nombre.toLowerCase()).join(" ");
      return (
        p.nombre.toLowerCase().includes(q) ||
        (p.ruc ?? "").toLowerCase().includes(q) ||
        (p.email ?? "").toLowerCase().includes(q) ||
        (p.telefono ?? "").toLowerCase().includes(q) ||
        cats.includes(q)
      );
    });
  }, [proveedores, query]);

  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      <header className="mb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Proveedores</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {proveedores.length === 0 ? "Sin proveedores cargados." : `${proveedores.length} proveedores`}
            </p>
          </div>
          <Link
            href="/proveedores/nuevo"
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
          placeholder="Nombre, RUC, email o categoría"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#0EA5E9]/40 focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]/30"
        />
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar los proveedores.
        </div>
      ) : null}

      {isLoading ? (
        <SkeletonList />
      ) : filtrados.length === 0 ? (
        <EmptyState hayBusqueda={!!query.trim()} total={proveedores.length} />
      ) : (
        <ul className="space-y-2">
          {filtrados.map((p) => (
            <ProveedorCard key={p.id} proveedor={p} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ProveedorCard({ proveedor }: { proveedor: Proveedor }) {
  const inicial = proveedor.nombre.charAt(0).toUpperCase();
  const detalle = proveedor.email || proveedor.telefono || proveedor.ruc || null;
  return (
    <li>
      <Link
        href={`/proveedores/${proveedor.id}/editar`}
        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-transform active:scale-[0.99]"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-orange-100 text-base font-bold text-orange-700">
          {inicial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{proveedor.nombre}</p>
          {detalle ? <p className="truncate text-[11px] text-slate-500">{detalle}</p> : null}
          {proveedor.categorias && proveedor.categorias.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {proveedor.categorias.slice(0, 3).map((c) => (
                <span
                  key={c.id}
                  className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-600"
                >
                  {c.nombre}
                </span>
              ))}
              {proveedor.categorias.length > 3 ? (
                <span className="text-[10px] text-slate-400">+{proveedor.categorias.length - 3}</span>
              ) : null}
            </div>
          ) : null}
        </div>
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
        <Truck className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 text-sm font-medium text-slate-700">Sin proveedores cargados</p>
        <p className="mt-1 text-xs text-slate-500">Tocá <span className="font-semibold">Nuevo</span> para agregar uno.</p>
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
          <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-slate-100" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-100" />
            <div className="h-2.5 w-1/2 animate-pulse rounded bg-slate-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}
