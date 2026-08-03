"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getVentas } from "@/lib/ventas/storage";
import type { Venta, TipoVenta, TipoIvaVenta } from "@/lib/ventas/types";

// ── Helpers ────────────────────────────────────────────────────────────────────

function formatGs(valor: number) {
  return `Gs. ${Math.round(valor).toLocaleString("es-PY")}`;
}

function formatFecha(iso: string) {
  try {
    const d    = new Date(iso);
    const dd   = String(d.getDate()).padStart(2, "0");
    const mm   = String(d.getMonth() + 1).padStart(2, "0");
    const yyyy = d.getFullYear();
    const hh   = String(d.getHours()).padStart(2, "0");
    const min  = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  } catch {
    return iso;
  }
}

// ── Constantes de estilo ───────────────────────────────────────────────────────

const inputFilterClass =
  "border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#4FAEB2] focus:outline-none";

const tipoVentaBadge: Record<TipoVenta, string> = {
  CONTADO: "bg-blue-50 text-blue-700",
  CREDITO: "bg-orange-50 text-orange-700",
};

const ivaLabel: Record<TipoIvaVenta, string> = {
  EXENTA: "Exenta",
  "5%":   "IVA 5%",
  "10%":  "IVA 10%",
};

// ── Métricas del día ──────────────────────────────────────────────────────────

function esDeHoy(iso: string): boolean {
  try {
    const fecha = new Date(iso);
    const hoy   = new Date();
    return (
      fecha.getFullYear() === hoy.getFullYear() &&
      fecha.getMonth()    === hoy.getMonth()    &&
      fecha.getDate()     === hoy.getDate()
    );
  } catch {
    return false;
  }
}

interface MetricasHoy {
  facturacion:       number;
  cantidadVentas:    number;
  ticketPromedio:    number;
  productosVendidos: number;  // suma de todas las cantidades en todos los ítems
}

function calcularMetricas(ventas: Venta[]): MetricasHoy {
  const deHoy            = ventas.filter((v) => esDeHoy(v.fecha));
  const facturacion      = deHoy.reduce((s, v) => s + v.total, 0);
  const cantidadVentas   = deHoy.length;
  const ticketPromedio   = cantidadVentas > 0 ? facturacion / cantidadVentas : 0;
  const productosVendidos = deHoy.reduce(
    (s, v) => s + v.items.reduce((si, i) => si + i.cantidad, 0),
    0
  );
  return { facturacion, cantidadVentas, ticketPromedio, productosVendidos };
}

// ── Tarjeta métrica ───────────────────────────────────────────────────────────

function MetricCard({
  label, value, sub, accent,
}: {
  label: string; value: string; sub?: string; accent?: boolean;
}) {
  const wrap = accent
    ? "relative overflow-hidden rounded-2xl border border-[#4FAEB2]/55 bg-gradient-to-br from-white via-white to-[#4FAEB2]/8 px-5 py-4 shadow-[0_4px_18px_rgba(79,174,178,0.08)]"
    : "rounded-2xl border border-slate-200 bg-white px-5 py-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
  const valueCls = accent ? "text-[#3F8E91]" : "text-slate-900";
  return (
    <div className={wrap}>
      {accent ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#4FAEB2] via-[#4FAEB2]/70 to-[#4FAEB2]/30"
        />
      ) : null}
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
        {label}
      </p>
      <p className={`mt-1.5 text-2xl font-semibold tabular-nums tracking-tight ${valueCls}`}>
        {value}
      </p>
      {sub ? <p className="mt-1 text-[11px] text-slate-500">{sub}</p> : null}
    </div>
  );
}

// ── Helpers de fila ───────────────────────────────────────────────────────────

/** Muestra el primer producto de la venta y un badge con el resto. */
function ResumenProductos({ v }: { v: Venta }) {
  const primero = v.items[0];
  if (!primero) {
    return (
      <span className="text-xs text-gray-400">Sin líneas cargadas</span>
    );
  }
  const extra   = v.items.length - 1;
  return (
    <div className="flex flex-col gap-0.5">
      <span className="font-medium text-gray-800 leading-tight">
        {primero.producto_nombre}
      </span>
      <div className="flex items-center gap-2 mt-0.5">
        <span className="font-mono text-xs text-gray-400">{primero.sku}</span>
        {extra > 0 && (
          <span className="bg-gray-100 text-gray-500 text-xs px-1.5 py-0.5 rounded-full font-medium">
            +{extra} más
          </span>
        )}
      </div>
    </div>
  );
}

/** Determina qué mostrar en la celda IVA cuando hay múltiples ítems. */
function ivaResumen(v: Venta): string {
  const tipos = [...new Set(v.items.map((i) => i.tipo_iva))];
  if (tipos.length === 1) return ivaLabel[tipos[0]];
  return "Mixto";
}

// ── Componente principal ───────────────────────────────────────────────────────

export default function VentasPage() {
  const [todas,      setTodas]      = useState<Venta[]>([]);
  const [busqueda,   setBusqueda]   = useState("");
  const [filtroTipo, setFiltroTipo] = useState<TipoVenta | "">("");
  const [filtroIva,  setFiltroIva]  = useState<TipoIvaVenta | "">("");

  useEffect(() => {
    let cancelled = false;
    getVentas().then((data) => {
      if (cancelled) return;
      const ordenadas = [...data].sort((a, b) => {
        const ta = new Date(a.fecha).getTime();
        const tb = new Date(b.fecha).getTime();
        return tb - ta || b.numero_control.localeCompare(a.numero_control);
      });
      setTodas(ordenadas);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const metricas = calcularMetricas(todas);

  const filtradas = todas.filter((v) => {
    // Búsqueda global: número de control, nombre o SKU de cualquier ítem
    if (busqueda.trim() !== "") {
      const t = busqueda.toLowerCase().trim();
      const coincide =
        v.numero_control.toLowerCase().includes(t) ||
        v.items.some(
          (i) =>
            i.producto_nombre.toLowerCase().includes(t) ||
            i.sku.toLowerCase().includes(t)
        );
      if (!coincide) return false;
    }
    // Tipo de venta
    if (filtroTipo !== "" && v.tipo_venta !== filtroTipo) return false;
    // IVA: coincide si al menos un ítem tiene ese tipo
    if (filtroIva !== "" && !v.items.some((i) => i.tipo_iva === filtroIva))
      return false;
    return true;
  });

  const hayFiltros = busqueda || filtroTipo || filtroIva;

  return (
    <div className="space-y-6 pb-10">

      {/* Header al estilo del Dashboard */}
      <div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
          />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
            Comercial
          </p>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Caja</h1>
        <p className="mt-1 text-sm text-slate-500">Caja de ventas y despacho de productos</p>
      </div>

      {/* ── Métricas del día ──────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            Resumen de hoy —{" "}
            <span className="text-slate-500 font-medium normal-case tracking-normal">
              {new Date().toLocaleDateString("es-PY", {
                weekday: "long", day: "numeric", month: "long", year: "numeric",
              })}
            </span>
          </h2>
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <MetricCard
            label="Facturación de hoy"
            value={`Gs. ${metricas.facturacion.toLocaleString("es-PY")}`}
            sub="Total incl. IVA"
            accent
          />
          <MetricCard
            label="Ventas de hoy"
            value={String(metricas.cantidadVentas)}
            sub={metricas.cantidadVentas === 1 ? "orden registrada" : "órdenes registradas"}
          />
          <MetricCard
            label="Ticket promedio"
            value={
              metricas.ticketPromedio > 0
                ? `Gs. ${Math.round(metricas.ticketPromedio).toLocaleString("es-PY")}`
                : "—"
            }
            sub="Por orden de venta"
          />
          <MetricCard
            label="Unidades vendidas"
            value={String(metricas.productosVendidos)}
            sub="Unidades despachadas"
          />
        </div>
      </section>

      {/* ── Tabla de ventas ───────────────────────────────────────────────────── */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              Órdenes de venta
            </h2>
          </div>
          <Link
            href="/ventas/nueva"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91]"
          >
            + Nueva venta
          </Link>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3 mb-5 pb-5 border-b border-gray-100">
          <input
            type="text"
            placeholder="Buscar por número, producto o SKU..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className={`${inputFilterClass} min-w-64`}
          />
          <select
            value={filtroTipo}
            onChange={(e) => setFiltroTipo(e.target.value as TipoVenta | "")}
            className={inputFilterClass}
          >
            <option value="">Todos los tipos</option>
            <option value="CONTADO">Contado</option>
            <option value="CREDITO">Crédito</option>
          </select>
          <select
            value={filtroIva}
            onChange={(e) => setFiltroIva(e.target.value as TipoIvaVenta | "")}
            className={inputFilterClass}
          >
            <option value="">Todos los IVA</option>
            <option value="EXENTA">Exenta</option>
            <option value="5%">IVA 5%</option>
            <option value="10%">IVA 10%</option>
          </select>
          {hayFiltros && (
            <button
              onClick={() => { setBusqueda(""); setFiltroTipo(""); setFiltroIva(""); }}
              className="text-sm text-gray-400 hover:text-gray-600 transition-colors px-2"
            >
              Limpiar filtros
            </button>
          )}
          <span className="ml-auto text-sm text-gray-400">
            {filtradas.length} de {todas.length} ventas
          </span>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="bg-slate-50 text-slate-600 text-sm font-semibold">
                <th className="py-3 pr-4 font-medium">Número</th>
                <th className="py-3 pr-4 font-medium">Productos</th>
                <th className="py-3 pr-4 font-medium text-center">Ítems</th>
                <th className="py-3 pr-4 font-medium text-right">Cant. total</th>
                <th className="py-3 pr-4 font-medium">IVA</th>
                <th className="py-3 pr-4 font-medium text-right">Total</th>
                <th className="py-3 pr-4 font-medium">Tipo</th>
                <th className="py-3 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-gray-400">
                    {todas.length === 0
                      ? "No hay ventas registradas"
                      : "Ninguna venta coincide con los filtros"}
                  </td>
                </tr>
              ) : (
                filtradas.map((v) => {
                  const cantTotal = v.items.reduce((s, i) => s + i.cantidad, 0);
                  return (
                    <tr key={v.id} className="border-b border-slate-200 last:border-0 hover:bg-slate-50 transition-colors">
                      <td className="py-4 pr-4 font-mono text-xs text-gray-500 align-middle">
                        {v.numero_control}
                      </td>
                      <td className="py-4 pr-4 align-middle">
                        <ResumenProductos v={v} />
                      </td>
                      <td className="py-4 pr-4 text-center align-middle">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                          {v.items.length}
                        </span>
                      </td>
                      <td className="py-4 pr-4 text-right tabular-nums text-gray-700 align-middle">
                        {cantTotal}
                      </td>
                      <td className="py-4 pr-4 align-middle">
                        <span className="px-2 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700">
                          {ivaResumen(v)}
                        </span>
                      </td>
                      <td className="py-4 pr-4 text-right tabular-nums font-semibold text-gray-800 align-middle">
                        {formatGs(v.total)}
                      </td>
                      <td className="py-4 pr-4 align-middle">
                        <span className={`px-2 py-1 rounded-full text-xs font-semibold ${tipoVentaBadge[v.tipo_venta]}`}>
                          {v.tipo_venta === "CONTADO"
                            ? "Contado"
                            : `Crédito ${v.plazo_dias ?? ""}d`}
                        </span>
                      </td>
                      <td className="py-4 text-gray-500 text-xs tabular-nums align-middle">
                        {formatFecha(v.fecha)}
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
