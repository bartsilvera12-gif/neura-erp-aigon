"use client";

import type { AgendaCitaEnriquecida } from "@/lib/agenda/types";
import { estadoStyle, hhmm, isToday, monthMatrix, sameDay, WEEKDAYS_ES } from "../calendar-utils";

const MAX_CHIPS = 3;

export default function MonthView({
  anchor,
  citas,
  onSelect,
  onCreateAt,
  onVerDia,
}: {
  anchor: Date;
  citas: AgendaCitaEnriquecida[];
  onSelect: (c: AgendaCitaEnriquecida) => void;
  onCreateAt: (d: Date) => void;
  onVerDia: (d: Date) => void;
}) {
  const weeks = monthMatrix(anchor);
  const mesActual = anchor.getMonth();

  function citasDe(day: Date): AgendaCitaEnriquecida[] {
    return citas
      .filter((c) => sameDay(new Date(c.inicio_at), day))
      .sort((a, b) => new Date(a.inicio_at).getTime() - new Date(b.inicio_at).getTime());
  }

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="grid grid-cols-7 border-b border-slate-200 bg-slate-50/60">
        {WEEKDAYS_ES.map((w) => (
          <div key={w} className="px-2 py-2 text-center text-[11px] font-medium uppercase tracking-wide text-slate-400">
            {w}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {weeks.flat().map((day, idx) => {
          const inMonth = day.getMonth() === mesActual;
          const today = isToday(day);
          const dayCitas = citasDe(day);
          return (
            <div
              key={idx}
              onClick={() => {
                const d = new Date(day);
                d.setHours(9, 0, 0, 0);
                onCreateAt(d);
              }}
              className={`min-h-[104px] cursor-pointer border-b border-l border-slate-100 p-1.5 transition-colors hover:bg-slate-50 ${
                inMonth ? "" : "bg-slate-50/40"
              }`}
            >
              <div className="mb-1 flex justify-end">
                <span
                  className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-semibold ${
                    today ? "bg-slate-800 text-white" : inMonth ? "text-slate-700" : "text-slate-300"
                  }`}
                >
                  {day.getDate()}
                </span>
              </div>
              <div className="space-y-0.5">
                {dayCitas.slice(0, MAX_CHIPS).map((c) => {
                  const st = estadoStyle(c.estado);
                  return (
                    <button
                      key={c.id}
                      onClick={(e) => {
                        e.stopPropagation();
                        onSelect(c);
                      }}
                      className="flex w-full items-center gap-1 truncate rounded px-1 py-0.5 text-left text-[11px] hover:bg-white"
                    >
                      <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${st.dot}`} />
                      <span className="shrink-0 tabular-nums text-slate-500">{hhmm(new Date(c.inicio_at))}</span>
                      <span className="truncate font-medium text-slate-700">{c.titulo}</span>
                    </button>
                  );
                })}
                {dayCitas.length > MAX_CHIPS && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      onVerDia(day);
                    }}
                    className="w-full rounded px-1 text-left text-[11px] font-medium text-slate-400 hover:text-slate-600"
                  >
                    +{dayCitas.length - MAX_CHIPS} más
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
