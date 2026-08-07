import { NextRequest, NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { pgLoadConversationForSend } from "@/lib/chat/chat-send-persist-pg";
import { markFirstHumanOperatorReply } from "@/lib/chat/conversation-sla-markers";
import { getAuthWithRol } from "@/lib/middleware/auth";
import {
  resolveOutboundTextContextFromIds,
  type ChannelOutboundTextContext,
} from "@/lib/chat/outbound-send-dispatch";
import { sendWhatsAppSticker } from "@/lib/chat/whatsapp-send-service";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { isLikelyUnexposedTenantChatSchema } from "@/lib/supabase/chat-data-schema";

export const runtime = "nodejs";

/**
 * POST /api/chat/send-sticker
 * Manda un sticker de la biblioteca a una conversación de WhatsApp.
 *
 * Body: { conversation_id: uuid, sticker_id: uuid }
 *
 * Notas:
 *  - Solo canales `provider = "meta"` por ahora. YCloud sticker no está soportado.
 *  - El sticker debe existir en aigonerp.stickers y pertenecer a la empresa del usuario.
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
    const stickerId =
      body && typeof body === "object" && typeof (body as { sticker_id?: string }).sticker_id === "string"
        ? (body as { sticker_id: string }).sticker_id.trim()
        : "";

    if (!conversationId || !stickerId) {
      return NextResponse.json(
        { ok: false, error: "conversation_id y sticker_id son obligatorios" },
        { status: 400 }
      );
    }

    const supabase = await getChatServiceClientForEmpresa(auth.empresa_id);
    const dataSchema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const pool = getChatPostgresPool();
    const tenantPg = Boolean(pool && isLikelyUnexposedTenantChatSchema(dataSchema));

    // 1) Cargar la conversación (mismo patrón que send-media)
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

    // 2) Cargar el sticker (mismo tenant)
    const { data: stickerRow, error: stErr } = await supabase
      .from("stickers")
      .select("id, empresa_id, public_url, storage_path")
      .eq("id", stickerId)
      .eq("empresa_id", empresaId)
      .maybeSingle();
    if (stErr) {
      return NextResponse.json({ ok: false, error: stErr.message }, { status: 500 });
    }
    if (!stickerRow) {
      return NextResponse.json({ ok: false, error: "Sticker no encontrado" }, { status: 404 });
    }
    const sticker = stickerRow as { id: string; public_url: string; storage_path: string };

    // 3) Contexto de envío
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
      return NextResponse.json(
        { ok: false, error: "El envío de stickers requiere un canal Meta (Cloud API)" },
        { status: 400 }
      );
    }

    const { toDigits, phoneNumberId, accessToken } = outboundCtx;
    if (!toDigits || !phoneNumberId || !accessToken) {
      return NextResponse.json(
        { ok: false, error: "Falta configuración de envío (teléfono/token/phone_number_id)" },
        { status: 400 }
      );
    }

    // 4) Enviar a WhatsApp
    const send = await sendWhatsAppSticker({
      toDigits,
      phoneNumberId,
      accessToken,
      stickerUrl: sticker.public_url,
    });
    if (!send.ok) {
      return NextResponse.json(
        { ok: false, error: send.error ?? "Meta rechazó el sticker" },
        { status: 400 }
      );
    }

    // 5) Persistir el mensaje saliente
    const ts = new Date().toISOString();
    const { error: insErr } = await supabase.from("chat_messages").insert({
      empresa_id: empresaId,
      conversation_id: conversationId,
      wa_message_id: send.waMessageId,
      from_me: true,
      sender_type: "human",
      sent_by_user_id: auth.user.id,
      sent_by_user_name: auth.nombre ?? auth.user.email ?? null,
      message_type: "sticker",
      content: `Sticker enviado\n${sticker.public_url}`,
      raw_payload: {
        ...(send.raw && typeof send.raw === "object" ? send.raw : {}),
        erp: {
          public_url: sticker.public_url,
          storage_path: sticker.storage_path,
          mime_type: "image/webp",
          sticker_id: sticker.id,
        },
      } as Record<string, unknown>,
    });
    if (insErr) {
      return NextResponse.json(
        { ok: false, error: "Enviado a WhatsApp pero no guardado: " + insErr.message },
        { status: 500 }
      );
    }

    await supabase
      .from("chat_conversations")
      .update({
        last_message_at: ts,
        last_message_preview: "Sticker enviado",
        updated_at: ts,
      })
      .eq("id", conversationId);

    await markFirstHumanOperatorReply(supabase, empresaId, conversationId, {
      from_me: true,
      sender_type: "human",
    });

    return NextResponse.json({ ok: true, wa_message_id: send.waMessageId });
  } catch (e) {
    console.error("[api/chat/send-sticker]", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
