import { NextRequest, NextResponse } from "next/server";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { runCampaignProcessOnce } from "@/lib/campaigns/campaign-job-service";
import { SUPABASE_APP_SCHEMA } from "@/lib/supabase/schema";
import type { SupabaseAdmin } from "@/lib/chat/types";

/**
 * Cron de DISPATCH de campañas masivas de WhatsApp. Protegido por `CRON_SECRET`.
 *
 * Drena las campañas en estado `sending` procesando lotes con `runCampaignProcessOnce`
 * (el mismo motor que usa el navegador, con reclamo ATÓMICO de destinatarios → nunca
 * envía dos veces el mismo número, aunque coexista con el poller del navegador).
 *
 * Motivo: antes la campaña solo avanzaba mientras alguien tenía abierta la pantalla de
 * detalle (el poller vivía en el navegador). Con este cron la campaña avanza sola.
 *
 * Programar cada ~1 min: `* * * * *` apuntando a
 *   GET /api/cron/campanas-dispatch  con  `Authorization: Bearer <CRON_SECRET>`.
 *
 * Query params:
 *  - `dryRun=1`         → no procesa; solo lista campañas `sending` y su cola pendiente.
 *  - `batch_size=N`     → tamaño de lote (default 25, máx 100).
 *  - `max_batches=N`    → máx lotes por campaña por invocación (default 40).
 *  - `max_ms=N`         → presupuesto de tiempo por invocación en ms (default 50000).
 *  - `campaign_id=uuid` → (QA) limitar a una sola campaña.
 *  - `empresa_ids=uuid,uuid` → (QA) limitar a esas empresas.
 *
 * Seguridad: sin `Bearer <CRON_SECRET>` válido → 401.
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

function parseIntParam(v: string | null, def: number, min: number, max: number): number {
  const n = Number.parseInt((v ?? "").trim(), 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

async function resolverEmpresaIds(override?: string): Promise<string[]> {
  const fromParam = (override ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (fromParam.length > 0) return fromParam;

  const fromEnv = (process.env.CAMPANAS_DISPATCH_EMPRESA_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;

  // Instancia single-client: la empresa está fijada por env (mismo id que usa el
  // webhook de WhatsApp). Es la fuente más segura y evita tocar el tenant equivocado.
  const single = (process.env.WHATSAPP_DEFAULT_EMPRESA_ID ?? "").trim();
  if (single) return [single];

  // Fallback: resolver desde el schema del cliente (NEURA_CLIENT_SCHEMA), NO desde
  // un "neura" por defecto que pertenecería a otro tenant.
  const schemaRaw = SUPABASE_APP_SCHEMA.trim();
  const schema = /^[a-z0-9_]+$/.test(schemaRaw) ? schemaRaw : "";
  if (!schema) return [];
  const pool = getChatPostgresPool();
  if (!pool) return [];
  const r = await pool.query(`SELECT id::text AS id FROM "${schema}".empresas`);
  return (r.rows as Array<{ id: string }>).map((x) => x.id).filter(Boolean);
}

type CampaignDispatchResult = {
  campaign_id: string;
  batches: number;
  processed: number;
  remaining_queued: number;
  completed: boolean;
  error?: string;
};

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "no autorizado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = parseBool(url.searchParams.get("dryRun"));
  const batchSize = parseIntParam(url.searchParams.get("batch_size"), 25, 1, 100);
  const maxBatches = parseIntParam(url.searchParams.get("max_batches"), 40, 1, 400);
  const maxMs = parseIntParam(url.searchParams.get("max_ms"), 50_000, 1_000, 120_000);
  const onlyCampaignId = (url.searchParams.get("campaign_id") ?? "").trim() || null;
  const empresaOverride = url.searchParams.get("empresa_ids") ?? undefined;

  let empresaIds: string[];
  try {
    empresaIds = await resolverEmpresaIds(empresaOverride);
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `No se pudieron resolver empresas: ${e instanceof Error ? e.message : e}` },
      { status: 500 }
    );
  }
  if (empresaIds.length === 0) {
    return NextResponse.json({ ok: false, error: "Sin empresas objetivo" }, { status: 500 });
  }

  const startedAt = Date.now();
  const deadline = startedAt + maxMs;
  const resultados: Array<{ empresa_id: string; campaigns: CampaignDispatchResult[]; error?: string }> = [];

  for (const empresaId of empresaIds) {
    try {
      const sb = await getChatServiceClientForEmpresa(empresaId);

      let q = sb
        .from("chat_campaigns")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("status", "sending")
        .limit(50);
      if (onlyCampaignId) q = q.eq("id", onlyCampaignId);
      const { data: campaigns, error: cErr } = await q;
      if (cErr) throw new Error(cErr.message);

      const campaignRows = (campaigns ?? []) as Array<{ id: string }>;
      const perCampaign: CampaignDispatchResult[] = [];

      for (const c of campaignRows) {
        if (dryRun) {
          const { count } = await sb
            .from("chat_campaign_recipients")
            .select("id", { count: "exact", head: true })
            .eq("empresa_id", empresaId)
            .eq("campaign_id", c.id)
            .eq("status", "queued");
          perCampaign.push({
            campaign_id: c.id,
            batches: 0,
            processed: 0,
            remaining_queued: count ?? 0,
            completed: false,
          });
          continue;
        }

        let batches = 0;
        let processed = 0;
        let remainingQueued = 0;
        let completed = false;
        let error: string | undefined;

        try {
          while (batches < maxBatches && Date.now() < deadline) {
            const res = await runCampaignProcessOnce({
              supabase: sb as unknown as SupabaseAdmin,
              empresaId,
              campaignId: c.id,
              batchSize,
            });
            batches += 1;
            processed += res.processed;
            remainingQueued = res.remainingQueued;
            if (res.campaignCompleted || res.remainingQueued === 0) {
              completed = res.campaignCompleted;
              break;
            }
            // Si el lote no procesó nada (p.ej. otra corrida se llevó todo), evitar bucle vacío.
            if (res.processed === 0) break;
          }
        } catch (e) {
          error = e instanceof Error ? e.message : String(e);
        }

        perCampaign.push({
          campaign_id: c.id,
          batches,
          processed,
          remaining_queued: remainingQueued,
          completed,
          ...(error ? { error } : {}),
        });
        console.info("[cron][campanas-dispatch]", {
          empresa_id_short: empresaId.slice(0, 8),
          campaign_id_short: c.id.slice(0, 8),
          batches,
          processed,
          remaining_queued: remainingQueued,
          completed,
          error: error ?? null,
        });

        if (Date.now() >= deadline) break;
      }

      resultados.push({ empresa_id: empresaId, campaigns: perCampaign });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      resultados.push({ empresa_id: empresaId, campaigns: [], error });
      console.error("[cron][campanas-dispatch] empresa falló", {
        empresa_id_short: empresaId.slice(0, 8),
        error,
      });
    }

    if (Date.now() >= deadline) break;
  }

  return NextResponse.json({
    ok: true,
    started_at: new Date(startedAt).toISOString(),
    ended_at: new Date().toISOString(),
    dry_run: dryRun,
    empresas: empresaIds.length,
    batch_size: batchSize,
    resultados,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
