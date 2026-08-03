"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import {
  emptyUsuarioForm,
  rolFromNivelForm,
  UsuarioFormFields,
  type UsuarioFormValues,
} from "@/components/usuarios/UsuarioForm";

export type UsuarioNuevoFormProps = {
  variant?: "page" | "modal";
  onClose?: () => void;
  onCreated?: () => void;
};

export default function UsuarioNuevoForm({
  variant = "page",
  onClose,
  onCreated,
}: UsuarioNuevoFormProps) {
  const router = useRouter();

  const [form, setForm] = useState(emptyUsuarioForm());
  const [showPwd, setShowPwd] = useState(false);
  const [showPwd2, setShowPwd2] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [guardando, setGuardando] = useState(false);

  const closeOrBack = () => {
    if (onClose) onClose();
    else router.push("/usuarios");
  };

  function handleChange(e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) {
    const { name, value, type } = e.target;
    const upper = ["nombre"];
    if (type === "checkbox") {
      setForm((prev) => ({ ...prev, [name]: (e.target as HTMLInputElement).checked }));
    } else {
      let normalized = value;
      if (name === "email" || type === "email") normalized = value.toLowerCase();
      else if (upper.includes(name)) normalized = value.toUpperCase();
      setForm((prev) => ({ ...prev, [name]: normalized } as UsuarioFormValues));
    }
  }

  function handleSelectChange(name: string, value: string) {
    setForm((prev) => ({ ...prev, [name]: value } as UsuarioFormValues));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.nombre.trim()) {
      setError("El nombre es obligatorio.");
      return;
    }
    if (!form.email.trim()) {
      setError("El email es obligatorio.");
      return;
    }
    if (!form.password) {
      setError("La contraseña es obligatoria.");
      return;
    }
    if (form.password.length < 6) {
      setError("La contraseña debe tener al menos 6 caracteres.");
      return;
    }
    if (form.password !== form.password2) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    const pct = form.porcentaje_comision.trim();
    const pctNum = pct === "" ? null : Number(pct);
    if (pctNum !== null && (!Number.isFinite(pctNum) || pctNum < 0 || pctNum > 100)) {
      setError("La comisión debe estar entre 0 y 100.");
      return;
    }

    setGuardando(true);

    try {
      const res = await fetchWithSupabaseSession("/api/empresas/usuarios/nuevo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim().toLowerCase(),
          password: form.password,
          nombre: form.nombre.trim(),
          telefono: form.telefono.trim() || undefined,
          fecha_nacimiento: form.fecha_nacimiento || undefined,
          fecha_ingreso: form.fecha_ingreso || undefined,
          tipo_contrato: form.tipo_contrato,
          salario_base: form.salario_base.trim() || undefined,
          porcentaje_comision: pct.trim() || undefined,
          ips: form.ips,
          area: form.area,
          rol: rolFromNivelForm(form.nivel),
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        throw new Error(typeof json.error === "string" ? json.error : "Error al crear usuario");
      }
    } catch (err: unknown) {
      setGuardando(false);
      const msg =
        err instanceof Error
          ? err.message
          : typeof err === "object" && err !== null && "message" in err
            ? String((err as { message: unknown }).message)
            : String(err);
      setError(`Error al crear usuario: ${msg}`);
      return;
    }

    setGuardando(false);
    onCreated?.();
    closeOrBack();
  }

  const isModal = variant === "modal";

  return (
    <div className={`space-y-6 ${isModal ? "" : "max-w-3xl"}`}>
      {!isModal && (
        <>
          <div className="flex items-center gap-2 text-sm text-gray-400">
            <Link href="/usuarios" className="hover:text-[#4FAEB2] transition-colors">
              Usuarios
            </Link>
            <span>/</span>
            <span className="text-gray-700 font-medium">Nuevo usuario</span>
          </div>

          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">Nuevo usuario</h1>
            <p className="mt-1 text-sm text-slate-500">Código generado automáticamente al guardar.</p>
          </div>
        </>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6" autoComplete="off">
        <UsuarioFormFields
          variant="create"
          form={form}
          onChange={handleChange}
          onSelectChange={handleSelectChange}
          onSalarioBaseChange={(n) => setForm((prev) => ({ ...prev, salario_base: String(n) }))}
          showPwd={showPwd}
          setShowPwd={setShowPwd}
          showPwd2={showPwd2}
          setShowPwd2={setShowPwd2}
        />

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
            {guardando ? "Creando usuario…" : "Guardar usuario"}
          </button>
        </div>
      </form>
    </div>
  );
}
