import { SUPABASE_APP_SCHEMA } from "@/lib/supabase/schema";

/** Slug + sufijo hex de empresa (p. ej. erp_demo_audit_3b885371). */
const RE_ERP = /^erp_[a-zA-Z0-9_]+$/;
const RE_ER_UUID = /^er_[0-9a-f]{32}$/;

/**
 * Identificador Postgres seguro para tenant: letra inicial + alfanum/_ minúsculas, hasta 63 chars.
 * Cubre todos los slugs de tenant en uso (neura, mariacuevas, ncgconstructora, vastion, triple7, etc.)
 * sin depender de la env var `APP_DB_SCHEMA` resuelta en module load.
 */
const RE_TENANT_SLUG = /^[a-z][a-z0-9_]{0,62}$/;

/**
 * Schemas reservados de Postgres / Supabase que NUNCA deben aceptarse como tenant.
 * Defense-in-depth contra interpolación accidental en SQL chat / CRM.
 */
const RESERVED_SCHEMAS = new Set<string>([
  "pg_catalog",
  "pg_toast",
  "information_schema",
  "auth",
  "storage",
  "realtime",
  "supabase_functions",
  "supabase_migrations",
  "extensions",
  "vault",
  "graphql",
  "graphql_public",
  "pgsodium",
  "pgsodium_masks",
  "_realtime",
  "_analytics",
  "net",
  "cron",
]);

/**
 * Valida nombre de schema Postgres para interpolación segura en SQL (solo datos chat / CRM).
 *
 * Política:
 *  1) Acepta `public` (catálogo legacy) y el `SUPABASE_APP_SCHEMA` resuelto al inicio del proceso.
 *  2) Acepta patrones históricos `erp_*` (slug+hex) y `er_<32hex>` (legacy multi-tenant).
 *  3) Acepta cualquier tenant slug seguro (`[a-z][a-z0-9_]{0,62}`) que NO esté en la lista
 *     reservada de schemas Postgres/Supabase. Esto permite que el ERP de Neura, mariacuevas,
 *     ncgconstructora, etc. funcionen sin depender de que `APP_DB_SCHEMA` esté presente en
 *     runtime — antes la validación rechazaba el schema si la env var no estaba cargada al
 *     iniciar el proceso Node, dejando a la lógica CRM/chat sin poder operar.
 *
 * Seguridad: el regex estricto + denylist explícita preserva la garantía contra SQL injection
 * (es el motivo original del validator). No relaja seguridad — solo amplía cobertura legítima.
 */
export function assertAllowedChatDataSchema(schema: string): string {
  const s = schema.trim();
  if (!s) throw new Error("schema vacío");
  if (s === "public" || s === SUPABASE_APP_SCHEMA) return s;
  if (RE_ERP.test(s) || RE_ER_UUID.test(s)) return s;
  if (RE_TENANT_SLUG.test(s) && !RESERVED_SCHEMAS.has(s)) return s;
  throw new Error(`schema no permitido: ${s}`);
}

/**
 * Decide si un schema tenant probablemente NO esté expuesto en PostgREST (`Exposed schemas`).
 * `public`, `SUPABASE_APP_SCHEMA` y schemas tenant "modernos" (slugs directos como `neura`)
 * normalmente sí están expuestos. Los legacy `erp_*` / `er_<uuid>` históricamente no se
 * exponían en PostgREST y se accedían por PG directo (shim) — esos sí siguen marcados como
 * "unexposed" para conservar el fallback existente.
 */
export function isLikelyUnexposedTenantChatSchema(schema: string): boolean {
  const s = schema.trim();
  if (!s || s === SUPABASE_APP_SCHEMA || s === "public") return false;
  return RE_ERP.test(s) || RE_ER_UUID.test(s);
}
