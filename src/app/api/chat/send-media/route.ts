import { NextRequest, NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { pgLoadConversationForSend } from "@/lib/chat/chat-send-persist-pg";
import { markFirstHumanOperatorReply } from "@/lib/chat/conversation-sla-markers";
import { getAuthWithRol } from "@/lib/middleware/auth";
import {
  resolveOutboundTextContextFromIds,
  type ChannelOutboundTextContext,
} from "@/lib/chat/outbound-send-dispatch";
import {
  sendWhatsAppAudio,
  sendWhatsAppDocument,
  sendWhatsAppImage,
  sendWhatsAppVideo,
  type SendWhatsAppTextResult,
} from "@/lib/chat/whatsapp-send-service";
import {
  sendYCloudWhatsappMediaViaLink,
  sendYCloudWhatsappAudioById,
  uploadYCloudWhatsappMedia,
} from "@/lib/chat/ycloud-send-service";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { isLikelyUnexposedTenantChatSchema } from "@/lib/supabase/chat-data-schema";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const CHAT_MEDIA_BUCKET = "chat-media";
const execFileAsync = promisify(execFile);

function safeFileName(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]+/g, "_").slice(0, 120) || "archivo";
}

/**
 * Convierte el audio grabado (webm/opus) -> MP3 (audio/mpeg) para enviarlo como AUDIO NORMAL
 * (no nota de voz).
 *
 * Por qué MP3 y no ogg/opus con voice:true: las NOTAS DE VOZ enviadas por la API de WhatsApp
 * (`voice: true`) son inestables del lado del receptor — aunque se entreguen (status delivered/
 * read), a muchos clientes les muestra "Este audio ya no está disponible" al reproducir. El MP3
 * como audio normal se descarga al teléfono del cliente y queda reproducible de forma confiable
 * (pierde la onda de "nota de voz", pero SIEMPRE se escucha). Mono 64k es más que suficiente para voz.
 *
 * Usa execFile con args array (sin shell) y archivos temporales con nombres propios. Lanza si
 * ffmpeg no está disponible o no produce salida → el caller NO envía el webm crudo.
 */
async function transcodeAudioToMp3(input: Buffer): Promise<Buffer> {
  const dir = await mkdtemp(join(tmpdir(), "ccaudio-"));
  const inPath = join(dir, "in.webm");
  const outPath = join(dir, "out.mp3");
  try {
    await writeFile(inPath, input);
    await execFileAsync(
      "ffmpeg",
      [
        "-y", "-hide_banner", "-loglevel", "error",
        "-i", inPath,
        "-vn",
        "-c:a", "libmp3lame", "-b:a", "64k", "-ar", "44100", "-ac", "1",
        "-f", "mp3", outPath,
      ],
      { timeout: 60000 }
    );
    const out = await readFile(outPath);
    if (!out || out.length < 1) throw new Error("ffmpeg produjo un MP3 vacío");
    return out;
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * POST multipart: conversation_id, file (opcional caption)
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth?.empresa_id) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const form = await request.formData().catch(() => null);
    const convRaw = form?.get("conversation_id");
    const conversationId = typeof convRaw === "string" ? convRaw.trim() : "";
    const capRaw = form?.get("caption");
    const caption = typeof capRaw === "string" ? capRaw.trim().slice(0, 1024) : "";
    const file = form?.get("file");

    if (!conversationId || !(file instanceof File) || file.size < 1) {
      return NextResponse.json(
        { ok: false, error: "Se requiere conversation_id y archivo" },
        { status: 400 }
      );
    }

    const maxBytes = 15 * 1024 * 1024;
    if (file.size > maxBytes) {
      return NextResponse.json({ ok: false, error: "Archivo demasiado grande (máx. 15 MB)" }, { status: 400 });
    }

    const supabase = await getChatServiceClientForEmpresa(auth.empresa_id);
    const dataSchema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const pool = getChatPostgresPool();
    const tenantPg = Boolean(pool && isLikelyUnexposedTenantChatSchema(dataSchema));

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
      if (msg.includes("desactivado")) status = 403;
      else if (msg.includes("configuración completa")) status = 400;
      else if (msg.includes("token") || msg.includes("ycloud_api_key")) status = 500;
      return NextResponse.json({ ok: false, error: msg }, { status });
    }

    const toDigits = outboundCtx.toDigits;
    const provider = outboundCtx.provider;
    const ycloudApiKey = provider === "ycloud" ? outboundCtx.apiKey : "";
    const ycloudFromE164 = provider === "ycloud" ? outboundCtx.fromE164 : null;
    const phoneNumberId = provider === "meta" ? outboundCtx.phoneNumberId : null;
    const token = provider === "meta" ? outboundCtx.accessToken : null;

    if (!toDigits) {
      return NextResponse.json({ ok: false, error: "Falta teléfono del contacto" }, { status: 400 });
    }

    const { data: buckets } = await supabase.storage.listBuckets();
    if (!(buckets ?? []).some((b) => b.name === CHAT_MEDIA_BUCKET)) {
      const { error: bcErr } = await supabase.storage.createBucket(CHAT_MEDIA_BUCKET, {
        public: true,
        fileSizeLimit: "15MB",
      });
      if (bcErr && !bcErr.message.toLowerCase().includes("already exists")) {
        return NextResponse.json({ ok: false, error: bcErr.message }, { status: 500 });
      }
    }

    const originalMime = (file.type || "").toLowerCase();
    let buf: Buffer = Buffer.from(await file.arrayBuffer());
    let origName = safeFileName(file.name || "archivo");
    let uploadMime = file.type || "application/octet-stream";

    // El audio grabado (webm/opus del MediaRecorder, desktop y APK) se transcodea a MP3 y se
    // envía como AUDIO NORMAL (no nota de voz). Las notas de voz por API (voice:true) llegan pero
    // son inestables para reproducir en el cliente ("audio ya no está disponible"), incluso
    // entregadas. El MP3 como audio normal se descarga al teléfono y se reproduce confiablemente.
    const isAudioWebm =
      originalMime.startsWith("audio/") &&
      (originalMime.includes("webm") || /\.webm$/i.test(file.name || ""));
    if (isAudioWebm) {
      try {
        buf = await transcodeAudioToMp3(buf);
      } catch (e) {
        return NextResponse.json(
          {
            ok: false,
            error: "No se pudo convertir el audio a MP3 (ffmpeg): " + (e instanceof Error ? e.message : String(e)),
          },
          { status: 500 }
        );
      }
      origName = (origName.replace(/\.webm$/i, "") || "audio") + ".mp3";
      uploadMime = "audio/mpeg";
    }

    const objectPath = `${empresaId}/${conversationId}/out_${Date.now()}_${origName}`;

    const { error: upErr } = await supabase.storage
      .from(CHAT_MEDIA_BUCKET)
      .upload(objectPath, buf, {
        contentType: uploadMime,
        upsert: true,
      });

    if (upErr) {
      return NextResponse.json({ ok: false, error: "No se pudo subir el archivo: " + upErr.message }, { status: 500 });
    }

    const { data: pub } = supabase.storage.from(CHAT_MEDIA_BUCKET).getPublicUrl(objectPath);
    const publicUrl = pub?.publicUrl;
    if (!publicUrl) {
      return NextResponse.json({ ok: false, error: "No se pudo obtener URL pública del archivo" }, { status: 500 });
    }

    // mime EFECTIVO (tras posible remux) para rutear el tipo a WhatsApp/YCloud.
    const mime = uploadMime.toLowerCase();
    const isImage = mime.startsWith("image/");
    const isAudio = mime.startsWith("audio/");
    const isVideo = mime.startsWith("video/");

    let sendResult: SendWhatsAppTextResult;
    let outboundMessageType: "image" | "document" | "audio" | "video";

    if (provider === "ycloud") {
      if (isImage) {
        outboundMessageType = "image";
        sendResult = await sendYCloudWhatsappMediaViaLink({
          apiKey: ycloudApiKey,
          fromE164: ycloudFromE164!,
          toDigits,
          kind: "image",
          mediaLink: publicUrl,
          caption: caption || undefined,
        });
      } else if (isAudio) {
        outboundMessageType = "audio";
        // AUDIO NORMAL (no nota de voz): subimos el MP3 a YCloud y enviamos por MEDIA ID SIN
        // voice:true. Las notas de voz por API son inestables para reproducir en el cliente
        // ("audio ya no está disponible") aunque se entreguen; el audio normal (mp3) se descarga
        // y se reproduce siempre. Si la subida falla, degradamos al link.
        const uploaded = await uploadYCloudWhatsappMedia({
          apiKey: ycloudApiKey,
          fromE164: ycloudFromE164!,
          bytes: buf,
          filename: origName,
          contentType: uploadMime,
        });
        if (uploaded.ok) {
          sendResult = await sendYCloudWhatsappAudioById({
            apiKey: ycloudApiKey,
            fromE164: ycloudFromE164!,
            toDigits,
            mediaId: uploaded.mediaId,
            voice: false,
          });
        } else {
          console.warn("[api/chat/send-media] upload YCloud audio falló, fallback a link:", uploaded.error);
          sendResult = await sendYCloudWhatsappMediaViaLink({
            apiKey: ycloudApiKey,
            fromE164: ycloudFromE164!,
            toDigits,
            kind: "audio",
            mediaLink: publicUrl,
          });
        }
      } else if (isVideo) {
        outboundMessageType = "video";
        sendResult = await sendYCloudWhatsappMediaViaLink({
          apiKey: ycloudApiKey,
          fromE164: ycloudFromE164!,
          toDigits,
          kind: "video",
          mediaLink: publicUrl,
          caption: caption || undefined,
        });
      } else {
        outboundMessageType = "document";
        sendResult = await sendYCloudWhatsappMediaViaLink({
          apiKey: ycloudApiKey,
          fromE164: ycloudFromE164!,
          toDigits,
          kind: "document",
          mediaLink: publicUrl,
          filename: origName,
          caption: caption || undefined,
        });
      }
    } else if (isImage) {
      outboundMessageType = "image";
      sendResult = await sendWhatsAppImage({
        toDigits,
        phoneNumberId: phoneNumberId!,
        accessToken: token!,
        imageUrl: publicUrl,
        caption: caption || undefined,
      });
    } else if (isAudio) {
      outboundMessageType = "audio";
      sendResult = await sendWhatsAppAudio({
        toDigits,
        phoneNumberId: phoneNumberId!,
        accessToken: token!,
        audioUrl: publicUrl,
      });
    } else if (isVideo) {
      outboundMessageType = "video";
      sendResult = await sendWhatsAppVideo({
        toDigits,
        phoneNumberId: phoneNumberId!,
        accessToken: token!,
        videoUrl: publicUrl,
        caption: caption || undefined,
      });
    } else {
      outboundMessageType = "document";
      sendResult = await sendWhatsAppDocument({
        toDigits,
        phoneNumberId: phoneNumberId!,
        accessToken: token!,
        link: publicUrl,
        filename: origName,
        caption: caption || undefined,
      });
    }

    if (!sendResult.ok) {
      return NextResponse.json(
        { ok: false, error: sendResult.error, meta: sendResult.raw },
        { status: 502 }
      );
    }

    const ts = new Date().toISOString();
    const contentLabel =
      outboundMessageType === "image"
        ? caption
          ? `Imagen: ${caption}\n${publicUrl}`
          : `Imagen enviada\n${publicUrl}`
        : outboundMessageType === "audio"
          ? caption
            ? `Audio: ${caption}\n${publicUrl}`
            : `Audio enviado\n${publicUrl}`
          : outboundMessageType === "video"
            ? caption
              ? `Video: ${caption}\n${publicUrl}`
              : `Video enviado\n${publicUrl}`
            : caption
              ? `Documento: ${origName}\n${caption}\n${publicUrl}`
              : `Documento: ${origName}\n${publicUrl}`;

    const { error: insErr } = await supabase.from("chat_messages").insert({
      empresa_id: empresaId,
      conversation_id: conversationId,
      wa_message_id: sendResult.waMessageId,
      from_me: true,
      sender_type: "human",
      sent_by_user_id: auth.user.id,
      sent_by_user_name: auth.nombre ?? auth.user.email ?? null,
      message_type: outboundMessageType,
      content: contentLabel,
      raw_payload: {
        ...(sendResult.raw && typeof sendResult.raw === "object" ? sendResult.raw : {}),
        erp: {
          public_url: publicUrl,
          storage_path: objectPath,
          mime_type: uploadMime,
          original_mime: originalMime || null,
          filename: origName,
          caption: caption || null,
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
        last_message_preview: contentLabel.slice(0, 280),
        updated_at: ts,
      })
      .eq("id", conversationId);

    await markFirstHumanOperatorReply(supabase, empresaId, conversationId, {
      from_me: true,
      sender_type: "human",
    });

    return NextResponse.json({ ok: true, wa_message_id: sendResult.waMessageId, public_url: publicUrl });
  } catch (e) {
    console.error("[api/chat/send-media]", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
