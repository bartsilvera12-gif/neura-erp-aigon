import { resolveDataSchemaForCurrentUserServer } from "@/lib/supabase/empresa-data-server";
import { SUPABASE_APP_SCHEMA } from "@/lib/supabase/schema";
import { getDeviceTypeFromRequest } from "@/shared/device/server";
import ProyectosKanbanClient from "./ProyectosKanbanClient";
import ProyectosMobile from "@/mobile/pages/ProyectosMobile";

/** Módulo Proyectos. Mobile no necesita el dataSchema del Kanban — corta antes del await. */
export default async function ProyectosPage() {
  const device = await getDeviceTypeFromRequest();
  if (device === "mobile") {
    return <ProyectosMobile />;
  }

  let dataSchema = SUPABASE_APP_SCHEMA;
  try {
    dataSchema = await resolveDataSchemaForCurrentUserServer();
  } catch (e) {
    console.error("[dashboard/proyectos] resolveDataSchemaForCurrentUserServer", e);
  }
  return <ProyectosKanbanClient dataSchema={dataSchema} />;
}
