import { normalizeWaPhone } from "@/lib/chat/wa-phone";
import type { SendWhatsAppTextResult } from "@/lib/chat/whatsapp-send-service";

/** Endpoint enqueue según OpenAPI oficial YCloud (`POST /v2/whatsapp/messages`). */
const YCLOUD_WHATSAPP_MESSAGES_URL = "https://api.ycloud.com/v2/whatsapp/messages";

function digitsToE164(digits: string): string | null {
  const d = normalizeWaPhone(digits);
  if (!d) return null;
  return `+${d}`;
}

/** Traduce códigos de error de YCloud a un mensaje claro en español para el asesor. */
function friendlyYcloudError(code: string, rawMsg: string): string {
  switch (code) {
    case "BALANCE_INSUFFICIENT":
      return "Sin saldo en la cuenta de WhatsApp (YCloud) para enviar este mensaje. Hay que recargar el saldo y volver a intentar.";
    case "WHATSAPP_BUSINESS_ACCOUNT_UNAVAILABLE":
      return "La cuenta de WhatsApp Business no está disponible o sin vincular. Revisá la configuración del canal.";
    case "RATE_LIMIT_EXCEEDED":
      return "Se alcanzó el límite de envíos por ahora. Probá de nuevo en unos minutos.";
    case "UNAUTHORIZED":
      return "Error de autenticación con WhatsApp (YCloud). Revisá la API key del canal.";
    default:
      return rawMsg || "No se pudo enviar el mensaje.";
  }
}

async function postYCloudWhatsappMessage(
  apiKey: string,
  body: Record<string, unknown>
): Promise<SendWhatsAppTextResult> {
  const res = await fetch(YCLOUD_WHATSAPP_MESSAGES_URL, {
    method: "POST",
    headers: {
      "X-API-Key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errObj = raw.error as Record<string, unknown> | undefined;
    const code = typeof errObj?.code === "string" ? errObj.code : "";
    const rawMsg =
      (typeof errObj?.message === "string" && errObj.message) ||
      (typeof raw.message === "string" && raw.message) ||
      res.statusText;
    console.warn("[ycloud-send] request_failed", { status: res.status, code, raw });
    return {
      ok: false,
      error: friendlyYcloudError(code, rawMsg) || `HTTP ${res.status}`,
      code: code || undefined,
      status: res.status,
      raw,
    };
  }

  const ycloudStatus = typeof raw.status === "string" ? raw.status.toLowerCase() : "";
  if (ycloudStatus === "failed") {
    const errMsg =
      (typeof raw.errorMessage === "string" && raw.errorMessage.trim()) ||
      "El proveedor marcó el mensaje como fallido";
    const errCode = raw.errorCode ?? (raw as { errroCode?: unknown }).errroCode;
    const codeStr = errCode != null ? String(errCode) : "";
    console.warn("[ycloud-send] provider_failed", { httpStatus: res.status, ycloudStatus, code: codeStr });
    return {
      ok: false,
      error: errMsg,
      code: codeStr || undefined,
      status: res.status,
      raw,
    };
  }

  const wamid = typeof raw.wamid === "string" ? raw.wamid : null;
  const id = typeof raw.id === "string" ? raw.id : null;
  const waMessageId = wamid || id;
  console.info("[ycloud-send] accepted", { waMessageId, status: res.status });
  return { ok: true, waMessageId, raw };
}

/**
 * Envía texto por WhatsApp usando la API REST de YCloud (no Meta Graph).
 * Autenticación: header `X-API-Key` (esquema documentado en OpenAPI).
 */
export async function sendMessageViaYCloud(params: {
  apiKey: string;
  /** Número de negocio en E.164 (p. ej. +54911…), desde config.ycloud_sender_id */
  fromE164: string;
  /** Solo dígitos del cliente (mismo formato que usa Meta en el ERP) */
  toDigits: string;
  text: string;
}): Promise<SendWhatsAppTextResult> {
  const toE164 = digitsToE164(params.toDigits);
  if (!toE164) {
    return { ok: false, error: "Teléfono de destino inválido para YCloud" };
  }

  return postYCloudWhatsappMessage(params.apiKey, {
    from: params.fromE164,
    to: toE164,
    type: "text",
    text: { body: params.text },
  });
}

export type YCloudOutboundMediaKind = "image" | "document" | "audio" | "video";

/**
 * Envía imagen / documento / audio / video con URL https pública (p. ej. Supabase Storage),
 * mismo patrón que la WhatsApp Cloud API.
 */
export async function sendYCloudWhatsappMediaViaLink(params: {
  apiKey: string;
  fromE164: string;
  toDigits: string;
  kind: YCloudOutboundMediaKind;
  mediaLink: string;
  caption?: string;
  filename?: string;
}): Promise<SendWhatsAppTextResult> {
  const toE164 = digitsToE164(params.toDigits);
  if (!toE164) {
    return { ok: false, error: "Teléfono de destino inválido para YCloud" };
  }
  const link = params.mediaLink.trim();
  if (!/^https:\/\//i.test(link)) {
    return { ok: false, error: "El archivo debe estar en una URL https pública" };
  }

  const kind = params.kind;
  const cap = params.caption?.trim();

  let mediaPayload: Record<string, unknown> = { link };
  if (kind === "image") {
    if (cap) mediaPayload = { link, caption: cap };
  } else if (kind === "document") {
    mediaPayload = {
      link,
      filename: (params.filename?.trim() || "archivo").slice(0, 240),
    };
    if (cap) mediaPayload.caption = cap;
  } else if (kind === "video") {
    if (cap) mediaPayload = { link, caption: cap };
  } else if (kind === "audio") {
    // AUDIO NORMAL (sin `voice:true`). Las notas de voz por API son inestables para reproducir
    // en el cliente; el audio normal (mp3) se descarga y se reproduce siempre.
    mediaPayload = { link };
  }

  return postYCloudWhatsappMessage(params.apiKey, {
    from: params.fromE164,
    to: toE164,
    type: kind,
    [kind]: mediaPayload,
  });
}

/**
 * Sube un archivo de media a YCloud (Meta lo persiste ~30 días) y devuelve su `id`.
 * Endpoint: `POST /v2/whatsapp/media/{phoneNumber}/upload` (multipart, campo `file`).
 *
 * Enviar audio por MEDIA ID (en vez de por `link`) es lo recomendado por YCloud para notas de
 * voz: WhatsApp valida y hostea el archivo de forma SÍNCRONA en la subida, evitando el fetch
 * asíncrono del link que hace que las notas de voz ogg/opus lleguen como "audio no disponible"
 * aunque el archivo sea válido. Respuesta observada en vivo: `{"id":"159491..."}`.
 */
export async function uploadYCloudWhatsappMedia(params: {
  apiKey: string;
  /** Número de negocio (sender). El path usa solo dígitos. */
  fromE164: string;
  bytes: Buffer;
  filename: string;
  contentType: string;
}): Promise<{ ok: true; mediaId: string } | { ok: false; error: string }> {
  const phoneDigits = String(params.fromE164 ?? "").replace(/[^\d]/g, "");
  if (!phoneDigits) return { ok: false, error: "Sender inválido para subir media a YCloud" };

  const form = new FormData();
  const blob = new Blob([new Uint8Array(params.bytes)], { type: params.contentType });
  form.append("file", blob, params.filename || "archivo");

  let res: Response;
  try {
    res = await fetch(`https://api.ycloud.com/v2/whatsapp/media/${phoneDigits}/upload`, {
      method: "POST",
      headers: { "X-API-Key": params.apiKey },
      body: form,
    });
  } catch (e) {
    return { ok: false, error: "Fallo de red al subir media a YCloud: " + (e instanceof Error ? e.message : String(e)) };
  }

  const raw = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const errObj = raw.error as Record<string, unknown> | undefined;
    const msg =
      (typeof errObj?.message === "string" && errObj.message) ||
      (typeof raw.message === "string" && raw.message) ||
      res.statusText;
    console.warn("[ycloud-media-upload] failed", { status: res.status, raw });
    return { ok: false, error: msg || `HTTP ${res.status}` };
  }
  const mediaId = typeof raw.id === "string" ? raw.id.trim() : "";
  if (!mediaId) {
    console.warn("[ycloud-media-upload] sin id en respuesta", { raw });
    return { ok: false, error: "YCloud no devolvió media id" };
  }
  return { ok: true, mediaId };
}

/**
 * Envía audio referenciando un MEDIA ID ya subido (ver `uploadYCloudWhatsappMedia`).
 * Por defecto = AUDIO NORMAL (más confiable de reproducir). `voice: true` lo enviaría como nota
 * de voz PTT, pero esas son inestables del lado del cliente por la API — no usar salvo necesidad.
 */
export async function sendYCloudWhatsappAudioById(params: {
  apiKey: string;
  fromE164: string;
  toDigits: string;
  mediaId: string;
  voice?: boolean;
}): Promise<SendWhatsAppTextResult> {
  const toE164 = digitsToE164(params.toDigits);
  if (!toE164) {
    return { ok: false, error: "Teléfono de destino inválido para YCloud" };
  }
  const audio: Record<string, unknown> = { id: params.mediaId };
  // Solo marcamos nota de voz si se pide explícitamente. Por defecto = audio normal (mp3),
  // más confiable de reproducir del lado del cliente.
  if (params.voice) audio.voice = true;
  return postYCloudWhatsappMessage(params.apiKey, {
    from: params.fromE164,
    to: toE164,
    type: "audio",
    audio,
  });
}

export function ycloudSenderToE164(senderId: string): string | null {
  return digitsToE164(senderId);
}

/**
 * Envío de plantilla WhatsApp vía API YCloud (mismo host que texto).
 * `externalId` recomendado para reconciliar webhooks (p. ej. campaign:uuid:recipient:uuid).
 */
export async function sendYCloudWhatsappTemplateMessage(params: {
  apiKey: string;
  fromE164: string;
  toDigits: string;
  templatePayload: Record<string, unknown>;
  externalId?: string;
}): Promise<SendWhatsAppTextResult> {
  const toE164 = digitsToE164(params.toDigits);
  if (!toE164) {
    return { ok: false, error: "Teléfono de destino inválido para YCloud" };
  }

  const body: Record<string, unknown> = {
    from: params.fromE164,
    to: toE164,
    type: "template",
    template: params.templatePayload,
  };
  if (params.externalId?.trim()) {
    body.externalId = params.externalId.trim().slice(0, 512);
  }

  return postYCloudWhatsappMessage(params.apiKey, body);
}
