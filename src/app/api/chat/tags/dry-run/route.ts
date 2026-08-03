import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import {
  loadTagRule,
  runTagDryRun,
  TAG_DRY_RUN_DEFAULT_DAYS,
  TAG_DRY_RUN_DEFAULT_LIMIT,
  TAG_DRY_RUN_MAX_LIMIT,
  type TagDryRunPurchaseFilter,
} from "@/lib/chat/tags/dry-run-shared";

/**
 * Etiquetas Automáticas - FASE 2 dry-run.
 * READ-ONLY: solo SELECT. NO inserta en chat_conversation_tag_history.
 * NO modifica chat_conversations. NO activa ocultamiento.
 */

function isUuid(v: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    v.trim()
  );
}

function parseIntParam(value: string | null, fallback: number, max?: number): number {
  if (!value) return fallback;
  const n = parseInt(value, 10);
  if (Number.isNaN(n) || n <= 0) return fallback;
  if (max && n > max) return max;
  return n;
}

function parseBool(value: string | null, fallback: boolean): boolean {
  if (value == null) return fallback;
  const v = value.trim().toLowerCase();
  if (v === "true" || v === "1" || v === "yes") return true;
  if (v === "false" || v === "0" || v === "no") return false;
  return fallback;
}

function parsePurchaseFilter(value: string | null): TagDryRunPurchaseFilter {
  const allowed: TagDryRunPurchaseFilter[] = [
    "any",
    "purchased_any",
    "no_purchase",
    "payment_pending",
    "abandoned",
    "data_incomplete",
    // FASE 3C-1: matching 1:1 con TagPurchaseCategory real.
    "purchased_once",
    "purchased_multiple_tickets",
    "repurchased",
    "payment_received_incomplete",
    "unknown",
  ];
  if (!value) return "any";
  const v = value.trim() as TagDryRunPurchaseFilter;
  return allowed.includes(v) ? v : "any";
}

async function handle(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth?.empresa_id) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const url = new URL(request.url);
    const days = parseIntParam(url.searchParams.get("days_without_activity"), TAG_DRY_RUN_DEFAULT_DAYS);
    const limit = parseIntParam(
      url.searchParams.get("limit"),
      TAG_DRY_RUN_DEFAULT_LIMIT,
      TAG_DRY_RUN_MAX_LIMIT
    );
    const channelIdRaw = url.searchParams.get("channel_id");
    const channelId = channelIdRaw && isUuid(channelIdRaw) ? channelIdRaw : null;
    const ruleIdRaw = url.searchParams.get("rule_id");
    const ruleId = ruleIdRaw && isUuid(ruleIdRaw) ? ruleIdRaw : null;
    const purchaseCondition = parsePurchaseFilter(url.searchParams.get("purchase_condition"));
    const includeReasons = parseBool(url.searchParams.get("include_reasons"), false);
    const staleActiveSessionMode = parseBool(url.searchParams.get("stale_active_session_mode"), false);
    const criticalGraceHoursRaw = parseIntParam(
      url.searchParams.get("critical_node_grace_hours"),
      48,
      24 * 30
    );
    const criticalNodesRaw = url.searchParams.get("critical_node_codes");
    const criticalNodeCodes = criticalNodesRaw
      ? criticalNodesRaw
          .split(",")
          .map((s) => s.trim())
          .filter((s) => s.length > 0 && s.length <= 64)
      : undefined;

    const pool = getChatPostgresPool();
    if (!pool) {
      return NextResponse.json(
        { ok: false, error: "Pool de Postgres no disponible" },
        { status: 503 }
      );
    }

    const schema = await fetchDataSchemaForEmpresaId(auth.empresa_id);

    // Si hay rule_id, sus filtros sobreescriben los query params.
    let effectiveDays = days;
    let effectiveChannel = channelId;
    let effectivePurchase = purchaseCondition;
    let effectiveExcludeHuman = true;
    let effectiveExcludeBot = true;
    let effectiveExcludeManualClosure = true;

    if (ruleId) {
      const rule = await loadTagRule(pool, schema, auth.empresa_id, ruleId);
      if (!rule) {
        return NextResponse.json({ ok: false, error: "Regla no encontrada" }, { status: 404 });
      }
      effectiveDays = rule.days_without_activity;
      effectiveChannel = rule.channel_id;
      effectivePurchase = (rule.purchase_condition as TagDryRunPurchaseFilter) || "any";
      effectiveExcludeHuman = rule.exclude_human_taken_over;
      effectiveExcludeBot = rule.exclude_active_bot_session;
      effectiveExcludeManualClosure = rule.exclude_manual_closure;
    }

    const result = await runTagDryRun(pool, {
      empresaId: auth.empresa_id,
      schema,
      daysWithoutActivity: effectiveDays,
      limit,
      channelId: effectiveChannel,
      purchaseCondition: effectivePurchase,
      ruleId,
      includeReasons,
      excludeHumanTakenOver: effectiveExcludeHuman,
      excludeActiveBotSession: effectiveExcludeBot,
      excludeManualClosure: effectiveExcludeManualClosure,
      staleActiveSessionMode,
      criticalNodeCodes,
      criticalNodeGraceHours: criticalGraceHoursRaw,
    });

    return NextResponse.json({ ok: true, ...result });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error interno";
    console.error("[api/chat/tags/dry-run]", e);
    return NextResponse.json({ ok: false, error: msg }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
