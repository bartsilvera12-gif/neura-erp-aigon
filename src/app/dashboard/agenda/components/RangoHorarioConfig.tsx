"use client";

import { pad } from "../calendar-utils";
import type { AgendaPrefs } from "../agenda-prefs";

const PRESETS: { label: string; startHour: number; endHour: number }[] = [
  { label: "Laboral (8–18)", startHour: 8, endHour: 18 },
  { label: "Extendido (7–20)", startHour: 7, endHour: 20 },
  { label: "Completo (0–24)", startHour: 0, endHour: 24 },
];

export default function RangoHorarioConfig({
  prefs,
  onChange,
}: {
  prefs: AgendaPrefs;
  onChange: (p: AgendaPrefs) => void;
}) {
  const startOpts = Array.from({ length: 24 }, (_, i) => i); // 0..23
  const endOpts = Array.from({ length: 24 }, (_, i) => i + 1); // 1..24

  const selCls =
    "w-full rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-800 outline-none focus:border-teal-500 focus:ring-1 focus:ring-teal-400";

  return (
    <div className="w-64 space-y-3">
      <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Rango horario visible</div>
      <p className="text-xs text-slate-500">Aplica a las vistas Día y Semana.</p>

      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Desde</span>
          <select
            className={selCls}
            value={prefs.startHour}
            onChange={(e) => onChange({ ...prefs, startHour: parseInt(e.target.value, 10) })}
          >
            {startOpts.map((h) => (
              <option key={h} value={h} disabled={h >= prefs.endHour}>
                {pad(h)}:00
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-medium text-slate-600">Hasta</span>
          <select
            className={selCls}
            value={prefs.endHour}
            onChange={(e) => onChange({ ...prefs, endHour: parseInt(e.target.value, 10) })}
          >
            {endOpts.map((h) => (
              <option key={h} value={h} disabled={h <= prefs.startHour}>
                {pad(h)}:00
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="flex flex-wrap gap-1.5 pt-1">
        {PRESETS.map((p) => {
          const active = p.startHour === prefs.startHour && p.endHour === prefs.endHour;
          return (
            <button
              key={p.label}
              type="button"
              onClick={() => onChange({ startHour: p.startHour, endHour: p.endHour })}
              className={`rounded-full border px-2.5 py-1 text-[11px] font-medium transition-colors ${
                active ? "border-teal-500 bg-teal-500 text-white" : "border-slate-300 text-slate-600 hover:bg-slate-100"
              }`}
            >
              {p.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
