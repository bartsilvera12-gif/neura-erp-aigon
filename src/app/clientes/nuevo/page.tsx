"use client";

import { useRouter } from "next/navigation";
import ClienteNuevoForm from "@/app/clientes/components/ClienteNuevoForm";

export default function NuevoClientePage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <button
          onClick={() => router.push("/clientes")}
          className="text-sm font-medium text-[#4FAEB2] hover:text-[#3F8E91] hover:underline"
        >
          ← Volver
        </button>
      </div>
      <div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
          />
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4FAEB2]">Nuevo</p>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Crear cliente</h1>
        <p className="mt-1 text-sm text-slate-500">Registrá un cliente en la base de datos.</p>
      </div>

      <ClienteNuevoForm
        variant="page"
        onCreated={(id) => router.push(`/clientes/${id}`)}
        onCancel={() => router.push("/clientes")}
      />
    </div>
  );
}
