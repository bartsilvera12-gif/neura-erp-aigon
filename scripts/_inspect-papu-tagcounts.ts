import { config } from "dotenv";
import pg from "pg";
import { join } from "path";
config({ path: join(process.cwd(), ".env.local"), quiet: true });

const SCHEMA = "erp_el_papu_store_5ad0bdda";
const EMPRESA_ID = "5ad0bdda-f94f-446c-9032-1fedf34e8479";

(async () => {
  const pool = new pg.Pool({
    connectionString: process.env.SUPABASE_DB_URL!.trim(),
    max: 2,
    ssl: { rejectUnauthorized: false },
  });
  try {
    for (const days of [3, 7, 15, 30]) {
      const r = await pool.query(
        `
        SELECT
          count(*) FILTER (WHERE TRUE) AS all_open_pending_idle,
          count(*) FILTER (WHERE c.human_taken_over IS NOT TRUE) AS no_human,
          count(*) FILTER (WHERE c.active_flow_session_id IS NULL) AS no_active_session,
          count(*) FILTER (WHERE c.closed_by_usuario_id IS NULL) AS no_manual_closure,
          count(*) FILTER (WHERE c.human_taken_over IS NOT TRUE
                           AND c.active_flow_session_id IS NULL
                           AND c.closed_by_usuario_id IS NULL) AS all_filters
        FROM "${SCHEMA}".chat_conversations c
        WHERE c.empresa_id = $1
          AND c.status IN ('open','pending')
          AND c.hidden_by_tag = false
          AND c.current_tag_id IS NULL
          AND c.last_message_at < now() - ($2::int * interval '1 day')
        `,
        [EMPRESA_ID, days]
      );
      console.log(`days=${days}: ${JSON.stringify(r.rows[0])}`);
    }
  } finally {
    await pool.end();
  }
})();
