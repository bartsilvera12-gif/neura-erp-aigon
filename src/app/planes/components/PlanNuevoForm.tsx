"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import MontoInput from "@/components/ui/MontoInput";
import { FancySelect } from "@/app/dashboard/proyectos/components/FancySelect";
import { savePlan } from "@/lib/planes/storage";

const fLabelClass = "block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1";
const fInputClass =
  "w-full px-3 py-2 text-sm border border-slate-200 rounded-xl bg-white shadow-sm transition-colors placeholder:text-slate-400 hover:border-[#4FAEB2]/60 focus:outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20";

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

export type PlanNuevoFormProps = {
  variant?: "page" | "modal";
  onClose?: () => void;
  onCreated?: (id?: string) => void;
};

export default function PlanNuevoForm({
  variant = "page",
  onClose,
  onCreated,
}: PlanNuevoFormProps) {
  const router = useRouter();

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
  });

  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const closeOrBack = () => {
    if (onClose) onClose();
    else router.push("/planes");
  };

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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.nombre.trim()) {
      setError("El nombre del plan es obligatorio.");
      return;
    }
    if (!form.precio || parseFloat(form.precio) <= 0) {
      setError("El precio debe ser mayor a 0.");
      return;
    }

    setGuardando(true);
    try {
      const guardado = await savePlan({
        nombre: form.nombre.trim(),
        descripcion: form.descripcion.trim() || undefined,
        precio: parseFloat(form.precio),
        moneda: form.moneda,
        periodicidad: form.periodicidad,
        limite_usuarios: form.limite_usuarios ? parseInt(form.limite_usuarios, 10) : null,
        limite_clientes: form.limite_clientes ? parseInt(form.limite_clientes, 10) : null,
        limite_facturas: form.limite_facturas ? parseInt(form.limite_facturas, 10) : null,
        estado: form.estado,
      });

      if (!guardado.ok) {
        setError(guardado.error);
        return;
      }
      onCreated?.(guardado.plan?.id);
      closeOrBack();
    } finally {
      setGuardando(false);
    }
  }

  const isModal = variant === "modal";

  return (
    <div className={`space-y-6 ${isModal ? "" : "max-w-3xl"}`}>
      {!isModal && (
        <>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Link href="/planes" className="hover:text-[#4FAEB2] transition-colors">
              Planes
            </Link>
            <span>/</span>
            <span className="font-medium text-gray-700">Nuevo plan</span>
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Nuevo plan</h1>
            <p className="mt-1 text-sm text-slate-500">
              El código se generará automáticamente al guardar.
            </p>
          </div>
        </>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <SectionCard title="Información general" icon="📝">
          <div className="space-y-4">
            <div>
              <label className={fLabelClass}>Nombre del plan *</label>
              <input
                type="text"
                name="nombre"
                value={form.nombre}
                onChange={handleChange}
                placeholder="Ej: BÁSICO, PROFESIONAL, ENTERPRISE"
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
                placeholder="Descripción breve del plan y sus beneficios…"
                rows={3}
                className={fInputClass}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className={fLabelClass}>Estado</label>
                <FancySelect
                  ariaLabel="Estado"
                  value={form.estado}
                  onChange={(v) => setField("estado", v as "activo" | "inactivo")}
                  options={[
                    { value: "activo", label: "Activo" },
                    { value: "inactivo", label: "Inactivo" },
                  ]}
                />
              </div>
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
                placeholder="0"
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
                  { value: "unico", label: "Único (pago único)" },
                ]}
              />
            </div>
          </div>
        </SectionCard>

        <SectionCard title="Límites del plan" icon="📦">
          <p className="mb-4 text-xs text-slate-500">
            Dejar en blanco para indicar que el límite es <strong>ilimitado</strong>.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className={fLabelClass}>Límite de usuarios</label>
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
              <label className={fLabelClass}>Límite de clientes</label>
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
              <label className={fLabelClass}>Límite de facturas</label>
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
            onClick={closeOrBack}
            className="px-4 py-2.5 text-sm text-slate-500 transition-colors hover:text-[#4FAEB2]"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={guardando}
            className="rounded-lg bg-[#4FAEB2] px-6 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {guardando ? "Guardando…" : "Guardar plan"}
          </button>
        </div>
      </form>
    </div>
  );
}
