import "server-only";
import type { SupabaseAdmin } from "@/lib/chat/types";
import { getChatServiceClientForEmpresa } from "@/lib/supabase/chat-service-role-empresa";
import type { ResolvedYCloudChannel } from "@/lib/chat/webhooks/ycloud-resolve-channel";

/** Rango del flujo positivo (para no degradar). `failed` se trata aparte. */
function positiveRank(s: string): number {
  if (s === "sent") return 1;
  if (s === "delivered") return 2;
  if (s === "read") return 3;
  return 0;
}

/**
 * Refleja en el mensaje del INBOX (`chat_messages`) el estado de entrega que YCloud reporta vía
 * `whatsapp.message.updated` (sent/delivered/read/failed) para mensajes salientes normales
 * (NO campañas — esas ya las maneja applyYCloudCampaignMessageUpdated).
 *
 * Guarda el motivo del fallo en `raw_payload.neura_ycloud_status` para que el front pueda mostrar
 * "No entregado — <motivo>" (p. ej. ventana de 24 h cerrada, error 131047). Best-effort: cualquier
 * fallo se traga para no romper el ack del webhook.
 */
export async function applyYCloudInboxMessageStatus(params: {
  resolved: ResolvedYCloudChannel;
  whatsappMessage: Record<string, unknown>;
}): Promise<void> {
  const wm = params.whatsappMessage;
  const empresaId = params.resolved.empresa_id;

  const statusRaw = typeof wm.status === "string" ? wm.status.trim().toLowerCase() : "";
  if (statusRaw !== "failed" && statusRaw !== "delivered" && statusRaw !== "read" && statusRaw !== "sent") {
    return; // 'accepted' u otros: nada que reflejar en el inbox
  }

  const mid = typeof wm.id === "string" ? wm.id.trim() : "";
  const wamid = typeof wm.wamid === "string" ? wm.wamid.trim() : "";
  const waKeys = Array.from(new Set([mid, wamid].filter(Boolean)));
  if (waKeys.length === 0) return;

  const errorCode = wm.errorCode ?? (wm as { errroCode?: unknown }).errroCode;
  const errorMessage =
    typeof wm.errorMessage === "string"
      ? wm.errorMessage.trim()
      : typeof wm.message === "string"
        ? wm.message.trim()
        : "";
  const deliverTime = typeof wm.deliverTime === "string" ? wm.deliverTime : null;
  const readTime = typeof wm.readTime === "string" ? wm.readTime : null;

  const sb = (await getChatServiceClientForEmpresa(empresaId)) as unknown as SupabaseAdmin;

  const { data: row, error: selErr } = await sb
    .from("chat_messages")
    .select("id, whatsapp_delivery_status, raw_payload")
    .eq("empresa_id", empresaId)
    .in("wa_message_id", waKeys)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (selErr || !row) return;

  const cur = String(
    (row as { whatsapp_delivery_status?: string | null }).whatsapp_delivery_status ?? ""
  ).toLowerCase();

  // Guarda monotónica: no pisar un estado terminal/superior.
  if (cur === "failed") return; // failed es terminal
  if (statusRaw === "failed") {
    if (cur === "delivered" || cur === "read") return; // ya llegó → ignorar failed tardío
  } else if (positiveRank(statusRaw) <= positiveRank(cur)) {
    return; // no degradar (p. ej. delivered no pisa read)
  }

  const ts = new Date().toISOString();
  const prevRaw = (row as { raw_payload?: unknown }).raw_payload;
  const mergedRaw = {
    ...(prevRaw && typeof prevRaw === "object" && !Array.isArray(prevRaw)
      ? (prevRaw as Record<string, unknown>)
      : {}),
    neura_ycloud_status: {
      status: statusRaw,
      errorCode: errorCode != null ? String(errorCode) : null,
      errorMessage: errorMessage || null,
      receivedAt: ts,
    },
  };

  const patch: Record<string, unknown> = {
    whatsapp_delivery_status: statusRaw,
    raw_payload: mergedRaw,
  };
  if (statusRaw === "delivered") patch.whatsapp_delivered_at = deliverTime ?? ts;
  if (statusRaw === "read") {
    patch.whatsapp_read_at = readTime ?? ts;
    if (deliverTime) patch.whatsapp_delivered_at = deliverTime;
  }

  const rowId = String((row as { id?: string }).id ?? "");
  if (!rowId) return;

  const { error: updErr } = await sb
    .from("chat_messages")
    .update(patch)
    .eq("id", rowId)
    .eq("empresa_id", empresaId);
  if (updErr) {
    console.warn("[ycloud-inbox-status] update_falló", updErr.message);
  }
}
