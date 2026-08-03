/**
 * Contact Center V1 — integración inbound detrás de feature flag.
 *
 * Con `CONTACT_CENTER_V1` apagado (default), NADA de esto se ejecuta y el inbox
 * mantiene exactamente el comportamiento actual (assignConversation / assignConversationPg).
 *
 * Con el flag encendido (y migración aplicada):
 *  - Setea ventana WhatsApp 24h (last_customer_message_at / whatsapp_window_expires_at).
 *  - Asigna vía la RPC atómica public.cc_assign_conversation.
 *
 * GARANTÍA DE FALLBACK: ninguna de las dos funciones lanza. Cualquier fallo del
 * Contact Center V1 (RPC inexistente, columna faltante, schema inválido, error de red)
 * se captura y se devuelve como { ok:false, error }. El caller (webhook) usa ese
 * resultado para caer al motor legacy → el lead nunca se pierde y el webhook nunca
 * devuelve 500 por una falla del Contact Center.
 */
import type { Pool } from "pg";
import type { SupabaseAdmin } from "@/lib/chat/types";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

export function contactCenterV1Enabled(): boolean {
  const v = (process.env.CONTACT_CENTER_V1 ?? "").trim().toLowerCase();
  return v === "1" || v === "true" || v === "yes";
}

export type CcInboundResult =
  | { ok: true; assigned: boolean; reason?: string; agent_id?: string }
  | { ok: false; error: string };

function ccError(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : String(e) };
}

/** Vía pool PG (tenants no expuestos o YCLOUD_WEBHOOK_CHAT_PG_ALWAYS=1). Nunca lanza. */
export async function applyInboundWindowAndAssignPg(
  pool: Pool,
  schema: string,
  empresaId: string,
  conversationId: string
): Promise<CcInboundResult> {
  try {
    const sch = assertAllowedChatDataSchema(schema);
    await pool.query(
      `UPDATE "${sch}".chat_conversations
         SET last_customer_message_at = now(),
             whatsapp_window_expires_at = now() + interval '24 hours',
             needs_template_response = false,
             updated_at = now()
       WHERE id = $1::uuid AND empresa_id = $2::uuid`,
      [conversationId, empresaId]
    );
    const r = await pool.query(`SELECT public.cc_assign_conversation($1, $2::uuid, $3::uuid) AS r`, [
      sch,
      empresaId,
      conversationId,
    ]);
    const row = (r.rows[0] as { r?: { assigned?: boolean; reason?: string; agent_id?: string } } | undefined)?.r;
    return { ok: true, assigned: Boolean(row?.assigned), reason: row?.reason, agent_id: row?.agent_id };
  } catch (e) {
    // Falla del Contact Center V1 → el webhook hace fallback al motor legacy.
    return ccError(e);
  }
}

/** Vía PostgREST (schema tenant expuesto, p. ej. neura). Nunca lanza. */
export async function applyInboundWindowAndAssignRest(
  supabase: SupabaseAdmin,
  schema: string,
  empresaId: string,
  conversationId: string
): Promise<CcInboundResult> {
  try {
    const sch = assertAllowedChatDataSchema(schema);
    const ts = new Date().toISOString();
    const expires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    const { error: upErr } = await supabase
      .from("chat_conversations")
      .update({
        last_customer_message_at: ts,
        whatsapp_window_expires_at: expires,
        needs_template_response: false,
        updated_at: ts,
      })
      .eq("id", conversationId)
      .eq("empresa_id", empresaId);
    if (upErr) return { ok: false, error: upErr.message };

    // RPC vive en `public`; el cliente de chat está scopeado al schema del tenant.
    const sb = supabase as unknown as {
      schema: (s: string) => { rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }> };
    };
    const { data, error } = await sb.schema("public").rpc("cc_assign_conversation", {
      p_schema: sch,
      p_empresa_id: empresaId,
      p_conversation_id: conversationId,
    });
    if (error) return { ok: false, error: error.message };
    const row = (data ?? {}) as { assigned?: boolean; reason?: string; agent_id?: string };
    return { ok: true, assigned: Boolean(row.assigned), reason: row.reason, agent_id: row.agent_id };
  } catch (e) {
    // Falla del Contact Center V1 → el webhook hace fallback al motor legacy.
    return ccError(e);
  }
}
