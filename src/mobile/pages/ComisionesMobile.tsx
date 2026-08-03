"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Percent, TrendingUp, X } from "lucide-react";
import Link from "next/link";
import {
  useComisionesPreview,
  type ComisionLinea,
  type ComisionVendedorRow,
} from "@/shared/hooks/useComisiones";

/**
 * Vista mobile de Comisiones — preview del periodo.
 *  - Selector compacto: Este mes / Mes anterior.
 *  - KPI principal: comisión estimada (mía si soy vendedor, total si admin).
 *  - Cards de vendedores con nombre, comisión, escala y progreso.
 *  - Link al detalle desktop para profundizar (lineas, ajustes, etc.).
 */
export default function ComisionesMobile() {
  const [mes, setMes] = useState<string | undefined>(undefined);
  const { data, isLoading, error } = useComisionesPreview(mes);
  const [showExcluidas, setShowExcluidas] = useState(false);

  const opciones = useMemo(() => buildMesesOpciones(), []);
  const periodoMes = data?.meta?.periodo_mes ?? mes ?? opciones[0].value;
  const esVendedor = data?.meta?.is_vendedor_view === true;
  const nExcluidas = data?.kpis?.lineas_excluidas ?? 0;

  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      <header className="mb-3">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Comisiones</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          {data?.meta?.politica_nombre ? `Política: ${data.meta.politica_nombre}` : "Preview del periodo"}
        </p>
      </header>

      {/* Selector de periodo */}
      <div className="mb-3 space-y-2">
        <div className="flex gap-2">
          {opciones.map((o) => (
            <button
              key={o.value}
              type="button"
              onClick={() => setMes(o.value === opciones[0].value ? undefined : o.value)}
              className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
                periodoMes === o.value
                  ? "border-[#0EA5E9] bg-[#0EA5E9]/5 text-[#0EA5E9]"
                  : "border-slate-200 bg-white text-slate-600"
              }`}
            >
              {o.label}
            </button>
          ))}
        </div>
        <label className="flex items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">Otro mes</span>
          <input
            type="month"
            value={periodoMes}
            max={opciones[0].value}
            onChange={(e) => setMes(e.target.value || undefined)}
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-sm font-medium text-slate-800 focus:border-[#0EA5E9] focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]/20"
          />
        </label>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar las comisiones.
        </div>
      ) : null}

      {/* KPI principal */}
      {!isLoading && data?.kpis ? (
        <div className="mb-4 rounded-2xl border border-emerald-200 bg-gradient-to-br from-white to-emerald-50 p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-100 text-emerald-700">
              <Percent className="h-4 w-4" />
            </div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              {esVendedor ? "Tu comisión estimada" : "Comisión total estimada"}
            </p>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">
            {formatGs(data.kpis.comision_estimada_total)}
          </p>
          {(data.kpis.premio_fijo_total ?? 0) > 0 ? (
            <p className="mt-0.5 text-[11px] text-emerald-700">
              Variable {formatGs(data.kpis.comision_variable_total ?? 0)} + Premio fijo{" "}
              {formatGs(data.kpis.premio_fijo_total ?? 0)}
            </p>
          ) : null}
          <p className="mt-0.5 text-xs text-slate-600">
            Sobre {formatGs(data.kpis.revenue_comisionable_total ?? data.kpis.revenue_base_total)} comisionable ·{" "}
            {data.kpis.vendedores_con_comision} vendedor(es)
          </p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            Cobrado total {formatGs(data.kpis.revenue_cobrado_total ?? data.kpis.cobrado_periodo_total)}
          </p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11px]">
            {nExcluidas > 0 ? (
              <button
                type="button"
                onClick={() => setShowExcluidas(true)}
                className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 font-semibold text-amber-800 hover:bg-amber-100"
              >
                {nExcluidas} excluida{nExcluidas === 1 ? "" : "s"} →
              </button>
            ) : (
              <span className="text-slate-400">0 excluidas</span>
            )}
            {(data.kpis.lineas_incluidas_manual ?? 0) > 0 ? (
              <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 font-medium text-sky-700">
                {data.kpis.lineas_incluidas_manual} incluida(s) manual
              </span>
            ) : null}
          </div>
        </div>
      ) : null}

      {showExcluidas && data ? (
        <ExcluidasSheet rows={data.por_vendedor} onClose={() => setShowExcluidas(false)} />
      ) : null}

      {/* Lista de vendedores */}
      {isLoading ? (
        <SkeletonList />
      ) : !data || data.por_vendedor.length === 0 ? (
        <EmptyState mensaje={data?.mensaje ?? "Sin movimientos en el periodo."} />
      ) : (
        <ul className="space-y-2">
          {data.por_vendedor.map((v) => (
            <VendedorCard key={v.vendedor_usuario_id} v={v} />
          ))}
        </ul>
      )}

      <div className="mt-4">
        <Link
          href="/comisiones"
          className="flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-700 hover:bg-slate-50"
        >
          Ver detalle por línea <ArrowUpRight className="h-3.5 w-3.5" />
        </Link>
        <p className="mt-2 text-center text-[11px] text-slate-400">
          Las inclusiones/exclusiones de comisión se gestionan desde el detalle (escritorio).
        </p>
      </div>
    </div>
  );
}

function VendedorCard({ v }: { v: ComisionVendedorRow }) {
  const progreso = v.progreso_hacia_siguiente_pct ?? 0;
  return (
    <li>
      <div className="rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{v.vendedor_nombre}</p>
            <div className="mt-1 flex items-center gap-1.5 text-[11px] text-slate-500">
              <TrendingUp className="h-3 w-3" />
              {v.escala_aplicada}
            </div>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {v.cantidad_movimientos} movimientos · {formatPct(v.porcentaje_tramo)}
              {v.lineas_excluidas ? ` · ${v.lineas_excluidas} excluida(s)` : ""}
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-base font-bold tabular-nums text-emerald-700">{formatGs(v.comision_estimada)}</p>
            <p className="text-[10px] text-slate-500">{formatGs(v.revenue_base)} base</p>
          </div>
        </div>

        {/* Barra de progreso a la próxima escala */}
        {!v.max_escala_alcanzada && progreso > 0 ? (
          <div className="mt-2.5">
            <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width] duration-300"
                style={{ width: `${Math.min(100, Math.max(0, progreso))}%` }}
              />
            </div>
            <p className="mt-1 text-[10px] text-slate-500">
              {Math.round(progreso)}% hacia la próxima escala
            </p>
          </div>
        ) : v.max_escala_alcanzada ? (
          <p className="mt-2 text-[10px] font-medium text-emerald-700">🏆 Máxima escala alcanzada</p>
        ) : null}
      </div>
    </li>
  );
}

function EmptyState({ mensaje }: { mensaje: string }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
      <Percent className="mx-auto h-8 w-8 text-slate-300" />
      <p className="mt-2 text-sm font-medium text-slate-700">{mensaje}</p>
    </div>
  );
}

function SkeletonList() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="rounded-2xl border border-slate-200 bg-white p-3.5">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-100" />
              <div className="h-2.5 w-1/3 animate-pulse rounded bg-slate-100" />
              <div className="h-2.5 w-1/2 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="ml-auto h-4 w-16 shrink-0 animate-pulse rounded bg-slate-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function buildMesesOpciones(): { value: string; label: string }[] {
  const hoy = new Date();
  const actual = `${hoy.getFullYear()}-${String(hoy.getMonth() + 1).padStart(2, "0")}`;
  const anterior = new Date(hoy.getFullYear(), hoy.getMonth() - 1, 1);
  const anteriorStr = `${anterior.getFullYear()}-${String(anterior.getMonth() + 1).padStart(2, "0")}`;
  return [
    { value: actual, label: "Este mes" },
    { value: anteriorStr, label: "Mes anterior" },
  ];
}

function formatGs(n: number): string {
  return `₲ ${Math.round(n).toLocaleString("es-PY")}`;
}

function formatPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${(n * 100).toFixed(1)}%`;
}

function formatDateShort(iso: string | null): string {
  if (!iso) return "—";
  const ymd = iso.slice(0, 10);
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}`;
}

function motivoExclusion(ln: ComisionLinea): string {
  if (ln.origen === "override_excluir") {
    return ln.override_motivo?.trim() ? ln.override_motivo : "Excluido manualmente";
  }
  if (ln.origen === "factura") return "Factura marcada no comisionable";
  return "No es venta nueva (cliente recurrente / suscripción)";
}

type ExcluidaMobile = ComisionLinea & { _vendedor: string };

function ExcluidasSheet({
  rows,
  onClose,
}: {
  rows: ComisionVendedorRow[];
  onClose: () => void;
}) {
  const excluidas: ExcluidaMobile[] = useMemo(() => {
    const out: ExcluidaMobile[] = [];
    for (const v of rows) {
      for (const ln of v.lineas) {
        if (ln.comisiona === false) out.push({ ...ln, _vendedor: v.vendedor_nombre });
      }
    }
    out.sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
    return out;
  }, [rows]);

  const total = excluidas.reduce((s, ln) => s + (Number(ln.monto_base) || 0), 0);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex flex-col justify-end">
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40"
      />
      <div className="relative z-10 flex max-h-[88vh] flex-col overflow-hidden rounded-t-2xl border-t border-slate-200 bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wider text-amber-700">
              Líneas excluidas
            </p>
            <h2 className="mt-0.5 text-base font-bold tracking-tight text-slate-900">
              {excluidas.length} no comisiona{excluidas.length === 1 ? "" : "n"}
            </h2>
            <p className="mt-0.5 text-[11px] text-slate-500">
              Total monto excluido: {formatGs(total)}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 p-1.5 text-slate-500"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-auto p-3">
          {excluidas.length === 0 ? (
            <p className="px-2 py-8 text-center text-sm text-slate-500">
              No hay líneas excluidas en este período.
            </p>
          ) : (
            <ul className="space-y-2">
              {excluidas.map((ln, i) => (
                <li
                  key={`${ln.pago_id ?? ""}-${ln.factura_id ?? ""}-${i}`}
                  className="rounded-xl border border-amber-200/70 bg-amber-50/40 p-3"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-slate-900">
                        {ln.cliente_label}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {ln.numero_factura ?? "Sin comprobante"} · {formatDateShort(ln.fecha)} ·{" "}
                        {ln._vendedor}
                      </p>
                    </div>
                    <p className="shrink-0 text-sm font-bold tabular-nums text-slate-900">
                      {formatGs(ln.monto_base)}
                    </p>
                  </div>
                  <p className="mt-1.5 text-[11px] font-medium text-amber-800">
                    {motivoExclusion(ln)}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>
        <p className="border-t border-slate-200 bg-slate-50 px-4 py-2 text-[10px] text-slate-500">
          Movimientos sin vendedor se cuentan aparte.
        </p>
      </div>
    </div>
  );
}
