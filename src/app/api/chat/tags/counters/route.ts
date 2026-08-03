import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * Etiquetas Automáticas - FASE 5B-FIX.
 * Counters livianos para las cards del módulo Etiquetas:
 *   - suggested_latest_snapshot: filas dry_run del run_key más reciente.
 *   - latest_run_key: identificador del snapshot vigente.
 *   - applied_total: history con action='applied'.
 *   - hidden_by_tag_total: chat_conversations con hidden_by_tag=true.
 *   - reactivated_total: history con action='cleared'.
 *
 * READ-ONLY: solo SELECTs.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth?.empresa_id) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    const pool = getChatPostgresPool();
    if (!pool) {
      return NextResponse.json({ ok: false, error: "Pool no disponible" }, { status: 503 });
    }
    const schema = assertAllowedChatDataSchema(await fetchDataSchemaForEmpresaId(auth.empresa_id));

    // Latest run_key + su conteo
    const latestRes = await pool.query(
      `SELECT metadata->>'run_key' AS run_key, count(*)::int AS n
         FROM "${schema}".chat_conversation_tag_history
        WHERE empresa_id = $1 AND action = 'dry_run' AND metadata ? 'run_key'
        GROUP BY metadata->>'run_key'
        ORDER BY max(created_at) DESC
        LIMIT 1`,
      [auth.empresa_id]
    );
    const latestRunKey = latestRes.rows[0]?.run_key ?? null;
    const suggestedLatestSnapshot = latestRes.rows[0]?.n ?? 0;

    // Counters principales en una sola query
    const restRes = await pool.query(
      `SELECT
         (SELECT count(*) FROM "${schema}".chat_conversation_tag_history
           WHERE empresa_id=$1 AND action='applied')::int AS applied_total,
         (SELECT count(*) FROM "${schema}".chat_conversation_tag_history
           WHERE empresa_id=$1 AND action='cleared')::int AS reactivated_total,
         (SELECT count(*) FROM "${schema}".chat_conversations
           WHERE empresa_id=$1 AND hidden_by_tag=true)::int AS hidden_by_tag_total,
         (SELECT count(*) FROM "${schema}".chat_conversations
           WHERE empresa_id=$1 AND current_tag_id IS NOT NULL)::int AS current_tag_total,
         (SELECT count(*) FROM "${schema}".chat_conversation_tag_history
           WHERE empresa_id=$1 AND action='replaced')::int AS replaced_total`,
      [auth.empresa_id]
    );
    const c = restRes.rows[0];

    // FASE 6D: distribución vigente por tag (fuente: chat_conversations.current_tag_id).
    // Esta es la fuente productiva — NO se basa en snapshots dry_run.
    const byCurrentTagRes = await pool.query(
      `SELECT COALESCE(t.code, 'sin_tag') AS tag_code,
              COALESCE(t.label, '') AS tag_label,
              count(*)::int AS n
         FROM "${schema}".chat_conversations c
         LEFT JOIN "${schema}".chat_conversation_tags t ON t.id = c.current_tag_id
        WHERE c.empresa_id = $1 AND c.current_tag_id IS NOT NULL
        GROUP BY t.code, t.label
        ORDER BY n DESC`,
      [auth.empresa_id]
    );

    // FASE 6D: catálogo de tags disponibles (para poblar dropdowns aunque hoy no haya etiquetadas).
    const availableTagsRes = await pool.query(
      `SELECT code AS tag_code, label AS tag_label, color, sort_order
         FROM "${schema}".chat_conversation_tags
        WHERE empresa_id = $1 AND is_active = true
        ORDER BY sort_order ASC, label ASC`,
      [auth.empresa_id]
    );

    return NextResponse.json({
      ok: true,
      wrote_changes: false,
      counters: {
        suggested_latest_snapshot: suggestedLatestSnapshot,
        latest_run_key: latestRunKey,
        applied_total: c.applied_total,
        replaced_total: c.replaced_total,
        cleared_total: c.reactivated_total,
        reactivated_total: c.reactivated_total,
        hidden_by_tag_total: c.hidden_by_tag_total,
        current_tag_total: c.current_tag_total,
      },
      by_current_tag: byCurrentTagRes.rows,
      available_tags: availableTagsRes.rows,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error interno";
    console.error("[api/chat/tags/counters]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
