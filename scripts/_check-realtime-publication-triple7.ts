/**
 * Verifica READ-ONLY si la publicación `supabase_realtime` incluye las tablas
 * chat_* del tenant `erp_triple_7_82f8a15a`. Solo reporta — NO ejecuta
 * ALTER PUBLICATION ni modifica datos.
 *
 * Uso:
 *   npx tsx scripts/_check-realtime-publication-triple7.ts
 */

import "dotenv/config";
import fs from "node:fs";
import { Client } from "pg";

for (const line of fs.readFileSync(".env.local", "utf8").split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^"|"$/g, "");
}

const TARGET_SCHEMA = "erp_triple_7_82f8a15a";
const TARGET_TABLES = ["chat_conversations", "chat_messages"];

async function main() {
  const url = process.env.SUPABASE_DB_URL ?? process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    console.error("Falta SUPABASE_DB_URL / DIRECT_URL / DATABASE_URL");
    process.exit(2);
  }
  const c = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await c.connect();

  try {
    const pubExists = await c.query(`select pubname from pg_publication where pubname='supabase_realtime'`);
    console.log("publicación supabase_realtime existe:", pubExists.rowCount === 1);

    const inPub = await c.query(
      `select pn.nspname as schemaname, pc.relname as tablename
         from pg_publication p
         join pg_publication_rel pr on pr.prpubid=p.oid
         join pg_class pc on pc.oid=pr.prrelid
         join pg_namespace pn on pn.oid=pc.relnamespace
        where p.pubname='supabase_realtime'
          and pn.nspname=$1
          and pc.relname = any($2::text[])
        order by tablename`,
      [TARGET_SCHEMA, TARGET_TABLES],
    );
    const inSet = new Set(inPub.rows.map((r) => `${r.schemaname}.${r.tablename}`));

    console.log("\nestado por tabla:");
    for (const t of TARGET_TABLES) {
      const fq = `${TARGET_SCHEMA}.${t}`;
      const en_publication = inSet.has(fq);
      console.log(`  - ${fq}: en publicación = ${en_publication}`);
    }

    // Reportar otras tablas chat_* del schema que estén en la publicación
    const extras = await c.query(
      `select pn.nspname as schemaname, pc.relname as tablename
         from pg_publication p
         join pg_publication_rel pr on pr.prpubid=p.oid
         join pg_class pc on pc.oid=pr.prrelid
         join pg_namespace pn on pn.oid=pc.relnamespace
        where p.pubname='supabase_realtime'
          and pn.nspname=$1
          and pc.relname like 'chat_%'
        order by tablename`,
      [TARGET_SCHEMA],
    );
    console.log("\nTABLAS chat_* del schema en la publicación supabase_realtime:");
    if (extras.rowCount === 0) console.log("  (ninguna)");
    for (const r of extras.rows) console.log(`  - ${r.schemaname}.${r.tablename}`);

    // Verificar también REPLICA IDENTITY (relevante para UPDATE/DELETE realtime)
    const replicaIdent = await c.query(
      `select c.relname as tablename,
              case c.relreplident when 'd' then 'default' when 'n' then 'nothing' when 'f' then 'full' when 'i' then 'index' end as replica_identity
         from pg_class c
         join pg_namespace n on n.oid=c.relnamespace
        where n.nspname=$1 and c.relname = any($2::text[])`,
      [TARGET_SCHEMA, TARGET_TABLES],
    );
    console.log("\nREPLICA IDENTITY:");
    for (const r of replicaIdent.rows) console.log(`  - ${r.tablename}: ${r.replica_identity}`);

    console.log("\n[FIN] Reporte read-only — no se modificó nada.");
  } finally {
    await c.end();
  }
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
