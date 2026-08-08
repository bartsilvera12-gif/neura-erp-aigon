import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";

export const runtime = "nodejs";

/**
 * Cron diario que encola notificaciones "seguimiento_hoy" en
 * agent_notification_events para todas las conversaciones cuyo
 * estado_pipeline='seguimiento' y seguimiento_fecha=<hoy>.
 *
 * NO envía FCM directamente: solo encola. El dispatcher existente
 * (cc-notifications-dispatch) las levanta y las manda como cualquier
 * otra notificación pending/fcm.
 *
 * Idempotente por día: no encola si YA existe un evento seguimiento_hoy
 * para el mismo (agent_id, conversation_id) con created_at del día actual.
 *
 * Protegido por CRON_SECRET (Bearer). Correr 1x/día temprano (ej. 08:00).
 * dryRun=1 → solo cuenta.
 */
function isAuthorized(req: NextRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return false;
  return (req.headers.get("authorization") ?? "") === `Bearer ${expected}`;
}
function parseBool(v: string | null): boolean {
  const s = (v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "no autorizado" }, { status: 401 });
  }
  const url = new URL(req.url);
  const dryRun = parseBool(url.searchParams.get("dryRun"));

  let sb;
  try {
    sb = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `cliente service-role no disponible: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }

  const hoy = new Date().toISOString().slice(0, 10);
  const startOfDay = `${hoy}T00:00:00Z`;

  // Conversaciones con seguimiento hoy asignadas a un agente.
  const { data: convsRaw, error: qErr } = await sb
    .from("chat_conversations")
    .select("id, empresa_id, assigned_agent_id, contact_id")
    .eq("estado_pipeline", "seguimiento")
    .eq("seguimiento_fecha", hoy)
    .not("assigned_agent_id", "is", null);

  if (qErr) {
    return NextResponse.json({ ok: false, error: `query pipeline falló: ${qErr.message}` }, { status: 500 });
  }
  const convs = (convsRaw ?? []) as Array<{
    id: string;
    empresa_id: string;
    assigned_agent_id: string;
    contact_id: string | null;
  }>;

  let enqueued = 0;
  let skipped = 0;
  const detail: Array<Record<string, unknown>> = [];

  for (const c of convs) {
    // Idempotencia: buscamos si ya hay un evento seguimiento_hoy encolado o enviado HOY.
    const { data: existing } = await sb
      .from("agent_notification_events")
      .select("id, status")
      .eq("empresa_id", c.empresa_id)
      .eq("agent_id", c.assigned_agent_id)
      .eq("conversation_id", c.id)
      .eq("type", "seguimiento_hoy")
      .gte("created_at", startOfDay)
      .limit(1);
    if (existing && existing.length > 0) {
      skipped++;
      detail.push({ conv: c.id.slice(0, 8), result: "already_enqueued_today" });
      continue;
    }

    if (dryRun) {
      enqueued++;
      detail.push({ conv: c.id.slice(0, 8), result: "would_enqueue", agent: c.assigned_agent_id.slice(0, 8) });
      continue;
    }

    const { error: insErr } = await sb.from("agent_notification_events").insert({
      empresa_id: c.empresa_id,
      agent_id: c.assigned_agent_id,
      conversation_id: c.id,
      type: "seguimiento_hoy",
      channel: "fcm",
      status: "pending",
      metadata: { fecha: hoy },
    });
    if (insErr) {
      detail.push({ conv: c.id.slice(0, 8), result: "insert_failed", error: insErr.message.slice(0, 160) });
      continue;
    }
    enqueued++;
    detail.push({ conv: c.id.slice(0, 8), result: "enqueued", agent: c.assigned_agent_id.slice(0, 8) });
  }

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    fecha: hoy,
    scanned: convs.length,
    enqueued,
    skipped,
    detail,
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
