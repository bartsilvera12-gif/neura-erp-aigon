import { NextRequest, NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { pgLoadConversationForSend } from "@/lib/chat/chat-send-persist-pg";
import { markFirstHumanOperatorReply } from "@/lib/chat/conversation-sla-markers";
import { getAuthWithRol } from "@/lib/middleware/auth";
import {
  resolveOutboundTextContextFromIds,
  type ChannelOutboundTextContext,
} from "@/lib/chat/outbound-send-dispatch";
import { sendWhatsAppTemplateMessage, type SendWhatsAppTextResult } from "@/lib/chat/whatsapp-send-service";
import { sendYCloudWhatsappTemplateMessage } from "@/lib/chat/ycloud-send-service";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { isLikelyUnexposedTenantChatSchema } from "@/lib/supabase/chat-data-schema";
import { buildMetaCloudTemplatePayload } from "@/lib/campaigns/campaign-template-payload";
import {
  extractBodyPlaceholderKeysOrdered,
  getBodyComponentText,
  PLACEHOLDER_RE,
} from "@/lib/campaigns/campaign-placeholders-shared";

/**
 * POST /api/chat/send-template
 * body: { conversation_id, template_id, variables: { slot: valor } }
 * Envía una plantilla WhatsApp APROBADA a la conversación (recontacto). Reabre la conversación
 * (status='open') y persiste el mensaje saliente. El webhook de estado marcará "No entregado" si
 * WhatsApp la rechaza, igual que un mensaje normal.
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth?.empresa_id) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as {
      conversation_id?: string;
      template_id?: string;
      variables?: Record<string, string>;
    } | null;
    const conversationId = String(body?.conversation_id ?? "").trim();
    const templateId = String(body?.template_id ?? "").trim();
    const variables =
      body?.variables && typeof body.variables === "object" ? (body.variables as Record<string, string>) : {};
    if (!conversationId || !templateId) {
      return NextResponse.json({ ok: false, error: "conversation_id y template_id requeridos" }, { status: 400 });
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
          empresa_id: cdata.empresa_id as string,
          contact_id: cdata.contact_id as string,
          channel_id: cdata.channel_id as string,
        };
      }
    }
    if (!conv) return NextResponse.json({ ok: false, error: "Conversación no encontrada" }, { status: 404 });
    if (conv.empresa_id !== auth.empresa_id) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 403 });
    }
    const empresaId = conv.empresa_id;

    // Plantilla (aprobada) del canal.
    const { data: tplRow, error: tErr } = await supabase
      .from("chat_campaign_templates")
      .select("id, name, language, components_json, status")
      .eq("empresa_id", empresaId)
      .eq("id", templateId)
      .maybeSingle();
    const tpl = tplRow as
      | { name?: string; language?: string; components_json?: unknown; status?: string }
      | null;
    if (tErr || !tpl) return NextResponse.json({ ok: false, error: "Plantilla no encontrada" }, { status: 404 });
    if (String(tpl.status ?? "").toUpperCase() !== "APPROVED") {
      return NextResponse.json({ ok: false, error: "La plantilla no está aprobada" }, { status: 400 });
    }
    const components = Array.isArray(tpl.components_json) ? (tpl.components_json as unknown[]) : [];
    const templateName = String(tpl.name ?? "");
    const languageCode = String(tpl.language ?? "es");

    // Variables del cuerpo: todas obligatorias (WhatsApp rechaza plantillas con parámetros vacíos).
    const slots = extractBodyPlaceholderKeysOrdered(components);
    const mappedBySlot: Record<string, string> = {};
    const missing: string[] = [];
    for (const s of slots) {
      const v = String(variables[s] ?? "").trim();
      if (!v) missing.push(s);
      mappedBySlot[s] = v;
    }
    if (missing.length > 0) {
      return NextResponse.json({ ok: false, error: `Faltan completar variables: ${missing.join(", ")}` }, { status: 400 });
    }

    // Contexto de envío (proveedor + credenciales + teléfono destino).
    let outboundCtx: ChannelOutboundTextContext;
    try {
      outboundCtx = await resolveOutboundTextContextFromIds(
        supabase,
        { contactId: conv.contact_id, channelId: conv.channel_id },
        { dataSchema, empresaId }
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Datos de envío incompletos";
      let status = 400;
      if (msg.includes("token") || msg.includes("ycloud_api_key")) status = 500;
      return NextResponse.json({ ok: false, error: msg }, { status });
    }
    const toDigits = outboundCtx.toDigits;
    if (!toDigits) return NextResponse.json({ ok: false, error: "Falta teléfono del contacto" }, { status: 400 });

    const templatePayload = buildMetaCloudTemplatePayload({
      templateName,
      languageCode,
      componentsSnapshot: components,
      mappedBySlot,
    });

    let sendResult: SendWhatsAppTextResult;
    if (outboundCtx.provider === "ycloud") {
      sendResult = await sendYCloudWhatsappTemplateMessage({
        apiKey: outboundCtx.apiKey,
        fromE164: outboundCtx.fromE164,
        toDigits,
        templatePayload,
      });
    } else {
      sendResult = await sendWhatsAppTemplateMessage({
        toDigits,
        phoneNumberId: outboundCtx.phoneNumberId,
        accessToken: outboundCtx.accessToken,
        templatePayload,
      });
    }
    if (!sendResult.ok) {
      return NextResponse.json({ ok: false, error: sendResult.error, meta: sendResult.raw }, { status: 502 });
    }

    // Texto para el inbox = cuerpo de la plantilla con las variables ya reemplazadas.
    const bodyText = getBodyComponentText(components).replace(PLACEHOLDER_RE, (_m, rawKey: string) => {
      const k = String(rawKey).trim();
      return mappedBySlot[k] ?? `{{${k}}}`;
    });
    const contentLabel = (bodyText || `Plantilla ${templateName}`).trim();

    const ts = new Date().toISOString();
    const { error: insErr } = await supabase.from("chat_messages").insert({
      empresa_id: empresaId,
      conversation_id: conversationId,
      wa_message_id: sendResult.waMessageId,
      from_me: true,
      sender_type: "human",
      sent_by_user_id: auth.user.id,
      sent_by_user_name: auth.nombre ?? auth.user.email ?? null,
      message_type: "template",
      content: contentLabel,
      raw_payload: {
        ...(sendResult.raw && typeof sendResult.raw === "object" ? sendResult.raw : {}),
        erp: { template_name: templateName, language: languageCode, variables: mappedBySlot },
      } as Record<string, unknown>,
    });
    if (insErr) {
      return NextResponse.json(
        { ok: false, error: "Enviado a WhatsApp pero no guardado: " + insErr.message },
        { status: 500 }
      );
    }

    // Recontacto → reabrir la conversación para que vuelva al inbox (si estaba finalizada).
    await supabase
      .from("chat_conversations")
      .update({
        status: "open",
        last_message_at: ts,
        last_message_preview: contentLabel.slice(0, 280),
        updated_at: ts,
      })
      .eq("id", conversationId)
      .eq("empresa_id", empresaId);

    await markFirstHumanOperatorReply(supabase, empresaId, conversationId, {
      from_me: true,
      sender_type: "human",
    });

    return NextResponse.json({ ok: true, wa_message_id: sendResult.waMessageId });
  } catch (e) {
    console.error("[api/chat/send-template]", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
