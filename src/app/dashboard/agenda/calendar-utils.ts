import type { AgendaCitaEnriquecida } from "@/lib/agenda/types";

export type AgendaView = "dia" | "semana" | "mes" | "lista";

export const HOUR_PX = 48; // alto de cada hora en la grilla de tiempo
export const DAY_START_SCROLL_HOUR = 7; // hora a la que se auto-scrollea la grilla

/* ----------------------------- fechas ----------------------------- */
export function pad(n: number): string {
  return String(n).padStart(2, "0");
}
export function ymd(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}
export function addDays(d: Date, n: number): Date {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}
export function addMonths(d: Date, n: number): Date {
  const x = new Date(d);
  x.setMonth(x.getMonth() + n);
  return x;
}
/** Semana arranca el lunes (uso de negocio en Paraguay). */
export function startOfWeek(d: Date): Date {
  const x = startOfDay(d);
  const day = (x.getDay() + 6) % 7; // 0 = lunes
  return addDays(x, -day);
}
export function sameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
export function isToday(d: Date): boolean {
  return sameDay(d, new Date());
}

/** Rango [start, end) de fechas a pedir al backend según la vista. */
export function rangeForView(view: AgendaView, anchor: Date): { start: Date; end: Date } {
  if (view === "dia") {
    const s = startOfDay(anchor);
    return { start: s, end: addDays(s, 1) };
  }
  if (view === "semana") {
    const s = startOfWeek(anchor);
    return { start: s, end: addDays(s, 7) };
  }
  if (view === "mes") {
    const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
    const gridStart = startOfWeek(first);
    return { start: gridStart, end: addDays(gridStart, 42) };
  }
  // lista: ventana amplia desde el inicio de la semana del ancla
  const s = startOfWeek(anchor);
  return { start: s, end: addDays(s, 30) };
}

/** Matriz 6x7 de la vista mes. */
export function monthMatrix(anchor: Date): Date[][] {
  const first = new Date(anchor.getFullYear(), anchor.getMonth(), 1);
  const gridStart = startOfWeek(first);
  const weeks: Date[][] = [];
  for (let w = 0; w < 6; w++) {
    const row: Date[] = [];
    for (let d = 0; d < 7; d++) row.push(addDays(gridStart, w * 7 + d));
    weeks.push(row);
  }
  return weeks;
}

export const WEEKDAYS_ES = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];
export const MONTHS_ES = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function tituloPeriodo(view: AgendaView, anchor: Date): string {
  if (view === "dia") {
    return anchor.toLocaleDateString("es-PY", { weekday: "long", day: "2-digit", month: "long", year: "numeric" });
  }
  if (view === "semana") {
    const s = startOfWeek(anchor);
    const e = addDays(s, 6);
    const sameMonth = s.getMonth() === e.getMonth();
    if (sameMonth) return `${s.getDate()} – ${e.getDate()} ${MONTHS_ES[e.getMonth()]} ${e.getFullYear()}`;
    return `${s.getDate()} ${MONTHS_ES[s.getMonth()]} – ${e.getDate()} ${MONTHS_ES[e.getMonth()]} ${e.getFullYear()}`;
  }
  return `${MONTHS_ES[anchor.getMonth()]} ${anchor.getFullYear()}`;
}

/* ----------------------------- horas ----------------------------- */
export function hhmm(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
export function minutesFromMidnight(d: Date): number {
  return d.getHours() * 60 + d.getMinutes();
}

/* ----------------------------- colores ----------------------------- */
/** Estilos por estado con class strings LITERALES (seguros para el purge de Tailwind). */
export const ESTADO_STYLE: Record<string, { block: string; dot: string; chip: string; label: string }> = {
  pendiente: {
    block: "bg-amber-50 border-amber-400 text-amber-900 hover:bg-amber-100",
    dot: "bg-amber-400",
    chip: "border-amber-200 bg-amber-50 text-amber-700",
    label: "Pendiente",
  },
  confirmada: {
    block: "bg-sky-50 border-sky-400 text-sky-900 hover:bg-sky-100",
    dot: "bg-sky-500",
    chip: "border-sky-200 bg-sky-50 text-sky-700",
    label: "Confirmada",
  },
  completada: {
    block: "bg-emerald-50 border-emerald-400 text-emerald-900 hover:bg-emerald-100",
    dot: "bg-emerald-500",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
    label: "Completada",
  },
  no_asistio: {
    block: "bg-orange-50 border-orange-400 text-orange-900 hover:bg-orange-100",
    dot: "bg-orange-500",
    chip: "border-orange-200 bg-orange-50 text-orange-700",
    label: "No asistió",
  },
  cancelada: {
    block: "bg-rose-50 border-rose-400 text-rose-900 line-through hover:bg-rose-100",
    dot: "bg-rose-500",
    chip: "border-rose-200 bg-rose-50 text-rose-700",
    label: "Cancelada",
  },
  reprogramada: {
    block: "bg-violet-50 border-violet-400 text-violet-900 hover:bg-violet-100",
    dot: "bg-violet-500",
    chip: "border-violet-200 bg-violet-50 text-violet-700",
    label: "Reprogramada",
  },
};
export function estadoStyle(estado: string) {
  return (
    ESTADO_STYLE[estado] ?? {
      block: "bg-slate-50 border-slate-400 text-slate-800 hover:bg-slate-100",
      dot: "bg-slate-400",
      chip: "border-slate-200 bg-slate-50 text-slate-600",
      label: estado,
    }
  );
}

/* ------------------- layout de solapes (time grid) ------------------- */
export type PositionedEvent = {
  cita: AgendaCitaEnriquecida;
  topPx: number;
  heightPx: number;
  leftPct: number;
  widthPct: number;
};

/**
 * Empaqueta eventos solapados en columnas (algoritmo greedy estándar).
 * `startHour`/`endHour` definen la ventana horaria visible: los topPx se calculan
 * relativos a `startHour` y los eventos se recortan a la ventana. Eventos totalmente
 * fuera de la ventana no se posicionan.
 */
export function layoutDayEvents(
  citas: AgendaCitaEnriquecida[],
  dayStart: Date,
  startHour = 0,
  endHour = 24
): PositionedEvent[] {
  const winStart = startHour * 60;
  const winEnd = endHour * 60;
  const items = citas
    .map((c) => {
      const ini = new Date(c.inicio_at);
      const fin = new Date(c.fin_at);
      const rawStart = (ini.getTime() - dayStart.getTime()) / 60000;
      const rawEnd = (fin.getTime() - dayStart.getTime()) / 60000;
      const startMin = Math.max(winStart, rawStart);
      const endMin = Math.min(winEnd, Math.max(rawEnd, rawStart + 15));
      return { cita: c, startMin, endMin };
    })
    .filter((x) => x.endMin > x.startMin && x.startMin < winEnd && x.endMin > winStart)
    .sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  const out: PositionedEvent[] = [];
  let cluster: typeof items = [];
  let clusterEnd = -1;

  const flush = () => {
    if (cluster.length === 0) return;
    // asignar columnas dentro del cluster
    const cols: number[] = []; // fin de cada columna
    const colOf = new Map<(typeof cluster)[number], number>();
    for (const ev of cluster) {
      let placed = false;
      for (let i = 0; i < cols.length; i++) {
        if (ev.startMin >= cols[i]) {
          cols[i] = ev.endMin;
          colOf.set(ev, i);
          placed = true;
          break;
        }
      }
      if (!placed) {
        cols.push(ev.endMin);
        colOf.set(ev, cols.length - 1);
      }
    }
    const total = cols.length;
    for (const ev of cluster) {
      const col = colOf.get(ev) ?? 0;
      out.push({
        cita: ev.cita,
        topPx: ((ev.startMin - winStart) / 60) * HOUR_PX,
        heightPx: Math.max(((ev.endMin - ev.startMin) / 60) * HOUR_PX, 18),
        leftPct: (col / total) * 100,
        widthPct: (1 / total) * 100,
      });
    }
    cluster = [];
    clusterEnd = -1;
  };

  for (const ev of items) {
    if (cluster.length === 0 || ev.startMin < clusterEnd) {
      cluster.push(ev);
      clusterEnd = Math.max(clusterEnd, ev.endMin);
    } else {
      flush();
      cluster.push(ev);
      clusterEnd = ev.endMin;
    }
  }
  flush();
  return out;
}
