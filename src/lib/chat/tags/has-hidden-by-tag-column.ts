import type { Pool } from "pg";

/**
 * Etiquetas Automáticas - FASE 5B-INBOX.
 *
 * Guard multi-tenant: detecta si el schema dado expone la columna
 * `chat_conversations.hidden_by_tag`. Solo los tenants que recibieron la
 * migración de etiquetas (hoy solo `erp_el_papu_store_5ad0bdda`) la tienen.
 *
 * READ-ONLY (consulta `information_schema.columns`) y cacheado por schema en
 * memoria del proceso, así no hay query extra por cada listado del inbox.
 * En Vercel serverless el cache se conserva mientras el contenedor está
 * caliente y se reinicia naturalmente en un cold start.
 */

const cache = new Map<string, boolean>();

export function clearHasHiddenByTagColumnCache(schema?: string): void {
  if (schema) cache.delete(schema);
  else cache.clear();
}

export async function schemaHasHiddenByTagColumn(pool: Pool, schema: string): Promise<boolean> {
  if (!schema) return false;
  if (cache.has(schema)) return cache.get(schema) === true;
  try {
    const r = await pool.query(
      `SELECT 1
         FROM information_schema.columns
        WHERE table_schema = $1
          AND table_name = 'chat_conversations'
          AND column_name = 'hidden_by_tag'
        LIMIT 1`,
      [schema]
    );
    const has = (r.rowCount ?? 0) > 0;
    cache.set(schema, has);
    return has;
  } catch {
    // Ante cualquier error, ser conservador y no aplicar el filtro.
    cache.set(schema, false);
    return false;
  }
}
