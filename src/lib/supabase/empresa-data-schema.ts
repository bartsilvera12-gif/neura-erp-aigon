import { createClient } from "@supabase/supabase-js";
import {
  SUPABASE_APP_SCHEMA,
  resolveEmpresaDataSchema,
  type AppSupabaseClient,
  supabaseServiceRoleClientOptions,
} from "@/lib/supabase/schema";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";

/**
 * Lee `empresas.data_schema` (catálogo en zentra_erp).
 * NULL o vacío → datos de negocio en plantilla `zentra_erp` (empresas legadas).
 * Valor `erp_*` → schema tenant clonado desde zentra_erp.
 */
export async function fetchDataSchemaForEmpresaId(empresaId: string): Promise<string> {
  const catalog = createServiceRoleClient();
  const { data, error } = await catalog
    .from("empresas")
    .select("data_schema")
    .eq("id", empresaId)
    .maybeSingle();

  if (error) {
    console.error("[empresa-data-schema] fetch:", error.message);
    return SUPABASE_APP_SCHEMA;
  }

  return resolveEmpresaDataSchema((data as { data_schema?: string | null } | null)?.data_schema);
}

/** Service role apuntando al esquema de datos operativos de la empresa (chat/omnicanal). */
export function createServiceRoleClientWithDbSchema(schema: string): AppSupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Error("Faltan NEXT_PUBLIC_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY");
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
    db: { schema },
  }) as AppSupabaseClient;
}

/** Resuelve cliente service role: tenant si `data_schema`, si no catálogo zentra_erp. */
export async function createServiceRoleClientForEmpresa(empresaId: string): Promise<AppSupabaseClient> {
  const schema = await fetchDataSchemaForEmpresaId(empresaId);
  if (schema === SUPABASE_APP_SCHEMA) {
    return createServiceRoleClient();
  }
  return createServiceRoleClientWithDbSchema(schema);
}
