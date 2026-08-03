"use client";

import { ChevronDown, RefreshCw, Search, X } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

const BASE_LABEL: Record<string, string> = {
  pago_registrado: "Cobros registrados",
  factura_emitida: "Facturas emitidas",
  factura_pagada: "Facturas cobradas",
};

const MOVIMIENTO_LABEL: Record<string, string> = {
  pago: "Cobro registrado",
  factura_emitida: "Factura emitida",
  factura_pagada: "Factura cobrada",
};

type Linea = {
  tipo: string;
  cliente_label: string;
  factura_id: string | null;
  numero_factura?: string | null;
  pago_id: string | null;
  fecha: string | null;
  monto_base: number;
  comision_estimada_linea: number;
  cobrado_periodo: number;
  saldo_pendiente: number;
  pendiente_por_comisionar: number;
  comisiona?: boolean;
  origen?: "auto" | "factura" | "override_incluir" | "override_excluir";
  override_motivo?: string | null;
  override_por?: string | null;
  override_at?: string | null;
  cliente_alta?: string | null;
  factura_monto_total?: number | null;
};

type VendedorRow = {
  vendedor_usuario_id: string;
  vendedor_nombre: string;
  cantidad_movimientos: number;
  revenue_base: number;
  revenue_cobrado_total?: number;
  cobrado_periodo_total: number;
  saldo_pendiente_total: number;
  pendiente_por_comisionar_total: number;
  lineas_excluidas?: number;
  lineas_incluidas_manual?: number;
  escala_aplicada: string;
  porcentaje_tramo: number;
  premio_fijo_tramo: number;
  escala_actual_desde: number | null;
  escala_actual_hasta: number | null;
  escala_actual_porcentaje: number | null;
  escala_actual_premio_fijo: number | null;
  siguiente_escala_desde: number | null;
  siguiente_escala_porcentaje: number | null;
  falta_para_siguiente_escala: number | null;
  progreso_hacia_siguiente_pct: number | null;
  max_escala_alcanzada: boolean;
  comision_variable?: number;
  premio_fijo_aplicado?: number;
  comision_estimada: number;
  lineas: Linea[];
};

type PreviewMeta = {
  preview?: boolean;
  periodo?: string;
  timezone?: string;
  modo_periodo?: string;
  fecha_inicio_local?: string;
  fecha_fin_local?: string;
  periodo_mes?: string;
  politica_nombre?: string;
  base_calculo?: string;
  sin_escalas?: boolean;
  alcance?: string;
  viewer_role?: string | null;
  viewer_scope?: "admin" | "vendedor";
  viewer_usuario_id?: string;
  is_vendedor_view?: boolean;
  vendedor_detectado_por?: string;
  vendedor_clientes_asignados?: number;
  supervisor_equipos_pendiente?: boolean;
  alerta_neto_sin_nc?: string | null;
  documentacion_base?: Record<string, string>;
};

type PreviewKpis = {
  revenue_base_total: number;
  revenue_comisionable_total?: number;
  revenue_cobrado_total?: number;
  comision_variable_total?: number;
  premio_fijo_total?: number;
  comision_estimada_total: number;
  cobrado_periodo_total: number;
  saldo_pendiente_total: number;
  pendiente_por_comisionar_total: number;
  vendedores_con_comision: number;
  lineas_excluidas?: number;
  lineas_incluidas_manual?: number;
  fuentes_sin_vendedor: number;
  alertas_sin_vendedor_pagos: number;
  alertas_sin_vendedor_facturas: number;
};

type PreviewPayload = {
  estado: string;
  mensaje?: string;
  meta: PreviewMeta | null;
  kpis: PreviewKpis | null;
  por_vendedor: VendedorRow[];
};

// ── Helpers ──────────────────────────────────────────────────────────────────

function fmtMoney(n: number): string {
  return new Intl.NumberFormat("es-PY", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

function fmtPct(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${new Intl.NumberFormat("es-PY", { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n)}%`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const ymd = iso.slice(0, 10);
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return iso;
  return `${d}/${m}/${y}`;
}

function currentMonthInputValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// ── Búsqueda local de movimientos (no altera cálculo ni totales) ─────────────

/**
 * Filtro 100% visual sobre las filas ya cargadas en el preview.
 * Coincide por nombre de cliente, comprobante, tipo de movimiento y fecha.
 * No modifica base, comisión, pendiente ni progreso del vendedor.
 */
function lineaMatchesQuery(ln: Linea, query: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const haystacks = [
    ln.cliente_label ?? "",
    ln.numero_factura ?? "",
    MOVIMIENTO_LABEL[ln.tipo] ?? "",
    ln.tipo ?? "",
    formatDate(ln.fecha),
    ln.fecha ?? "",
  ];
  return haystacks.some((h) => h.toLowerCase().includes(needle));
}

function MovimientosSearch({
  value,
  onChange,
  shown,
  total,
}: {
  value: string;
  onChange: (v: string) => void;
  shown: number;
  total: number;
}) {
  const active = value.trim().length > 0;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="relative w-full sm:max-w-sm">
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Buscar cliente, comprobante o movimiento…"
          className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-9 text-sm text-slate-800 shadow-sm transition-colors placeholder:text-slate-400 hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
        />
        {active ? (
          <button
            type="button"
            onClick={() => onChange("")}
            aria-label="Limpiar búsqueda"
            className="absolute right-2 top-1/2 flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        ) : null}
      </div>
      {active ? (
        <p className="text-xs font-medium tabular-nums text-slate-500">
          Mostrando {shown} de {total} movimientos
        </p>
      ) : null}
    </div>
  );
}

function MovimientosEmptyState() {
  return (
    <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 px-4 py-10 text-center">
      <div className="mx-auto mb-2.5 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-400">
        <Search className="h-4 w-4" aria-hidden="true" />
      </div>
      <p className="text-sm font-semibold text-slate-700">
        No se encontraron movimientos para esta búsqueda.
      </p>
      <p className="mt-1 text-xs text-slate-500">Probá con otro nombre, comprobante o fecha.</p>
    </div>
  );
}

function escalaActualLabel(r: VendedorRow): string {
  if (r.escala_actual_porcentaje == null) {
    return r.siguiente_escala_desde == null ? "Sin escalas configuradas" : "Sin escala alcanzada todavía";
  }
  const premio = r.escala_actual_premio_fijo ?? r.premio_fijo_tramo ?? 0;
  const premioTxt = premio > 0 ? ` + ₲ ${fmtMoney(premio)} fijo` : "";
  return `Escala actual: ${fmtPct(r.escala_actual_porcentaje)}${premioTxt}`;
}

function siguienteEscalaLabel(r: VendedorRow): string {
  if (r.escala_actual_porcentaje == null && r.siguiente_escala_desde == null)
    return "Configurá escalas para medir el progreso.";
  if (r.max_escala_alcanzada) return "Máxima escala alcanzada";
  if (r.siguiente_escala_desde == null) return "Sin siguiente escala";
  return `Siguiente escala: ${fmtPct(r.siguiente_escala_porcentaje)} desde ${fmtMoney(r.siguiente_escala_desde)}`;
}

function faltaEscalaLabel(r: VendedorRow): string {
  if (r.max_escala_alcanzada) return "Ya estás en el tramo más alto.";
  if (r.falta_para_siguiente_escala == null) return "Sin escala siguiente configurada.";
  if (r.falta_para_siguiente_escala <= 0) return "Ya alcanzaste la siguiente escala.";
  return `Te faltan ₲ ${fmtMoney(r.falta_para_siguiente_escala)} para llegar a la siguiente escala.`;
}

function mensajeFuentesSinVendedor(k: PreviewKpis): string {
  const total = k.fuentes_sin_vendedor;
  return `Hay ${total} ${total === 1 ? "movimiento" : "movimientos"} de clientes sin vendedor asignado. Asigná un vendedor responsable en la ficha del cliente para incluirlos en el cálculo.`;
}

// ── Avatar de iniciales (estable por hash) ──────────────────────────────────

const AVATAR_TONES = [
  "bg-[#4FAEB2]/12 text-[#3F8E91] border-[#4FAEB2]/30",
  "bg-violet-50 text-violet-700 border-violet-200",
  "bg-amber-50 text-amber-700 border-amber-200",
  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "bg-rose-50 text-rose-700 border-rose-200",
  "bg-sky-50 text-sky-700 border-sky-200",
  "bg-indigo-50 text-indigo-700 border-indigo-200",
];

function avatarToneFor(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) | 0;
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}
function avatarInitial(label: string): string {
  const cleaned = label.replace(/^[^A-Za-z0-9]+/, "");
  const m = cleaned.match(/[A-Za-z0-9]/);
  return (m?.[0] ?? "?").toUpperCase();
}

// ── KPI premium (reemplaza ConfigMetricCard slate) ───────────────────────────

function Kpi({
  label,
  value,
  sub,
  accent = "neutral",
  onClick,
}: {
  label: string;
  value: string | number;
  sub?: string;
  accent?: "neutral" | "featured" | "warning" | "success";
  onClick?: () => void;
}) {
  const baseWrap =
    accent === "featured"
      ? "relative overflow-hidden rounded-2xl border border-[#4FAEB2]/55 bg-gradient-to-br from-white via-white to-[#4FAEB2]/8 p-4 shadow-[0_4px_18px_rgba(79,174,178,0.08)]"
      : "rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
  const wrapCls = onClick
    ? `${baseWrap} cursor-pointer text-left transition-shadow hover:shadow-md hover:border-[#4FAEB2]/60 focus:outline-none focus-visible:ring-2 focus-visible:ring-[#4FAEB2]/60`
    : baseWrap;
  const valueCls =
    accent === "featured"
      ? "text-[#3F8E91]"
      : accent === "warning"
        ? "text-amber-700"
        : accent === "success"
          ? "text-emerald-700"
          : "text-slate-900";
  const content = (
    <>
      {accent === "featured" ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#4FAEB2] via-[#4FAEB2]/70 to-[#4FAEB2]/30"
        />
      ) : null}
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={`mt-1.5 text-xl font-semibold tabular-nums tracking-tight sm:text-2xl ${valueCls}`}>
        {value}
      </p>
      {sub ? <p className="mt-1 text-[11px] text-slate-500">{sub}</p> : null}
      {onClick ? (
        <p className="mt-1.5 text-[10px] font-semibold uppercase tracking-[0.1em] text-[#3F8E91]">
          Ver detalle →
        </p>
      ) : null}
    </>
  );
  if (onClick) {
    return (
      <button type="button" onClick={onClick} className={`${wrapCls} block w-full`}>
        {content}
      </button>
    );
  }
  return <div className={wrapCls}>{content}</div>;
}

// ── ScaleProgress (paleta turquesa) ──────────────────────────────────────────

function ScaleProgress({ row, compact = false }: { row: VendedorRow; compact?: boolean }) {
  const progress = row.max_escala_alcanzada ? 100 : row.progreso_hacia_siguiente_pct ?? 0;

  if (row.escala_actual_porcentaje == null && row.siguiente_escala_desde == null) {
    return (
      <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-600">
        Sin escalas configuradas para esta política.
      </div>
    );
  }

  return (
    <div className={compact ? "space-y-2" : "rounded-xl border border-[#4FAEB2]/25 bg-[#4FAEB2]/[0.04] p-4"}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-slate-900">{escalaActualLabel(row)}</p>
          <p className="text-xs text-slate-500">{siguienteEscalaLabel(row)}</p>
        </div>
        <span
          className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
            row.max_escala_alcanzada
              ? "border-emerald-200 bg-emerald-50 text-emerald-700"
              : "border-[#4FAEB2]/30 bg-[#4FAEB2]/10 text-[#3F8E91]"
          }`}
        >
          <span
            aria-hidden="true"
            className={`h-1.5 w-1.5 rounded-full ${
              row.max_escala_alcanzada ? "bg-emerald-500" : "bg-[#4FAEB2]"
            }`}
          />
          {row.max_escala_alcanzada ? "Máxima escala" : `${progress}%`}
        </span>
      </div>
      <div className="h-2 rounded-full bg-white ring-1 ring-slate-200">
        <div
          className="h-2 rounded-full bg-gradient-to-r from-[#4FAEB2] to-[#3F8E91] transition-all"
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        />
      </div>
      <p className="text-xs text-slate-600">{faltaEscalaLabel(row)}</p>
    </div>
  );
}

function MiniScaleSummary({ row }: { row: VendedorRow }) {
  const progress = row.max_escala_alcanzada ? 100 : row.progreso_hacia_siguiente_pct ?? 0;
  return (
    <div className="min-w-[200px] text-left sm:text-right">
      <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
        Progreso de escala
      </p>
      <p className="mt-0.5 text-xs font-medium text-slate-700">
        {row.max_escala_alcanzada ? "Máxima escala alcanzada" : faltaEscalaLabel(row)}
      </p>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-1.5 rounded-full bg-gradient-to-r from-[#4FAEB2] to-[#3F8E91]"
          style={{ width: `${Math.max(0, Math.min(100, progress))}%` }}
        />
      </div>
    </div>
  );
}

function TotalsStrip({ row }: { row: VendedorRow }) {
  const premio = row.premio_fijo_aplicado ?? 0;
  const variable = row.comision_variable ?? row.comision_estimada;
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      <Kpi label="Base comisionable" value={`₲ ${fmtMoney(row.revenue_base)}`} />
      <Kpi
        label="Comisión estimada"
        value={`₲ ${fmtMoney(row.comision_estimada)}`}
        accent="featured"
        sub={
          premio > 0
            ? `Variable ₲ ${fmtMoney(variable)} + Premio fijo ₲ ${fmtMoney(premio)}`
            : undefined
        }
      />
      <Kpi label="Pendiente de cobro" value={`₲ ${fmtMoney(row.saldo_pendiente_total ?? 0)}`} accent="warning" />
    </div>
  );
}

export type OverrideCtx = {
  canOverride: boolean;
  busyPagoId: string | null;
  onOpen: (ln: Linea) => void;
  onClear: (pagoId: string) => void;
};

function OverrideActions({ ln, ctx }: { ln: Linea; ctx?: OverrideCtx }) {
  if (!ctx?.canOverride || ln.tipo !== "pago" || !ln.pago_id) return <span className="text-slate-300">—</span>;
  const busy = ctx.busyPagoId === ln.pago_id;
  const esOverride = ln.origen === "override_incluir" || ln.origen === "override_excluir";
  return (
    <div className="flex items-center justify-end gap-1.5">
      {esOverride ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => ctx.onClear(ln.pago_id as string)}
          className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 transition-colors hover:border-slate-300 disabled:opacity-50"
        >
          Quitar override
        </button>
      ) : null}
      <button
        type="button"
        disabled={busy}
        onClick={() => ctx.onOpen(ln)}
        className={`rounded-lg border px-2 py-1 text-[10px] font-semibold transition-colors disabled:opacity-50 ${
          ln.comisiona !== false
            ? "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100"
            : "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
        }`}
      >
        {ln.comisiona !== false ? "Excluir" : "Incluir"}
      </button>
    </div>
  );
}

function OverrideModal({
  target,
  busy,
  onCancel,
  onConfirm,
}: {
  target: { ln: Linea; decision: "incluir" | "excluir" } | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (motivo: string) => void;
}) {
  const [motivo, setMotivo] = useState("");
  if (!target) return null;
  const accion = target.decision === "excluir" ? "Excluir de comisión" : "Incluir en comisión";
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
        <h3 className="text-base font-semibold text-slate-900">{accion}</h3>
        <p className="mt-1 text-xs text-slate-500">
          {target.ln.cliente_label} · {target.ln.numero_factura ?? "—"} · ₲ {fmtMoney(target.ln.monto_base)}
        </p>
        <label className="mt-4 block">
          <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
            Motivo (obligatorio)
          </span>
          <textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            rows={3}
            placeholder="Ej.: cliente recurrente, no es venta nueva de implementación"
            className="mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
          />
        </label>
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={busy}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => onConfirm(motivo.trim())}
            disabled={busy || motivo.trim().length === 0}
            className="rounded-xl bg-[#3F8E91] px-3.5 py-2 text-xs font-semibold text-white hover:bg-[#357a7d] disabled:opacity-50"
          >
            {busy ? "Guardando…" : "Confirmar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function motivoExclusionLabel(ln: Linea): string {
  if (ln.origen === "override_excluir") {
    return ln.override_motivo?.trim() ? ln.override_motivo : "Excluido manualmente";
  }
  if (ln.origen === "factura") return "Factura marcada no comisionable";
  return "No es venta nueva (cliente recurrente / suscripción)";
}

function motivoExclusionTag(ln: Linea): { label: string; tone: "manual" | "factura" | "auto" } {
  if (ln.origen === "override_excluir") return { label: "Manual", tone: "manual" };
  if (ln.origen === "factura") return { label: "Factura", tone: "factura" };
  return { label: "Auto", tone: "auto" };
}

type ExcluidaConVendedor = Linea & { _vendedorNombre: string; _vendedorId: string };

function LineasExcluidasDrawer({
  rows,
  meta,
  overrideCtx,
  onClose,
}: {
  rows: VendedorRow[];
  meta: PreviewMeta | null | undefined;
  overrideCtx?: OverrideCtx;
  onClose: () => void;
}) {
  const excluidas: ExcluidaConVendedor[] = useMemo(() => {
    const out: ExcluidaConVendedor[] = [];
    for (const v of rows) {
      for (const ln of v.lineas) {
        if (ln.comisiona === false) {
          out.push({ ...ln, _vendedorNombre: v.vendedor_nombre, _vendedorId: v.vendedor_usuario_id });
        }
      }
    }
    out.sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""));
    return out;
  }, [rows]);

  const totalMonto = useMemo(
    () => excluidas.reduce((sum, ln) => sum + (Number(ln.monto_base) || 0), 0),
    [excluidas]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-stretch justify-end">
      {/* backdrop */}
      <button
        type="button"
        aria-label="Cerrar"
        onClick={onClose}
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
      />
      {/* panel */}
      <aside
        role="dialog"
        aria-modal="true"
        aria-label="Detalle de líneas excluidas"
        className="relative z-10 flex h-full w-full max-w-3xl flex-col overflow-hidden border-l border-slate-200 bg-white shadow-2xl"
      >
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">
              Resumen · Líneas excluidas
            </p>
            <h2 className="mt-1 text-lg font-semibold tracking-tight text-slate-900">
              {excluidas.length} línea{excluidas.length === 1 ? "" : "s"} no comisiona
              {excluidas.length === 1 ? "" : "n"} este período
            </h2>
            <p className="mt-1 text-xs text-slate-500">
              {meta?.periodo ?? "—"}
              {meta?.fecha_inicio_local ? (
                <span className="tabular-nums text-slate-400">
                  {" "}
                  · {meta.fecha_inicio_local} → {meta.fecha_fin_local}
                </span>
              ) : null}
              <span className="block text-[11px] text-slate-400">
                Total monto excluido: ₲ {fmtMoney(totalMonto)} · No incluye movimientos sin vendedor (se cuentan aparte).
              </span>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-500 transition-colors hover:border-slate-300 hover:text-slate-700"
            aria-label="Cerrar panel"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex-1 overflow-auto">
          {excluidas.length === 0 ? (
            <div className="px-6 py-12 text-center text-sm text-slate-500">
              No hay líneas excluidas en este período.
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead className="sticky top-0 z-10 bg-amber-50/95 backdrop-blur">
                <tr className="border-b border-amber-200">
                  {[
                    { h: "Fecha", right: false },
                    { h: "Cliente / Factura", right: false },
                    { h: "Concepto", right: false },
                    { h: "Monto", right: true },
                    { h: "Vendedor", right: false },
                    { h: "Motivo", right: false },
                    { h: "Origen", right: false },
                    ...(overrideCtx?.canOverride ? [{ h: "Acción", right: true as const }] : []),
                  ].map(({ h, right }) => (
                    <th
                      key={h}
                      className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-800 whitespace-nowrap ${
                        right ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100/70">
                {excluidas.map((ln, i) => {
                  const tag = motivoExclusionTag(ln);
                  const tagCls =
                    tag.tone === "manual"
                      ? "border-rose-200 bg-rose-50 text-rose-700"
                      : tag.tone === "factura"
                        ? "border-sky-200 bg-sky-50 text-sky-700"
                        : "border-amber-200 bg-amber-50 text-amber-800";
                  return (
                    <tr key={`${ln.pago_id ?? ""}-${ln.factura_id ?? ""}-${i}`} className="hover:bg-amber-50/40">
                      <td className="px-4 py-3 text-xs tabular-nums text-slate-600 whitespace-nowrap">
                        {formatDate(ln.fecha)}
                      </td>
                      <td className="px-4 py-3">
                        <p className="text-sm font-medium text-slate-800">{ln.cliente_label}</p>
                        {ln.numero_factura ? (
                          <p className="text-[10px] text-slate-400">{ln.numero_factura}</p>
                        ) : null}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600 whitespace-nowrap">
                        {MOVIMIENTO_LABEL[ln.tipo] ?? ln.tipo}
                      </td>
                      <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-slate-900 whitespace-nowrap">
                        ₲ {fmtMoney(ln.monto_base)}
                      </td>
                      <td className="px-4 py-3 text-xs text-slate-600">{ln._vendedorNombre}</td>
                      <td className="px-4 py-3 text-xs text-slate-700">
                        {motivoExclusionLabel(ln)}
                        {ln.override_por ? (
                          <span className="block text-[10px] text-slate-400">{ln.override_por}</span>
                        ) : null}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tagCls}`}
                        >
                          {tag.label}
                        </span>
                      </td>
                      {overrideCtx?.canOverride ? (
                        <td className="px-4 py-3 text-right">
                          {ln.tipo === "pago" && ln.pago_id ? (
                            <button
                              type="button"
                              disabled={overrideCtx.busyPagoId === ln.pago_id}
                              onClick={() => overrideCtx.onOpen(ln)}
                              title="Incluir manualmente en la comisión de este período"
                              className="inline-flex items-center gap-1 rounded-lg border border-[#4FAEB2]/40 bg-[#4FAEB2]/10 px-2 py-1 text-[10px] font-semibold text-[#3F8E91] transition-colors hover:bg-[#4FAEB2]/20 disabled:opacity-50"
                            >
                              + Agregar
                            </button>
                          ) : (
                            <span className="text-slate-300">—</span>
                          )}
                        </td>
                      ) : null}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        <footer className="border-t border-slate-200 bg-slate-50 px-6 py-3 text-[11px] text-slate-500">
          Las líneas sin vendedor asignado no se cuentan acá; aparecen en la card{" "}
          <span className="font-semibold text-slate-700">Movimientos sin vendedor</span>.
        </footer>
      </aside>
    </div>
  );
}

function ExcluidosToggle({
  mostrar,
  onToggle,
  countExcluidos,
}: {
  mostrar: boolean;
  onToggle: () => void;
  countExcluidos: number;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold transition-colors ${
        mostrar
          ? "border-[#4FAEB2] bg-[#4FAEB2]/10 text-[#3F8E91]"
          : "border-slate-200 bg-white text-slate-600 hover:border-[#4FAEB2]/60"
      }`}
    >
      {mostrar ? "Ver comisionables" : `Mostrar excluidos${countExcluidos ? ` (${countExcluidos})` : ""}`}
    </button>
  );
}

function MovimientosTable({ row, overrideCtx }: { row: VendedorRow; overrideCtx?: OverrideCtx }) {
  const [query, setQuery] = useState("");
  const [mostrarExcluidos, setMostrarExcluidos] = useState(false);

  const comisionables = useMemo(() => row.lineas.filter((l) => l.comisiona !== false), [row.lineas]);
  const excluidas = useMemo(() => row.lineas.filter((l) => l.comisiona === false), [row.lineas]);
  const base = mostrarExcluidos ? excluidas : comisionables;
  const lineasFiltradas = useMemo(
    () => base.filter((ln) => lineaMatchesQuery(ln, query)),
    [base, query]
  );

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex-1 min-w-[200px]">
          <MovimientosSearch value={query} onChange={setQuery} shown={lineasFiltradas.length} total={base.length} />
        </div>
        <ExcluidosToggle
          mostrar={mostrarExcluidos}
          onToggle={() => setMostrarExcluidos((v) => !v)}
          countExcluidos={excluidas.length}
        />
      </div>

      {lineasFiltradas.length === 0 ? (
        <MovimientosEmptyState />
      ) : mostrarExcluidos ? (
        // ── Vista de auditoría / excluidos ──
        <div className="overflow-hidden rounded-xl border border-amber-200">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="bg-amber-50/70">
                <tr>
                  {[
                    { h: "Cliente", right: false },
                    { h: "Factura", right: false },
                    { h: "Fecha de pago", right: false },
                    { h: "Monto pagado", right: true },
                    { h: "Motivo / origen", right: false },
                    { h: "Acción", right: true },
                  ].map(({ h, right }) => (
                    <th
                      key={h}
                      className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-amber-700 whitespace-nowrap ${
                        right ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-amber-100/70">
                {lineasFiltradas.map((ln, i) => (
                  <tr key={`${ln.pago_id ?? ""}-${ln.factura_id ?? ""}-${i}`} className="hover:bg-amber-50/40">
                    <td className="px-4 py-3 text-sm font-medium text-slate-800">{ln.cliente_label}</td>
                    <td className="px-4 py-3 text-xs font-medium text-slate-700">{ln.numero_factura ?? "—"}</td>
                    <td className="px-4 py-3 text-xs tabular-nums text-slate-600">{formatDate(ln.fecha)}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-slate-900">
                      {fmtMoney(ln.monto_base)}
                    </td>
                    <td className="px-4 py-3 text-xs text-slate-600">
                      {motivoExclusionLabel(ln)}
                      {ln.override_por ? <span className="block text-[10px] text-slate-400">{ln.override_por}</span> : null}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <OverrideActions ln={ln} ctx={overrideCtx} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // ── Vista principal (solo comisionables) ──
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] text-left text-sm">
              <thead className="bg-slate-50/80">
                <tr>
                  {[
                    { h: "Cliente", right: false },
                    { h: "Fecha alta cliente", right: false },
                    { h: "Monto total", right: true },
                    { h: "Monto pagado", right: true },
                    { h: "Fecha de pago", right: false },
                    { h: "Comisión (variable)", right: true },
                    { h: "Acción", right: true },
                  ].map(({ h, right }) => (
                    <th
                      key={h}
                      className={`px-4 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 whitespace-nowrap ${
                        right ? "text-right" : "text-left"
                      }`}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {lineasFiltradas.map((ln, i) => (
                  <tr
                    key={`${ln.pago_id ?? ""}-${ln.factura_id ?? ""}-${i}`}
                    className="transition-colors hover:bg-[#4FAEB2]/[0.04]"
                  >
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium text-slate-800">{ln.cliente_label}</p>
                      {ln.numero_factura ? (
                        <p className="text-[10px] text-slate-400">{ln.numero_factura}</p>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums text-slate-600">{formatDate(ln.cliente_alta ?? null)}</td>
                    <td className="px-4 py-3 text-right text-sm tabular-nums text-slate-700">
                      {fmtMoney(ln.factura_monto_total ?? 0)}
                    </td>
                    <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-slate-900">
                      {fmtMoney(ln.monto_base)}
                    </td>
                    <td className="px-4 py-3 text-xs tabular-nums text-slate-600">{formatDate(ln.fecha)}</td>
                    <td className="px-4 py-3 text-right text-sm font-semibold tabular-nums text-[#3F8E91]">
                      {fmtMoney(ln.comision_estimada_linea)}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <OverrideActions ln={ln} ctx={overrideCtx} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function SellerMovimientosList({ row }: { row: VendedorRow }) {
  const [query, setQuery] = useState("");
  const [mostrarExcluidos, setMostrarExcluidos] = useState(false);

  const comisionables = useMemo(() => row.lineas.filter((l) => l.comisiona !== false), [row.lineas]);
  const excluidas = useMemo(() => row.lineas.filter((l) => l.comisiona === false), [row.lineas]);
  const base = mostrarExcluidos ? excluidas : comisionables;
  const lineasFiltradas = useMemo(() => base.filter((ln) => lineaMatchesQuery(ln, query)), [base, query]);

  return (
    <div className="mt-3 space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex-1 min-w-[200px]">
          <MovimientosSearch value={query} onChange={setQuery} shown={lineasFiltradas.length} total={base.length} />
        </div>
        <ExcluidosToggle
          mostrar={mostrarExcluidos}
          onToggle={() => setMostrarExcluidos((v) => !v)}
          countExcluidos={excluidas.length}
        />
      </div>
      {lineasFiltradas.length === 0 ? (
        <MovimientosEmptyState />
      ) : (
        <div className="grid gap-3">
          {lineasFiltradas.map((ln, i) => (
            <article
              key={`${ln.pago_id ?? ""}-${ln.factura_id ?? ""}-${i}`}
              className={`rounded-2xl border bg-white p-4 shadow-sm transition-shadow hover:shadow-md ${
                mostrarExcluidos ? "border-amber-200" : "border-slate-200"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{ln.cliente_label}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {ln.numero_factura ?? "Sin comprobante"} · {formatDate(ln.fecha)}
                  </p>
                  {mostrarExcluidos ? (
                    <p className="mt-1 text-[11px] font-medium text-amber-700">{motivoExclusionLabel(ln)}</p>
                  ) : null}
                </div>
                <div className="text-left sm:text-right">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                    Comisión (variable)
                  </p>
                  <p className="mt-0.5 text-base font-semibold tabular-nums text-[#3F8E91]">
                    ₲ {fmtMoney(ln.comision_estimada_linea)}
                  </p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Monto total</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">₲ {fmtMoney(ln.factura_monto_total ?? 0)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Monto pagado</p>
                  <p className="mt-0.5 text-sm font-semibold tabular-nums text-slate-900">₲ {fmtMoney(ln.monto_base)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Fecha de pago</p>
                  <p className="mt-0.5 text-sm font-medium tabular-nums text-slate-700">{formatDate(ln.fecha)}</p>
                </div>
                <div>
                  <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Fecha alta cliente</p>
                  <p className="mt-0.5 text-sm font-medium tabular-nums text-slate-700">{formatDate(ln.cliente_alta ?? null)}</p>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Vendedor view (vista del vendedor autenticado) ───────────────────────────

function renderVendedorView({
  meta,
  sellerRow,
  selectedSellerMonth,
  onMonthChange,
}: {
  meta: PreviewMeta | null | undefined;
  sellerRow: VendedorRow | null;
  selectedSellerMonth: string;
  onMonthChange: (mes: string) => void;
}) {
  return (
    <div className="space-y-6 pb-10">
      <section className="rounded-2xl border border-[#4FAEB2]/45 bg-white px-6 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Mi comisión
            </p>
            <h1 className="text-xl font-semibold tracking-tight text-slate-900">
              Comisión del mes
            </h1>
          </div>
          <label className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Mes a consultar
            </span>
            <input
              type="month"
              value={selectedSellerMonth}
              max={currentMonthInputValue()}
              onChange={(e) => onMonthChange(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
            />
          </label>
        </div>
      </section>

      {!sellerRow ? (
        <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center shadow-sm">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-[#4FAEB2]/25 bg-[#4FAEB2]/10 text-[#4FAEB2]">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-5 w-5"
              aria-hidden="true"
            >
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <p className="text-sm font-semibold text-slate-800">
            Todavía no tenés movimientos comisionables en este período.
          </p>
          <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
            Cuando tus clientes registren movimientos dentro del período, vas a verlos acá.
          </p>
        </div>
      ) : (
        <>
          <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                    Mini dashboard
                  </p>
                </div>
                <h2 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">
                  Mi comisión del mes
                </h2>
              </div>
              <span
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${
                  sellerRow.max_escala_alcanzada
                    ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                    : "border-[#4FAEB2]/30 bg-[#4FAEB2]/10 text-[#3F8E91]"
                }`}
              >
                <span
                  aria-hidden="true"
                  className={`h-1.5 w-1.5 rounded-full ${
                    sellerRow.max_escala_alcanzada ? "bg-emerald-500" : "bg-[#4FAEB2]"
                  }`}
                />
                {sellerRow.max_escala_alcanzada ? "Máxima escala alcanzada" : "En progreso"}
              </span>
            </div>

            <ScaleProgress row={sellerRow} />

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <Kpi label="Base comisionable" value={`₲ ${fmtMoney(sellerRow.revenue_base)}`} />
              <Kpi
                label="Comisión estimada"
                value={`₲ ${fmtMoney(sellerRow.comision_estimada)}`}
                accent="featured"
                sub={
                  (sellerRow.premio_fijo_aplicado ?? 0) > 0
                    ? `Variable ₲ ${fmtMoney(sellerRow.comision_variable ?? sellerRow.comision_estimada)} + Premio fijo ₲ ${fmtMoney(sellerRow.premio_fijo_aplicado ?? 0)}`
                    : undefined
                }
              />
              <Kpi
                label="Pendiente de cobro"
                value={`₲ ${fmtMoney(sellerRow.saldo_pendiente_total ?? 0)}`}
                accent="warning"
              />
            </div>
          </section>

          <details className="group rounded-2xl border border-slate-200 bg-white shadow-sm open:shadow-md">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-4 [&::-webkit-details-marker]:hidden">
              <div>
                <p className="font-semibold text-slate-900">Mis clientes y movimientos</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {sellerRow.cantidad_movimientos} movimientos · Pendiente de cobro ₲{" "}
                  {fmtMoney(sellerRow.saldo_pendiente_total ?? 0)}
                </p>
              </div>
              <ChevronDown className="h-5 w-5 shrink-0 text-[#4FAEB2] transition-transform group-open:rotate-180" />
            </summary>
            <div className="space-y-4 border-t border-slate-100 px-5 pb-5">
              <SellerMovimientosList row={sellerRow} />
            </div>
          </details>
        </>
      )}
    </div>
  );
}

// ── Admin view (vista de gestión) ────────────────────────────────────────────

function renderAdminView({
  meta,
  kpis,
  rows,
  baseLabel,
  selectedMonth,
  onMonthChange,
  onReload,
  overrideCtx,
  onShowExcluidas,
}: {
  onShowExcluidas?: () => void;
  meta: PreviewMeta | null | undefined;
  kpis: PreviewKpis | null | undefined;
  rows: VendedorRow[];
  baseLabel: string;
  selectedMonth: string;
  onMonthChange: (mes: string) => void;
  onReload: () => void;
  overrideCtx?: OverrideCtx;
}) {
  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Comercial
            </p>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Comisiones</h1>
          <p className="mt-1 text-sm text-slate-500">
            Seguimiento mensual de comisiones según la política activa.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onReload}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#3F8E91]"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Recalcular
          </button>
          <Link
            href="/configuracion/comisiones"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#3F8E91]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            Configuración
          </Link>
        </div>
      </div>

      {/* Período (seleccionable) */}
      <section className="rounded-2xl border border-[#4FAEB2]/45 bg-white px-6 py-4 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              Período
            </p>
            <p className="text-base font-semibold capitalize tracking-tight text-slate-900">
              {meta?.periodo ?? "—"}
            </p>
          </div>
          <label className="flex items-center gap-2">
            <span className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">
              Mes a consultar
            </span>
            <input
              type="month"
              value={selectedMonth}
              max={currentMonthInputValue()}
              onChange={(e) => onMonthChange(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-800 shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
            />
          </label>
        </div>
      </section>

      {/* Resumen */}
      {kpis && (
        <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="mb-4 flex items-center gap-2">
            <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              Resumen
            </h2>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
            <Kpi label="Base comisionable" value={`₲ ${fmtMoney(kpis.revenue_base_total)}`} />
            <Kpi
              label="Comisión estimada"
              value={`₲ ${fmtMoney(kpis.comision_estimada_total)}`}
              accent="featured"
              sub={
                (kpis.premio_fijo_total ?? 0) > 0
                  ? `Variable ₲ ${fmtMoney(kpis.comision_variable_total ?? 0)} + Premio fijo ₲ ${fmtMoney(kpis.premio_fijo_total ?? 0)}`
                  : undefined
              }
            />
            <Kpi
              label="Total pendiente de cobro"
              value={`₲ ${fmtMoney(kpis.saldo_pendiente_total ?? 0)}`}
              accent="warning"
            />
            <Kpi
              label="Líneas excluidas"
              value={kpis.lineas_excluidas ?? 0}
              sub="No comisionan este período"
              accent={(kpis.lineas_excluidas ?? 0) > 0 ? "warning" : "neutral"}
              onClick={
                (kpis.lineas_excluidas ?? 0) > 0 && onShowExcluidas ? onShowExcluidas : undefined
              }
            />
            <Kpi label="Vendedores con comisión" value={kpis.vendedores_con_comision} />
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Kpi
              label="Movimientos sin vendedor"
              value={kpis.fuentes_sin_vendedor}
              sub={
                kpis.fuentes_sin_vendedor > 0 ? "Se incluirán al asignar vendedor responsable" : undefined
              }
              accent={kpis.fuentes_sin_vendedor > 0 ? "warning" : "neutral"}
            />
          </div>
          {kpis.fuentes_sin_vendedor > 0 && (
            <div className="mt-4 flex flex-wrap items-start justify-between gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
              <div className="flex items-start gap-2.5">
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-amber-200 bg-amber-100 text-amber-700">
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="h-4 w-4"
                    aria-hidden="true"
                  >
                    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                    <line x1="12" y1="9" x2="12" y2="13" />
                    <line x1="12" y1="17" x2="12.01" y2="17" />
                  </svg>
                </span>
                <p className="max-w-3xl text-sm text-amber-900">{mensajeFuentesSinVendedor(kpis)}</p>
              </div>
              <Link
                href="/clientes"
                className="shrink-0 rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-800 shadow-sm transition-colors hover:bg-amber-100"
              >
                Ir a Clientes
              </Link>
            </div>
          )}
        </section>
      )}

      {/* Por vendedor */}
      <section>
        <div className="mb-4 flex items-center gap-2">
          <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            Por vendedor
          </h2>
          {rows.length > 0 ? (
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-700">
              {rows.length}
            </span>
          ) : null}
        </div>
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center shadow-sm">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-slate-700">
              No hay movimientos con vendedor asignado en este período.
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Cuando haya movimientos para la base seleccionada, vas a verlos acá.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((r) => {
              const tone = avatarToneFor(r.vendedor_nombre);
              return (
                <details
                  key={r.vendedor_usuario_id}
                  className="group overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm transition-shadow open:shadow-md hover:shadow-md"
                >
                  <summary className="flex cursor-pointer list-none flex-wrap items-center justify-between gap-4 px-5 py-4 [&::-webkit-details-marker]:hidden">
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        aria-hidden="true"
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full border text-sm font-semibold ${tone}`}
                      >
                        {avatarInitial(r.vendedor_nombre)}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {r.vendedor_nombre}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          <span className="font-medium text-slate-600 tabular-nums">
                            {r.cantidad_movimientos}
                          </span>{" "}
                          movimientos ·{" "}
                          <span className="text-slate-700">{escalaActualLabel(r)}</span>
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-5 text-right">
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          Base
                        </p>
                        <p className="text-sm font-semibold tabular-nums text-slate-900">
                          ₲ {fmtMoney(r.revenue_base)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          Comisión
                        </p>
                        <p className="text-sm font-semibold tabular-nums text-[#3F8E91]">
                          ₲ {fmtMoney(r.comision_estimada)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                          Pendiente
                        </p>
                        <p className="text-sm font-semibold tabular-nums text-amber-700">
                          ₲ {fmtMoney(r.saldo_pendiente_total ?? 0)}
                        </p>
                      </div>
                      <MiniScaleSummary row={r} />
                      <ChevronDown className="h-5 w-5 shrink-0 text-[#4FAEB2] transition-transform group-open:rotate-180" />
                    </div>
                  </summary>
                  <div className="space-y-4 border-t border-slate-100 px-5 pb-5 pt-4">
                    <ScaleProgress row={r} />
                    <TotalsStrip row={r} />
                    <MovimientosTable row={r} overrideCtx={overrideCtx} />
                  </div>
                </details>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
}

// ── Página principal ────────────────────────────────────────────────────────

export default function ComisionesPage() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PreviewPayload | null>(null);
  const [selectedMonth, setSelectedMonth] = useState("");
  const [overrideModal, setOverrideModal] = useState<
    { ln: Linea; decision: "incluir" | "excluir"; periodoYm: string } | null
  >(null);
  const [busyPagoId, setBusyPagoId] = useState<string | null>(null);
  const [excludedDrawerOpen, setExcludedDrawerOpen] = useState(false);

  const load = useCallback(async (opts?: { mes?: string }) => {
    setLoading(true);
    setError(null);
    try {
      const qs = opts?.mes ? `?mes=${encodeURIComponent(opts.mes)}` : "";
      const res = await fetchWithSupabaseSession(`/api/comisiones/preview${qs}`, { cache: "no-store" });
      const json = (await res.json()) as { success?: boolean; data?: PreviewPayload; error?: string };
      if (!res.ok || json.success !== true || !json.data) {
        throw new Error(json.error ?? `Error ${res.status}`);
      }
      setData(json.data);
      // Sincroniza el selector de mes con el período efectivamente cargado
      // (aplica tanto a la vista de vendedor como a la de administración).
      if (!opts?.mes) {
        setSelectedMonth(json.data.meta?.periodo_mes ?? currentMonthInputValue());
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const confirmOverride = useCallback(
    async (motivo: string) => {
      if (!overrideModal || !overrideModal.ln.pago_id || !overrideModal.periodoYm) return;
      const ln = overrideModal.ln;
      setBusyPagoId(ln.pago_id);
      try {
        const res = await fetchWithSupabaseSession("/api/comisiones/override", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            periodo_ym: overrideModal.periodoYm,
            pago_id: ln.pago_id,
            factura_id: ln.factura_id,
            decision: overrideModal.decision,
            motivo,
          }),
        });
        const json = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || json.success !== true) throw new Error(json.error ?? `Error ${res.status}`);
        setOverrideModal(null);
        await load({ mes: overrideModal.periodoYm });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al guardar el override");
      } finally {
        setBusyPagoId(null);
      }
    },
    [overrideModal, load]
  );

  const clearOverride = useCallback(
    async (pagoId: string, periodoYm: string) => {
      if (!periodoYm) return;
      setBusyPagoId(pagoId);
      try {
        const res = await fetchWithSupabaseSession(
          `/api/comisiones/override?periodo_ym=${encodeURIComponent(periodoYm)}&pago_id=${encodeURIComponent(pagoId)}`,
          { method: "DELETE" }
        );
        const json = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || json.success !== true) throw new Error(json.error ?? `Error ${res.status}`);
        await load({ mes: periodoYm });
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error al quitar el override");
      } finally {
        setBusyPagoId(null);
      }
    },
    [load]
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-20 text-sm text-slate-500">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#4FAEB2]" />
        Cargando seguimiento de comisiones…
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4 shrink-0"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          {error}
        </div>
        <button
          type="button"
          onClick={() => void load()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#3F8E91]"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Reintentar
        </button>
      </div>
    );
  }

  const estado = data?.estado ?? "";
  const meta = data?.meta;
  const kpis = data?.kpis;
  const rows = data?.por_vendedor ?? [];

  if (estado === "sin_politica" || estado === "politica_inactiva") {
    return (
      <div className="mx-auto max-w-3xl space-y-6">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Comercial
            </p>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Comisiones</h1>
          <p className="mt-1 text-sm text-slate-500">{data?.mensaje}</p>
        </div>
        <Link
          href="/configuracion/comisiones"
          className="inline-flex items-center gap-2 rounded-xl border border-[#4FAEB2]/30 bg-[#4FAEB2]/8 px-4 py-3 text-sm font-semibold text-[#3F8E91] transition-colors hover:bg-[#4FAEB2]/15"
        >
          Ir a Configuración → Comisiones
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </Link>
      </div>
    );
  }

  const baseLabel = BASE_LABEL[meta?.base_calculo ?? ""] ?? meta?.base_calculo ?? "—";
  const isSellerView =
    meta?.is_vendedor_view === true ||
    meta?.viewer_scope === "vendedor" ||
    meta?.alcance === "solo_vendedor_autenticado";
  const sellerRow = rows[0] ?? null;
  const selectedMonthValue = selectedMonth || meta?.periodo_mes || currentMonthInputValue();
  const onMonthChange = (mes: string) => {
    setSelectedMonth(mes);
    if (mes) void load({ mes });
  };

  if (isSellerView) {
    return renderVendedorView({
      meta,
      sellerRow,
      selectedSellerMonth: selectedMonthValue,
      onMonthChange,
    });
  }

  const periodoYm = meta?.periodo_mes ?? "";
  const overrideCtx: OverrideCtx = {
    canOverride: !isSellerView,
    busyPagoId,
    onOpen: (ln) =>
      setOverrideModal({ ln, decision: ln.comisiona !== false ? "excluir" : "incluir", periodoYm }),
    onClear: (pagoId) => void clearOverride(pagoId, periodoYm),
  };

  return (
    <>
      {renderAdminView({
        meta,
        kpis,
        rows,
        baseLabel,
        selectedMonth: selectedMonthValue,
        onMonthChange,
        onReload: () => void load({ mes: periodoYm }),
        overrideCtx,
        onShowExcluidas: () => setExcludedDrawerOpen(true),
      })}
      {overrideModal ? (
        <OverrideModal
          key={overrideModal.ln.pago_id ?? "modal"}
          target={overrideModal}
          busy={busyPagoId != null}
          onCancel={() => setOverrideModal(null)}
          onConfirm={(motivo) => void confirmOverride(motivo)}
        />
      ) : null}
      {excludedDrawerOpen ? (
        <LineasExcluidasDrawer
          rows={rows}
          meta={meta}
          overrideCtx={overrideCtx}
          onClose={() => setExcludedDrawerOpen(false)}
        />
      ) : null}
    </>
  );
}
