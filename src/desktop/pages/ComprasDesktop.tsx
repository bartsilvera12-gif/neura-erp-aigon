"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getCompras } from "@/lib/compras/storage";
import ExportExcelButton from "@/components/ui/ExportExcelButton";
import type { Compra, TipoPago } from "@/lib/compras/types";

const inputFilterClass =
  "border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:ring-2 focus:ring-[#4FAEB2]/40 focus:border-[#4FAEB2] focus:outline-none";

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
    return `${dd}/${mm}/${yyyy} ${hh}:${min}`;
  } catch {
    return iso;
  }
}

const tipoPagoBadge: Record<TipoPago, string> = {
  contado: "bg-blue-50 text-blue-700",
  credito: "bg-orange-50 text-orange-700",
};

const ivaLabel: Record<string, string> = {
  exenta: "Exenta",
  "5": "IVA 5%",
  "10": "IVA 10%",
};

export default function ComprasPage() {
  const [todas, setTodas] = useState<Compra[]>([]);
  const [busqueda, setBusqueda] = useState("");
  const [filtroTipoPago, setFiltroTipoPago] = useState<TipoPago | "">("");

  useEffect(() => {
    let cancel = false;
    getCompras().then((data) => {
      if (cancel) return;
      setTodas([...data].sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime()));
    });
    return () => { cancel = true; };
  }, []);

  const filtradas = todas.filter((c) => {
    const texto = busqueda.toLowerCase();
    const coincideTexto =
      texto === "" ||
      c.proveedor_nombre.toLowerCase().includes(texto) ||
      c.producto_nombre.toLowerCase().includes(texto) ||
      c.numero_control.toLowerCase().includes(texto);
    const coincideTipoPago = filtroTipoPago === "" || c.tipo_pago === filtroTipoPago;
    return coincideTexto && coincideTipoPago;
  });

  const hayFiltros = busqueda || filtroTipoPago;

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
              Operaciones · Compras
            </p>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Compras</h1>
          <p className="mt-1 text-sm text-slate-500">
            Registro de órdenes de compra a proveedores
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <ExportExcelButton url="/api/compras/export" />
        </div>
      </div>

      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">

        <div className="mb-5 flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              Órdenes de compra
            </h2>
          </div>
          <Link
            href="/compras/nueva"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91]"
          >
            + Nueva compra
          </Link>

          {/* Filtros inline */}
          <input
            type="text"
            placeholder="Buscar por proveedor, producto o N° control..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className={`${inputFilterClass} min-w-[18rem] flex-1`}
          />
          <select
            value={filtroTipoPago}
            onChange={(e) => setFiltroTipoPago(e.target.value as TipoPago | "")}
            className={inputFilterClass}
          >
            <option value="">Todos los pagos</option>
            <option value="contado">Contado</option>
            <option value="credito">Crédito</option>
          </select>
          {hayFiltros && (
            <button
              onClick={() => { setBusqueda(""); setFiltroTipoPago(""); }}
              className="text-[11px] font-semibold text-[#3F8E91] underline-offset-2 hover:underline"
            >
              Limpiar
            </button>
          )}
          <span className="ml-auto text-[11px] text-slate-400">
            {filtradas.length} de {todas.length} compras
          </span>
        </div>

        {/* Tabla */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead className="bg-slate-50 text-slate-600 text-sm font-semibold">
              <tr>
                <th className="py-3 pr-4 font-medium">N° Control</th>
                <th className="py-3 pr-4 font-medium">Proveedor</th>
                <th className="py-3 pr-4 font-medium">Producto</th>
                <th className="py-3 pr-4 font-medium text-right">Cant.</th>
                <th className="py-3 pr-4 font-medium text-right">Costo unit.</th>
                <th className="py-3 pr-4 font-medium">IVA</th>
                <th className="py-3 pr-4 font-medium text-right">Total</th>
                <th className="py-3 pr-4 font-medium text-right">Margen</th>
                <th className="py-3 pr-4 font-medium">Pago</th>
                <th className="py-3 font-medium">Fecha</th>
              </tr>
            </thead>
            <tbody>
              {filtradas.length === 0 ? (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-gray-400">
                    {todas.length === 0
                      ? "No hay compras registradas"
                      : "Ninguna compra coincide con los filtros"}
                  </td>
                </tr>
              ) : (
                filtradas.map((c) => (
                  <tr key={c.id} className="border-b border-slate-200 last:border-0 hover:bg-slate-50 transition-colors">
                    <td className="py-4 pr-4 font-mono text-xs text-gray-500">
                      {c.numero_control}
                    </td>
                    <td className="py-4 pr-4 font-medium text-gray-800">
                      {c.proveedor_nombre}
                    </td>
                    <td className="py-4 pr-4 text-gray-600">{c.producto_nombre}</td>
                    <td className="py-4 pr-4 text-right tabular-nums text-gray-700">
                      {c.cantidad}
                    </td>
                    <td className="py-4 pr-4 text-right tabular-nums text-gray-600 text-xs">
                      {c.moneda === "USD" && c.costo_unitario_original != null ? (
                        <span>
                          USD {c.costo_unitario_original.toLocaleString("es-PY")}
                          <br />
                          <span className="text-gray-400">≈ {formatGs(c.costo_unitario)}</span>
                        </span>
                      ) : (
                        formatGs(c.costo_unitario ?? c.total)
                      )}
                    </td>
                    <td className="py-4 pr-4 text-xs text-gray-500">
                      {c.iva_tipo ? ivaLabel[c.iva_tipo] : "—"}
                    </td>
                    <td className="py-4 pr-4 text-right tabular-nums font-semibold text-gray-800">
                      {formatGs(c.total)}
                    </td>
                    <td className="py-4 pr-4 text-right tabular-nums text-sm font-medium text-green-600">
                      {c.margen_venta != null ? `${c.margen_venta.toFixed(1)}%` : "—"}
                    </td>
                    <td className="py-4 pr-4">
                      <span className={`px-2 py-1 rounded-full text-xs font-semibold ${c.tipo_pago ? tipoPagoBadge[c.tipo_pago] : "bg-gray-100 text-gray-500"}`}>
                        {c.tipo_pago === "contado" ? "Contado" : c.tipo_pago === "credito" ? `Crédito ${c.plazo_dias ?? ""}d` : "—"}
                      </span>
                    </td>
                    <td className="py-4 text-gray-500 text-xs tabular-nums">
                      {formatFecha(c.fecha)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

      </section>

    </div>
  );
}
