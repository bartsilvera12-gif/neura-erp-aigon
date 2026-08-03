import { config } from "dotenv";
import pg from "pg";
import { join } from "path";
import { runTagDryRun } from "../src/lib/chat/tags/dry-run-shared";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const SCHEMA = "erp_el_papu_store_5ad0bdda";
const EMPRESA_ID = "5ad0bdda-f94f-446c-9032-1fedf34e8479";

(async () => {
  const url = process.env.SUPABASE_DB_URL?.trim();
  if (!url) {
    console.error("Missing SUPABASE_DB_URL");
    process.exit(1);
  }
  const pool = new pg.Pool({
    connectionString: url,
    max: 2,
    ssl: { rejectUnauthorized: false },
  });
  try {
    const buckets = [3, 7, 15, 30];
    console.log("[dryrun-papu-chat-tags] buckets de days_without_activity:", buckets.join(", "));

    for (const days of buckets) {
      // Modo (a) defaults estrictos (excluye sesiones bot activas): así correrá el motor cuando se active.
      const strict = await runTagDryRun(pool, {
        empresaId: EMPRESA_ID,
        schema: SCHEMA,
        daysWithoutActivity: days,
        limit: 100,
        purchaseCondition: "any",
      });
      // Modo (b) potencial: sin excluir sesión bot activa, para dimensionar el universo.
      const potential = await runTagDryRun(pool, {
        empresaId: EMPRESA_ID,
        schema: SCHEMA,
        daysWithoutActivity: days,
        limit: 100,
        purchaseCondition: "any",
        excludeActiveBotSession: false,
      });
      console.log(
        `\n=== bucket days=${days} ===\n` +
          `  [strict-defaults] scanned=${strict.scanned}  candidates=${strict.total_candidates}\n` +
          `    by_category: ${JSON.stringify(strict.by_category)}\n` +
          `    by_suggested_tag: ${JSON.stringify(strict.by_suggested_tag)}\n` +
          `  [potential exclude_active_bot_session=false] scanned=${potential.scanned}  candidates=${potential.total_candidates}\n` +
          `    by_category: ${JSON.stringify(potential.by_category)}\n` +
          `    by_suggested_tag: ${JSON.stringify(potential.by_suggested_tag)}\n` +
          `    sample[0..3]: ${JSON.stringify(potential.sample.slice(0, 3))}`
      );
    }

    // Verificaciones finales: nada debe haberse escrito.
    const verify = await pool.query(
      `
      SELECT
        (SELECT count(*)::int FROM "${SCHEMA}".chat_conversations
          WHERE empresa_id=$1 AND hidden_by_tag=true) AS hidden,
        (SELECT count(*)::int FROM "${SCHEMA}".chat_conversations
          WHERE empresa_id=$1 AND current_tag_id IS NOT NULL) AS tagged,
        (SELECT count(*)::int FROM "${SCHEMA}".chat_conversation_tag_history
          WHERE empresa_id=$1) AS history_rows,
        (SELECT count(*)::int FROM "${SCHEMA}".chat_conversations
          WHERE empresa_id=$1 AND status IN ('open','pending')) AS conv_open_pending,
        (SELECT count(*)::int FROM "${SCHEMA}".chat_conversation_tags
          WHERE empresa_id=$1) AS tags_seed
      `,
      [EMPRESA_ID]
    );
    console.log("\n[verify after dry-run]");
    console.log(JSON.stringify(verify.rows[0], null, 2));

    const v = verify.rows[0] as {
      hidden: number;
      tagged: number;
      history_rows: number;
      conv_open_pending: number;
      tags_seed: number;
    };
    if (v.hidden !== 0 || v.tagged !== 0 || v.history_rows !== 0 || v.tags_seed !== 7) {
      console.error("[dryrun-papu-chat-tags] VERIFICATION FAILED");
      process.exit(2);
    }
    console.log(`\n[dryrun-papu-chat-tags] OK (conv_open_pending=${v.conv_open_pending})`);
  } finally {
    await pool.end();
  }
})();
