"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Plus } from "lucide-react";
import { useAgenda } from "@/shared/hooks/useAgenda";
import { AGENDA_ESTADOS, type AgendaCitaEnriquecida, type AgendaEstado } from "@/lib/agenda/types";

/**
 * Agenda mobile — vista "Agenda del día".
 *  - Selector compacto de fecha (anterior, hoy, siguiente).
 *  - Botón "Nueva cita" → desktop CitaFormModal (full-screen en mobile via responsive).
 *  - Lista de citas del día ordenadas por hora.
 *  - Cards con: hora, título, cliente/contacto, estado badge.
 */
export default function AgendaMobile() {
  const [fecha, setFecha] = useState(() => new Date());

  const desde = useMemo(() => startOfDay(fecha).toISOString(), [fecha]);
  const hasta = useMemo(() => endOfDay(fecha).toISOString(), [fecha]);

  const { citas, isLoading, error } = useAgenda({ desde, hasta });

  const citasOrdenadas = useMemo(
    () => [...citas].sort((a, b) => (a.inicio_at ?? "").localeCompare(b.inicio_at ?? "")),
    [citas]
  );

  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      <header className="mb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Agenda</h1>
            <p className="mt-0.5 text-xs text-slate-500">{formatFechaLarga(fecha)}</p>
          </div>
          <Link
            href="/dashboard/agenda"
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#0EA5E9] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors active:bg-[#0284C7]"
          >
            <Plus className="h-4 w-4" />
            Nueva
          </Link>
        </div>
      </header>

      {/* Selector de fecha */}
      <div className="mb-3 flex items-center gap-2">
        <button
          type="button"
          onClick={() => setFecha((d) => addDays(d, -1))}
          aria-label="Día anterior"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors active:bg-slate-50"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <button
          type="button"
          onClick={() => setFecha(new Date())}
          className={`flex-1 rounded-xl border px-3 py-2 text-sm font-medium transition-colors ${
            esHoy(fecha) ? "border-[#0EA5E9] bg-[#0EA5E9]/5 text-[#0EA5E9]" : "border-slate-200 bg-white text-slate-700"
          }`}
        >
          {esHoy(fecha) ? "Hoy" : "Volver a hoy"}
        </button>
        <button
          type="button"
          onClick={() => setFecha((d) => addDays(d, 1))}
          aria-label="Día siguiente"
          className="flex h-10 w-10 items-center justify-center rounded-xl border border-slate-200 bg-white text-slate-700 transition-colors active:bg-slate-50"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar las citas.
        </div>
      ) : null}

      {isLoading ? (
        <SkeletonList />
      ) : citasOrdenadas.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-2">
          {citasOrdenadas.map((c) => (
            <CitaCard key={c.id} cita={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

function CitaCard({ cita }: { cita: AgendaCitaEnriquecida }) {
  const inicio = new Date(cita.inicio_at);
  const fin = new Date(cita.fin_at);
  const hora = `${formatHora(inicio)}–${formatHora(fin)}`;
  const cliente = cita.cliente?.nombre ?? cita.contacto_nombre ?? "Sin cliente";

  return (
    <li>
      <div className="flex items-stretch gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)]">
        <div className="flex shrink-0 flex-col items-center justify-center rounded-lg bg-[#0EA5E9]/10 px-2.5 py-2 text-[#0EA5E9]">
          <Clock className="h-4 w-4" />
          <p className="mt-1 text-[10px] font-semibold tabular-nums">{formatHora(inicio)}</p>
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{cita.titulo}</p>
          <p className="truncate text-[11px] text-slate-500">
            {cliente} {cita.responsable?.nombre ? `· ${cita.responsable.nombre}` : ""}
          </p>
          <p className="mt-0.5 text-[10px] text-slate-400 tabular-nums">{hora}</p>
          <div className="mt-1">
            <EstadoBadge estado={cita.estado} />
          </div>
        </div>
      </div>
    </li>
  );
}

const ESTADO_TONES: Record<AgendaEstado, string> = {
  pendiente: "bg-amber-50 text-amber-700",
  confirmada: "bg-[#4FAEB2]/10 text-[#3F8E91]",
  completada: "bg-emerald-50 text-emerald-700",
  no_asistio: "bg-rose-50 text-rose-700",
  cancelada: "bg-slate-100 text-slate-500",
  reprogramada: "bg-violet-50 text-violet-700",
};

function EstadoBadge({ estado }: { estado: AgendaEstado }) {
  const label = estado.replace(/_/g, " ");
  const cls = ESTADO_TONES[estado] ?? "bg-slate-100 text-slate-600";
  return <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${cls}`}>{label}</span>;
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
      <CalendarDays className="mx-auto h-8 w-8 text-slate-300" />
      <p className="mt-2 text-sm font-medium text-slate-700">Sin citas en este día</p>
    </div>
  );
}

function SkeletonList() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 4 }).map((_, i) => (
        <li key={i} className="flex gap-3 rounded-2xl border border-slate-200 bg-white p-3">
          <div className="h-14 w-14 shrink-0 animate-pulse rounded-lg bg-slate-100" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-100" />
            <div className="h-2.5 w-1/2 animate-pulse rounded bg-slate-100" />
            <div className="h-2.5 w-1/4 animate-pulse rounded bg-slate-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

function esHoy(d: Date): boolean {
  const h = new Date();
  return d.getFullYear() === h.getFullYear() && d.getMonth() === h.getMonth() && d.getDate() === h.getDate();
}

function formatHora(d: Date): string {
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function formatFechaLarga(d: Date): string {
  const s = d.toLocaleDateString("es-PY", { weekday: "long", day: "numeric", month: "long" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// referencia ligera para evitar tree-shake del import (no se usa en runtime mobile).
void AGENDA_ESTADOS;
