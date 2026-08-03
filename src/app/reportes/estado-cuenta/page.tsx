"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  Wallet,
  TrendingUp,
  Clock,
  ShoppingBag,
  Receipt,
  Scale,
  Inbox,
} from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { ymdInicioFinMesLocal, toCalendarDateStr } from "@/lib/fechas/calendario";

const INPUT_CLS =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";
const LABEL_CLS = "block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 mb-1.5";

type Totales = {
  ventas: number;
  cobrado: number;
  pendiente: number;
  compras: number;
  gastos: number;
  resultado: number;
};
type Movimiento = {
  fecha: string;
  tipo: "venta" | "cobro" | "compra" | "gasto";
  documento: string;
  contraparte: string;
  monto: number;
  estado: string;
};
type Pendiente = {
  numero_factura: string;
  cliente: string;
  fecha: string;
  fecha_vencimiento: string | null;
  saldo: number;
  estado: string;
};
type Reporte = {
  periodo: { desde: string; hasta: string };
  totales: Totales;
  movimientos: Movimiento[];
  pendientes: Pendiente[];
};

function gs(n: number): string {
  return `Gs. ${Math.round(Number(n) || 0).toLocaleString("es-PY")}`;
}
function fFecha(s: string): string {
  if (!s) return "—";
  const [y, m, d] = s.split("-");
  return d ? `${d}/${m}/${y}` : s;
}

const TIPO_META: Record<Movimiento["tipo"], { label: string; cls: string }> = {
  venta: { label: "Venta", cls: "border-[#4FAEB2]/30 bg-[#4FAEB2]/10 text-[#3F8E91]" },
  cobro: { label: "Cobro", cls: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  compra: { label: "Compra", cls: "border-amber-200 bg-amber-50 text-amber-700" },
  gasto: { label: "Gasto", cls: "border-rose-200 bg-rose-50 text-rose-700" },
};

export default function ReporteEstadoCuentaPage() {
  const mesActual = ymdInicioFinMesLocal();
  const [desde, setDesde] = useState(mesActual.inicioYmd);
  const [hasta, setHasta] = useState(mesActual.finYmd);
  const [data, setData] = useState<Reporte | null>(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async (d: string, h: string) => {
    setCargando(true);
    setError(null);
    try {
      const qs = new URLSearchParams();
      if (d) qs.set("desde", d);
      if (h) qs.set("hasta", h);
      const res = await fetchWithSupabaseSession(`/api/reportes/estado-cuenta?${qs.toString()}`, {
        cache: "no-store",
      });
      const json = await res.json();
      if (json?.success && json.data) {
        setData(json.data as Reporte);
      } else {
        setData(null);
        setError(json?.error ?? "No se pudo cargar el reporte.");
      }
    } catch {
      setData(null);
      setError("No se pudo cargar el reporte.");
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar(mesActual.inicioYmd, mesActual.finYmd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function aplicar() {
    cargar(toCalendarDateStr(desde), toCalendarDateStr(hasta));
  }
  function limpiar() {
    const m = ymdInicioFinMesLocal();
    setDesde(m.inicioYmd);
    setHasta(m.finYmd);
    cargar(m.inicioYmd, m.finYmd);
  }

  const t = data?.totales;

  return (
    <div className="w-full min-w-0 max-w-full space-y-6">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
          />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
            Reportes · Finanzas
          </p>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          Estado de cuenta empresa
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Resumen financiero general del período: ventas, cobros, pendientes, compras y gastos.
        </p>
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-end gap-3">
          <div className="min-w-[10rem]">
            <label className={LABEL_CLS}>Desde</label>
            <input type="date" value={desde} onChange={(e) => setDesde(e.target.value)} className={INPUT_CLS} />
          </div>
          <div className="min-w-[10rem]">
            <label className={LABEL_CLS}>Hasta</label>
            <input type="date" value={hasta} onChange={(e) => setHasta(e.target.value)} className={INPUT_CLS} />
          </div>
          <button
            type="button"
            onClick={aplicar}
            className="rounded-xl bg-[#4FAEB2] px-4 py-2.5 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91]"
          >
            Aplicar filtros
          </button>
          <button
            type="button"
            onClick={limpiar}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/5 hover:text-[#3F8E91]"
          >
            Limpiar filtros
          </button>
          <Link
            href="/reportes"
            className="ml-auto inline-flex items-center gap-1.5 self-center text-xs font-semibold text-[#4FAEB2] hover:text-[#3F8E91] hover:underline"
          >
            ← Volver a Reportes
          </Link>
        </div>
        {data ? (
          <p className="mt-3 text-[11px] text-slate-500">
            Período: {fFecha(data.periodo.desde)} — {fFecha(data.periodo.hasta)}
          </p>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-2xl border border-rose-200 bg-rose-50 px-5 py-4 text-sm text-rose-700">
          {error}
        </div>
      ) : null}

      {/* Resumen financiero */}
      <Section title="Resumen financiero">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Kpi icon={<TrendingUp className="h-4 w-4" />} label="Ventas del período" value={cargando ? "…" : gs(t?.ventas ?? 0)} accent="neutral" />
          <Kpi icon={<Wallet className="h-4 w-4" />} label="Cobrado del período" value={cargando ? "…" : gs(t?.cobrado ?? 0)} accent="featured" />
          <Kpi icon={<Clock className="h-4 w-4" />} label="Pendiente de cobro" value={cargando ? "…" : gs(t?.pendiente ?? 0)} accent="warning" />
          <Kpi icon={<ShoppingBag className="h-4 w-4" />} label="Compras del período" value={cargando ? "…" : gs(t?.compras ?? 0)} accent="neutral" />
          <Kpi icon={<Receipt className="h-4 w-4" />} label="Gastos del período" value={cargando ? "…" : gs(t?.gastos ?? 0)} accent="neutral" />
          <Kpi
            icon={<Scale className="h-4 w-4" />}
            label="Resultado estimado"
            value={cargando ? "…" : gs(t?.resultado ?? 0)}
            accent={(t?.resultado ?? 0) >= 0 ? "featured" : "warning"}
            sub="Cobrado − compras − gastos"
          />
        </div>
      </Section>

      {/* Movimientos recientes */}
      <Section title="Movimientos recientes" subtitle="Últimos movimientos del período (ventas, cobros, compras y gastos).">
        {cargando ? (
          <Cargando />
        ) : !data || data.movimientos.length === 0 ? (
          <Vacio />
        ) : (
          <TablaWrap minW="900px" headers={["Fecha", "Tipo", "Documento", "Cliente / Proveedor", "Monto", "Estado"]}>
            {data.movimientos.map((m, i) => (
              <tr key={i} className="transition-colors hover:bg-[#4FAEB2]/5">
                <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-600 first:pl-5 sm:px-4">{fFecha(m.fecha)}</td>
                <td className="whitespace-nowrap px-3 py-3 sm:px-4">
                  <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${TIPO_META[m.tipo].cls}`}>
                    {TIPO_META[m.tipo].label}
                  </span>
                </td>
                <td className="px-3 py-3 text-sm text-slate-700 sm:px-4 [overflow-wrap:anywhere]">{m.documento}</td>
                <td className="px-3 py-3 text-sm text-slate-600 sm:px-4 [overflow-wrap:anywhere]">{m.contraparte}</td>
                <td className="whitespace-nowrap px-3 py-3 text-sm font-semibold tabular-nums text-slate-900 sm:px-4">{gs(m.monto)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-600 last:pr-5 sm:px-4">{m.estado}</td>
              </tr>
            ))}
          </TablaWrap>
        )}
      </Section>

      {/* Pendientes importantes */}
      <Section title="Pendientes importantes" subtitle="Facturas con saldo pendiente de cobro (por vencimiento).">
        {cargando ? (
          <Cargando />
        ) : !data || data.pendientes.length === 0 ? (
          <Vacio />
        ) : (
          <TablaWrap minW="820px" headers={["Factura", "Cliente", "Fecha", "Vencimiento", "Saldo", "Estado"]}>
            {data.pendientes.map((p, i) => (
              <tr key={i} className="transition-colors hover:bg-[#4FAEB2]/5">
                <td className="whitespace-nowrap px-3 py-3 first:pl-5 sm:px-4">
                  <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-semibold text-slate-700">
                    {p.numero_factura}
                  </span>
                </td>
                <td className="px-3 py-3 text-sm text-slate-600 sm:px-4 [overflow-wrap:anywhere]">{p.cliente}</td>
                <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-600 sm:px-4">{fFecha(p.fecha)}</td>
                <td className="whitespace-nowrap px-3 py-3 text-sm text-slate-600 sm:px-4">{p.fecha_vencimiento ? fFecha(p.fecha_vencimiento) : "—"}</td>
                <td className="whitespace-nowrap px-3 py-3 text-sm font-semibold tabular-nums text-amber-600 sm:px-4">{gs(p.saldo)}</td>
                <td className="whitespace-nowrap px-3 py-3 last:pr-5 sm:px-4">
                  <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-[11px] font-semibold text-amber-700">
                    {p.estado}
                  </span>
                </td>
              </tr>
            ))}
          </TablaWrap>
        )}
      </Section>
    </div>
  );
}

// ── Subcomponentes ──────────────────────────────────────────────────────────

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">{title}</h2>
        </div>
        {subtitle ? <p className="mt-1 pl-3 text-[11px] text-slate-500">{subtitle}</p> : null}
      </div>
      {children}
    </div>
  );
}

function Kpi({
  icon,
  label,
  value,
  sub,
  accent = "neutral",
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  accent?: "neutral" | "featured" | "warning";
}) {
  const chip =
    accent === "featured"
      ? "border-[#4FAEB2]/30 bg-[#4FAEB2]/12 text-[#4FAEB2]"
      : accent === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-600"
        : "border-slate-200 bg-slate-50 text-slate-500";
  const valueCls =
    accent === "featured" ? "text-[#3F8E91]" : accent === "warning" ? "text-amber-600" : "text-slate-900";
  return (
    <div className="relative overflow-hidden rounded-xl border border-[#4FAEB2]/45 bg-white px-3.5 py-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-all duration-200 hover:-translate-y-0.5 hover:shadow-md">
      <div className="flex items-start gap-2.5">
        <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border ${chip}`}>{icon}</span>
        <div className="min-w-0 flex-1">
          <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className={`mt-0.5 truncate text-lg font-semibold tabular-nums leading-tight tracking-tight ${valueCls}`}>{value}</p>
          {sub ? <p className="mt-0.5 truncate text-[10px] text-slate-500">{sub}</p> : null}
        </div>
      </div>
    </div>
  );
}

function TablaWrap({ headers, minW, children }: { headers: string[]; minW: string; children: React.ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#4FAEB2]/45 bg-white shadow-sm">
      <div className="overflow-x-auto overscroll-x-contain">
        <table className="w-full table-auto border-separate border-spacing-0 text-sm" style={{ minWidth: minW }}>
          <thead className="bg-slate-50/80">
            <tr>
              {headers.map((h) => (
                <th
                  key={h}
                  className="px-3 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500 first:pl-5 last:pr-5 sm:px-4"
                >
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">{children}</tbody>
        </table>
      </div>
    </div>
  );
}

function Cargando() {
  return (
    <div className="flex items-center justify-center gap-3 rounded-2xl border border-[#4FAEB2]/45 bg-white py-14 text-sm text-slate-500 shadow-sm">
      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#4FAEB2]" />
      Cargando…
    </div>
  );
}

function Vacio() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-[#4FAEB2]/45 bg-white px-6 py-14 text-center shadow-sm">
      <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-[#4FAEB2]/25 bg-[#4FAEB2]/8 text-[#4FAEB2]">
        <Inbox className="h-6 w-6" />
      </span>
      <p className="text-sm font-medium text-slate-600">Sin datos para este período</p>
    </div>
  );
}
