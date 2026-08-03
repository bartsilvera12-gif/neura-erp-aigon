import { redirect } from "next/navigation";

/**
 * Ruta legacy de FASE 4A. Redirige a la ruta definitiva de FASE 4B.
 */
export default function EtiquetasPreviewRedirect() {
  redirect("/dashboard/etiquetas");
}
