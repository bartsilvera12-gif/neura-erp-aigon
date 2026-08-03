import { NextRequest, NextResponse } from "next/server";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { getFcmMessaging } from "@/lib/cc/firebase-admin";

export const runtime = "nodejs";

/**
 * Dispatcher de notificaciones push (FCM) del Contact Center.
 * Protegido por CRON_SECRET (Bearer). Procesa agent_notification_events pending/fcm.
 *
 * - Busca eventos pending → tokens activos del agente → envía push con Firebase Admin.
 * - Marca sent (con provider_message_id) o failed (con error_message); skipped si no hay device.
 * - Idempotente: solo toca pending → sent/failed/skipped (no reprocesa, no duplica).
 * - dryRun=1 → solo cuenta, no envía ni marca.
 * - Si faltan credenciales Firebase → responde config_missing y deja los eventos pending.
 * - Desactiva tokens inválidos (registration-token-not-registered).
 * - No imprime secretos.
 *
 * Acceso a datos vía cliente service-role PostgREST scopeado al schema de la app
 * (APP_DB_SCHEMA = neura) — NO el pool PG crudo (que no es el camino soportado para neura).
 *
 * Programar cada ~1 min en Coolify cuando se active (hoy NO programado).
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

const TITLES: Record<string, string> = {
  new_lead: "Nuevo lead asignado",
  new_message: "Nuevo mensaje",
  reassigned: "Conversación reasignada",
  sla_warning: "Lead sin responder",
};

async function handle(req: NextRequest) {
  if (!isAuthorized(req)) {
    return NextResponse.json({ ok: false, error: "no autorizado" }, { status: 401 });
  }
  const url = new URL(req.url);
  const dryRun = parseBool(url.searchParams.get("dryRun"));
  const limit = Math.min(500, Math.max(1, parseInt(url.searchParams.get("limit") ?? "100", 10) || 100));

  const fcm = await getFcmMessaging();
  if (!fcm.ok && fcm.reason === "config_missing" && !dryRun) {
    return NextResponse.json(
      {
        ok: false,
        error: "config_missing",
        missing: fcm.missing,
        hint: "Configurar credenciales Firebase en Coolify (ver docs/CAPACITOR_PUSH_SETUP.md). Los eventos quedan pending.",
      },
      { status: 200 }
    );
  }

  let sb;
  try {
    sb = createServiceRoleClient();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `cliente service-role no disponible: ${e instanceof Error ? e.message : String(e)}` },
      { status: 500 }
    );
  }
  const nowIso = () => new Date().toISOString();

  const { data: pend, error: pendErr } = await sb
    .from("agent_notification_events")
    .select("id, agent_id, conversation_id, type")
    .eq("status", "pending")
    .eq("channel", "fcm")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (pendErr) {
    return NextResponse.json({ ok: false, error: `query pending falló: ${pendErr.message}` }, { status: 500 });
  }

  const events = (pend ?? []) as Array<{
    id: string;
    agent_id: string | null;
    conversation_id: string | null;
    type: string;
  }>;
  let sent = 0,
    failed = 0,
    skipped = 0,
    wouldSend = 0;
  const detail: Array<Record<string, unknown>> = [];

  for (const ev of events) {
    let tokens: string[] = [];
    if (ev.agent_id) {
      const { data: tk } = await sb
        .from("agent_device_tokens")
        .select("fcm_token")
        .eq("agent_id", ev.agent_id)
        .eq("is_active", true);
      tokens = ((tk ?? []) as Array<{ fcm_token: string }>).map((r) => r.fcm_token).filter(Boolean);
    }
    if (tokens.length === 0) {
      if (!dryRun) {
        const { error: upErr } = await sb
          .from("agent_notification_events")
          .update({ status: "skipped", error_message: "no_active_device" })
          .eq("id", ev.id);
        if (upErr) {
          failed++;
          detail.push({ event: ev.id.slice(0, 8), result: "status_update_failed", stage: "skipped", error: upErr.message.slice(0, 160) });
          continue;
        }
      }
      skipped++;
      detail.push({ event: ev.id.slice(0, 8), result: "skipped_no_device" });
      continue;
    }

    let body = "Tenés un nuevo mensaje";
    let preview = "";
    let contactId: string | null = null;
    if (ev.conversation_id) {
      const { data: conv } = await sb
        .from("chat_conversations")
        .select("last_message_preview, contact_id")
        .eq("id", ev.conversation_id)
        .maybeSingle();
      preview = ((conv as { last_message_preview?: string | null } | null)?.last_message_preview ?? "").toString().trim();
      let who = "";
      contactId = (conv as { contact_id?: string | null } | null)?.contact_id ?? null;
      if (contactId) {
        const { data: ct } = await sb
          .from("chat_contacts")
          .select("nombre, telefono")
          .eq("id", contactId)
          .maybeSingle();
        who = (
          (ct as { nombre?: string | null } | null)?.nombre ||
          (ct as { telefono?: string | null } | null)?.telefono ||
          ""
        )
          .toString()
          .trim();
      }
      body = who ? (preview ? `${who}: ${preview}`.slice(0, 140) : who) : preview ? preview.slice(0, 140) : body;
    }
    let title = TITLES[ev.type] ?? "Notificación";
    // new_message: título = nombre/teléfono del contacto (columnas reales name/phone_number),
    // cuerpo = preview del mensaje. new_lead y los demás tipos quedan igual (arriba).
    if (ev.type === "new_message") {
      let whoMsg = "";
      if (contactId) {
        const { data: ctm } = await sb
          .from("chat_contacts")
          .select("name, phone_number")
          .eq("id", contactId)
          .maybeSingle();
        whoMsg = (
          (ctm as { name?: string | null } | null)?.name ||
          (ctm as { phone_number?: string | null } | null)?.phone_number ||
          ""
        )
          .toString()
          .trim();
      }
      title = whoMsg || "Nuevo mensaje";
      body = preview ? preview.slice(0, 140) : "Nuevo mensaje";
    }
    const route = ev.conversation_id ? `/m/asesor/chat/${ev.conversation_id}` : "/m/asesor";

    if (dryRun) {
      wouldSend++;
      detail.push({ event: ev.id.slice(0, 8), tokens: tokens.length, would_send: true, title });
      continue;
    }
    if (!fcm.ok) {
      failed++;
      const { error: upErr } = await sb
        .from("agent_notification_events")
        .update({ status: "failed", error_message: `fcm_${fcm.reason}` })
        .eq("id", ev.id);
      detail.push({ event: ev.id.slice(0, 8), result: "fcm_unavailable", status_persisted: !upErr });
      continue;
    }

    try {
      const res = await fcm.messaging.sendEachForMulticast({
        tokens,
        notification: { title, body },
        data: { conversationId: ev.conversation_id ?? "", route, type: ev.type, agentId: ev.agent_id ?? "" },
        android: { priority: "high" },
      });
      const toDeactivate: string[] = [];
      res.responses.forEach((r, i) => {
        if (!r.success) {
          const code = (r.error as { code?: string } | undefined)?.code ?? "";
          if (code.includes("registration-token-not-registered") || code.includes("invalid-argument")) {
            toDeactivate.push(tokens[i]);
          }
        }
      });
      if (toDeactivate.length > 0) {
        await sb
          .from("agent_device_tokens")
          .update({ is_active: false, updated_at: nowIso() })
          .in("fcm_token", toDeactivate);
      }
      if (res.successCount > 0) {
        const msgId = res.responses.find((r) => r.success)?.messageId ?? null;
        const { error: upErr } = await sb
          .from("agent_notification_events")
          .update({ status: "sent", provider_message_id: msgId, sent_at: nowIso() })
          .eq("id", ev.id);
        if (upErr) {
          // El push se envió, pero no se pudo persistir 'sent'. NO contarlo como éxito:
          // si quedara 'pending' se reenviaría en el próximo tick. Se reporta como fallo visible.
          failed++;
          detail.push({ event: ev.id.slice(0, 8), result: "sent_but_status_not_persisted", error: upErr.message.slice(0, 160) });
        } else {
          sent++;
          detail.push({ event: ev.id.slice(0, 8), result: "sent", ok: res.successCount, fail: res.failureCount });
        }
      } else {
        const { error: upErr } = await sb
          .from("agent_notification_events")
          .update({ status: "failed", error_message: `all_failed(${res.failureCount})` })
          .eq("id", ev.id);
        failed++;
        detail.push({ event: ev.id.slice(0, 8), result: "failed", fail: res.failureCount, status_persisted: !upErr });
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      const { error: upErr } = await sb
        .from("agent_notification_events")
        .update({ status: "failed", error_message: msg.slice(0, 300) })
        .eq("id", ev.id);
      failed++;
      detail.push({ event: ev.id.slice(0, 8), result: "error", status_persisted: !upErr });
    }
  }

  return NextResponse.json({
    ok: true,
    dry_run: dryRun,
    scanned: events.length,
    sent,
    failed,
    skipped,
    would_send: wouldSend,
    firebase_configured: fcm.ok,
    detail,
  });
}

export async function GET(req: NextRequest) {
  return handle(req);
}
export async function POST(req: NextRequest) {
  return handle(req);
}
