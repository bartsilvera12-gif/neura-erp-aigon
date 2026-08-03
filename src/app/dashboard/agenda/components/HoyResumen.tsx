"use client";

import { useEffect, useState } from "react";
import { CalendarDays } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { AgendaCitaEnriquecida } from "@/lib/agenda/types";
import { estadoStyle, hhmm, startOfDay, addDays } from "../calendar-utils";

export default function HoyResumen({
  onSelect,
  onVerDia,
}: {
  onSelect: (c: AgendaCitaEnriquecida) => void;
  onVerDia: () => void;
}) {
  const [citas, setCitas] = useState<AgendaCitaEnriquecida[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const start = startOfDay(new Date());
        const end = addDays(start, 1);
        const params = new URLSearchParams({ desde: start.toISOString(), hasta: end.toISOString() });
        const res = await fetchWithSupabaseSession(`/api/agenda?${params.toString()}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok || !json?.success) {
          setError(json?.error ?? "No se pudo cargar.");
          setCitas([]);
          return;
        }
        const rows = (json.data as AgendaCitaEnriquecida[]).sort(
          (a, b) => new Date(a.inicio_at).getTime() - new Date(b.inicio_at).getTime()
        );
        setCitas(rows);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Error.");
          setCitas([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const hoyLabel = new Date().toLocaleDateString("es-PY", { weekday: "long", day: "2-digit", month: "long" });

  return (
    <div className="w-80">
      <div className="mb-2 flex items-center justify-between">
        <div className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Hoy</div>
        <div className="text-xs capitalize text-slate-500">{hoyLabel}</div>
      </div>

      {error && <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>}

      {citas === null ? (
        <div className="py-6 text-center text-xs text-slate-400">Cargando…</div>
      ) : citas.length === 0 ? (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <CalendarDays className="h-7 w-7 text-slate-300" />
          <div className="text-sm text-slate-500">No hay citas para hoy</div>
        </div>
      ) : (
        <div className="max-h-72 space-y-1 overflow-y-auto pr-0.5">
          {citas.map((c) => {
            const st = estadoStyle(c.estado);
            const persona = c.cliente?.nombre ?? c.contacto_nombre;
            return (
              <button
                key={c.id}
                onClick={() => onSelect(c)}
                className="flex w-full items-start gap-2 rounded-lg border border-slate-100 px-2.5 py-2 text-left hover:border-slate-200 hover:bg-slate-50"
              >
                <span className={`mt-0.5 h-8 w-1 shrink-0 rounded-full ${st.dot}`} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium text-slate-800">{c.titulo}</span>
                    <span className="shrink-0 tabular-nums text-xs text-slate-500">
                      {hhmm(new Date(c.inicio_at))}–{hhmm(new Date(c.fin_at))}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1.5">
                    <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-medium ${st.chip}`}>{st.label}</span>
                    <span className="truncate text-[11px] text-slate-500">
                      {c.responsable?.nombre ?? "—"}
                      {persona ? ` · ${persona}` : ""}
                    </span>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}

      <button
        onClick={onVerDia}
        className="mt-3 w-full rounded-lg bg-teal-500 px-3 py-2 text-sm font-medium text-white hover:bg-teal-600"
      >
        Ver día completo
      </button>
    </div>
  );
}
