"use client";

import { useCallback, useEffect, useState } from "react";
import ProyectoDetalleInner from "./ProyectoDetalleInner";

export default function ProyectoDetalleModal({
  projectId,
  open,
  onClose,
  onUpdated,
  dataSchema,
}: {
  projectId: string | null;
  open: boolean;
  onClose: () => void;
  onUpdated: () => void;
  dataSchema: string;
}) {
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!open) setDirty(false);
  }, [open]);

  const requestClose = useCallback(() => {
    if (dirty) {
      if (!window.confirm("Hay cambios sin guardar en Datos. ¿Cerrar igualmente?")) return;
    }
    onClose();
  }, [dirty, onClose]);

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

  if (!open || !projectId) return null;

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
        aria-labelledby="proyecto-detalle-titulo"
        className="relative flex h-[100dvh] max-h-[100dvh] w-full max-w-5xl flex-col overflow-hidden rounded-none border-0 border-slate-200 bg-white shadow-2xl shadow-[#4FAEB2]/10 ring-1 ring-[#4FAEB2]/15 sm:h-[88dvh] sm:max-h-[920px] sm:rounded-2xl sm:border"
      >
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#4FAEB2] via-[#4FAEB2]/80 to-[#4FAEB2]/40"
        />
        <ProyectoDetalleInner
          projectId={projectId}
          variant="modal"
          onClose={requestClose}
          onProjectUpdated={onUpdated}
          onDirtyChange={setDirty}
          dataSchema={dataSchema}
        />
      </div>
    </div>
  );
}
