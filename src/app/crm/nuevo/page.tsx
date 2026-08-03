"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import ProspectoNuevoForm from "@/app/crm/components/ProspectoNuevoForm";

export default function NuevoProspectoPage() {
  const router = useRouter();

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-3">
        <Link
          href="/crm"
          className="text-sm font-medium text-[#4FAEB2] hover:text-[#3F8E91] hover:underline"
        >
          ← Volver
        </Link>
      </div>
      <div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
          />
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4FAEB2]">
            Nuevo
          </p>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          Crear prospecto
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Registrá una nueva oportunidad en el funnel comercial.
        </p>
      </div>

      <ProspectoNuevoForm
        variant="page"
        onCreated={() => router.push("/crm")}
        onCancel={() => router.push("/crm")}
      />
    </div>
  );
}
