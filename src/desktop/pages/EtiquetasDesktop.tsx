import { Suspense } from "react";
import EtiquetasClient from "@/app/dashboard/etiquetas/EtiquetasClient";

/**
 * Etiquetas Automáticas - FASE 4B.
 * Ruta definitiva. Vista read-only sobre el snapshot shadow en
 * chat_conversation_tag_history. NO oculta conversaciones, NO modifica
 * nada y NO está enlazada al sidebar (acceso solo por URL directa).
 */
export default function EtiquetasPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-slate-400 text-sm animate-pulse">
          Cargando etiquetas…
        </div>
      }
    >
      <EtiquetasClient />
    </Suspense>
  );
}
