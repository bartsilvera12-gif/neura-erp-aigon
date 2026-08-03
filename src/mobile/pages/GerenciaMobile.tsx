"use client";

import { useMemo, useState } from "react";
import { ArrowDownRight, ArrowUpRight, BarChart3, ChevronLeft, ChevronRight, Crown } from "lucide-react";
import { useGerenciaComercial } from "@/shared/hooks/useGerencia";

/**
 * Gerencia mobile — tablero ejecutivo simplificado.
 *  - Selector de periodo (mes anterior / mes actual).
 *  - KPIs grandes: facturado, cobrado, pendiente, MRR.
 *  - Top 5 clientes del periodo.
 *  - Top categorías de revenue.
 */
export default function GerenciaMobile() {
  const [period, setPeriod] = useState(currentPeriod());
  const { report, isLoading, error } = useGerenciaComercial(period);

  const kpis = report?.kpis;

  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      <header className="mb-3">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Gerencia</h1>
        <p className="mt-0.5 text-xs text-slate-500">Tablero ejecutivo</p>
      </header>

      {/* Selector de periodo */}
      <div className="mb-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setPeriod(addMonth(period, -1))}
          aria-label="Mes anterior"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-2 text-center text-sm font-medium text-slate-900">
          {formatPeriod(period)}
        </div>
        <button
          type="button"
          onClick={() => setPeriod(addMonth(period, 1))}
          disabled={period >= currentPeriod()}
          aria-label="Mes siguiente"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 disabled:opacity-50"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo cargar el reporte.
        </div>
      ) : null}

      {/* KPIs principales */}
      <section className="mb-4 grid grid-cols-2 gap-3">
        <KpiBox
          label="Facturado"
          value={kpis ? formatGsCompact(kpis.facturado_mes) : "—"}
          variacion={kpis?.variacion_facturado_pct ?? null}
          tone="primary"
          isLoading={isLoading}
        />
        <KpiBox
          label="Cobrado"
          value={kpis ? formatGsCompact(kpis.cobrado_mes) : "—"}
          variacion={kpis?.variacion_cobrado_pct ?? null}
          tone="emerald"
          isLoading={isLoading}
        />
        <KpiBox
          label="Pendiente"
          value={kpis ? formatGsCompact(kpis.pendiente_cobro) : "—"}
          tone="amber"
          isLoading={isLoading}
        />
        <KpiBox
          label="MRR"
          value={kpis ? formatGsCompact(kpis.mrr) : "—"}
          sub={report?.mrr ? `${report.mrr.subs_activas} subs activas` : undefined}
          tone="violet"
          isLoading={isLoading}
        />
      </section>

      {/* Top clientes */}
      <section className="mb-4">
        <div className="mb-2 flex items-center gap-2">
          <Crown className="h-3.5 w-3.5 text-amber-500" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Top clientes</h2>
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : !report?.top_clientes || report.top_clientes.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-3 py-3 text-center text-xs text-slate-500">
            Sin movimientos en el periodo.
          </p>
        ) : (
          <ul className="space-y-2">
            {report.top_clientes.slice(0, 5).map((c, i) => (
              <li key={i}>
                <div className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white p-3">
                  <div className="flex min-w-0 flex-1 items-center gap-2.5">
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-amber-100 text-xs font-bold text-amber-700">
                      {i + 1}
                    </span>
                    <p className="truncate text-sm font-medium text-slate-900">{c.cliente}</p>
                  </div>
                  <p className="shrink-0 text-right text-sm font-semibold tabular-nums text-slate-900">
                    {formatGsCompact(c.facturado)}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Top categorías */}
      <section>
        <div className="mb-2 flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5 text-[#4FAEB2]" />
          <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-500">Revenue por categoría</h2>
        </div>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-10 animate-pulse rounded-xl bg-slate-100" />
            ))}
          </div>
        ) : !report?.revenue_por_categoria || report.revenue_por_categoria.length === 0 ? (
          <p className="rounded-xl bg-slate-50 px-3 py-3 text-center text-xs text-slate-500">Sin datos.</p>
        ) : (
          <ul className="space-y-2">
            {report.revenue_por_categoria.slice(0, 5).map((c) => (
              <li key={c.categoria}>
                <CategoriaBar
                  categoria={c.categoria}
                  valor={c.facturado}
                  max={report.revenue_por_categoria[0]?.facturado ?? 1}
                />
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function KpiBox({
  label,
  value,
  variacion,
  sub,
  tone,
  isLoading,
}: {
  label: string;
  value: string;
  variacion?: number | null;
  sub?: string;
  tone: "primary" | "emerald" | "amber" | "violet";
  isLoading?: boolean;
}) {
  const toneCls = {
    primary: "border-slate-200",
    emerald: "border-emerald-200",
    amber: "border-amber-200",
    violet: "border-violet-200",
  }[tone];
  return (
    <div className={`rounded-2xl border bg-white p-3 ${toneCls}`}>
      <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="mt-1 break-words text-lg font-bold leading-tight tabular-nums text-slate-900">
        {isLoading ? <span className="inline-block h-5 w-20 animate-pulse rounded bg-slate-200" /> : value}
      </p>
      {variacion != null ? (
        <p
          className={`mt-0.5 flex items-center gap-0.5 text-[11px] font-medium ${
            variacion > 0 ? "text-emerald-600" : variacion < 0 ? "text-rose-600" : "text-slate-500"
          }`}
        >
          {variacion > 0 ? <ArrowUpRight className="h-3 w-3" /> : variacion < 0 ? <ArrowDownRight className="h-3 w-3" /> : null}
          {(variacion > 0 ? "+" : "") + variacion.toFixed(1)}% vs mes ant.
        </p>
      ) : sub ? (
        <p className="mt-0.5 text-[11px] text-slate-500">{sub}</p>
      ) : null}
    </div>
  );
}

const CAT_LABEL: Record<string, string> = {
  contabilidad: "Contabilidad",
  saas_erp: "SaaS / ERP",
  web_landing: "Web / Landing",
  marketing: "Marketing",
  branding: "Branding",
  otros: "Otros",
  sin_clasificar: "Sin clasificar",
};

function CategoriaBar({ categoria, valor, max }: { categoria: string; valor: number; max: number }) {
  const pct = max > 0 ? Math.round((valor / max) * 100) : 0;
  const label = CAT_LABEL[categoria] ?? categoria;
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-2.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-slate-700">{label}</p>
        <p className="text-xs font-semibold tabular-nums text-slate-900">{formatGsCompact(valor)}</p>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className="h-full rounded-full bg-[#4FAEB2]" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function addMonth(period: string, delta: number): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(y, m - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function formatPeriod(p: string): string {
  const meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
  const [y, m] = p.split("-").map(Number);
  return `${meses[m - 1]} ${y}`;
}

function formatGsCompact(n: number): string {
  const abs = Math.abs(n || 0);
  if (abs >= 1e9) return `Gs ${(n / 1e9).toFixed(1)}MM`;
  if (abs >= 1e6) return `Gs ${(n / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `Gs ${(n / 1e3).toFixed(0)}k`;
  return `Gs ${Math.round(n || 0).toLocaleString("es-PY")}`;
}
