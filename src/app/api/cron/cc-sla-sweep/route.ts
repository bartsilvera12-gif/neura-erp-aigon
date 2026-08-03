import { NextRequest, NextResponse } from "next/server";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

/**
 * Cron de ESCALAMIENTO POR SLA del Contact Center. Protegido por `CRON_SECRET`.
 *
 * Busca conversaciones con `sla_due_at` vencido, sin primera respuesta humana
 * (`first_human_response_at IS NULL`), abiertas (open/pending) y asignadas, y las
 * reasigna al siguiente agente disponible vía la RPC atómica `public.cc_reassign_on_sla`.
 * Si no hay otro agente o se supera `max_reassignments`, quedan unassigned visibles.
 *
 * No imprime secretos. Procesa por lotes. Idempotente: la RPC re-valida bajo lock.
 *
 * Programar cada 1 min (Coolify scheduler):  `* * * * *`.
 * Seguridad: `Authorization: Bearer <CRON_SECRET>`. Sin secret válido → 401.
 *
 * Query params:
 *  - `dryRun=1`        → solo cuenta candidatas, no reasigna.
 *  - `limit=N`         → tope de candidatas por empresa (default 200, máx 1000).
 */

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return false;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${expected}`;
}

function parseBool(v: string | null): boolean {
  const s = (v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

function resolveSchema(): string {
  const raw = (process.env.APP_DB_SCHEMA ?? "neura").trim();
  return assertAllowedChatDataSchema(raw);
}

async function resolverEmpresaIds(schema: string): Promise<string[]> {
  const fromEnv = (process.env.CONTACT_CENTER_EMPRESA_IDS ?? process.env.FACTURACION_MENSUAL_EMPRESA_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;
  const pool = getChatPostgresPool();
  if (!pool) return [];
  const r = await pool.query(`SELECT id::text AS id FROM "${schema}".empresas`);
  return (r.rows as Array<{ id: string }>).map((x) => x.id).filter(Boolean);
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "no autorizado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = parseBool(url.searchParams.get("dryRun"));
  const limit = Math.min(1000, Math.max(1, parseInt(url.searchParams.get("limit") ?? "200", 10) || 200));

  let schema: string;
  try {
    schema = resolveSchema();
  } catch (e) {
    return NextResponse.json({ ok: false, error: `schema inválido: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  }

  const pool = getChatPostgresPool();
  if (!pool) {
    return NextResponse.json({ ok: false, error: "pool PG no disponible" }, { status: 500 });
  }

  let empresaIds: string[];
  try {
    empresaIds = await resolverEmpresaIds(schema);
  } catch (e) {
    return NextResponse.json({ ok: false, error: `No se pudieron resolver empresas: ${e instanceof Error ? e.message : e}` }, { status: 500 });
  }
  if (empresaIds.length === 0) {
    return NextResponse.json({ ok: false, error: "Sin empresas objetivo" }, { status: 500 });
  }

  const startedAt = new Date().toISOString();
  let scanned = 0;
  let reassigned = 0;
  let unassigned = 0;
  let errors = 0;
  const detail: Array<Record<string, unknown>> = [];

  for (const empresaId of empresaIds) {
    let candidates: string[] = [];
    try {
      const r = await pool.query(
        `SELECT id::text AS id
           FROM "${schema}".chat_conversations
          WHERE empresa_id = $1::uuid
            AND assigned_agent_id IS NOT NULL
            AND first_human_response_at IS NULL
            AND status IN ('open','pending')
            AND sla_due_at IS NOT NULL
            AND sla_due_at < now()
          ORDER BY sla_due_at ASC
          LIMIT $2`,
        [empresaId, limit]
      );
      candidates = (r.rows as Array<{ id: string }>).map((x) => x.id);
    } catch (e) {
      errors += 1;
      detail.push({ empresa_id_short: empresaId.slice(0, 8), error: e instanceof Error ? e.message : String(e) });
      continue;
    }

    scanned += candidates.length;
    if (dryRun) {
      detail.push({ empresa_id_short: empresaId.slice(0, 8), candidates: candidates.length, dry_run: true });
      continue;
    }

    for (const conversationId of candidates) {
      try {
        const res = await pool.query(
          `SELECT public.cc_reassign_on_sla($1, $2::uuid, $3::uuid) AS r`,
          [schema, empresaId, conversationId]
        );
        const row = (res.rows[0] as { r?: { reassigned?: boolean; reason?: string } } | undefined)?.r;
        if (row?.reassigned) reassigned += 1;
        else if (row?.reason === "max_reassign_unassigned" || row?.reason === "no_other_agent") unassigned += 1;
      } catch (e) {
        errors += 1;
        console.error("[cron][cc-sla-sweep] reassign falló", {
          empresa_id_short: empresaId.slice(0, 8),
          conversation_id_short: conversationId.slice(0, 8),
          error: e instanceof Error ? e.message : String(e),
        });
      }
    }
  }

  console.info("[cron][cc-sla-sweep]", { scanned, reassigned, unassigned, errors, dry_run: dryRun });

  return NextResponse.json({
    ok: true,
    started_at: startedAt,
    ended_at: new Date().toISOString(),
    dry_run: dryRun,
    empresas: empresaIds.length,
    scanned,
    reassigned,
    unassigned,
    errors,
    detail,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
