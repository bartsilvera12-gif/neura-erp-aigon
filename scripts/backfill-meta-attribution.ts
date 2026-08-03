/**
 * Backfill de atribución Meta (CTWA) sobre `chat_messages.raw_payload` ya guardado.
 *
 * Idempotente: la tabla `chat_conversation_attribution` tiene UNIQUE(conversation_id),
 * así que un INSERT que choque se ignora silenciosamente (segunda corrida = no-op).
 *
 * No reproduce webhooks ni envía mensajes. Solo lee `chat_messages` por empresa
 * y, para cada mensaje con `referral`, inserta atribución por conversación.
 *
 * Variables de entorno (desde .env.local):
 *   - SUPABASE_DB_URL  o  DIRECT_URL  (Postgres URL directo)
 *   - opcional: APP_DB_SCHEMA (default 'neura')
 *   - opcional: BACKFILL_EMPRESA_ID (limita a una empresa)
 *
 * Uso:
 *   npx tsx scripts/backfill-meta-attribution.ts
 *   npx tsx scripts/backfill-meta-attribution.ts --dry-run
 *   npx tsx scripts/backfill-meta-attribution.ts --empresa=<uuid>
 *
 * Salida: JSON con { schema, empresas_procesadas, mensajes_escaneados,
 *                    con_referral, atribuciones_creadas, ignorados_existentes,
 *                    errores }
 */

import { config } from "dotenv";
import path from "node:path";
import pg from "pg";
import { extractMetaAttribution } from "../src/lib/chat/meta-attribution-extractor";

config({ path: path.resolve(process.cwd(), ".env.local") });

const SCHEMA = process.env.APP_DB_SCHEMA?.trim() || "neura";
const URL =
  process.env.SUPABASE_DB_URL?.trim() ||
  process.env.DIRECT_URL?.trim() ||
  process.env.DATABASE_URL?.trim();

const args = process.argv.slice(2);
const DRY = args.includes("--dry-run");
const empresaArg = args.find((a) => a.startsWith("--empresa="))?.split("=")[1]?.trim();
const onlyEmpresa = empresaArg || process.env.BACKFILL_EMPRESA_ID?.trim() || null;

if (!URL) {
  console.error(JSON.stringify({ error: "Falta SUPABASE_DB_URL/DIRECT_URL en .env.local" }));
  process.exit(2);
}

const q = (s: string) => `"${s.replace(/"/g, '""')}"`;

async function main() {
  const client = new pg.Client({
    connectionString: URL,
    ssl: URL!.includes("supabase") || URL!.includes("neura.com.py")
      ? { rejectUnauthorized: false }
      : undefined,
  });
  await client.connect();

  const stats = {
    schema: SCHEMA,
    dry_run: DRY,
    only_empresa: onlyEmpresa,
    empresas_procesadas: 0,
    mensajes_escaneados: 0,
    con_referral: 0,
    atribuciones_creadas: 0,
    ignorados_existentes: 0,
    errores: 0,
    sample_attribuciones: [] as Array<{
      empresa_id: string;
      conversation_id: string;
      meta_ad_id: string | null;
      ctwa: boolean;
    }>,
  };

  try {
    // Verificar que las tablas existen
    const checkQ = `
      SELECT
        to_regclass($1) AS msgs,
        to_regclass($2) AS conv,
        to_regclass($3) AS attr
    `;
    const check = await client.query(checkQ, [
      `${SCHEMA}.chat_messages`,
      `${SCHEMA}.chat_conversations`,
      `${SCHEMA}.chat_conversation_attribution`,
    ]);
    const row = check.rows[0];
    if (!row.msgs || !row.conv) {
      throw new Error(`Faltan tablas requeridas en schema ${SCHEMA}`);
    }
    if (!row.attr && !DRY) {
      throw new Error(
        `Falta ${SCHEMA}.chat_conversation_attribution. Aplicá la migración 20260615120000_chat_conversation_meta_attribution.sql primero.`
      );
    }

    // Empresas a procesar
    const empresasParams: unknown[] = [];
    const empresasFilter = onlyEmpresa ? "WHERE empresa_id = $1" : "";
    if (onlyEmpresa) empresasParams.push(onlyEmpresa);
    const empresas = await client.query(
      `SELECT DISTINCT empresa_id::text AS empresa_id
         FROM ${q(SCHEMA)}.chat_messages
         ${empresasFilter}`,
      empresasParams
    );

    for (const e of empresas.rows as { empresa_id: string }[]) {
      stats.empresas_procesadas++;

      // Cursor de mensajes con referral, ordenados por created_at asc para que el
      // PRIMER mensaje con referral (first wins) sea el que termine atribuyendo.
      // Solo procesamos canales meta (NOT NULL en raw_payload->'referral').
      const msgs = await client.query(
        `SELECT
            m.id::text AS message_id,
            m.empresa_id::text AS empresa_id,
            m.conversation_id::text AS conversation_id,
            m.created_at,
            m.raw_payload,
            c.contact_id::text AS contact_id,
            c.channel_id::text AS channel_id,
            ch.provider AS provider
         FROM ${q(SCHEMA)}.chat_messages m
         JOIN ${q(SCHEMA)}.chat_conversations c ON c.id = m.conversation_id
         LEFT JOIN ${q(SCHEMA)}.chat_channels ch ON ch.id = c.channel_id
         WHERE m.empresa_id = $1
           AND m.raw_payload ? 'referral'
           AND (ch.provider IS NULL OR ch.provider = 'meta' OR ch.provider = '')
         ORDER BY m.conversation_id, m.created_at ASC`,
        [e.empresa_id]
      );

      stats.mensajes_escaneados += msgs.rowCount ?? 0;

      // Procesamos solo el primero por conversación
      const seenConv = new Set<string>();
      for (const r of msgs.rows as {
        message_id: string;
        empresa_id: string;
        conversation_id: string;
        created_at: Date | string;
        raw_payload: unknown;
        contact_id: string | null;
        channel_id: string | null;
      }[]) {
        if (seenConv.has(r.conversation_id)) continue;
        seenConv.add(r.conversation_id);

        const extracted = extractMetaAttribution(r.raw_payload);
        if (!extracted) continue;
        stats.con_referral++;

        if (DRY) {
          if (stats.sample_attribuciones.length < 5) {
            stats.sample_attribuciones.push({
              empresa_id: r.empresa_id,
              conversation_id: r.conversation_id.slice(0, 8) + "…",
              meta_ad_id: extracted.meta_ad_id,
              ctwa: Boolean(extracted.meta_ctwa_clid),
            });
          }
          continue;
        }

        try {
          const ins = await client.query(
            `INSERT INTO ${q(SCHEMA)}.chat_conversation_attribution
              (empresa_id, conversation_id, contact_id, channel_id, provider,
               meta_ad_id, meta_source_type, meta_source_url, meta_ctwa_clid,
               meta_headline, meta_body, meta_media_type,
               meta_image_url, meta_video_url, meta_thumbnail_url,
               utm_source, utm_medium, utm_campaign, utm_content, utm_term,
               first_attribution_payload, first_message_at, source_message_id)
             VALUES
              ($1, $2, $3, $4, 'meta',
               $5, $6, $7, $8,
               $9, $10, $11,
               $12, $13, $14,
               $15, $16, $17, $18, $19,
               $20::jsonb, $21::timestamptz, $22)
             ON CONFLICT (conversation_id) DO NOTHING
             RETURNING id`,
            [
              r.empresa_id,
              r.conversation_id,
              r.contact_id,
              r.channel_id,
              extracted.meta_ad_id,
              extracted.meta_source_type,
              extracted.meta_source_url,
              extracted.meta_ctwa_clid,
              extracted.meta_headline,
              extracted.meta_body,
              extracted.meta_media_type,
              extracted.meta_image_url,
              extracted.meta_video_url,
              extracted.meta_thumbnail_url,
              extracted.utm_source,
              extracted.utm_medium,
              extracted.utm_campaign,
              extracted.utm_content,
              extracted.utm_term,
              JSON.stringify(extracted.first_attribution_payload),
              new Date(r.created_at).toISOString(),
              r.message_id,
            ]
          );
          if (ins.rowCount && ins.rowCount > 0) {
            stats.atribuciones_creadas++;
            if (stats.sample_attribuciones.length < 5) {
              stats.sample_attribuciones.push({
                empresa_id: r.empresa_id,
                conversation_id: r.conversation_id.slice(0, 8) + "…",
                meta_ad_id: extracted.meta_ad_id,
                ctwa: Boolean(extracted.meta_ctwa_clid),
              });
            }
          } else {
            stats.ignorados_existentes++;
          }
        } catch (err) {
          stats.errores++;
          console.error(
            JSON.stringify({
              level: "error",
              empresa_id: r.empresa_id,
              conversation_id: r.conversation_id.slice(0, 8) + "…",
              error: err instanceof Error ? err.message.slice(0, 160) : "unknown",
            })
          );
        }
      }
    }

    console.log(JSON.stringify(stats, null, 2));
  } finally {
    await client.end();
  }
}

main().catch((e) => {
  console.error(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }));
  process.exit(1);
});
