"use client";

import { useCallback, useEffect } from "react";
import GastoForm from "@/components/gastos/GastoForm";
import type { Gasto } from "@/lib/gastos/actions";

export type GastoModalProps = {
  open: boolean;
  /** Si está definido, el modal abre en modo "editar" precargando los datos. */
  gasto?: Gasto | null;
  onClose: () => void;
  onSaved: () => void;
};

export default function GastoModal({ open, gasto, onClose, onSaved }: GastoModalProps) {
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

  if (!open) return null;

  const editando = Boolean(gasto?.id);

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
        aria-labelledby="gasto-modal-titulo"
        className="relative flex h-[100dvh] max-h-[100dvh] w-full max-w-2xl flex-col overflow-hidden rounded-none border-0 border-slate-200 bg-white shadow-2xl shadow-[#4FAEB2]/10 ring-1 ring-[#4FAEB2]/15 sm:h-[88dvh] sm:max-h-[820px] sm:rounded-2xl sm:border"
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
                {editando ? "Editar" : "Nuevo"}
              </p>
            </div>
            <h2
              id="gasto-modal-titulo"
              className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-900"
            >
              {editando ? "Editar gasto" : "Registrar gasto"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {editando ? "Actualizá los datos del gasto operativo." : "Registrá un gasto operativo de la empresa."}
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

        <div className="min-h-0 flex-1 overflow-hidden">
          <GastoForm
            gasto={gasto ?? null}
            variant="modal"
            onSaved={onSaved}
            onCancel={requestClose}
          />
        </div>
      </div>
    </div>
  );
}
