import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * Etiquetas Automáticas - FASE 4B.
 * GET: lista reglas de chat_conversation_tag_rules (JOIN tags) para la empresa.
 * PATCH: actualiza UN subset de campos. SHADOW LOCK ESTRICTO:
 *  - El body NUNCA acepta `shadow_mode`.
 *  - Antes y después del UPDATE se verifica que shadow_mode = true; si no,
 *    se aborta dentro de la transacción.
 *  - NO se permite cambiar tag_id, empresa_id, purchase_condition, source.
 */

const MAX_BODY_BYTES = 4 * 1024;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUuid(v: unknown): v is string {
  return typeof v === "string" && UUID_RE.test(v.trim());
}

function clampInt(value: unknown, min: number, max: number): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  const n = Math.trunc(value);
  if (n < min || n > max) return null;
  return n;
}

function sanitizeNodeCodes(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const out: string[] = [];
  for (const item of value) {
    if (typeof item !== "string") continue;
    const t = item.trim();
    if (!t) continue;
    if (t.length > 64) continue;
    if (!/^[a-zA-Z0-9_:-]+$/.test(t)) continue;
    if (!out.includes(t)) out.push(t);
    if (out.length >= 16) break;
  }
  return out;
}

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
    const schema = assertAllowedChatDataSchema(
      await fetchDataSchemaForEmpresaId(auth.empresa_id)
    );

    const url = new URL(request.url);
    const channelIdRaw = url.searchParams.get("channel_id");
    const channelId = channelIdRaw && isUuid(channelIdRaw) ? channelIdRaw : null;
    const sourceRaw = (url.searchParams.get("source") || "fase_3b_shadow_rules").trim();
    const source = sourceRaw.length > 0 && sourceRaw.length <= 64 ? sourceRaw : "fase_3b_shadow_rules";

    const params: unknown[] = [auth.empresa_id, source];
    const where: string[] = [
      `r.empresa_id = $1`,
      `(r.config->>'source' IS NULL OR r.config->>'source' = $2)`,
    ];
    if (channelId) {
      params.push(channelId);
      where.push(`r.channel_id = $${params.length}::uuid`);
    } else {
      where.push(`r.channel_id IS NULL`);
    }

    const sql = `
      SELECT r.id::text                       AS id,
             r.name                           AS name,
             r.tag_id::text                   AS tag_id,
             COALESCE(t.code, '')             AS tag_code,
             COALESCE(t.label, '')            AS tag_label,
             r.purchase_condition             AS purchase_condition,
             r.days_without_activity          AS days_without_activity,
             r.priority                       AS priority,
             r.is_active                      AS is_active,
             r.shadow_mode                    AS shadow_mode,
             r.channel_id::text               AS channel_id,
             r.exclude_human_taken_over       AS exclude_human_taken_over,
             r.exclude_active_bot_session     AS exclude_active_bot_session,
             r.exclude_manual_closure         AS exclude_manual_closure,
             r.recontact_exclusion            AS recontact_exclusion,
             r.config                         AS config
        FROM "${schema}".chat_conversation_tag_rules r
        LEFT JOIN "${schema}".chat_conversation_tags t ON t.id = r.tag_id
       WHERE ${where.join(" AND ")}
       ORDER BY r.priority ASC NULLS LAST, t.code ASC, r.name ASC
    `;
    const res = await pool.query(sql, params);

    return NextResponse.json({
      ok: true,
      wrote_changes: false,
      shadow_locked: true,
      source,
      channel_id: channelId,
      rules: res.rows,
    });
  } catch (e) {
    console.error("[api/chat/tags/rules][GET]", e);
    const msg = e instanceof Error ? e.message : "Error interno";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth?.empresa_id) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    const pool = getChatPostgresPool();
    if (!pool) {
      return NextResponse.json({ ok: false, error: "Pool no disponible" }, { status: 503 });
    }
    const schema = assertAllowedChatDataSchema(
      await fetchDataSchemaForEmpresaId(auth.empresa_id)
    );

    // Body con cap de tamaño.
    const raw = await request.text();
    if (raw.length > MAX_BODY_BYTES) {
      return NextResponse.json(
        { ok: false, error: "Body demasiado grande" },
        { status: 413 }
      );
    }
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return NextResponse.json({ ok: false, error: "JSON inválido" }, { status: 400 });
    }

    if (!isUuid(body.id)) {
      return NextResponse.json({ ok: false, error: "id inválido" }, { status: 400 });
    }
    const ruleId = (body.id as string).trim();

    // Campos prohibidos: rechazar si vienen explícitos.
    const FORBIDDEN = ["tag_id", "empresa_id", "purchase_condition", "shadow_mode", "source"];
    for (const k of FORBIDDEN) {
      if (k in body) {
        return NextResponse.json(
          { ok: false, error: `Campo no editable: ${k}` },
          { status: 400 }
        );
      }
    }

    const sets: string[] = [];
    const params: unknown[] = [];
    function add(field: string, val: unknown) {
      params.push(val);
      sets.push(`${field} = $${params.length}`);
    }

    if (typeof body.is_active === "boolean") add("is_active", body.is_active);

    if ("days_without_activity" in body) {
      const v = clampInt(body.days_without_activity, 1, 365);
      if (v === null) {
        return NextResponse.json(
          { ok: false, error: "days_without_activity fuera de rango (1..365)" },
          { status: 400 }
        );
      }
      add("days_without_activity", v);
    }

    if ("priority" in body) {
      const v = clampInt(body.priority, 0, 1000);
      if (v === null) {
        return NextResponse.json(
          { ok: false, error: "priority fuera de rango (0..1000)" },
          { status: 400 }
        );
      }
      add("priority", v);
    }

    if (typeof body.exclude_human_taken_over === "boolean") {
      add("exclude_human_taken_over", body.exclude_human_taken_over);
    }
    if (typeof body.exclude_active_bot_session === "boolean") {
      add("exclude_active_bot_session", body.exclude_active_bot_session);
    }
    if (typeof body.exclude_manual_closure === "boolean") {
      add("exclude_manual_closure", body.exclude_manual_closure);
    }

    // config merge: critical_node_grace_hours / critical_node_codes.
    const configPatch: Record<string, unknown> = {};
    if ("critical_node_grace_hours" in body) {
      const v = clampInt(body.critical_node_grace_hours, 0, 720);
      if (v === null) {
        return NextResponse.json(
          { ok: false, error: "critical_node_grace_hours fuera de rango (0..720)" },
          { status: 400 }
        );
      }
      configPatch.critical_node_grace_hours = v;
    }
    if ("critical_node_codes" in body) {
      const v = sanitizeNodeCodes(body.critical_node_codes);
      if (v === null) {
        return NextResponse.json(
          { ok: false, error: "critical_node_codes inválido (array de strings)" },
          { status: 400 }
        );
      }
      configPatch.critical_node_codes = v;
    }
    const hasConfigPatch = Object.keys(configPatch).length > 0;
    if (hasConfigPatch) {
      params.push(JSON.stringify(configPatch));
      sets.push(
        `config = COALESCE(config, '{}'::jsonb) || $${params.length}::jsonb`
      );
    }

    if (sets.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Sin campos para actualizar" },
        { status: 400 }
      );
    }

    // params actuales son los SETs. Agregamos id + empresa_id como WHERE.
    params.push(ruleId);
    const idIdx = params.length;
    params.push(auth.empresa_id);
    const empresaIdx = params.length;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");

      // Pre-check shadow_mode dentro de la TX.
      const pre = await client.query(
        `SELECT id::text AS id, shadow_mode
           FROM "${schema}".chat_conversation_tag_rules
          WHERE id = $1::uuid AND empresa_id = $2::uuid
          FOR UPDATE`,
        [ruleId, auth.empresa_id]
      );
      if (pre.rowCount === 0) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { ok: false, error: "Regla no encontrada" },
          { status: 404 }
        );
      }
      if (pre.rows[0].shadow_mode !== true) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          {
            ok: false,
            error: "Regla fuera de modo shadow; edición bloqueada en esta fase",
          },
          { status: 409 }
        );
      }

      const updateSql = `
        UPDATE "${schema}".chat_conversation_tag_rules
           SET ${sets.join(", ")},
               updated_at = NOW()
         WHERE id = $${idIdx}::uuid
           AND empresa_id = $${empresaIdx}::uuid
           AND shadow_mode = true
        RETURNING id::text AS id, shadow_mode
      `;
      const upd = await client.query(updateSql, params);
      if (upd.rowCount === 0 || upd.rows[0].shadow_mode !== true) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { ok: false, error: "UPDATE rechazado por shadow lock" },
          { status: 409 }
        );
      }

      // Post-verification dentro de la TX.
      const post = await client.query(
        `SELECT shadow_mode
           FROM "${schema}".chat_conversation_tag_rules
          WHERE id = $1::uuid AND empresa_id = $2::uuid`,
        [ruleId, auth.empresa_id]
      );
      if (post.rowCount === 0 || post.rows[0].shadow_mode !== true) {
        await client.query("ROLLBACK");
        return NextResponse.json(
          { ok: false, error: "Verificación post-update falló" },
          { status: 500 }
        );
      }

      // Releer regla completa para devolverla al cliente.
      const finalRes = await client.query(
        `SELECT r.id::text                       AS id,
                r.name                           AS name,
                r.tag_id::text                   AS tag_id,
                COALESCE(t.code, '')             AS tag_code,
                COALESCE(t.label, '')            AS tag_label,
                r.purchase_condition             AS purchase_condition,
                r.days_without_activity          AS days_without_activity,
                r.priority                       AS priority,
                r.is_active                      AS is_active,
                r.shadow_mode                    AS shadow_mode,
                r.channel_id::text               AS channel_id,
                r.exclude_human_taken_over       AS exclude_human_taken_over,
                r.exclude_active_bot_session     AS exclude_active_bot_session,
                r.exclude_manual_closure         AS exclude_manual_closure,
                r.recontact_exclusion            AS recontact_exclusion,
                r.config                         AS config
           FROM "${schema}".chat_conversation_tag_rules r
           LEFT JOIN "${schema}".chat_conversation_tags t ON t.id = r.tag_id
          WHERE r.id = $1::uuid AND r.empresa_id = $2::uuid`,
        [ruleId, auth.empresa_id]
      );

      await client.query("COMMIT");

      return NextResponse.json({
        ok: true,
        shadow_locked: true,
        rule: finalRes.rows[0] ?? null,
      });
    } catch (txErr) {
      try {
        await client.query("ROLLBACK");
      } catch {
        /* ignore */
      }
      throw txErr;
    } finally {
      client.release();
    }
  } catch (e) {
    console.error("[api/chat/tags/rules][PATCH]", e);
    const msg = e instanceof Error ? e.message : "Error interno";
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}
