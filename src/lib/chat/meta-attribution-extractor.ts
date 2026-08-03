/**
 * Parser puro del nodo `referral` que Meta envía en mensajes generados desde
 * anuncios Click-to-WhatsApp (CTWA). Sin side effects, sin DB, sin red.
 * Se usa tanto en el hook del webhook (en línea) como en el backfill histórico
 * sobre `chat_messages.raw_payload` ya guardado.
 *
 * Forma típica del referral:
 * {
 *   source_url: "https://fb.me/...",
 *   source_id: "120209876543210",     // ad_id
 *   source_type: "ad",                 // "ad" | "post"
 *   headline: "...",
 *   body: "...",
 *   media_type: "image" | "video",
 *   image_url?: "...",
 *   video_url?: "...",
 *   thumbnail_url?: "...",
 *   ctwa_clid: "..."
 * }
 *
 * Garantías:
 *  - Si el payload no tiene referral usable, devuelve null (el caller decide).
 *  - Source con `source_type` distinto de 'ad' o 'post' se ignora.
 *  - Se intentan extraer UTMs de `source_url` y de `body` (defensivo, opcional).
 *  - El snapshot que persistimos es acotado: solo campos definidos del referral
 *    y los UTM detectados; nunca el `raw_payload` completo del mensaje.
 */

export interface MetaAttributionExtracted {
  meta_ad_id: string | null;
  meta_source_type: "ad" | "post" | null;
  meta_source_url: string | null;
  meta_ctwa_clid: string | null;
  meta_headline: string | null;
  meta_body: string | null;
  meta_media_type: string | null;
  meta_image_url: string | null;
  meta_video_url: string | null;
  meta_thumbnail_url: string | null;
  utm_source: string | null;
  utm_medium: string | null;
  utm_campaign: string | null;
  utm_content: string | null;
  utm_term: string | null;
  /** Snapshot acotado del referral original (solo campos conocidos). */
  first_attribution_payload: Record<string, unknown>;
}

const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;

function asString(v: unknown): string | null {
  if (v == null) return null;
  if (typeof v === "string") {
    const t = v.trim();
    return t.length > 0 ? t : null;
  }
  return null;
}

function normalizeSourceType(v: unknown): "ad" | "post" | null {
  const s = asString(v)?.toLowerCase();
  if (s === "ad" || s === "post") return s;
  return null;
}

/** Intento defensivo de extraer UTMs de una URL. No falla si la URL es inválida. */
function utmsFromUrl(url: string | null): Partial<Record<(typeof UTM_KEYS)[number], string>> {
  const out: Partial<Record<(typeof UTM_KEYS)[number], string>> = {};
  if (!url) return out;
  try {
    const u = new URL(url);
    for (const k of UTM_KEYS) {
      const v = u.searchParams.get(k);
      if (v && v.trim()) out[k] = v.trim();
    }
  } catch {
    /* URL inválida — devolvemos lo que tengamos (vacío). */
  }
  return out;
}

/** Busca patrones `utm_xxx=valor` en texto libre (body), por si vinieran ahí. */
function utmsFromText(text: string | null): Partial<Record<(typeof UTM_KEYS)[number], string>> {
  const out: Partial<Record<(typeof UTM_KEYS)[number], string>> = {};
  if (!text) return out;
  for (const k of UTM_KEYS) {
    const re = new RegExp(`${k}\\s*=\\s*([^\\s&]+)`, "i");
    const m = text.match(re);
    if (m && m[1]) out[k] = decodeURIComponent(m[1]).trim();
  }
  return out;
}

/**
 * Localiza el objeto `referral` dentro del payload crudo. Soporta dos shapes:
 *  - Meta directo (webhook Cloud API):       `rawPayload.referral`
 *  - YCloud (envelope BSP):                  `rawPayload.whatsappInboundMessage.referral`
 *
 * Ambos providers entregan el mismo set de campos snake_case dentro de `referral`
 * (source_id, source_type, source_url, ctwa_clid, headline, body, media_type,
 * image_url, video_url, thumbnail_url). YCloud agrega `welcome_message` que se
 * preserva en `first_attribution_payload`.
 */
function findReferralNode(rawPayload: unknown): Record<string, unknown> | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;
  const root = rawPayload as Record<string, unknown>;

  // Meta directo: referral en root
  const directRef = root["referral"];
  if (directRef && typeof directRef === "object" && !Array.isArray(directRef)) {
    return directRef as Record<string, unknown>;
  }

  // YCloud envelope: whatsappInboundMessage.referral
  const wim = root["whatsappInboundMessage"];
  if (wim && typeof wim === "object" && !Array.isArray(wim)) {
    const wimRef = (wim as Record<string, unknown>)["referral"];
    if (wimRef && typeof wimRef === "object" && !Array.isArray(wimRef)) {
      return wimRef as Record<string, unknown>;
    }
  }

  return null;
}

/**
 * Extrae atribución Meta de un payload de mensaje crudo (lo que Meta o YCloud
 * entregan vía webhook y queda en `chat_messages.raw_payload`).
 *
 * Agnóstico al provider: detecta el shape automáticamente. El anuncio sigue
 * siendo de Meta — el provider del CANAL (meta directo vs ycloud) se decide
 * afuera al persistir en `chat_conversation_attribution`.
 *
 * @returns null si el payload no contiene un referral usable.
 */
export function extractMetaAttribution(rawPayload: unknown): MetaAttributionExtracted | null {
  const ref = findReferralNode(rawPayload);
  if (!ref) return null;

  const meta_source_type = normalizeSourceType(ref["source_type"]);
  const meta_ad_id = meta_source_type === "ad" ? asString(ref["source_id"]) : null;
  const meta_source_url = asString(ref["source_url"]);
  const meta_ctwa_clid = asString(ref["ctwa_clid"]);
  const meta_headline = asString(ref["headline"]);
  const meta_body = asString(ref["body"]);
  const meta_media_type = asString(ref["media_type"]);
  const meta_image_url = asString(ref["image_url"]);
  const meta_video_url = asString(ref["video_url"]);
  const meta_thumbnail_url = asString(ref["thumbnail_url"]);

  // ¿Hay algo accionable? Requiere mínimo source_type o ctwa_clid o ad_id.
  const accionable = Boolean(meta_source_type || meta_ad_id || meta_ctwa_clid);
  if (!accionable) return null;

  const utmsUrl = utmsFromUrl(meta_source_url);
  const utmsBody = utmsFromText(meta_body);
  const utms = { ...utmsBody, ...utmsUrl };

  // Snapshot acotado: solo campos definidos (no el rawPayload completo del msg).
  const snapshot: Record<string, unknown> = {};
  const maybeSet = (k: string, v: unknown) => {
    if (v != null && v !== "") snapshot[k] = v;
  };
  maybeSet("source_id", meta_ad_id);
  maybeSet("source_type", meta_source_type);
  maybeSet("source_url", meta_source_url);
  maybeSet("ctwa_clid", meta_ctwa_clid);
  maybeSet("headline", meta_headline);
  maybeSet("body", meta_body);
  maybeSet("media_type", meta_media_type);
  maybeSet("image_url", meta_image_url);
  maybeSet("video_url", meta_video_url);
  maybeSet("thumbnail_url", meta_thumbnail_url);
  // YCloud anexa `welcome_message` (texto auto-respuesta del anuncio); útil
  // para reconocer el anuncio en analítica sin depender solo del headline.
  maybeSet("welcome_message", ref["welcome_message"]);
  if (Object.keys(utms).length > 0) snapshot["utms"] = utms;

  return {
    meta_ad_id,
    meta_source_type,
    meta_source_url,
    meta_ctwa_clid,
    meta_headline,
    meta_body,
    meta_media_type,
    meta_image_url,
    meta_video_url,
    meta_thumbnail_url,
    utm_source: utms.utm_source ?? null,
    utm_medium: utms.utm_medium ?? null,
    utm_campaign: utms.utm_campaign ?? null,
    utm_content: utms.utm_content ?? null,
    utm_term: utms.utm_term ?? null,
    first_attribution_payload: snapshot,
  };
}

/** Para logs: representa la atribución sin valores potencialmente sensibles (urls largas). */
export function summarizeAttributionForLog(a: MetaAttributionExtracted): Record<string, unknown> {
  return {
    has_ad_id: Boolean(a.meta_ad_id),
    source_type: a.meta_source_type,
    has_ctwa_clid: Boolean(a.meta_ctwa_clid),
    has_headline: Boolean(a.meta_headline),
    media_type: a.meta_media_type ?? null,
    utm_source: a.utm_source ?? null,
    utm_campaign: a.utm_campaign ?? null,
  };
}
