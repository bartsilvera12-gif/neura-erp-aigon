import { config } from "dotenv";
import pg from "pg";
import { join } from "path";
config({ path: join(process.cwd(), ".env.local"), quiet: true });

const SCHEMA = "erp_el_papu_store_5ad0bdda";

(async () => {
  const pool = new pg.Pool({
    connectionString: process.env.SUPABASE_DB_URL!.trim(),
    max: 2,
    ssl: { rejectUnauthorized: false },
  });
  try {
    for (const t of [
      "sorteo_entradas",
      "chat_flow_data",
      "chat_flow_sessions",
      "chat_comprobante_validaciones",
      "chat_conversations",
      "chat_contacts",
    ]) {
      const r = await pool.query(
        `SELECT column_name, data_type FROM information_schema.columns
         WHERE table_schema=$1 AND table_name=$2 ORDER BY ordinal_position`,
        [SCHEMA, t]
      );
      console.log(`--- ${t}`);
      for (const c of r.rows) console.log(`  ${c.column_name}  ${c.data_type}`);
    }
  } finally {
    await pool.end();
  }
})();
