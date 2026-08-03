"use client";

import { useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

/**
 * Acción "Anular factura" (anulación administrativa) reutilizable.
 * Abre un modal de confirmación con motivo obligatorio y hace
 * POST /api/facturas/[id]/anular. No elimina nada físicamente.
 *
 * El backend valida permisos (admin), pagos y estado SIFEN; este componente
 * solo muestra el flujo y propaga el resultado vía `onAnulada`.
 */
export function AnularFacturaButton({
  facturaId,
  estado,
  variant = "full",
  onAnulada,
}: {
  facturaId: string;
  /** `facturas.estado` actual (para ocultar la acción si ya no aplica). */
  estado: string;
  /** `full` para detalle de factura; `compact` para celdas de tabla. */
  variant?: "full" | "compact";
  onAnulada?: () => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const est = String(estado ?? "").trim();
  // Si ya está en estado terminal, no ofrecer la acción.
  if (est === "Anulado" || est === "Corregida NC") return null;

  async function handleConfirmar() {
    setError(null);
    const m = motivo.trim();
    if (m.length < 5) {
      setError("El motivo debe tener al menos 5 caracteres.");
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetchWithSupabaseSession(`/api/facturas/${facturaId}/anular`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ motivo: m }),
      });
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !j.success) {
        setError(j.error ?? `Error ${res.status}`);
        return;
      }
      setOpen(false);
      setMotivo("");
      await onAnulada?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error de red");
    } finally {
      setSubmitting(false);
    }
  }

  const triggerCls =
    variant === "compact"
      ? "inline-flex items-center justify-center rounded-lg border border-red-200 bg-white px-2 py-1 text-[11px] font-semibold text-red-600 transition-colors hover:border-red-300 hover:bg-red-50"
      : "inline-flex items-center justify-center rounded-lg border border-red-300 bg-white px-3 py-2 text-xs font-semibold text-red-600 transition-colors hover:border-red-400 hover:bg-red-50";

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setMotivo("");
          setError(null);
          setOpen(true);
        }}
        className={triggerCls}
        title="Anular factura (anulación administrativa)"
      >
        Anular factura
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[70] flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="anular-factura-title"
          onClick={() => !submitting && setOpen(false)}
        >
          <div
            className="w-full max-w-md space-y-3 rounded-xl border border-slate-200 bg-white p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h4 id="anular-factura-title" className="text-sm font-bold text-slate-900">
              Anular factura
            </h4>
            <p className="text-xs leading-relaxed text-slate-600">
              Esta acción marca la factura como <span className="font-semibold">Anulado</span> y deja su saldo en 0.
              No elimina la factura ni sus registros. Si la factura tiene pagos o un documento electrónico aprobado,
              la anulación será rechazada y deberás usar reversión de pago, cancelación SIFEN o nota de crédito.
            </p>
            <label className="block text-xs font-semibold text-slate-600">
              Motivo (obligatorio)
              <textarea
                value={motivo}
                onChange={(e) => setMotivo(e.target.value)}
                rows={3}
                className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-red-300"
                placeholder="Ej.: factura cargada por error en el cliente equivocado"
              />
            </label>
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {error}
              </div>
            )}
            <div className="flex flex-wrap justify-end gap-2 pt-1">
              <button
                type="button"
                disabled={submitting}
                onClick={() => setOpen(false)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                disabled={submitting}
                onClick={() => void handleConfirmar()}
                className="rounded-lg bg-red-600 px-3 py-2 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {submitting ? "Anulando…" : "Confirmar anulación"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
