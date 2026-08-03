"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import ProveedorForm, { emptyProveedorForm, type ProveedorFormValues } from "@/app/proveedores/ProveedorForm";
import { createProveedor } from "@/lib/proveedores/storage";

export default function NuevoProveedorPage() {
  const router = useRouter();
  const [form, setForm] = useState<ProveedorFormValues>(emptyProveedorForm);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.nombre.trim()) {
      setError("Completá el nombre.");
      return;
    }
    setSaving(true);
    const payload = {
      nombre: form.nombre.trim(),
      nombre_comercial: form.nombre_comercial.trim() || null,
      razon_social: form.razon_social.trim() || null,
      ruc: form.ruc.trim() || null,
      telefono: form.telefono.trim() || null,
      email: form.email.trim() || null,
      direccion: form.direccion.trim() || null,
      contacto: form.contacto.trim() || null,
      estado: form.estado,
      condicion_pago: form.condicion_pago === "" ? null : form.condicion_pago,
      plazo_pago_dias:
        form.plazo_pago_dias.trim() === "" ? null : parseInt(form.plazo_pago_dias, 10),
      moneda_preferida: form.moneda_preferida === "" ? null : form.moneda_preferida,
      observaciones: form.observaciones.trim() || null,
      categoria_ids: form.categoria_ids,
    };
    const res = await createProveedor(payload);
    setSaving(false);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    router.push("/proveedores");
  }

  return (
    <div className="space-y-6 pb-10">

      <div>
        <Link
          href="/proveedores"
          className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-[#3F8E91] transition-colors hover:text-[#2f6c6f]"
        >
          ← Volver a Proveedores
        </Link>
      </div>

      <div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
          />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
            Operaciones · Proveedores
          </p>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Nuevo proveedor</h1>
        <p className="mt-1 text-sm text-slate-500">Los datos se guardan en la base de tu empresa.</p>
      </div>

      <form onSubmit={handleSubmit} className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
        <ProveedorForm values={form} onChange={setForm} disabled={saving} />
        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm font-medium text-red-700">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-5">
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-4 py-2 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar proveedor"}
          </button>
          <Link
            href="/proveedores"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 transition-colors hover:bg-slate-50"
          >
            Cancelar
          </Link>
        </div>
      </form>
    </div>
  );
}
