"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getProspectos, saveProspecto } from "@/lib/crm/storage";
import { getEtapas } from "@/lib/crm/etapas";
import { getCurrentUser } from "@/lib/auth";
import { getPlanes } from "@/lib/planes/storage";
import PlanSelector from "@/components/crm/PlanSelector";
import { cleanTelefono, formatTelefonoDisplay, isValidTelefono } from "@/lib/telefono";
import type { EtapaCrm } from "@/lib/crm/etapas";
import type { Plan } from "@/lib/planes/types";

export type ProspectoNuevoFormProps = {
  variant?: "page" | "modal";
  onCreated?: (id?: string) => void;
  onCancel?: () => void;
};

const INPUT_CLS =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";
const SELECT_CLS =
  "w-full appearance-none rounded-xl border border-slate-200 bg-white bg-[length:14px_14px] bg-[right_0.85rem_center] bg-no-repeat px-3.5 py-2.5 pr-9 text-sm text-slate-900 shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";
const LABEL_CLS = "block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1.5";
const CHEVRON_STYLE = {
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%234FAEB2' stroke-width='2.5'><path stroke-linecap='round' stroke-linejoin='round' d='M6 9l6 6 6-6'/></svg>\")",
} as const;

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
        {children}
      </p>
    </div>
  );
}

export default function ProspectoNuevoForm({
  variant = "page",
  onCreated,
  onCancel,
}: ProspectoNuevoFormProps) {
  const isModal = variant === "modal";

  const [form, setForm] = useState({
    empresa: "",
    contacto: "",
    email: "",
    telefono: "",
    planIds: [] as string[],
    etapa: "",
    proxima_accion: "",
    fecha_proxima_accion: "",
    responsable: "",
    observaciones: "",
  });

  const [error, setError] = useState<string | null>(null);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [etapas, setEtapas] = useState<EtapaCrm[]>([]);
  const [cargandoPlanes, setCargandoPlanes] = useState(true);
  const [usuarioActual, setUsuarioActual] = useState<{ nombre?: string; email?: string } | null>(null);
  const [telefonosHistorial, setTelefonosHistorial] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPlanes()
      .then(setPlanes)
      .catch(() => setPlanes([]))
      .finally(() => setCargandoPlanes(false));
  }, []);

  useEffect(() => {
    getEtapas().then((e) => {
      setEtapas(e);
      if (e.length > 0 && !form.etapa) {
        const inicial = e.find((x) => x.codigo === "LEAD") ?? e[0];
        setForm((prev) => ({ ...prev, etapa: inicial.codigo }));
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    getCurrentUser()
      .then((u) =>
        u
          ? setUsuarioActual({
              nombre: (u as { nombre?: string }).nombre,
              email: (u as { email?: string }).email,
            })
          : null,
      )
      .catch(() => setUsuarioActual(null));
  }, []);

  useEffect(() => {
    getProspectos()
      .then((ps) => {
        const tels = [
          ...new Set(
            ps.map((p) => cleanTelefono(p.telefono ?? "")).filter((t) => t.length === 10),
          ),
        ];
        setTelefonosHistorial(tels);
      })
      .catch(() => setTelefonosHistorial([]));
  }, []);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) {
    setError(null);
    const { name, value } = e.target;
    const type = (e.target as HTMLInputElement).type;
    if (name === "telefono") {
      const raw = cleanTelefono(value);
      setForm((prev) => ({ ...prev, telefono: raw }));
      return;
    }
    const upper = ["empresa", "contacto", "responsable"];
    let normalized = value;
    if (name === "email" || type === "email") normalized = value.toLowerCase();
    else if (upper.includes(name)) normalized = value.toUpperCase();
    setForm((prev) => ({ ...prev, [name]: normalized }));
  }

  function togglePlan(planId: string) {
    setForm((prev) => ({
      ...prev,
      planIds: prev.planIds.includes(planId)
        ? prev.planIds.filter((id) => id !== planId)
        : [...prev.planIds, planId],
    }));
  }

  const planesActivos = planes.filter((p) => p.estado === "activo");
  const servicioTexto = form.planIds
    .map((id) => planesActivos.find((p) => p.id === id)?.nombre)
    .filter(Boolean)
    .join(", ");
  const valorEstimado = form.planIds.reduce(
    (sum, id) => sum + (planesActivos.find((p) => p.id === id)?.precio ?? 0),
    0,
  );

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.empresa.trim()) return setError("La empresa es obligatoria.");
    if (!form.contacto.trim()) return setError("El contacto es obligatorio.");
    if (form.planIds.length === 0) return setError("Seleccioná al menos un servicio/plan.");
    if (!form.etapa) return setError("Seleccioná una etapa.");
    if (form.telefono && !isValidTelefono(form.telefono)) {
      return setError(
        "Número inválido. Usá formato local 0981100453 o internacional +595981100453.",
      );
    }

    setSaving(true);

    const telefonoGuardar = form.telefono ? cleanTelefono(form.telefono) : undefined;

    try {
      const guardado = await saveProspecto({
        empresa: form.empresa.trim().toUpperCase(),
        contacto: form.contacto.trim().toUpperCase(),
        email: form.email.trim() || undefined,
        telefono: telefonoGuardar,
        servicio: servicioTexto,
        valor_estimado: valorEstimado,
        etapa: form.etapa,
        proxima_accion: form.proxima_accion.trim() || undefined,
        fecha_proxima_accion: form.fecha_proxima_accion || undefined,
        responsable: form.responsable.trim().toUpperCase() || undefined,
        observaciones: form.observaciones.trim() || null,
      });

      if (guardado) {
        const id =
          guardado && typeof guardado === "object" && "id" in guardado
            ? ((guardado as { id?: string }).id ?? undefined)
            : undefined;
        onCreated?.(id);
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      className={
        isModal
          ? "flex h-full min-h-0 flex-col"
          : "max-w-2xl space-y-6 rounded-2xl border border-[#4FAEB2]/45 bg-white p-6 shadow-sm"
      }
    >
      <div
        className={
          isModal
            ? "min-h-0 flex-1 space-y-6 overflow-y-auto bg-slate-50/50 px-6 py-5"
            : "space-y-6"
        }
      >
        {/* Datos del prospecto */}
        <section
          className={
            isModal ? "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" : ""
          }
        >
          <SectionTitle>Datos del prospecto</SectionTitle>

          <div className="space-y-4">
            <div>
              <label className={LABEL_CLS}>
                Empresa <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                name="empresa"
                value={form.empresa}
                onChange={handleChange}
                placeholder="Nombre de la empresa"
                className={`${INPUT_CLS} uppercase`}
                required
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL_CLS}>
                  Persona de contacto <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  name="contacto"
                  value={form.contacto}
                  onChange={handleChange}
                  placeholder="Nombre y apellido"
                  className={`${INPUT_CLS} uppercase`}
                  required
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Teléfono</label>
                <input
                  type="text"
                  name="telefono"
                  value={formatTelefonoDisplay(form.telefono)}
                  onChange={handleChange}
                  placeholder="0981 100 453"
                  className={INPUT_CLS}
                  autoComplete="off"
                  list="telefono-sugerencias"
                  inputMode="numeric"
                  maxLength={12}
                />
                <datalist id="telefono-sugerencias">
                  {telefonosHistorial.map((t) => (
                    <option key={t} value={formatTelefonoDisplay(t)} />
                  ))}
                </datalist>
              </div>
            </div>

            <div>
              <label className={LABEL_CLS}>Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                placeholder="contacto@empresa.com"
                className={INPUT_CLS}
              />
            </div>

            <div>
              <label className={LABEL_CLS}>Comentarios / observaciones internas</label>
              <textarea
                name="observaciones"
                value={form.observaciones}
                onChange={handleChange}
                rows={4}
                placeholder="Contexto, objeciones, próximos pasos… (solo equipo)"
                className={`${INPUT_CLS} resize-y min-h-[96px]`}
              />
            </div>
          </div>
        </section>

        {/* Oportunidad */}
        <section
          className={
            isModal ? "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" : ""
          }
        >
          <SectionTitle>Oportunidad</SectionTitle>

          <div className="space-y-4">
            <div>
              <label className={LABEL_CLS}>
                Servicios / Productos de interés <span className="text-rose-500">*</span>
              </label>
              {cargandoPlanes ? (
                <p className="py-2 text-sm text-slate-400">Cargando planes…</p>
              ) : planes.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <p className="font-medium">No hay planes creados para esta empresa.</p>
                  <p className="mt-1 text-amber-700">
                    Creá un plan primero para poder seleccionarlo como servicio de interés.
                  </p>
                  <Link
                    href="/planes/nuevo"
                    className="mt-3 inline-flex items-center gap-1.5 font-medium text-[#4FAEB2] hover:text-[#3F8E91]"
                  >
                    Ir a crear plan →
                  </Link>
                </div>
              ) : (
                <PlanSelector
                  planes={planes}
                  selectedIds={form.planIds}
                  onToggle={togglePlan}
                  placeholder="Buscar plan por nombre…"
                />
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL_CLS}>Valor estimado (Gs.)</label>
                <input
                  type="text"
                  readOnly
                  value={valorEstimado > 0 ? valorEstimado.toLocaleString("es-PY") : ""}
                  placeholder="Se calcula automáticamente"
                  className={`${INPUT_CLS} cursor-not-allowed bg-slate-50`}
                />
                {valorEstimado > 0 && (
                  <p className="mt-1 text-xs text-slate-500">Suma de los planes seleccionados</p>
                )}
              </div>
              <div>
                <label className={LABEL_CLS}>Etapa inicial</label>
                <select
                  name="etapa"
                  value={form.etapa}
                  onChange={handleChange}
                  className={SELECT_CLS}
                  style={CHEVRON_STYLE}
                >
                  {etapas
                    .filter((e) => e.codigo !== "GANADO" && e.codigo !== "PERDIDO")
                    .map((e) => (
                      <option key={e.id} value={e.codigo}>
                        {e.nombre}
                      </option>
                    ))}
                </select>
              </div>
            </div>
          </div>
        </section>

        {/* Seguimiento */}
        <section
          className={
            isModal ? "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" : ""
          }
        >
          <SectionTitle>Seguimiento</SectionTitle>

          <div className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL_CLS}>Próxima acción</label>
                <input
                  type="text"
                  name="proxima_accion"
                  value={form.proxima_accion}
                  onChange={handleChange}
                  placeholder="Ej: Enviar propuesta"
                  className={INPUT_CLS}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Fecha próxima acción</label>
                <input
                  type="date"
                  name="fecha_proxima_accion"
                  value={form.fecha_proxima_accion}
                  onChange={handleChange}
                  className={INPUT_CLS}
                />
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL_CLS}>Responsable</label>
                <input
                  type="text"
                  name="responsable"
                  value={form.responsable}
                  onChange={handleChange}
                  placeholder="Ej: JUAN PÉREZ"
                  className={`${INPUT_CLS} uppercase`}
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Creado por</label>
                <input
                  type="text"
                  readOnly
                  value={usuarioActual?.nombre?.trim() || usuarioActual?.email || "Cargando…"}
                  className={`${INPUT_CLS} cursor-not-allowed bg-slate-50`}
                />
                <p className="mt-1 text-xs text-slate-500">
                  Se registra automáticamente con tu usuario
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Error */}
        {error ? (
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
        ) : null}
      </div>

      {/* Acciones */}
      <div
        className={
          isModal
            ? "flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-white px-6 py-4"
            : "flex flex-wrap items-center justify-end gap-2 pt-2"
        }
      >
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#4FAEB2]"
          >
            Cancelar
          </button>
        ) : null}
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-[#4FAEB2] px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/20 transition-colors hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
        >
          {saving ? "Guardando…" : "Guardar prospecto"}
        </button>
      </div>
    </form>
  );
}
