import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { pgLoadConversationForSend } from "@/lib/chat/chat-send-persist-pg";
import {
  resolveOutboundTextContextFromIds,
  type ChannelOutboundTextContext,
} from "@/lib/chat/outbound-send-dispatch";
import { sendWhatsAppReaction } from "@/lib/chat/whatsapp-send-service";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { isLikelyUnexposedTenantChatSchema } from "@/lib/supabase/chat-data-schema";

export const runtime = "nodejs";

/**
 * POST /api/chat/react
 * Body: { conversation_id, wa_message_id, emoji }
 *
 * Envía una reacción a Meta (message.type=reaction) y persiste una fila
 * chat_messages con message_type='reaction' y content=<emoji>. En el raw_payload
 * queda `erp.reaction_target_wa_message_id` para que la UI pueda agrupar la
 * reacción bajo la burbuja del mensaje al que apunta.
 *
 * `emoji` vacío = quitar la reacción previa (Meta lo interpreta así).
 * Solo canales meta. YCloud queda para otra iteración.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth?.empresa_id) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      conversation_id?: string;
      wa_message_id?: string;
      emoji?: string;
    } | null;
    const conversationId = typeof body?.conversation_id === "string" ? body.conversation_id.trim() : "";
    const targetWaMessageId = typeof body?.wa_message_id === "string" ? body.wa_message_id.trim() : "";
    // Meta acepta emoji vacío para BORRAR una reacción previa. No trimeamos a null.
    const emoji = typeof body?.emoji === "string" ? body.emoji : "";

    if (!conversationId || !targetWaMessageId) {
      return NextResponse.json(
        { ok: false, error: "conversation_id y wa_message_id requeridos" },
        { status: 400 }
      );
    }

    const supabase = await getChatServiceClientForEmpresa(auth.empresa_id);
    const dataSchema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const pool = getChatPostgresPool();
    const tenantPg = Boolean(pool && isLikelyUnexposedTenantChatSchema(dataSchema));

    let conv: { empresa_id: string; contact_id: string; channel_id: string } | null = null;
    if (tenantPg && pool) {
      conv = await pgLoadConversationForSend(pool, dataSchema, conversationId);
    } else {
      const { data: cdata } = await supabase
        .from("chat_conversations")
        .select("id, empresa_id, contact_id, channel_id")
        .eq("id", conversationId)
        .maybeSingle();
      if (cdata) {
        conv = {
          empresa_id: (cdata as { empresa_id: string }).empresa_id,
          contact_id: (cdata as { contact_id: string }).contact_id,
          channel_id: (cdata as { channel_id: string }).channel_id,
        };
      }
    }
    if (!conv) {
      return NextResponse.json({ ok: false, error: "Conversación no encontrada" }, { status: 404 });
    }
    if (conv.empresa_id !== auth.empresa_id) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 403 });
    }

    let outboundCtx: ChannelOutboundTextContext;
    try {
      outboundCtx = await resolveOutboundTextContextFromIds(
        supabase,
        { contactId: conv.contact_id, channelId: conv.channel_id },
        { dataSchema, empresaId: conv.empresa_id }
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Datos de envío incompletos";
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }
    if (outboundCtx.provider !== "meta") {
      return NextResponse.json(
        { ok: false, error: "Reacciones solo soportadas en canales Meta por ahora" },
        { status: 400 }
      );
    }
    const { phoneNumberId, accessToken } = outboundCtx;
    if (!phoneNumberId || !accessToken) {
      return NextResponse.json(
        { ok: false, error: "Credenciales Meta incompletas" },
        { status: 400 }
      );
    }

    // Se necesita el número del contacto en formato dígitos para el `to`.
    // El outboundCtx normalmente ya lo trae; si no, lo levantamos del contacto.
    const toDigits =
      (outboundCtx as unknown as { toDigits?: string }).toDigits?.trim() || "";
    let toDigitsResolved = toDigits;
    if (!toDigitsResolved) {
      const { data: ct } = await supabase
        .from("chat_contacts")
        .select("phone_number")
        .eq("id", conv.contact_id)
        .maybeSingle();
      toDigitsResolved =
        ((ct as { phone_number?: string } | null)?.phone_number ?? "")
          .replace(/[^\d]/g, "")
          .trim();
    }
    if (!toDigitsResolved) {
      return NextResponse.json({ ok: false, error: "Sin teléfono del contacto" }, { status: 400 });
    }

    const sendRes = await sendWhatsAppReaction({
      phoneNumberId,
      accessToken,
      toDigits: toDigitsResolved,
      targetMessageId: targetWaMessageId,
      emoji,
    });

    if (!sendRes.ok) {
      return NextResponse.json(
        { ok: false, error: sendRes.error, status: sendRes.status },
        { status: 502 }
      );
    }

    // Persistir localmente para que la UI muestre la reacción sin esperar webhook.
    const ts = new Date().toISOString();
    const rawWithErp: Record<string, unknown> = {
      ...((sendRes.raw ?? {}) as Record<string, unknown>),
      erp: { reaction_target_wa_message_id: targetWaMessageId },
    };

    const { error: insErr } = await supabase.from("chat_messages").insert({
      empresa_id: conv.empresa_id,
      conversation_id: conversationId,
      wa_message_id: sendRes.waMessageId,
      from_me: true,
      sender_type: "human",
      sent_by_user_id: auth.user.id,
      sent_by_user_name: auth.nombre ?? auth.user.email ?? null,
      message_type: "reaction",
      content: emoji,
      raw_payload: rawWithErp,
      created_at: ts,
    });

    if (insErr) {
      // La reacción llegó a Meta pero no la persistimos. No es fatal — el webhook
      // de estatus podría re-emitir, pero avisamos con warn.
      console.warn("[api/chat/react] insert_local_fail", insErr.message);
    }

    return NextResponse.json({ ok: true, wa_message_id: sendRes.waMessageId });
  } catch (e) {
    console.error("[api/chat/react]", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
