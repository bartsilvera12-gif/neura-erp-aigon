/**
 * Aplica la migración del módulo asistente reescribiendo el schema destino.
 *
 * La migración base (supabase/migrations/20260605120000_assistant_module.sql) usa
 * `zentra_erp`; cada instancia puede tener otro schema de datos (p. ej. `neura`).
 *
 * Uso:
 *   node scripts/apply-assistant-module.cjs                 → schema de APP_DB_SCHEMA o zentra_erp
 *   node scripts/apply-assistant-module.cjs neura           → schema explícito
 *   node scripts/apply-assistant-module.cjs neura --print   → imprime el SQL (para SQL editor), no aplica
 *
 * Conexión: SUPABASE_DB_URL de .env.local (igual que apply-migration-file-pg.cjs).
 */
require("dotenv").config({ path: ".env.local", quiet: true });
const { readFileSync } = require("node:fs");
const path = require("node:path");

const MIGRATION = path.join(
  __dirname,
  "..",
  "supabase",
  "migrations",
  "20260605120000_assistant_module.sql"
);

const args = process.argv.slice(2).filter((a) => a !== "--print");
const printOnly = process.argv.includes("--print");
const schema = (args[0] || process.env.APP_DB_SCHEMA || "zentra_erp").trim();

if (!/^[a-z_][a-z0-9_]{0,62}$/.test(schema)) {
  console.error(`Schema inválido: "${schema}"`);
  process.exit(1);
}

const sql = readFileSync(MIGRATION, "utf8").replace(/zentra_erp/g, schema);

if (printOnly) {
  process.stdout.write(sql);
  process.exit(0);
}

const url = process.env.SUPABASE_DB_URL?.trim();
if (!url) {
  console.error("Falta SUPABASE_DB_URL en .env.local (o usá --print y pegalo en el SQL editor)");
  process.exit(1);
}

const { Client } = require("pg");

(async () => {
  const client = new Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    console.log(`Aplicando módulo asistente en schema "${schema}"...`);
    await client.query(sql);
    console.log("✓ Migración aplicada.");
  } finally {
    await client.end();
  }
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
