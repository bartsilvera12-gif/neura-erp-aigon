/**
 * Storage idempotente de atribución Meta por conversación. Implementa la regla
 * "first attribution wins" vía UNIQUE(conversation_id) + ON CONFLICT DO NOTHING
 * (garantizado por la migración chat_conversation_attribution).
 *
 * Diseño defensivo:
 *  - NUNCA lanza: cualquier error se loguea y la función retorna `{ ok: false }`.
 *    El webhook no debe interrumpirse por un fallo de atribución (best effort).
 *  - Skip rápido si la conversación ya tiene atribución: una consulta SELECT
 *    antes del insert evita escribir en la mayoría de los casos (todo mensaje
 *    posterior al primero CTWA de una conversación).
 *  - Sin payload completo: solo persiste el snapshot acotado del referral.
 */

import type { AppSupabaseClient } from "@/lib/supabase/schema";
import {
  extractMetaAttribution,
  summarizeAttributionForLog,
  type MetaAttributionExtracted,
} from "@/lib/chat/meta-attribution-extractor";

const LOG = "[meta-attribution]";

export interface CaptureMetaAttributionInput {
  supabase: AppSupabaseClient;
  empresaId: string;
  conversationId: string;
  contactId?: string | null;
  channelId?: string | null;
  rawPayload: unknown;
  /** ISO string del timestamp del mensaje (preferido); si falta, usa now(). */
  messageTimestampIso?: string | null;
  /** id de chat_messages que originó la captura, si está disponible. */
  sourceMessageId?: string | null;
  /**
   * Canal real de entrega del mensaje. La campaña sigue siendo de Meta — este
   * campo distingue si el lead llegó vía API directa de Meta o vía BSP YCloud.
   * Default: 'meta' (compatibilidad con el hook viejo del webhook Meta).
   */
  provider?: "meta" | "ycloud";
}

export type CaptureMetaAttributionResult =
  | { ok: true; created: true; conversationId: string }
  | { ok: true; created: false; reason: "no_referral" | "already_attributed" | "skipped_provider" }
  | { ok: false; error: string };

function parseTimestamp(raw: string | null | undefined): string {
  if (!raw) return new Date().toISOString();
  const t = String(raw).trim();
  if (!t) return new Date().toISOString();
  // Meta envía epoch seconds como string en webhook
  if (/^\d{10}$/.test(t)) return new Date(parseInt(t, 10) * 1000).toISOString();
  if (/^\d{13}$/.test(t)) return new Date(parseInt(t, 10)).toISOString();
  // ISO
  const d = new Date(t);
  if (!isNaN(d.getTime())) return d.toISOString();
  return new Date().toISOString();
}

/**
 * Captura atribución Meta para una conversación. Idempotente "first wins".
 * Llamar después de persistir el mensaje en chat_messages.
 */
export async function captureFirstMetaAttribution(
  input: CaptureMetaAttributionInput
): Promise<CaptureMetaAttributionResult> {
  const { supabase, empresaId, conversationId, rawPayload } = input;

  let extracted: MetaAttributionExtracted | null;
  try {
    extracted = extractMetaAttribution(rawPayload);
  } catch (e) {
    console.warn(LOG, "extract_failed", {
      conversation_id: conversationId,
      error: e instanceof Error ? e.message : "unknown",
    });
    return { ok: false, error: "extract_failed" };
  }
  if (!extracted) return { ok: true, created: false, reason: "no_referral" };

  // Skip rápido: ¿la conversación ya está atribuida?
  try {
    const { data: existing, error: selErr } = await supabase
      .from("chat_conversation_attribution")
      .select("id")
      .eq("conversation_id", conversationId)
      .maybeSingle();
    if (selErr) {
      // Si la tabla no existe todavía (migración no aplicada), no es error fatal.
      console.warn(LOG, "select_existing_failed", {
        conversation_id: conversationId,
        error: selErr.message,
      });
    }
    if (existing) return { ok: true, created: false, reason: "already_attributed" };
  } catch (e) {
    console.warn(LOG, "select_existing_threw", {
      conversation_id: conversationId,
      error: e instanceof Error ? e.message : "unknown",
    });
    // continuamos al insert: ON CONFLICT DO NOTHING nos cubre
  }

  const firstMessageAt = parseTimestamp(input.messageTimestampIso);

  const row: Record<string, unknown> = {
    empresa_id: empresaId,
    conversation_id: conversationId,
    contact_id: input.contactId ?? null,
    channel_id: input.channelId ?? null,
    provider: input.provider ?? "meta",
    meta_ad_id: extracted.meta_ad_id,
    meta_source_type: extracted.meta_source_type,
    meta_source_url: extracted.meta_source_url,
    meta_ctwa_clid: extracted.meta_ctwa_clid,
    meta_headline: extracted.meta_headline,
    meta_body: extracted.meta_body,
    meta_media_type: extracted.meta_media_type,
    meta_image_url: extracted.meta_image_url,
    meta_video_url: extracted.meta_video_url,
    meta_thumbnail_url: extracted.meta_thumbnail_url,
    utm_source: extracted.utm_source,
    utm_medium: extracted.utm_medium,
    utm_campaign: extracted.utm_campaign,
    utm_content: extracted.utm_content,
    utm_term: extracted.utm_term,
    first_attribution_payload: extracted.first_attribution_payload,
    first_message_at: firstMessageAt,
    source_message_id: input.sourceMessageId ?? null,
  };

  try {
    const { error: insErr } = await supabase
      .from("chat_conversation_attribution")
      .insert(row);
    if (insErr) {
      // Conflict en UNIQUE(conversation_id) → ya está atribuida (race). OK.
      const code = (insErr as { code?: string }).code ?? "";
      const msg = String(insErr.message ?? "");
      if (code === "23505" || msg.includes("23505") || msg.toLowerCase().includes("duplicate")) {
        return { ok: true, created: false, reason: "already_attributed" };
      }
      // Tabla no existe (migración no aplicada): degradación silenciosa
      if (msg.toLowerCase().includes("does not exist") || msg.toLowerCase().includes("relation")) {
        console.warn(LOG, "table_missing_skip", {
          conversation_id: conversationId,
          error: msg.slice(0, 160),
        });
        return { ok: false, error: "table_missing" };
      }
      console.error(LOG, "insert_failed", {
        conversation_id: conversationId,
        error: msg.slice(0, 200),
      });
      return { ok: false, error: msg };
    }

    console.info(LOG, "attribution_created", {
      conversation_id: conversationId,
      empresa_id: empresaId,
      summary: summarizeAttributionForLog(extracted),
    });
    return { ok: true, created: true, conversationId };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown";
    console.error(LOG, "insert_threw", {
      conversation_id: conversationId,
      error: msg.slice(0, 200),
    });
    return { ok: false, error: msg };
  }
}
