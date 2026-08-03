"use client";

import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { MarketingOpsPieza } from "@/lib/marketing-ops/types";
import MarketingOpsPiezaDetalleClient from "./MarketingOpsPiezaDetalleClient";

export type MarketingOpsPiezaDetalleModalProps = {
  piezaId: string | null;
  open: boolean;
  onClose: () => void;
};

export default function MarketingOpsPiezaDetalleModal({
  piezaId,
  open,
  onClose,
}: MarketingOpsPiezaDetalleModalProps) {
  const [tituloPreview, setTituloPreview] = useState<string | null>(null);

  const requestClose = useCallback(() => {
    onClose();
  }, [onClose]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      requestClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, requestClose]);

  useEffect(() => {
    if (!open) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  // Pre-carga liviana solo del título para mostrar en el header del modal mientras
  // el cuerpo termina de cargar el detalle completo.
  useEffect(() => {
    if (!open || !piezaId) {
      setTituloPreview(null);
      return;
    }
    let cancelled = false;
    void fetchWithSupabaseSession(`/api/marketing-ops/piezas/${piezaId}`, { cache: "no-store" })
      .then((res) => res.json().catch(() => ({})))
      .then((json: { success?: boolean; data?: { pieza?: MarketingOpsPieza } }) => {
        if (cancelled) return;
        if (json?.success && json.data?.pieza?.titulo) {
          setTituloPreview(json.data.pieza.titulo);
        }
      })
      .catch(() => {
        if (!cancelled) setTituloPreview(null);
      });
    return () => {
      cancelled = true;
    };
  }, [open, piezaId]);

  if (!open || !piezaId) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-0 sm:p-4 md:p-6">
      <button
        type="button"
        aria-label="Cerrar modal"
        className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm"
        onClick={requestClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="pieza-detalle-titulo"
        className="relative flex h-[100dvh] max-h-[100dvh] w-full max-w-5xl flex-col overflow-hidden rounded-none border-0 border-slate-200 bg-white shadow-2xl shadow-[#4FAEB2]/10 ring-1 ring-[#4FAEB2]/15 sm:h-[90dvh] sm:max-h-[960px] sm:rounded-2xl sm:border"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#4FAEB2] via-[#4FAEB2]/80 to-[#4FAEB2]/40"
        />
        <div className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-br from-white via-white to-[#4FAEB2]/5 px-6 pb-5 pt-6">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
              />
              <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4FAEB2]">
                Pieza
              </p>
            </div>
            <h2
              id="pieza-detalle-titulo"
              className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-900"
            >
              {tituloPreview ?? "Detalle de pieza"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Estados, comentarios e historial — todo en un solo lugar.
            </p>
          </div>
          <button
            type="button"
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#4FAEB2]"
            onClick={requestClose}
          >
            Cerrar
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto bg-slate-50/50 px-6 py-5">
          <MarketingOpsPiezaDetalleClient piezaId={piezaId} mode="modal" />
        </div>
      </div>
    </div>
  );
}
