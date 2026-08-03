import { Suspense } from "react";
import { loadFinalizedFilterOptions } from "@/lib/chat/finalized-closures-actions";
import FinalizedClosuresClient from "./FinalizedClosuresClient";
import { getDeviceTypeFromRequest } from "@/shared/device/server";
import ConversacionesFinalizadasMobile from "@/mobile/pages/ConversacionesFinalizadasMobile";

export default async function ConversacionesFinalizadasPage() {
  // Mobile: placeholder. No carga las opciones de filtro pesadas.
  const device = await getDeviceTypeFromRequest();
  if (device === "mobile") {
    return <ConversacionesFinalizadasMobile />;
  }

  const filterOptions = await loadFinalizedFilterOptions();
  return (
    <Suspense fallback={<div className="p-8 text-slate-400 text-sm animate-pulse">Cargando finalizadas…</div>}>
      <FinalizedClosuresClient filterOptions={filterOptions} />
    </Suspense>
  );
}
