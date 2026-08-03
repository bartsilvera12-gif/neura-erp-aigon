"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import MontoInput from "@/components/ui/MontoInput";
import { FancySelect, type FancySelectOption } from "@/app/dashboard/proyectos/components/FancySelect";
import { getPlan, updatePlan, toggleEstadoPlan, deletePlan } from "@/lib/planes/storage";
import type { Plan, PlanMarketingItem } from "@/lib/planes/types";
import { TIPOS_CONTENIDO } from "@/lib/marketing/types";

const fLabelClass = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1";
const fInputClass =
  "w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white shadow-sm transition-colors placeholder:text-slate-400 hover:border-[#4FAEB2]/60 focus:outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20 disabled:bg-slate-50 disabled:text-slate-500";

function formatGs(n: number) {
  return n.toLocaleString("es-PY");
}

function formatPrecio(p: Plan) {
  return p.moneda === "USD"
    ? `USD ${p.precio.toLocaleString("en-US")}`
    : `Gs. ${formatGs(p.precio)}`;
}

function limiteLabel(v: number | null) {
  return v === null ? "Ilimitado" : v.toLocaleString("es-PY");
}

function SectionCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon?: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm ring-1 ring-[#4FAEB2]/15">
      <div className="mb-5 flex items-center gap-2 border-b border-slate-100 pb-3">
        {icon ? <span className="text-base">{icon}</span> : null}
        <h3 className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
          {title}
        </h3>
      </div>
      {children}
    </section>
  );
}

function BadgeEstado({ estado }: { estado: Plan["estado"] }) {
  const activo = estado === "activo";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        activo
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-500"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${activo ? "bg-emerald-500" : "bg-slate-400"}`}
      />
      {activo ? "Activo" : "Inactivo"}
    </span>
  );
}

function BadgePeriodicidad({ p }: { p: Plan["periodicidad"] }) {
  const cfg = {
    mensual: {
      cls: "border-[#4FAEB2]/30 bg-[#4FAEB2]/10 text-[#3F8E91]",
      dot: "bg-[#4FAEB2]",
    },
    anual: {
      cls: "border-violet-200 bg-violet-50 text-violet-700",
      dot: "bg-violet-500",
    },
    unico: {
      cls: "border-amber-200 bg-amber-50 text-amber-700",
      dot: "bg-amber-500",
    },
  } as const;
  const label = { mensual: "Mensual", anual: "Anual", unico: "Único" };
  const it = cfg[p];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${it.cls}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${it.dot}`} />
      {label[p]}
    </span>
  );
}

export type PlanDetalleClientProps = {
  id: string;
  variant?: "page" | "modal";
  initialEditing?: boolean;
  onClose?: () => void;
  onUpdated?: () => void;
};

export default function PlanDetalleClient({
  id,
  variant = "page",
  initialEditing = false,
  onClose,
  onUpdated,
}: PlanDetalleClientProps) {
  const router = useRouter();

  const closeOrBack = useCallback(() => {
    if (onClose) onClose();
    else router.push("/planes");
  }, [onClose, router]);

  const [plan, setPlan] = useState<Plan | null>(null);
  const [editing, setEditing] = useState(initialEditing);
  const [formError, setFormError] = useState<string | null>(null);
  const [showDel, setShowDel] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [form, setForm] = useState({
    nombre: "",
    descripcion: "",
    precio: "",
    moneda: "GS" as "GS" | "USD",
    periodicidad: "mensual" as "mensual" | "anual" | "unico",
    limite_usuarios: "",
    limite_clientes: "",
    limite_facturas: "",
    estado: "activo" as "activo" | "inactivo",
    es_plan_marketing: false,
    plantilla_items: [] as PlanMarketingItem[],
  });

  useEffect(() => {
    if (!id) return;
    setLoadError(null);
    getPlan(id)
      .then((p) => {
        if (!p) {
          setLoadError("No se encontró el plan.");
          return;
        }
        setPlan(p);
        setForm({
          nombre: p.nombre,
          descripcion: p.descripcion ?? "",
          precio: String(p.precio),
          moneda: p.moneda,
          periodicidad: p.periodicidad,
          limite_usuarios: p.limite_usuarios !== null ? String(p.limite_usuarios) : "",
          limite_clientes: p.limite_clientes !== null ? String(p.limite_clientes) : "",
          limite_facturas: p.limite_facturas !== null ? String(p.limite_facturas) : "",
          estado: p.estado,
          es_plan_marketing: Boolean(p.es_plan_marketing),
          plantilla_items: p.plantilla_operativa?.items ?? [],
        });
      })
      .catch((err) => {
        setLoadError(err instanceof Error ? err.message : "Error al cargar el plan");
      });
  }, [id]);

  function handleChange(
    e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>
  ) {
    const { name, value } = e.target;
    const upper = ["nombre"];
    setForm((prev) => ({
      ...prev,
      [name]: upper.includes(name) ? value.toUpperCase() : value,
    }));
  }

  function setField<K extends keyof typeof form>(name: K, value: (typeof form)[K]) {
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleGuardar(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);

    if (!form.nombre.trim()) {
      setFormError("El nombre es obligatorio.");
      return;
    }
    if (!form.precio || parseFloat(form.precio) <= 0) {
      setFormError("El precio debe ser mayor a 0.");
      return;
    }

    const itemsNorm = form.plantilla_items.map((it) => {
      if (it.periodicidad === "semanal") {
        return { ...it, cantidad: Math.max(1, (it.dias_semana ?? []).length) };
      }
      return it;
    });

    setGuardando(true);
    try {
      const actualizado = await updatePlan(id, {
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || undefined,
        precio: parseFloat(form.precio),
        moneda: form.moneda,
        periodicidad: form.periodicidad,
        limite_usuarios: form.limite_usuarios ? parseInt(form.limite_usuarios, 10) : null,
        limite_clientes: form.limite_clientes ? parseInt(form.limite_clientes, 10) : null,
        limite_facturas: form.limite_facturas ? parseInt(form.limite_facturas, 10) : null,
        estado: form.estado,
        es_plan_marketing: form.es_plan_marketing,
        plantilla_operativa: itemsNorm.length > 0 ? { items: itemsNorm } : undefined,
      });

      if (!actualizado.ok) {
        setFormError(actualizado.error);
        return;
      }
      onUpdated?.();
      const fresh = await getPlan(id);
      if (fresh) setPlan(fresh);
      setEditing(false);
    } finally {
      setGuardando(false);
    }
  }

  async function handleToggleEstado() {
    if (!plan) return;
    const nuevo = plan.estado === "activo" ? "inactivo" : "activo";
    await toggleEstadoPlan(id, nuevo);
    onUpdated?.();
    const fresh = await getPlan(id);
    if (fresh) setPlan(fresh);
  }

  async function handleEliminar() {
    const r = await deletePlan(id);
    if (!r.ok) {
      setFormError(r.error);
      return;
    }
    onUpdated?.();
    closeOrBack();
  }

  const isModal = variant === "modal";

  if (loadError) {
    return (
      <div className="space-y-6">
        {!isModal ? (
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Link href="/planes" className="hover:text-[#4FAEB2] transition-colors">
              Planes
            </Link>
            <span>/</span>
            <span className="font-medium text-gray-700">Error</span>
          </div>
        ) : null}
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-700">
          {loadError}
        </div>
        <button
          type="button"
          onClick={closeOrBack}
          className="inline-flex items-center gap-1.5 text-sm text-slate-600 hover:text-[#4FAEB2]"
        >
          ← Volver
        </button>
      </div>
    );
  }

  if (!plan) {
    return (
      <div className="flex items-center justify-center py-24 text-sm text-slate-400">
        Cargando…
      </div>
    );
  }

  return (
    <div className={`space-y-6 ${isModal ? "" : "max-w-3xl"}`}>
      {!isModal && (
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <Link href="/planes" className="hover:text-[#4FAEB2] transition-colors">
            Planes
          </Link>
          <span>/</span>
          <span className="font-medium text-gray-700">{plan.codigo_plan}</span>
        </div>
      )}

      {/* Header */}
      <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm ring-1 ring-[#4FAEB2]/15">
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-900">{plan.nombre}</h1>
              <span className="rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-600">
                {plan.codigo_plan}
              </span>
              <BadgeEstado estado={plan.estado} />
              <BadgePeriodicidad p={plan.periodicidad} />
            </div>
            {plan.descripcion && (
              <p className="mt-1 text-sm text-slate-500">{plan.descripcion}</p>
            )}
            <p className="mt-2 text-xl font-bold tracking-tight text-[#3F8E91]">
              {formatPrecio(plan)}
            </p>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {!editing && (
              <button
                type="button"
                onClick={() => setEditing(true)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-[#4FAEB2]/45 bg-white px-3 py-1.5 text-sm font-semibold text-[#3F8E91] shadow-sm transition-colors hover:bg-[#4FAEB2]/10"
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="h-3.5 w-3.5"
                >
                  <path d="M2.695 14.763l-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.5a2.121 2.121 0 0 0-3-3L3.58 13.42a4 4 0 0 0-.885 1.343Z" />
                </svg>
                Editar
              </button>
            )}
            <button
              type="button"
              onClick={() => void handleToggleEstado()}
              className={`rounded-lg border px-3 py-1.5 text-sm font-semibold transition-colors ${
                plan.estado === "activo"
                  ? "border-red-200 text-red-600 hover:bg-red-50"
                  : "border-emerald-200 text-emerald-600 hover:bg-emerald-50"
              }`}
            >
              {plan.estado === "activo" ? "Desactivar" : "Activar"}
            </button>
          </div>
        </div>
      </div>

      {/* Marketing summary (vista) */}
      {!editing && plan.es_plan_marketing && plan.plantilla_operativa?.items?.length ? (
        <SectionCard title="Plan de marketing" icon="🎯">
          <p className="mb-3 text-sm text-slate-600">
            Este plan genera tareas de contenido automáticamente.
          </p>
          <ul className="space-y-2">
            {plan.plantilla_operativa.items.map((item, i) => (
              <li
                key={i}
                className="rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2 text-sm text-slate-700"
              >
                <span className="font-medium capitalize">{item.tipo_contenido}</span>
                {" — "}
                {item.periodicidad === "semanal"
                  ? `${Math.max(1, (item.dias_semana ?? []).length)} por semana${
                      item.dias_semana?.length
                        ? ` (${(item.dias_semana ?? [])
                            .map((d) => ["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"][d])
                            .join(", ")})`
                        : ""
                    }`
                  : `${item.cantidad} por mes (semana ${item.semana_del_mes ?? 1})`}
              </li>
            ))}
          </ul>
        </SectionCard>
      ) : null}

      {/* Resumen de límites (vista) */}
      {!editing && (
        <SectionCard title="Límites del plan" icon="📦">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              { label: "Usuarios", value: limiteLabel(plan.limite_usuarios) },
              { label: "Clientes", value: limiteLabel(plan.limite_clientes) },
              { label: "Facturas", value: limiteLabel(plan.limite_facturas) },
            ].map((item) => {
              const ilim = item.value === "Ilimitado";
              return (
                <div
                  key={item.label}
                  className={`rounded-xl border p-4 text-center ${
                    ilim
                      ? "border-[#4FAEB2]/30 bg-[#4FAEB2]/8"
                      : "border-slate-200 bg-slate-50/70"
                  }`}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
                    {item.label}
                  </p>
                  <p
                    className={`mt-1 text-lg font-bold tracking-tight ${
                      ilim ? "text-[#3F8E91]" : "text-slate-800"
                    }`}
                  >
                    {item.value}
                  </p>
                </div>
              );
            })}
          </div>
        </SectionCard>
      )}

      {/* Formulario de edición */}
      {editing && (
        <form onSubmit={handleGuardar} className="space-y-6">
          {formError && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {formError}
            </div>
          )}

          <SectionCard title="Información general" icon="📝">
            <div className="space-y-4">
              <div>
                <label className={fLabelClass}>Nombre del plan *</label>
                <input
                  type="text"
                  name="nombre"
                  value={form.nombre}
                  onChange={handleChange}
                  className={`${fInputClass} uppercase`}
                  required
                />
              </div>
              <div>
                <label className={fLabelClass}>Descripción</label>
                <textarea
                  name="descripcion"
                  value={form.descripcion}
                  onChange={handleChange}
                  rows={3}
                  className={fInputClass}
                />
              </div>
              <div>
                <label className={fLabelClass}>Estado</label>
                <FancySelect
                  ariaLabel="Estado del plan"
                  value={form.estado}
                  onChange={(v) => setField("estado", v as "activo" | "inactivo")}
                  options={[
                    { value: "activo", label: "Activo" },
                    { value: "inactivo", label: "Inactivo" },
                  ]}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Precio y periodicidad" icon="💲">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className={fLabelClass}>Precio *</label>
                <MontoInput
                  value={form.precio}
                  onChange={(n) => setForm((p) => ({ ...p, precio: String(n) }))}
                  className={fInputClass}
                  decimals={form.moneda === "USD"}
                  required
                />
              </div>
              <div>
                <label className={fLabelClass}>Moneda</label>
                <FancySelect
                  ariaLabel="Moneda"
                  value={form.moneda}
                  onChange={(v) => setField("moneda", v as "GS" | "USD")}
                  options={[
                    { value: "GS", label: "Guaraníes (GS)" },
                    { value: "USD", label: "Dólares (USD)" },
                  ]}
                />
              </div>
              <div>
                <label className={fLabelClass}>Periodicidad</label>
                <FancySelect
                  ariaLabel="Periodicidad"
                  value={form.periodicidad}
                  onChange={(v) => setField("periodicidad", v as "mensual" | "anual" | "unico")}
                  options={[
                    { value: "mensual", label: "Mensual" },
                    { value: "anual", label: "Anual" },
                    { value: "unico", label: "Único" },
                  ]}
                />
              </div>
            </div>
          </SectionCard>

          <SectionCard title="Plan de marketing" icon="🎯">
            <div className="space-y-4">
              <label className="flex cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  checked={form.es_plan_marketing}
                  onChange={(e) =>
                    setForm((p) => ({ ...p, es_plan_marketing: e.target.checked }))
                  }
                  className="h-4 w-4 rounded border-slate-300 text-[#4FAEB2] focus:ring-[#4FAEB2]/30"
                />
                <span className="text-sm font-medium text-slate-800">Es plan de marketing</span>
              </label>
              {form.es_plan_marketing && (
                <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
                  <p className="text-xs text-slate-500">
                    Plantilla operativa (genera tareas automáticamente)
                  </p>
                  {form.plantilla_items.map((item, idx) => {
                    const tipoOptions: FancySelectOption[] = TIPOS_CONTENIDO.map((t) => ({
                      value: t,
                      label: t.charAt(0).toUpperCase() + t.slice(1),
                    }));
                    const semanaOptions: FancySelectOption[] = [1, 2, 3, 4].map((s) => ({
                      value: String(s),
                      label: `${s}ª del mes`,
                    }));
                    return (
                      <div
                        key={idx}
                        className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                      >
                        <FancySelect
                          size="sm"
                          ariaLabel="Tipo de contenido"
                          value={item.tipo_contenido}
                          onChange={(v) => {
                            const items = [...form.plantilla_items];
                            items[idx] = {
                              ...item,
                              tipo_contenido: v as PlanMarketingItem["tipo_contenido"],
                            };
                            setForm((p) => ({ ...p, plantilla_items: items }));
                          }}
                          options={tipoOptions}
                          className="min-w-[140px]"
                        />
                        <FancySelect
                          size="sm"
                          ariaLabel="Periodicidad del item"
                          value={item.periodicidad}
                          onChange={(v) => {
                            const items = [...form.plantilla_items];
                            const periodicidad = v as "semanal" | "mensual";
                            const next = { ...item, periodicidad };
                            if (periodicidad === "semanal") {
                              next.cantidad = Math.max(1, (item.dias_semana ?? []).length);
                            }
                            items[idx] = next;
                            setForm((p) => ({ ...p, plantilla_items: items }));
                          }}
                          options={[
                            { value: "semanal", label: "Semanal" },
                            { value: "mensual", label: "Mensual" },
                          ]}
                          className="min-w-[110px]"
                        />
                        {item.periodicidad === "mensual" ? (
                          <input
                            type="number"
                            min={1}
                            value={item.cantidad}
                            onChange={(e) => {
                              const items = [...form.plantilla_items];
                              items[idx] = {
                                ...item,
                                cantidad: parseInt(e.target.value, 10) || 1,
                              };
                              setForm((p) => ({ ...p, plantilla_items: items }));
                            }}
                            className="w-16 rounded-lg border border-slate-200 px-2 py-1 text-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
                            placeholder="Cant."
                          />
                        ) : (
                          <span className="w-20 text-xs text-slate-500">
                            {Math.max(1, (item.dias_semana ?? []).length)} tareas/sem
                          </span>
                        )}
                        {item.periodicidad === "semanal" && (
                          <>
                            <span className="text-xs text-slate-500">Días:</span>
                            {[0, 1, 2, 3, 4, 5, 6].map((d) => {
                              const checked = (item.dias_semana ?? []).includes(d);
                              return (
                                <label
                                  key={d}
                                  className={`inline-flex cursor-pointer items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs transition-colors ${
                                    checked
                                      ? "border-[#4FAEB2]/45 bg-[#4FAEB2]/10 text-[#3F8E91]"
                                      : "border-slate-200 bg-white text-slate-600 hover:border-[#4FAEB2]/40"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="hidden"
                                    checked={checked}
                                    onChange={(e) => {
                                      const items = [...form.plantilla_items];
                                      const ds = item.dias_semana ?? [];
                                      const next = e.target.checked
                                        ? [...ds, d].sort((a, b) => a - b)
                                        : ds.filter((x) => x !== d);
                                      items[idx] = {
                                        ...item,
                                        dias_semana: next,
                                        cantidad: Math.max(1, next.length),
                                      };
                                      setForm((p) => ({ ...p, plantilla_items: items }));
                                    }}
                                  />
                                  {["Do", "Lu", "Ma", "Mi", "Ju", "Vi", "Sa"][d]}
                                </label>
                              );
                            })}
                          </>
                        )}
                        {item.periodicidad === "mensual" && (
                          <>
                            <span className="text-xs text-slate-500">Semana:</span>
                            <FancySelect
                              size="sm"
                              ariaLabel="Semana del mes"
                              value={String(item.semana_del_mes ?? 1)}
                              onChange={(v) => {
                                const items = [...form.plantilla_items];
                                items[idx] = {
                                  ...item,
                                  semana_del_mes: parseInt(v, 10),
                                };
                                setForm((p) => ({ ...p, plantilla_items: items }));
                              }}
                              options={semanaOptions}
                              className="min-w-[110px]"
                            />
                          </>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            setForm((p) => ({
                              ...p,
                              plantilla_items: form.plantilla_items.filter((_, i) => i !== idx),
                            }))
                          }
                          className="ml-auto rounded-md px-2 py-1 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50"
                        >
                          Quitar
                        </button>
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() =>
                      setForm((p) => ({
                        ...p,
                        plantilla_items: [
                          ...p.plantilla_items,
                          {
                            tipo_contenido: "post",
                            periodicidad: "semanal",
                            cantidad: 3,
                            dias_semana: [1, 3, 5],
                          },
                        ],
                      }))
                    }
                    className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#3F8E91] transition-colors hover:text-[#4FAEB2]"
                  >
                    + Agregar item
                  </button>
                </div>
              )}
            </div>
          </SectionCard>

          <SectionCard title="Límites del plan" icon="📦">
            <p className="mb-4 text-xs text-slate-500">
              Dejar en blanco para indicar que el límite es <strong>ilimitado</strong>.
            </p>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label className={fLabelClass}>Usuarios</label>
                <input
                  type="number"
                  name="limite_usuarios"
                  value={form.limite_usuarios}
                  onChange={handleChange}
                  min={1}
                  step="1"
                  placeholder="Ilimitado"
                  className={fInputClass}
                />
              </div>
              <div>
                <label className={fLabelClass}>Clientes</label>
                <input
                  type="number"
                  name="limite_clientes"
                  value={form.limite_clientes}
                  onChange={handleChange}
                  min={1}
                  step="1"
                  placeholder="Ilimitado"
                  className={fInputClass}
                />
              </div>
              <div>
                <label className={fLabelClass}>Facturas</label>
                <input
                  type="number"
                  name="limite_facturas"
                  value={form.limite_facturas}
                  onChange={handleChange}
                  min={1}
                  step="1"
                  placeholder="Ilimitado"
                  className={fInputClass}
                />
              </div>
            </div>
          </SectionCard>

          <div className="flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={() => setEditing(false)}
              className="px-4 py-2.5 text-sm text-slate-500 transition-colors hover:text-[#4FAEB2]"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={guardando}
              className="rounded-lg bg-[#4FAEB2] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#3F8E91] disabled:opacity-50"
            >
              {guardando ? "Guardando…" : "Guardar cambios"}
            </button>
          </div>
        </form>
      )}

      {/* Zona peligrosa */}
      <SectionCard title="Zona peligrosa" icon="⚠️">
        {!showDel ? (
          <button
            type="button"
            onClick={() => setShowDel(true)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 px-3.5 py-2 text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
          >
            Eliminar este plan
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium text-red-700">
              ¿Confirmar eliminación de <strong>{plan.nombre}</strong>? Esta acción no se puede
              deshacer.
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => void handleEliminar()}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-red-700"
              >
                Sí, eliminar
              </button>
              <button
                type="button"
                onClick={() => setShowDel(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600 transition-colors hover:bg-slate-50"
              >
                Cancelar
              </button>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
