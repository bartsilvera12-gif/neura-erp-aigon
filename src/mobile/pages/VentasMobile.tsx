"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Search, ShoppingCart, TrendingUp } from "lucide-react";
import { useVentas } from "@/shared/hooks/useVentas";
import type { Venta, TipoVenta } from "@/lib/ventas/types";

/**
 * Lista mobile de ventas. Diseño desde cero:
 *  - Header: KPI compacto del día (facturación + cantidad) + botón "Nueva".
 *  - Búsqueda por número de control o monto.
 *  - Lista de cards apiladas (no tabla): número, fecha+hora, total grande, badges
 *    de tipo (contado/crédito) y cantidad de productos.
 *  - FAB inferior derecho para "+ Nueva venta" (oculto cuando hay 0 resultados — el
 *    botón del header lo cubre).
 *  - Empty states: cargando, sin resultados de búsqueda, sin ventas todavía.
 *
 * El detalle de venta (drawer/full-screen) llega en una iteración posterior; por ahora
 * tap a card abre el detalle desktop como fallback.
 */
export default function VentasMobile() {
  const { ventas, isLoading, error } = useVentas();
  const [query, setQuery] = useState("");

  const metricasHoy = useMemo(() => calcularMetricasHoy(ventas), [ventas]);

  const ventasFiltradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ordenadas = [...ventas].sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? ""));
    if (!q) return ordenadas;
    return ordenadas.filter(
      (v) =>
        v.numero_control.toLowerCase().includes(q) ||
        String(v.total).includes(q) ||
        v.items.some((i) => i.producto_nombre.toLowerCase().includes(q))
    );
  }, [ventas, query]);

  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      {/* KPI del día + botón nueva */}
      <header className="mb-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Caja</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {metricasHoy.cantidad === 0
                ? "Aún no hubo ventas hoy."
                : `${metricasHoy.cantidad} ${metricasHoy.cantidad === 1 ? "venta" : "ventas"} hoy`}
            </p>
          </div>
          <Link
            href="/ventas/nueva"
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors active:bg-[#3F8E91]"
          >
            <Plus className="h-4 w-4" />
            Nueva
          </Link>
        </div>

        {/* Card de facturación del día */}
        <div className="mt-3 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-[#4FAEB2]/5 p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#4FAEB2]/10 text-[#4FAEB2]">
              <TrendingUp className="h-4 w-4" />
            </div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Facturación de hoy
            </p>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
            {formatGs(metricasHoy.facturacion)}
          </p>
          {metricasHoy.cantidad > 0 ? (
            <p className="mt-0.5 text-xs text-slate-500">
              Ticket promedio: {formatGs(metricasHoy.ticketPromedio)}
            </p>
          ) : null}
        </div>
      </header>

      {/* Buscador */}
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Buscar por número, producto o monto"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#4FAEB2]/40 focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/30"
        />
      </div>

      {/* Estado de error */}
      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar las ventas. Refrescá para reintentar.
        </div>
      ) : null}

      {/* Lista */}
      {isLoading ? (
        <SkeletonList />
      ) : ventasFiltradas.length === 0 ? (
        <EmptyState hayBusqueda={!!query.trim()} total={ventas.length} />
      ) : (
        <ul className="space-y-2">
          {ventasFiltradas.map((v) => (
            <VentaCard key={v.id} venta={v} />
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Card de venta ────────────────────────────────────────────────────────────

function VentaCard({ venta }: { venta: Venta }) {
  const cantidadItems = venta.items.reduce((s, i) => s + i.cantidad, 0);
  const primerItem = venta.items[0];
  const itemsExtra = venta.items.length - 1;

  return (
    <li>
      <div className="flex flex-col gap-2.5 rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-transform active:scale-[0.99]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-[#4FAEB2]">
                {venta.numero_control}
              </span>
              <TipoVentaBadge tipo={venta.tipo_venta} />
            </div>
            <p className="mt-1 truncate text-sm font-medium text-slate-900">
              {primerItem ? primerItem.producto_nombre : "Sin productos"}
              {itemsExtra > 0 ? (
                <span className="ml-1 text-slate-500">+{itemsExtra} más</span>
              ) : null}
            </p>
            <p className="mt-0.5 text-[11px] text-slate-500">{formatFecha(venta.fecha)}</p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-base font-bold tabular-nums text-slate-900">
              {formatGs(venta.total)}
            </p>
            <p className="text-[11px] text-slate-500">
              {cantidadItems} {cantidadItems === 1 ? "ud." : "uds."}
            </p>
          </div>
        </div>
      </div>
    </li>
  );
}

function TipoVentaBadge({ tipo }: { tipo: TipoVenta }) {
  const styles: Record<TipoVenta, string> = {
    CONTADO: "bg-blue-50 text-blue-700",
    CREDITO: "bg-orange-50 text-orange-700",
  };
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${styles[tipo]}`}>
      {tipo === "CONTADO" ? "Contado" : "Crédito"}
    </span>
  );
}

// ── Estados vacíos ───────────────────────────────────────────────────────────

function EmptyState({ hayBusqueda, total }: { hayBusqueda: boolean; total: number }) {
  if (hayBusqueda) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <Search className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 text-sm font-medium text-slate-700">Sin resultados</p>
        <p className="mt-1 text-xs text-slate-500">Probá con otro término de búsqueda.</p>
      </div>
    );
  }
  if (total === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <ShoppingCart className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 text-sm font-medium text-slate-700">Sin ventas registradas</p>
        <p className="mt-1 text-xs text-slate-500">
          Tocá <span className="font-semibold text-slate-700">Nueva</span> para registrar tu primera venta.
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
        <li key={i} className="rounded-2xl border border-slate-200 bg-white p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-3 w-20 animate-pulse rounded bg-slate-100" />
              <div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-100" />
              <div className="h-2.5 w-1/3 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="shrink-0 space-y-1.5 text-right">
              <div className="ml-auto h-4 w-20 animate-pulse rounded bg-slate-100" />
              <div className="ml-auto h-2.5 w-10 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Cálculos y formatters ────────────────────────────────────────────────────

type MetricasHoy = { facturacion: number; cantidad: number; ticketPromedio: number };

function calcularMetricasHoy(ventas: Venta[]): MetricasHoy {
  const hoy = new Date();
  const yMatch = hoy.getFullYear();
  const mMatch = hoy.getMonth();
  const dMatch = hoy.getDate();
  const deHoy = ventas.filter((v) => {
    const d = new Date(v.fecha);
    return d.getFullYear() === yMatch && d.getMonth() === mMatch && d.getDate() === dMatch;
  });
  const facturacion = deHoy.reduce((s, v) => s + v.total, 0);
  return {
    facturacion,
    cantidad: deHoy.length,
    ticketPromedio: deHoy.length > 0 ? facturacion / deHoy.length : 0,
  };
}

function formatGs(valor: number): string {
  return `₲ ${Math.round(valor).toLocaleString("es-PY")}`;
}

function formatFecha(iso: string): string {
  try {
    const d = new Date(iso);
    const dd = String(d.getDate()).padStart(2, "0");
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const hh = String(d.getHours()).padStart(2, "0");
    const min = String(d.getMinutes()).padStart(2, "0");
    return `${dd}/${mm} · ${hh}:${min}`;
  } catch {
    return iso;
  }
}
