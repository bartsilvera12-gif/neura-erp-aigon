"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  addNota,
  deleteProspecto,
  getProspecto,
  moveProspecto,
  updateProspecto,
} from "@/lib/crm/storage";
import { getEtapas, getEtapaClasses } from "@/lib/crm/etapas";
import { getPlanes } from "@/lib/planes/storage";
import PlanSelector from "@/components/crm/PlanSelector";
import { getBrowserSupabaseForEmpresaData } from "@/lib/supabase/browser-data-client";
import type { EtapaCrm } from "@/lib/crm/etapas";
import type { Nota, Prospecto } from "@/lib/crm/types";
import type { Plan } from "@/lib/planes/types";

export type ProspectoDetalleFormProps = {
  id: string;
  variant?: "page" | "modal";
  onUpdated?: () => void;
  onDeleted?: () => void;
  onCancel?: () => void;
};

const INPUT_CLS =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";
const LABEL_CLS = "block text-xs font-medium uppercase tracking-wide text-slate-500 mb-1.5";

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

function formatFecha(iso: string) {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  } catch {
    return "";
  }
}

function originLabel(origen?: Prospecto["origen_creacion"]): string {
  switch (origen) {
    case "manual":
      return "Manual";
    case "whatsapp":
      return "WhatsApp";
    case "formulario_web":
      return "Formulario web";
    case "referido":
      return "Referido";
    case "campaña_meta":
      return "Campaña Meta";
    case "automatizacion":
      return "Automatización";
    case "otro":
      return "Otro";
    default:
      return "-";
  }
}

export default function ProspectoDetalleForm({
  id,
  variant = "page",
  onUpdated,
  onDeleted,
  onCancel,
}: ProspectoDetalleFormProps) {
  const isModal = variant === "modal";

  const [prospecto, setProspecto] = useState<Prospecto | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [cargando, setCargando] = useState(true);
  const [saving, setSaving] = useState(false);

  const [form, setForm] = useState({
    empresa: "",
    contacto: "",
    email: "",
    telefono: "",
    planIds: [] as string[],
    proxima_accion: "",
    fecha_proxima_accion: "",
    creado_por: "",
    responsable: "",
    observaciones: "",
  });

  const [nuevaNota, setNuevaNota] = useState("");
  const [guardandoNota, setGuardandoNota] = useState(false);
  const notaInputRef = useRef<HTMLTextAreaElement>(null);

  const [errorForm, setErrorForm] = useState<string | null>(null);
  const [confirmarEliminar, setConfirmarEliminar] = useState(false);
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [etapas, setEtapas] = useState<EtapaCrm[]>([]);
  const [cargandoPlanes, setCargandoPlanes] = useState(true);
  const [conversationId, setConversationId] = useState<string | null>(null);

  useEffect(() => {
    getEtapas().then(setEtapas);
  }, []);

  useEffect(() => {
    getPlanes()
      .then(setPlanes)
      .catch(() => setPlanes([]))
      .finally(() => setCargandoPlanes(false));
  }, []);

  useEffect(() => {
    if (!prospecto || planes.length === 0) return;
    const nombres = prospecto.servicio.split(",").map((s) => s.trim()).filter(Boolean);
    const ids = nombres
      .map((n) => planes.find((p) => p.nombre === n)?.id)
      .filter((pid): pid is string => Boolean(pid));
    setForm((prev) => ({ ...prev, planIds: ids }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospecto?.id, prospecto?.servicio, planes]);

  useEffect(() => {
    async function loadConversationId() {
      if (!prospecto) {
        setConversationId(null);
        return;
      }
      try {
        const sb = await getBrowserSupabaseForEmpresaData();
        const { data: chatContact, error: cErr } = await sb
          .from("chat_contacts")
          .select("id")
          .eq("crm_prospecto_id", prospecto.id)
          .maybeSingle();
        if (cErr) {
          setConversationId(null);
          return;
        }

        const contactId = (chatContact?.id as string | undefined) ?? undefined;
        if (!contactId) {
          setConversationId(null);
          return;
        }

        const { data: conv, error: convErr } = await sb
          .from("chat_conversations")
          .select("id")
          .eq("contact_id", contactId)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        if (convErr) {
          setConversationId(null);
          return;
        }
        setConversationId((conv?.id as string | undefined) ?? null);
      } catch {
        setConversationId(null);
      }
    }

    void loadConversationId();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [prospecto?.id]);

  const cargar = useCallback(async () => {
    if (!id) return;
    setCargando(true);
    setNotFound(false);
    try {
      const p = await getProspecto(id);
      if (!p) {
        setProspecto(null);
        setNotFound(true);
        return;
      }
      setProspecto(p);
      setForm((prev) => ({
        ...prev,
        empresa: p.empresa,
        contacto: p.contacto,
        email: p.email ?? "",
        telefono: p.telefono ?? "",
        proxima_accion: p.proxima_accion ?? "",
        fecha_proxima_accion: p.fecha_proxima_accion ?? "",
        creado_por: p.creado_por ?? "",
        responsable: p.responsable ?? "",
        observaciones: p.observaciones ?? "",
      }));
    } finally {
      setCargando(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) void cargar();
    else {
      setNotFound(true);
      setCargando(false);
    }
  }, [id, cargar]);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>,
  ) {
    setErrorForm(null);
    const { name, value } = e.target;
    const type = (e.target as HTMLInputElement).type;
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
        ? prev.planIds.filter((pid) => pid !== planId)
        : [...prev.planIds, planId],
    }));
  }

  const planesActivos = planes.filter((p) => p.estado === "activo");
  const valorEstimado = form.planIds.reduce(
    (sum, pid) => sum + (planesActivos.find((p) => p.id === pid)?.precio ?? 0),
    0,
  );

  async function handleGuardar(e: React.FormEvent) {
    e.preventDefault();
    setErrorForm(null);
    if (!form.empresa.trim()) return setErrorForm("La empresa es obligatoria.");
    if (!form.contacto.trim()) return setErrorForm("El contacto es obligatorio.");

    const servicioTexto = form.planIds
      .map((pid) => planesActivos.find((p) => p.id === pid)?.nombre)
      .filter(Boolean)
      .join(", ");

    setSaving(true);
    try {
      const actualizado = await updateProspecto(id, {
        empresa: form.empresa.trim().toUpperCase(),
        contacto: form.contacto.trim().toUpperCase(),
        email: form.email.trim() || undefined,
        telefono: form.telefono.trim() || undefined,
        servicio: servicioTexto,
        valor_estimado: valorEstimado,
        proxima_accion: form.proxima_accion.trim() || undefined,
        fecha_proxima_accion: form.fecha_proxima_accion || undefined,
        responsable: form.responsable.trim().toUpperCase() || undefined,
        observaciones: form.observaciones.trim() ? form.observaciones.trim() : null,
      });
      if (actualizado) {
        await cargar();
        onUpdated?.();
      }
    } finally {
      setSaving(false);
    }
  }

  async function handleCambiarEtapa(etapaCodigo: string) {
    await moveProspecto(id, etapaCodigo);
    await cargar();
    onUpdated?.();
  }

  async function handleAgregarNota(e: React.FormEvent) {
    e.preventDefault();
    if (!nuevaNota.trim()) return;
    setGuardandoNota(true);
    await addNota(id, nuevaNota);
    setNuevaNota("");
    await cargar();
    setGuardandoNota(false);
    setTimeout(() => notaInputRef.current?.focus(), 0);
    onUpdated?.();
  }

  async function handleEliminar() {
    await deleteProspecto(id);
    onDeleted?.();
  }

  // ── Estados de carga / not found ─────────────────────────────────────────
  if (cargando) {
    return (
      <div className={isModal ? "flex h-full items-center justify-center" : "max-w-3xl space-y-4 animate-pulse"}>
        {isModal ? (
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#4FAEB2]" />
            Cargando prospecto…
          </div>
        ) : (
          <>
            <div className="h-6 w-40 rounded bg-slate-200" />
            <div className="h-10 w-2/3 rounded bg-slate-200" />
            <div className="h-48 rounded-xl border border-slate-200 bg-slate-100" />
            <div className="h-64 rounded-xl border border-slate-200 bg-slate-100" />
          </>
        )}
      </div>
    );
  }

  if (notFound || !prospecto) {
    return (
      <div className={isModal ? "flex h-full flex-col items-center justify-center gap-3 p-8" : "space-y-4"}>
        <h2 className="text-lg font-semibold text-slate-800">Prospecto no encontrado</h2>
        {onCancel ? (
          <button
            onClick={onCancel}
            className="text-sm font-medium text-[#4FAEB2] hover:text-[#3F8E91] hover:underline"
          >
            ← Volver
          </button>
        ) : null}
      </div>
    );
  }

  const etapaActual = etapas.find((e) => e.codigo === prospecto.etapa);
  const etapaActualClasses = etapaActual ? getEtapaClasses(etapaActual.color) : null;

  return (
    <div
      className={
        isModal
          ? "flex h-full min-h-0 flex-col"
          : "max-w-3xl space-y-6"
      }
    >
      {/* En page variant, header propio. En modal el header lo pone el wrapper. */}
      {!isModal ? (
        <div className="flex items-start justify-between">
          <div>
            <button
              onClick={onCancel}
              className="mb-2 flex items-center gap-1 text-xs text-slate-400 hover:text-slate-600"
            >
              ← Funnel CRM
            </button>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{prospecto.empresa}</h1>
            <div className="mt-1 flex items-center gap-2">
              <span className="font-mono text-sm text-slate-400">{prospecto.numero_control}</span>
              {etapaActual && etapaActualClasses ? (
                <span
                  className={`rounded-full border px-2 py-0.5 text-xs font-semibold ${etapaActualClasses.border} ${etapaActualClasses.headerBg} ${etapaActualClasses.headerText}`}
                >
                  {etapaActual.nombre}
                </span>
              ) : null}
            </div>
          </div>
          <button
            onClick={() => setConfirmarEliminar(true)}
            className="rounded-lg p-2 text-rose-400 transition-colors hover:bg-rose-50 hover:text-rose-700"
            title="Eliminar prospecto"
            aria-label="Eliminar prospecto"
          >
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-5 w-5">
              <path
                fillRule="evenodd"
                d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
                clipRule="evenodd"
              />
            </svg>
          </button>
        </div>
      ) : null}

      <div
        className={
          isModal
            ? "min-h-0 flex-1 space-y-5 overflow-y-auto bg-slate-50/50 px-6 py-5"
            : "space-y-6"
        }
      >
        {/* Confirmación eliminar (común a ambas variants) */}
        {confirmarEliminar ? (
          <div className="flex items-center justify-between gap-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3">
            <p className="text-sm font-medium text-rose-700">
              ¿Eliminar permanentemente este prospecto?
            </p>
            <div className="flex shrink-0 gap-2">
              <button
                onClick={handleEliminar}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-700"
              >
                Sí, eliminar
              </button>
              <button
                onClick={() => setConfirmarEliminar(false)}
                className="rounded-lg border border-rose-200 px-3 py-1.5 text-xs text-rose-600 hover:bg-rose-100"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : null}

        {/* Etapa del funnel */}
        <section
          className={isModal ? "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" : "rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm"}
        >
          <SectionTitle>Etapa del funnel</SectionTitle>
          <div className="flex flex-wrap gap-2">
            {etapas.map((e) => {
              const cls = getEtapaClasses(e.color);
              const active = prospecto.etapa === e.codigo;
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => handleCambiarEtapa(e.codigo)}
                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition-all ${
                    active
                      ? `${cls.headerBg} ${cls.headerText} ${cls.border} ring-2 ring-[#4FAEB2]/30 ring-offset-1`
                      : "border-slate-200 bg-white text-slate-600 hover:border-[#4FAEB2]/60 hover:text-[#4FAEB2]"
                  }`}
                >
                  {e.nombre}
                </button>
              );
            })}
          </div>
          {prospecto.etapa === "GANADO" ? (
            <div className="mt-3 flex items-center justify-between rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5">
              <p className="text-sm font-medium text-emerald-700">✓ Oportunidad ganada</p>
              <a
                href={`/clientes/nuevo?from_crm=${prospecto.id}`}
                className="text-sm font-semibold text-emerald-700 underline hover:text-emerald-900"
              >
                Crear cliente →
              </a>
            </div>
          ) : null}
        </section>

        {/* Datos del prospecto */}
        <section
          className={isModal ? "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" : "rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm"}
        >
          <SectionTitle>Datos del prospecto</SectionTitle>

          <div className="mb-4 flex items-start justify-between gap-3 text-sm">
            <div className="text-slate-600">
              <span className="font-semibold text-slate-700">Origen:</span>{" "}
              <span className="text-slate-800">{originLabel(prospecto.origen_creacion)}</span>
            </div>
            {conversationId ? (
              <Link
                href={`/dashboard/conversaciones?conversationId=${encodeURIComponent(conversationId)}`}
                className="shrink-0 text-sm font-semibold text-[#4FAEB2] hover:text-[#3F8E91] hover:underline"
              >
                Abrir conversación →
              </Link>
            ) : null}
          </div>

          <form onSubmit={handleGuardar} className="space-y-4">
            {/* Empresa */}
            <div>
              <label className={LABEL_CLS}>
                Empresa <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                name="empresa"
                value={form.empresa}
                onChange={handleChange}
                className={`${INPUT_CLS} uppercase`}
                required
              />
            </div>

            {/* Contacto + Teléfono */}
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label className={LABEL_CLS}>
                  Contacto <span className="text-rose-500">*</span>
                </label>
                <input
                  type="text"
                  name="contacto"
                  value={form.contacto}
                  onChange={handleChange}
                  className={`${INPUT_CLS} uppercase`}
                  required
                />
              </div>
              <div>
                <label className={LABEL_CLS}>Teléfono</label>
                <input
                  type="text"
                  name="telefono"
                  value={form.telefono}
                  onChange={handleChange}
                  className={INPUT_CLS}
                />
              </div>
            </div>

            {/* Email */}
            <div>
              <label className={LABEL_CLS}>Email</label>
              <input
                type="email"
                name="email"
                value={form.email}
                onChange={handleChange}
                className={INPUT_CLS}
              />
            </div>

            {/* Observaciones */}
            <div>
              <label className={LABEL_CLS}>Comentarios / observaciones internas</label>
              <textarea
                name="observaciones"
                value={form.observaciones}
                onChange={handleChange}
                rows={4}
                placeholder="Contexto comercial, objeciones, acuerdos, próximos pasos… (solo equipo)"
                className={`${INPUT_CLS} resize-y min-h-[100px]`}
              />
              <p className="mt-1 text-xs text-slate-500">
                Distinto de las notas con fecha abajo: este bloque es un campo único editable del prospecto.
              </p>
            </div>

            {/* Servicios */}
            <div>
              <label className={LABEL_CLS}>Servicios / Productos de interés</label>
              {cargandoPlanes ? (
                <p className="py-2 text-sm text-slate-400">Cargando planes…</p>
              ) : planes.length === 0 ? (
                <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                  <p className="font-medium">No hay planes creados para esta empresa.</p>
                  <Link
                    href="/planes/nuevo"
                    className="mt-2 inline-flex items-center gap-1.5 font-medium text-[#4FAEB2] hover:text-[#3F8E91]"
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

            {/* Valor estimado */}
            <div>
              <label className={LABEL_CLS}>Valor estimado (Gs.)</label>
              <input
                type="text"
                readOnly
                value={valorEstimado > 0 ? valorEstimado.toLocaleString("es-PY") : ""}
                placeholder="Se calcula automáticamente"
                className={`${INPUT_CLS} cursor-not-allowed bg-slate-50`}
              />
              {valorEstimado > 0 ? (
                <p className="mt-1 text-xs text-slate-500">Suma de los planes seleccionados</p>
              ) : null}
            </div>

            {/* Próxima acción */}
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

            {/* Equipo */}
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
                  value={form.creado_por || "—"}
                  className={`${INPUT_CLS} cursor-not-allowed bg-slate-50`}
                />
                <p className="mt-1 text-xs text-slate-500">Registro inmutable del creador del lead</p>
              </div>
            </div>

            {errorForm ? (
              <div className="flex items-center gap-2 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
                <span>⚠</span>
                <span className="font-medium">{errorForm}</span>
              </div>
            ) : null}

            <div className="flex flex-wrap gap-2 pt-1">
              <button
                type="submit"
                disabled={saving}
                className="rounded-xl bg-[#4FAEB2] px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/20 transition-colors hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
              >
                {saving ? "Guardando…" : "Guardar cambios"}
              </button>
              {!isModal && onCancel ? (
                <button
                  type="button"
                  onClick={onCancel}
                  className="rounded-xl border border-slate-200 bg-white px-5 py-2.5 text-sm font-medium text-slate-700 transition-colors hover:border-[#4FAEB2]/60 hover:text-[#4FAEB2]"
                >
                  Cancelar
                </button>
              ) : null}
            </div>
          </form>
        </section>

        {/* Notas internas */}
        <section
          className={isModal ? "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" : "rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm"}
        >
          <SectionTitle>Notas internas ({prospecto.notas.length})</SectionTitle>

          <form onSubmit={handleAgregarNota} className="mb-5">
            <label className={LABEL_CLS}>Nueva nota</label>
            <textarea
              ref={notaInputRef}
              value={nuevaNota}
              onChange={(e) => setNuevaNota(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault();
                  handleAgregarNota(e as unknown as React.FormEvent);
                }
              }}
              rows={3}
              placeholder="Escribí una nota interna (Ctrl+Enter para guardar rápido)…"
              className={`${INPUT_CLS} mb-3 resize-none`}
            />
            <button
              type="submit"
              disabled={!nuevaNota.trim() || guardandoNota}
              className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              {guardandoNota ? "Agregando…" : "Agregar nota"}
            </button>
          </form>

          {prospecto.notas.length === 0 ? (
            <p className="text-sm italic text-slate-400">No hay notas registradas aún.</p>
          ) : (
            <div className="space-y-3">
              {[...prospecto.notas].reverse().map((nota: Nota) => (
                <div
                  key={nota.id}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                >
                  <p className="whitespace-pre-wrap text-sm text-slate-700">{nota.texto}</p>
                  <p className="mt-2 text-xs text-slate-400">{formatFecha(nota.fecha)}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* Eliminar (sólo en modal — para que el page tenga su propio botón en header) */}
        {isModal ? (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setConfirmarEliminar(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-medium text-rose-600 shadow-sm transition-colors hover:bg-rose-50"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
                <path
                  fillRule="evenodd"
                  d="M8.75 1A2.75 2.75 0 0 0 6 3.75v.443c-.795.077-1.584.176-2.365.298a.75.75 0 1 0 .23 1.482l.149-.022.841 10.518A2.75 2.75 0 0 0 7.596 19h4.807a2.75 2.75 0 0 0 2.742-2.53l.841-10.52.149.023a.75.75 0 0 0 .23-1.482A41.03 41.03 0 0 0 14 4.193V3.75A2.75 2.75 0 0 0 11.25 1h-2.5ZM10 4c.84 0 1.673.025 2.5.075V3.75c0-.69-.56-1.25-1.25-1.25h-2.5c-.69 0-1.25.56-1.25 1.25v.325C8.327 4.025 9.16 4 10 4ZM8.58 7.72a.75.75 0 0 0-1.5.06l.3 7.5a.75.75 0 1 0 1.5-.06l-.3-7.5Zm4.34.06a.75.75 0 1 0-1.5-.06l-.3 7.5a.75.75 0 1 0 1.5.06l.3-7.5Z"
                  clipRule="evenodd"
                />
              </svg>
              Eliminar prospecto
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
