/**
 * Endpoint diagnóstico de versión — read-only, sin secretos.
 * Sirve para detectar si un deploy concreto ya está activo.
 * Devuelve un marcador estático + flags de presencia de env vars críticas
 * (sólo true/false, sin valores).
 *
 * Seguro: no expone tokens, no requiere auth, sólo confirma estado de runtime.
 */
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    marker: "diag-0bb441e-runtime-fix",
    runtime_env_flags: {
      APP_DB_SCHEMA_set: Boolean(process.env.APP_DB_SCHEMA?.trim()),
      SUPABASE_DB_URL_set: Boolean(process.env.SUPABASE_DB_URL?.trim()),
      DIRECT_URL_set: Boolean(process.env.DIRECT_URL?.trim()),
      SUPABASE_SERVICE_ROLE_KEY_set: Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()),
    },
    resolved_app_schema_at_module_load: process.env.APP_DB_SCHEMA?.trim() || "zentra_erp",
    process_uptime_seconds: Math.floor(process.uptime()),
    timestamp: new Date().toISOString(),
  });
}
