"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getProductos } from "@/lib/inventario/storage";
import type { Producto, MetodoValuacion } from "@/lib/inventario/types";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import ImportExcelButton from "@/components/ui/ImportExcelButton";
import { useIsAdmin } from "@/lib/auth/use-is-admin";

const inputFilterClass =
  "border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#4FAEB2]/40 focus:border-[#4FAEB2] focus:outline-none";

const metodoBadge: Record<MetodoValuacion, string> = {
  CPP: "bg-blue-100 text-blue-700",
  FIFO: "bg-green-100 text-green-700",
  LIFO: "bg-purple-100 text-purple-700",
};

function formatGs(valor: number) {
  return `Gs. ${valor.toLocaleString("es-PY")}`;
}

function calcularMargenVenta(costo: number, precio: number): number {
  if (precio === 0) return 0;
  return ((precio - costo) / precio) * 100;
}

function margenColor(margen: number): string {
  if (margen >= 40) return "text-green-600";
  if (margen >= 20) return "text-yellow-600";
  return "text-red-600";
}

interface UbicacionMin { id: string; nombre: string; tipo: string }

export default function InventarioPage() {
  const { isAdmin } = useIsAdmin();
  const [todos, setTodos] = useState<Producto[]>([]);
  const [ubicaciones, setUbicaciones] = useState<UbicacionMin[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  // Busqueda unica global + paginado
  const [query, setQuery] = useState("");
  const [pageSize, setPageSize] = useState<25 | 50 | 100 | "all">(25);

  useEffect(() => {
    let cancelled = false;
    getProductos().then((data) => {
      if (!cancelled) setTodos(data);
    });
    // Ubicaciones para el filtro
    fetch("/api/inventario/ubicaciones", { credentials: "include", cache: "no-store" })
      .then((r) => r.json())
      .then((j) => {
        if (cancelled || !j?.success) return;
        setUbicaciones((j.data?.ubicaciones ?? []) as UbicacionMin[]);
      })
      .catch(() => undefined);
    return () => { cancelled = true; };
  }, [refreshKey]);

  const ubicacionById = new Map(ubicaciones.map((u) => [u.id, u]));

  // Filtro unico: matchea contra cualquier dato visible del producto.
  // El query se separa por palabras y todas deben matchear (AND), case-insensitive.
  const filtradosTodos = todos.filter((p) => {
    const q = query.trim().toLowerCase();
    if (q === "") return true;
    const u = p.ubicacion_principal_id ? ubicacionById.get(p.ubicacion_principal_id) : null;
    const haystack = [
      p.nombre,
      p.sku,
      String(p.costo_promedio),
      p.costo_promedio.toLocaleString("es-PY"),
      String(p.precio_venta),
      p.precio_venta.toLocaleString("es-PY"),
      String(p.stock_actual),
      String(p.stock_minimo),
      p.unidad_medida,
      p.metodo_valuacion,
      u?.nombre ?? "",
      u?.tipo ?? "",
    ]
      .join(" • ")
      .toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    return terms.every((t) => haystack.includes(t));
  });

  const productos =
    pageSize === "all" ? filtradosTodos : filtradosTodos.slice(0, pageSize);

  return (
    <div className="space-y-6 pb-10">

      {/* Header tipo Dashboard */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Operaciones · Stock
            </p>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Inventario</h1>
          <p className="mt-1 text-sm text-slate-500">Gestión de productos y control de stock</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportExcelButton url="/api/inventario/productos/export" />
          <ImportExcelButton
            entidad="Productos"
            previewUrl="/api/inventario/productos/import/preview"
            commitUrl="/api/inventario/productos/import/commit"
            templateUrl="/api/inventario/productos/import/template"
            permiteCrearFaltantes
            visible={isAdmin}
            onCompleted={() => setRefreshKey((k) => k + 1)}
          />
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              Productos
            </h2>
          </div>
          <Link
            href="/inventario/nuevo"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91]"
          >
            + Nuevo producto
          </Link>
          <div className="relative min-w-[16rem] flex-1">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              aria-hidden="true"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
                clipRule="evenodd"
              />
            </svg>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar por nombre, SKU, costo, precio, stock, unidad, ubicación, valuación…"
              className={`${inputFilterClass} w-full pl-9`}
            />
          </div>
          <div className="flex items-center gap-2">
            <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              Filas
            </label>
            <select
              value={String(pageSize)}
              onChange={(e) => {
                const v = e.target.value;
                setPageSize(v === "all" ? "all" : (Number(v) as 25 | 50 | 100));
              }}
              className={inputFilterClass}
            >
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="all">Todo</option>
            </select>
          </div>
          <span className="ml-auto text-[11px] text-slate-400">
            {productos.length} de {filtradosTodos.length}
            {filtradosTodos.length !== todos.length ? ` · ${todos.length} en total` : ""}
            {" "}producto{filtradosTodos.length === 1 ? "" : "s"}
          </span>
          <p className="hidden text-[11px] text-slate-400 xl:block">
            Los productos ingresan desde <span className="font-medium text-slate-500">Compras</span>
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">

            <thead>
              <tr className="bg-slate-50 text-slate-600 text-sm font-semibold">
                <th className="py-3 pr-4 font-medium">Nombre</th>
                <th className="py-3 pr-4 font-medium">SKU</th>
                <th className="py-3 pr-4 font-medium">Costo Prom.</th>
                <th className="py-3 pr-4 font-medium">Precio Venta</th>
                <th className="py-3 pr-4 font-medium text-center">Stock</th>
                <th className="py-3 pr-4 font-medium text-center">Stock Mín.</th>
                <th className="py-3 pr-4 font-medium">Unidad</th>
                <th className="py-3 pr-4 font-medium">Ubicación</th>
                <th className="py-3 pr-4 font-medium">Valuación</th>
                <th className="py-3 font-medium text-right">
                  <span title="(precio - costo) / precio × 100">Margen s/venta</span>
                </th>
                <th className="py-3 font-medium w-20"></th>
              </tr>
            </thead>

            <tbody>
              {productos.map((p) => {
                const stockBajo = p.stock_actual <= p.stock_minimo;
                const margen = calcularMargenVenta(p.costo_promedio, p.precio_venta);
                return (
                  <tr key={p.id} className="border-b border-slate-200 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="py-4 pr-4 font-medium text-gray-800">{p.nombre}</td>
                    <td className="py-4 pr-4 text-gray-500 font-mono">{p.sku}</td>
                    <td className="py-4 pr-4 text-gray-700">{formatGs(p.costo_promedio)}</td>
                    <td className="py-4 pr-4 text-gray-700">{formatGs(p.precio_venta)}</td>
                    <td className="py-4 pr-4 text-center">
                      <span className={`font-semibold ${stockBajo ? "text-red-600" : "text-gray-800"}`}>
                        {p.stock_actual}
                      </span>
                    </td>
                    <td className="py-4 pr-4 text-center text-gray-500">{p.stock_minimo}</td>
                    <td className="py-4 pr-4 text-gray-600">{p.unidad_medida}</td>
                    <td className="py-4 pr-4 text-gray-600 text-xs">
                      {p.ubicacion_principal_id
                        ? (() => {
                            const u = ubicacionById.get(p.ubicacion_principal_id);
                            return u ? (
                              <span>
                                <span className="font-medium text-gray-700">{u.nombre}</span>
                                <span className="text-gray-400"> — {u.tipo}</span>
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            );
                          })()
                        : <span className="text-gray-300">—</span>}
                    </td>
                    <td className="py-4 pr-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${metodoBadge[p.metodo_valuacion]}`}>
                        {p.metodo_valuacion}
                      </span>
                    </td>
                    <td className={`py-4 text-right tabular-nums font-semibold ${margenColor(margen)}`}>
                      {margen.toFixed(2)}%
                    </td>
                    <td className="py-4">
                      <Link
                        href={`/inventario/${p.id}/editar`}
                        className="text-sm text-gray-500 hover:text-gray-800 underline"
                      >
                        Editar
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>

          </table>
        </div>

      </section>

    </div>
  );
}
