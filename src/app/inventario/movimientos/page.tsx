"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import * as XLSX from "xlsx";
import { getMovimientos } from "@/lib/inventario/storage";
import type { MovimientoInventario, TipoMovimiento, OrigenMovimiento } from "@/lib/inventario/types";

const tipoBadge: Record<TipoMovimiento, string> = {
  ENTRADA: "bg-green-100 text-green-700",
  SALIDA: "bg-red-100 text-red-700",
  AJUSTE: "bg-yellow-100 text-yellow-700",
};

const origenLabel: Record<OrigenMovimiento, string> = {
  compra: "Compra",
  venta: "Venta",
  ajuste_manual: "Ajuste manual",
  inventario_inicial: "Inventario inicial",
};

const origenBadge: Record<OrigenMovimiento, string> = {
  compra: "bg-blue-50 text-blue-600",
  venta: "bg-purple-50 text-purple-600",
  ajuste_manual: "bg-gray-100 text-gray-600",
  inventario_inicial: "bg-orange-50 text-orange-600",
};

function formatGs(valor: number) {
  return `Gs. ${valor.toLocaleString("es-PY")}`;
}

function formatFecha(iso: string) {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy}, ${hh}:${min}`;
  } catch {
    return iso;
  }
}

const inputFilterClass =
  "border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#4FAEB2]/40 focus:border-[#4FAEB2] focus:outline-none";

export default function MovimientosPage() {
  const [todos, setTodos] = useState<MovimientoInventario[]>([]);
  const [query, setQuery] = useState("");
  const [fechaDesde, setFechaDesde] = useState(""); // "YYYY-MM-DD"
  const [fechaHasta, setFechaHasta] = useState(""); // "YYYY-MM-DD"
  const [pageSize, setPageSize] = useState<25 | 50 | 100 | "all">(25);

  useEffect(() => {
    let cancelled = false;
    getMovimientos().then((data) => {
      if (!cancelled) setTodos(data);
    });
    return () => { cancelled = true; };
  }, []);

  // Filtro unico: matchea contra cualquier dato visible del movimiento.
  // Multiples palabras → AND, case-insensitive.
  const filtradosTodos = useMemo(() => {
    return todos.filter((m) => {
      // Filtro de fecha (siempre aplica si seteado)
      const fechaMov = m.fecha.slice(0, 10);
      if (fechaDesde !== "" && fechaMov < fechaDesde) return false;
      if (fechaHasta !== "" && fechaMov > fechaHasta) return false;

      const q = query.trim().toLowerCase();
      if (q === "") return true;
      const haystack = [
        m.producto_nombre,
        m.producto_sku,
        m.tipo,
        origenLabel[m.origen],
        m.origen,
        String(m.cantidad),
        String(Math.abs(m.cantidad)),
        String(m.costo_unitario),
        m.costo_unitario.toLocaleString("es-PY"),
        m.usuario_nombre ?? "",
        formatFecha(m.fecha),
        fechaMov,
      ]
        .join(" • ")
        .toLowerCase();
      const terms = q.split(/\s+/).filter(Boolean);
      return terms.every((t) => haystack.includes(t));
    });
  }, [todos, query, fechaDesde, fechaHasta]);

  const filtrados = pageSize === "all" ? filtradosTodos : filtradosTodos.slice(0, pageSize);

  function handleExportExcel() {
    if (filtradosTodos.length === 0) {
      alert("No hay movimientos para exportar con los filtros actuales.");
      return;
    }
    const rows = filtradosTodos.map((m) => ({
      Producto: m.producto_nombre,
      SKU: m.producto_sku,
      Tipo: m.tipo,
      Cantidad: m.cantidad,
      "Costo unit.": m.costo_unitario,
      Origen: origenLabel[m.origen],
      Usuario: m.usuario_nombre ?? "",
      Fecha: formatFecha(m.fecha),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    // anchos minimos legibles
    ws["!cols"] = [
      { wch: 32 }, // Producto
      { wch: 14 }, // SKU
      { wch: 10 }, // Tipo
      { wch: 10 }, // Cantidad
      { wch: 14 }, // Costo unit.
      { wch: 18 }, // Origen
      { wch: 22 }, // Usuario
      { wch: 18 }, // Fecha
    ];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Movimientos");
    const stamp = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `movimientos_inventario_${stamp}.xlsx`);
  }

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
              Operaciones · Movimientos
            </p>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Movimientos de inventario
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Registro de entradas, salidas y ajustes de stock
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={handleExportExcel}
            disabled={filtradosTodos.length === 0}
            className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 px-3 py-2 text-sm font-medium text-emerald-700 transition-colors hover:bg-emerald-50 hover:text-emerald-900 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
              <path d="M10.75 2.75a.75.75 0 0 0-1.5 0v8.614L6.295 8.235a.75.75 0 1 0-1.09 1.03l4.25 4.5a.75.75 0 0 0 1.09 0l4.25-4.5a.75.75 0 0 0-1.09-1.03l-2.955 3.129V2.75Z" />
              <path d="M3.5 12.75a.75.75 0 0 0-1.5 0v2.5A2.75 2.75 0 0 0 4.75 18h10.5A2.75 2.75 0 0 0 18 15.25v-2.5a.75.75 0 0 0-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5Z" />
            </svg>
            Exportar Excel
          </button>
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

        {/* Header de la seccion */}
        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              Historial
            </h2>
          </div>
          <Link
            href="/inventario/movimientos/nuevo"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91]"
          >
            + Nuevo movimiento
          </Link>

          {/* Buscador único */}
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
              placeholder="Buscar por producto, SKU, tipo, origen, usuario, fecha…"
              className={`${inputFilterClass} w-full pl-9`}
            />
          </div>

          {/* Rango de fechas */}
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              Desde
            </label>
            <input
              type="date"
              value={fechaDesde}
              onChange={(e) => setFechaDesde(e.target.value)}
              max={fechaHasta || undefined}
              className={inputFilterClass}
            />
          </div>
          <div className="flex items-center gap-1.5">
            <label className="text-[11px] font-semibold uppercase tracking-[0.1em] text-slate-500">
              Hasta
            </label>
            <input
              type="date"
              value={fechaHasta}
              onChange={(e) => setFechaHasta(e.target.value)}
              min={fechaDesde || undefined}
              className={inputFilterClass}
            />
          </div>

          {/* Paginado */}
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
            {filtrados.length} de {filtradosTodos.length}
            {filtradosTodos.length !== todos.length ? ` · ${todos.length} en total` : ""}
            {" "}registro{filtradosTodos.length === 1 ? "" : "s"}
          </span>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-sm font-semibold">
                <th className="py-3 pr-4 font-medium">Producto</th>
                <th className="py-3 pr-4 font-medium">SKU</th>
                <th className="py-3 pr-4 font-medium">Tipo</th>
                <th className="py-3 pr-4 font-medium text-right">Cantidad</th>
                <th className="py-3 pr-4 font-medium text-right">Costo unit.</th>
                <th className="py-3 pr-4 font-medium">Origen</th>
                <th className="py-3 pr-4 font-medium">Usuario</th>
                <th className="py-3 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {filtrados.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400">
                    {todos.length === 0
                      ? "No hay movimientos registrados"
                      : "Ningún movimiento coincide con los filtros"}
                  </td>
                </tr>
              ) : (
                filtrados.map((m) => {
                  const signo =
                    m.tipo === "ENTRADA" ? "+" : m.tipo === "SALIDA" ? "−" : m.cantidad >= 0 ? "+" : "";
                  const cantidadColor =
                    m.tipo === "ENTRADA"
                      ? "text-green-600"
                      : m.tipo === "SALIDA"
                      ? "text-red-600"
                      : "text-yellow-600";

                  return (
                    <tr key={m.id} className="border-b border-slate-200 last:border-0 hover:bg-slate-50 transition-colors">
                      <td className="py-4 pr-4 font-medium text-gray-800">{m.producto_nombre}</td>
                      <td className="py-4 pr-4 text-gray-500 font-mono">{m.producto_sku}</td>
                      <td className="py-4 pr-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${tipoBadge[m.tipo]}`}>
                          {m.tipo}
                        </span>
                      </td>
                      <td className={`py-4 pr-4 text-right font-semibold tabular-nums ${cantidadColor}`}>
                        {signo}{Math.abs(m.cantidad)}
                      </td>
                      <td className="py-4 pr-4 text-right text-gray-700 tabular-nums">
                        {formatGs(m.costo_unitario)}
                      </td>
                      <td className="py-4 pr-4">
                        <span className={`px-2 py-1 rounded-full text-xs font-medium ${origenBadge[m.origen]}`}>
                          {origenLabel[m.origen]}
                        </span>
                      </td>
                      <td className="py-4 pr-4 text-gray-600 text-xs">
                        {m.usuario_nombre ?? <span className="text-gray-300">—</span>}
                      </td>
                      <td className="py-4 text-gray-500 text-xs tabular-nums">
                        {formatFecha(m.fecha)}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

      </section>

    </div>
  );
}
