"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createGasto, updateGasto } from "@/lib/gastos/actions";
import MontoInput from "@/components/ui/MontoInput";
import type { Gasto, GastoInput } from "@/lib/gastos/actions";

const LABEL_CLS = "block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1.5";
const INPUT_CLS =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";
const SELECT_CLS = `${INPUT_CLS} appearance-none bg-[length:14px_14px] bg-[right_0.85rem_center] bg-no-repeat pr-9`;
const CHEVRON_STYLE = {
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%234FAEB2' stroke-width='2.5'><path stroke-linecap='round' stroke-linejoin='round' d='M6 9l6 6 6-6'/></svg>\")",
} as const;

type Props = {
  gasto?: Gasto | null;
  variant?: "page" | "modal";
  /** Se invoca tras crear/editar con éxito; si está definido se prefiere antes de `router.push`. */
  onSaved?: () => void;
  onCancel?: () => void;
};

export default function GastoForm({ gasto, variant = "page", onSaved, onCancel }: Props) {
  const router = useRouter();
  const isModal = variant === "modal";
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [form, setForm] = useState<GastoInput>({
    categoria: gasto?.categoria ?? "",
    descripcion: gasto?.descripcion ?? "",
    monto: gasto?.monto ?? 0,
    tipo: gasto?.tipo ?? "variable",
    recurrente: gasto?.recurrente ?? false,
    frecuencia: gasto?.frecuencia ?? "",
    fecha: gasto?.fecha ?? new Date().toISOString().slice(0, 10),
  });

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) {
    const { name, value, type } = e.target;
    if (type === "checkbox") {
      setForm((prev) => ({ ...prev, recurrente: (e.target as HTMLInputElement).checked }));
    } else if (name !== "monto") {
      const normalized = ["categoria", "descripcion", "frecuencia"].includes(name)
        ? value.toUpperCase()
        : value;
      setForm((prev) => ({ ...prev, [name]: normalized }));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.monto <= 0) return setError("El monto debe ser mayor a 0.");
    setGuardando(true);
    try {
      if (gasto) {
        await updateGasto(gasto.id, form);
      } else {
        await createGasto(form);
      }
      if (onSaved) onSaved();
      else router.push("/gastos");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Error al guardar");
    } finally {
      setGuardando(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={
        isModal
          ? "flex h-full min-h-0 flex-col"
          : "max-w-2xl space-y-6"
      }
    >
      <div
        className={
          isModal
            ? "min-h-0 flex-1 space-y-4 overflow-y-auto bg-slate-50/50 px-6 py-5"
            : "space-y-6"
        }
      >
        {error && (
          <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4 shrink-0"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span className="font-medium">{error}</span>
          </div>
        )}

        <div
          className={
            isModal
              ? "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
              : "rounded-2xl border border-[#4FAEB2]/45 bg-white p-6 shadow-sm"
          }
        >
          <div className="mb-4 flex items-center gap-2">
            <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              Datos del gasto
            </p>
          </div>
          <div className="space-y-4">
            <div>
              <label className={LABEL_CLS}>Categoría</label>
              <input
                type="text"
                name="categoria"
                value={form.categoria}
                onChange={handleChange}
                placeholder="Ej: Servicios, Alquiler, Salarios"
                className={`${INPUT_CLS} uppercase`}
              />
            </div>
            <div>
              <label className={LABEL_CLS}>Descripción</label>
              <textarea
                name="descripcion"
                value={form.descripcion}
                onChange={handleChange}
                placeholder="Descripción del gasto"
                className={`${INPUT_CLS} resize-y min-h-[64px]`}
                rows={2}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL_CLS}>
                  Monto (Gs.) <span className="text-rose-500">*</span>
                </label>
                <MontoInput
                  value={form.monto}
                  onChange={(n) => setForm((prev) => ({ ...prev, monto: n }))}
                  placeholder="0"
                  className={INPUT_CLS}
                  required
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Tipo</label>
                <select
                  name="tipo"
                  value={form.tipo}
                  onChange={handleChange}
                  className={SELECT_CLS}
                  style={CHEVRON_STYLE}
                >
                  <option value="variable">Variable</option>
                  <option value="fijo">Fijo</option>
                </select>
              </div>
            </div>
            <div>
              <label className={LABEL_CLS}>
                Fecha <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                name="fecha"
                value={form.fecha}
                onChange={handleChange}
                className={INPUT_CLS}
                required
              />
            </div>
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 transition-colors hover:border-[#4FAEB2]/60">
              <input
                type="checkbox"
                name="recurrente"
                checked={form.recurrente}
                onChange={handleChange}
                className="h-4 w-4 rounded border-slate-300 text-[#4FAEB2] accent-[#4FAEB2] focus:ring-[#4FAEB2]/30"
              />
              Gasto recurrente
            </label>
            {form.recurrente && (
              <div>
                <label className={LABEL_CLS}>Frecuencia</label>
                <input
                  type="text"
                  name="frecuencia"
                  value={form.frecuencia ?? ""}
                  onChange={handleChange}
                  placeholder="Ej: Mensual, Semanal"
                  className={`${INPUT_CLS} uppercase`}
                />
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        className={
          isModal
            ? "flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-white px-6 py-4"
            : "flex flex-wrap items-center justify-end gap-2 pt-2"
        }
      >
        {(onCancel || !isModal) && (
          <button
            type="button"
            onClick={() => (onCancel ? onCancel() : router.push("/gastos"))}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#4FAEB2]"
          >
            Cancelar
          </button>
        )}
        <button
          type="submit"
          disabled={guardando}
          className="rounded-xl bg-[#4FAEB2] px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/20 transition-colors hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
        >
          {guardando ? "Guardando…" : gasto ? "Guardar cambios" : "Crear gasto"}
        </button>
      </div>
    </form>
  );
}
