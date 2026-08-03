import { config } from "dotenv";
import pg from "pg";
import { join } from "path";
import { readFileSync } from "fs";

config({ path: join(process.cwd(), ".env.local"), quiet: true });

const SCHEMA = "erp_el_papu_store_5ad0bdda";
const EMPRESA_ID = "5ad0bdda-f94f-446c-9032-1fedf34e8479";
const MIGRATION_FILE = "supabase/migrations/20260525120000_chat_conversation_tags_papu_store.sql";

async function countsSnapshot(pool: pg.Pool) {
  const q = await pool.query(
    `
    SELECT
      (SELECT count(*) FROM "${SCHEMA}".chat_conversations
        WHERE empresa_id=$1 AND status IN ('open','pending')) AS conv_open_pending,
      (SELECT count(*) FROM "${SCHEMA}".chat_conversations
        WHERE empresa_id=$1) AS conv_total,
      (SELECT count(*) FROM "${SCHEMA}".chat_messages
        WHERE empresa_id=$1) AS messages
    `,
    [EMPRESA_ID]
  );
  return q.rows[0];
}

async function postCounts(pool: pg.Pool) {
  const tagsTable = await pool.query(
    `SELECT count(*)::int AS rows FROM "${SCHEMA}".chat_conversation_tags WHERE empresa_id=$1`,
    [EMPRESA_ID]
  );
  const hidden = await pool.query(
    `SELECT count(*)::int AS rows FROM "${SCHEMA}".chat_conversations
       WHERE empresa_id=$1 AND hidden_by_tag=true`,
    [EMPRESA_ID]
  );
  const currentTag = await pool.query(
    `SELECT count(*)::int AS rows FROM "${SCHEMA}".chat_conversations
       WHERE empresa_id=$1 AND current_tag_id IS NOT NULL`,
    [EMPRESA_ID]
  );
  const history = await pool.query(
    `SELECT count(*)::int AS rows FROM "${SCHEMA}".chat_conversation_tag_history WHERE empresa_id=$1`,
    [EMPRESA_ID]
  );
  const rules = await pool.query(
    `SELECT count(*)::int AS rows FROM "${SCHEMA}".chat_conversation_tag_rules WHERE empresa_id=$1`,
    [EMPRESA_ID]
  );
  return {
    tags: tagsTable.rows[0].rows,
    rules: rules.rows[0].rows,
    history: history.rows[0].rows,
    hidden_by_tag: hidden.rows[0].rows,
    current_tag_id_not_null: currentTag.rows[0].rows,
  };
}

(async () => {
  const url = process.env.SUPABASE_DB_URL?.trim();
  if (!url) {
    console.error("Missing SUPABASE_DB_URL");
    process.exit(1);
  }
  const sql = readFileSync(MIGRATION_FILE, "utf8");
  const pool = new pg.Pool({
    connectionString: url,
    max: 2,
    ssl: { rejectUnauthorized: false },
  });
  try {
    console.log("[apply-migration-papu-tags] PRE snapshot:");
    const pre = await countsSnapshot(pool);
    console.log(JSON.stringify(pre, null, 2));

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(sql);
      await client.query("COMMIT");
      console.log("[apply-migration-papu-tags] migration committed");
    } catch (e) {
      await client.query("ROLLBACK").catch(() => {});
      throw e;
    } finally {
      client.release();
    }

    console.log("[apply-migration-papu-tags] POST snapshot:");
    const post = await countsSnapshot(pool);
    console.log(JSON.stringify(post, null, 2));

    console.log("[apply-migration-papu-tags] POST tags/rules/history/hidden:");
    const tags = await postCounts(pool);
    console.log(JSON.stringify(tags, null, 2));

    // Validaciones
    const ok =
      String(pre.conv_open_pending) === String(post.conv_open_pending) &&
      String(pre.conv_total) === String(post.conv_total) &&
      tags.tags === 7 &&
      tags.rules === 0 &&
      tags.history === 0 &&
      tags.hidden_by_tag === 0 &&
      tags.current_tag_id_not_null === 0;

    if (!ok) {
      console.error("[apply-migration-papu-tags] VALIDATION FAILED");
      process.exit(2);
    }
    console.log("[apply-migration-papu-tags] OK");
  } finally {
    await pool.end();
  }
})();
