"use client";

import { useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { AgendaCitaEnriquecida, AgendaEstado } from "@/lib/agenda/types";

const TZ = "America/Asuncion";
function fmt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-PY", {
    timeZone: TZ,
    weekday: "short",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function CitaDetalleModal({
  open,
  cita,
  onClose,
  onEditar,
  onReprogramar,
  onChanged,
}: {
  open: boolean;
  cita: AgendaCitaEnriquecida | null;
  onClose: () => void;
  onEditar: (c: AgendaCitaEnriquecida) => void;
  onReprogramar: (c: AgendaCitaEnriquecida) => void;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open || !cita) return null;
  const terminal =
    cita.estado === "completada" ||
    cita.estado === "no_asistio" ||
    cita.estado === "cancelada" ||
    cita.estado === "reprogramada";

  async function setEstado(estado: AgendaEstado) {
    if (!cita) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetchWithSupabaseSession(`/api/agenda/${cita.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado }),
      });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setError(json?.error ?? "No se pudo actualizar.");
        setBusy(false);
        return;
      }
      setBusy(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error.");
      setBusy(false);
    }
  }

  async function cancelar() {
    if (!cita) return;
    const motivo = window.prompt("Motivo de cancelación (opcional):") ?? "";
    setBusy(true);
    setError(null);
    try {
      const qs = motivo ? `?motivo=${encodeURIComponent(motivo)}` : "";
      const res = await fetchWithSupabaseSession(`/api/agenda/${cita.id}${qs}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setError(json?.error ?? "No se pudo cancelar.");
        setBusy(false);
        return;
      }
      setBusy(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error.");
      setBusy(false);
    }
  }

  const btn = "rounded-lg px-3 py-1.5 text-xs font-medium disabled:opacity-50";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-800">{cita.titulo}</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600" aria-label="Cerrar">
            ✕
          </button>
        </div>

        <div className="px-5 py-4 space-y-2 text-sm text-slate-700">
          <Row label="Estado" value={cita.estado} />
          <Row label="Inicio" value={fmt(cita.inicio_at)} />
          <Row label="Fin" value={fmt(cita.fin_at)} />
          <Row label="Responsable" value={cita.responsable?.nombre ?? cita.responsable_id} />
          <Row
            label="Cliente / contacto"
            value={cita.cliente?.nombre ?? cita.contacto_nombre ?? "—"}
          />
          {cita.contacto_telefono && <Row label="Teléfono" value={cita.contacto_telefono} />}
          {cita.tipo && <Row label="Tipo" value={cita.tipo} />}
          {cita.ubicacion && <Row label="Ubicación" value={cita.ubicacion} />}
          {cita.observaciones && <Row label="Observaciones" value={cita.observaciones} />}
          {cita.cancelada_motivo && <Row label="Motivo cancelación" value={cita.cancelada_motivo} />}

          {error && (
            <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">{error}</div>
          )}
        </div>

        <div className="flex flex-wrap justify-end gap-2 border-t border-slate-100 px-5 py-4">
          {!terminal && (
            <>
              {cita.estado === "pendiente" && (
                <button disabled={busy} onClick={() => setEstado("confirmada")} className={`${btn} bg-sky-100 text-sky-700 hover:bg-sky-200`}>
                  Confirmar
                </button>
              )}
              <button disabled={busy} onClick={() => setEstado("completada")} className={`${btn} bg-emerald-100 text-emerald-700 hover:bg-emerald-200`}>
                Completar
              </button>
              <button disabled={busy} onClick={() => setEstado("no_asistio")} className={`${btn} bg-orange-100 text-orange-700 hover:bg-orange-200`}>
                No asistió
              </button>
              <button disabled={busy} onClick={() => onReprogramar(cita)} className={`${btn} bg-violet-100 text-violet-700 hover:bg-violet-200`}>
                Reprogramar
              </button>
              <button disabled={busy} onClick={() => onEditar(cita)} className={`${btn} bg-slate-100 text-slate-700 hover:bg-slate-200`}>
                Editar
              </button>
              <button disabled={busy} onClick={cancelar} className={`${btn} bg-rose-100 text-rose-700 hover:bg-rose-200`}>
                Cancelar
              </button>
            </>
          )}
          {terminal && (
            <span className="text-xs text-slate-400">Cita en estado terminal ({cita.estado}).</span>
          )}
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-2">
      <span className="w-36 shrink-0 text-xs font-medium text-slate-400">{label}</span>
      <span className="flex-1 break-words">{value}</span>
    </div>
  );
}
