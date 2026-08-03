import { resolveDataSchemaForCurrentUserServer } from "@/lib/supabase/empresa-data-server";
import { SUPABASE_APP_SCHEMA } from "@/lib/supabase/schema";
import ProyectoDetalleClient from "./ProyectoDetalleClient";

export default async function ProyectoDetallePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  let dataSchema = SUPABASE_APP_SCHEMA;
  try {
    dataSchema = await resolveDataSchemaForCurrentUserServer();
  } catch (e) {
    console.error("[dashboard/proyectos/[id]] resolveDataSchemaForCurrentUserServer", e);
  }
  return <ProyectoDetalleClient params={params} dataSchema={dataSchema} />;
}
