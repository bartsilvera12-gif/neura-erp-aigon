"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getGastos } from "@/lib/gastos/actions";
import GastoForm from "@/components/gastos/GastoForm";
import type { Gasto } from "@/lib/gastos/actions";

export default function EditarGastoPage() {
  const router = useRouter();
  const params = useParams();
  const id = String(params?.id ?? "");
  const [gasto, setGasto] = useState<Gasto | null>(null);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    getGastos()
      .then((lista) => setGasto(lista.find((g) => g.id === id) ?? null))
      .catch(() => setGasto(null))
      .finally(() => setCargando(false));
  }, [id]);

  const backLink = (
    <button
      onClick={() => router.push("/gastos")}
      className="text-sm font-medium text-[#4FAEB2] hover:text-[#3F8E91] hover:underline"
    >
      ← Volver
    </button>
  );

  if (cargando) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div className="flex items-center gap-3">{backLink}</div>
        <div className="flex items-center justify-center gap-3 py-20 text-sm text-slate-500">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#4FAEB2]" />
          Cargando gasto…
        </div>
      </div>
    );
  }

  if (!gasto) {
    return (
      <div className="mx-auto max-w-3xl space-y-6 p-6">
        <div className="flex items-center gap-3">{backLink}</div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          Gasto no encontrado
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6 p-6">
      <div className="flex items-center gap-3">{backLink}</div>
      <div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
          />
          <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4FAEB2]">Editar</p>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          {gasto.categoria || gasto.descripcion || "Gasto"}
        </h1>
        <p className="mt-1 text-sm text-slate-500">Actualizá los datos del gasto.</p>
      </div>
      <GastoForm gasto={gasto} variant="page" onSaved={() => router.push("/gastos")} />
    </div>
  );
}
