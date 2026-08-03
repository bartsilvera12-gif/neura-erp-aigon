"use client";

import { useMemo } from "react";
import type { AgendaCitaEnriquecida } from "@/lib/agenda/types";
import { estadoStyle, hhmm, ymd } from "../calendar-utils";

export default function ListView({
  citas,
  onSelect,
}: {
  citas: AgendaCitaEnriquecida[];
  onSelect: (c: AgendaCitaEnriquecida) => void;
}) {
  const grupos = useMemo(() => {
    const map = new Map<string, AgendaCitaEnriquecida[]>();
    for (const c of [...citas].sort((a, b) => new Date(a.inicio_at).getTime() - new Date(b.inicio_at).getTime())) {
      const k = ymd(new Date(c.inicio_at));
      const arr = map.get(k) ?? [];
      arr.push(c);
      map.set(k, arr);
    }
    return [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
  }, [citas]);

  if (grupos.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-slate-300 py-12 text-center text-sm text-slate-400">
        No hay citas en el rango seleccionado.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {grupos.map(([k, items]) => {
        const fecha = new Date(`${k}T00:00:00`);
        return (
          <div key={k}>
            <h3 className="mb-2 text-sm font-semibold capitalize text-slate-600">
              {fecha.toLocaleDateString("es-PY", { weekday: "long", day: "2-digit", month: "long" })}
            </h3>
            <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
              {items.map((c, i) => {
                const st = estadoStyle(c.estado);
                return (
                  <button
                    key={c.id}
                    onClick={() => onSelect(c)}
                    className={`flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 ${i > 0 ? "border-t border-slate-100" : ""}`}
                  >
                    <span className={`h-8 w-1 shrink-0 rounded-full ${st.dot}`} />
                    <div className="w-24 shrink-0 text-sm font-medium tabular-nums text-slate-700">
                      {hhmm(new Date(c.inicio_at))}–{hhmm(new Date(c.fin_at))}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-sm font-medium text-slate-800">{c.titulo}</div>
                      <div className="truncate text-xs text-slate-500">
                        {c.cliente?.nombre ?? c.contacto_nombre ?? "Sin cliente"}
                        {c.responsable?.nombre ? ` · ${c.responsable.nombre}` : ""}
                        {c.tipo ? ` · ${c.tipo}` : ""}
                      </div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs font-medium ${st.chip}`}>{st.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}
