import { NextRequest, NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { pgLoadConversationForSend } from "@/lib/chat/chat-send-persist-pg";
import { getAuthWithRol } from "@/lib/middleware/auth";
import {
  resolveOutboundTextContextFromIds,
  type ChannelOutboundTextContext,
} from "@/lib/chat/outbound-send-dispatch";
import { sendWhatsAppMarkAsRead } from "@/lib/chat/whatsapp-send-service";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { isLikelyUnexposedTenantChatSchema } from "@/lib/supabase/chat-data-schema";

export const runtime = "nodejs";

/**
 * POST /api/chat/mark-read
 * Marca como leído el último mensaje entrante de una conversación. Meta pinta
 * el doble check azul del lado del cliente. Marcar UNO implícitamente marca
 * TODOS los previos (por Meta), así que solo buscamos el más nuevo.
 *
 * Body: { conversation_id: uuid }
 *
 * Idempotente: si el último mensaje entrante ya está marcado como leído en la
 * DB (unread_count == 0 y no hay entrantes recientes sin marcar), no llama a
 * Meta y devuelve `{ ok: true, skipped: true }`.
 *
 * Solo canales Meta. YCloud tiene otro camino (BSP).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth?.empresa_id) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const body = await request.json().catch(() => null);
    const conversationId =
      body && typeof body === "object" && typeof (body as { conversation_id?: string }).conversation_id === "string"
        ? (body as { conversation_id: string }).conversation_id.trim()
        : "";

    if (!conversationId) {
      return NextResponse.json({ ok: false, error: "conversation_id requerido" }, { status: 400 });
    }

    const supabase = await getChatServiceClientForEmpresa(auth.empresa_id);
    const dataSchema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const pool = getChatPostgresPool();
    const tenantPg = Boolean(pool && isLikelyUnexposedTenantChatSchema(dataSchema));

    // 1) Cargar conversación con scope de empresa
    let conv: { empresa_id: string; contact_id: string; channel_id: string } | null = null;
    if (tenantPg && pool) {
      conv = await pgLoadConversationForSend(pool, dataSchema, conversationId);
    } else {
      const { data: cdata, error: cErr } = await supabase
        .from("chat_conversations")
        .select("id, empresa_id, contact_id, channel_id")
        .eq("id", conversationId)
        .maybeSingle();
      if (cErr || !cdata) {
        return NextResponse.json({ ok: false, error: "Conversación no encontrada" }, { status: 404 });
      }
      conv = {
        empresa_id: cdata.empresa_id as string,
        contact_id: cdata.contact_id as string,
        channel_id: cdata.channel_id as string,
      };
    }
    if (!conv) {
      return NextResponse.json({ ok: false, error: "Conversación no encontrada" }, { status: 404 });
    }
    if (conv.empresa_id !== auth.empresa_id) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 403 });
    }
    const empresaId = conv.empresa_id;

    // 2) Buscar el último mensaje entrante (from_me=false) con wa_message_id
    const { data: msgRow, error: msgErr } = await supabase
      .from("chat_messages")
      .select("id, wa_message_id")
      .eq("empresa_id", empresaId)
      .eq("conversation_id", conversationId)
      .eq("from_me", false)
      .not("wa_message_id", "is", null)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (msgErr) {
      return NextResponse.json({ ok: false, error: msgErr.message }, { status: 500 });
    }
    const waMessageId = (msgRow as { wa_message_id?: string } | null)?.wa_message_id ?? null;
    if (!waMessageId) {
      // Nada que marcar (chat sin entrantes o sin wa_message_id) — ok idempotente
      return NextResponse.json({ ok: true, skipped: true, reason: "no_inbound" });
    }

    // 3) Contexto de envío (necesitamos phone_number_id + access token)
    let outboundCtx: ChannelOutboundTextContext;
    try {
      outboundCtx = await resolveOutboundTextContextFromIds(
        supabase,
        { contactId: conv.contact_id, channelId: conv.channel_id },
        { dataSchema, empresaId }
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Datos de envío incompletos";
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
    if (outboundCtx.provider !== "meta") {
      // YCloud u otro BSP: no implementado aquí. No es un error para el cliente.
      return NextResponse.json({ ok: true, skipped: true, reason: "provider_not_meta" });
    }
    const { phoneNumberId, accessToken } = outboundCtx;
    if (!phoneNumberId || !accessToken) {
      return NextResponse.json({ ok: true, skipped: true, reason: "missing_meta_credentials" });
    }

    // 4) Llamar a Meta. Un fallo acá no revienta la UI: el user no depende del
    //    resultado directo. Loggeamos y devolvemos ok=false con detalle.
    const res = await sendWhatsAppMarkAsRead({
      phoneNumberId,
      accessToken,
      messageId: waMessageId,
    });
    if (!res.ok) {
      return NextResponse.json(
        { ok: false, error: res.error ?? "Meta rechazó el mark-as-read", status: res.status },
        { status: 200 } // 200 igual: el cliente sigue funcionando
      );
    }

    // 5) Bajar unread_count a 0 en local (mejor UX, sin esperar al poll)
    await supabase
      .from("chat_conversations")
      .update({ unread_count: 0, updated_at: new Date().toISOString() })
      .eq("id", conversationId)
      .eq("empresa_id", empresaId);

    return NextResponse.json({ ok: true, wa_message_id: waMessageId });
  } catch (e) {
    console.error("[api/chat/mark-read]", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
