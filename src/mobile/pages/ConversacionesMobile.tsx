"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, FileText, ImagePlus, Mic, MessageCircle, Search, Send, Smile, Square, Star, X } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import {
  attachmentCaptionForDisplay,
  getErpAttachmentPublicUrl,
  getWhatsAppMediaUrlFromRawPayload,
  type RawPayload,
} from "@/lib/chat/message-erp-display";
import {
  sendMobileMediaFile,
  sendMobileMessage,
  useMobileInbox,
  useMobileMessages,
  type MobileChatConversation,
  type MobileChatMessage,
} from "@/shared/hooks/useChatMobile";

/**
 * Conversaciones mobile — vista funcional.
 *
 * Modo único de página: con query `?id=X` muestra el detalle del chat (mensajes
 * + composer). Sin query muestra la lista del inbox. Esto evita rutas dinámicas
 * separadas y mantiene el back-stack natural del browser/PWA.
 *
 * Limitaciones conocidas:
 *  - Solo recibe/envía TEXTO. Adjuntos (imágenes, audio) quedan para una iteración futura.
 *  - Polling cada 10s (mensajes) y 30s (inbox). No es realtime puro pero alcanza
 *    para la mayoría de los casos en movimiento.
 *  - No asigna ni transfiere conversaciones — eso queda para desktop.
 */
// ── Tipos + helpers stickers ────────────────────────────────────────────────

type StickerCatalogItem = { id: string; public_url: string; kind: string; orden: number };
type StickerCatalogPack = {
  id: string;
  nombre: string;
  orden: number;
  stickers: StickerCatalogItem[];
};

/** Carga catálogo. Cachea en memoria del módulo por session ligera. */
async function fetchStickerCatalog(): Promise<StickerCatalogPack[]> {
  const res = await fetchWithSupabaseSession("/api/chat/stickers", { cache: "no-store" });
  if (!res.ok) throw new Error(`Catálogo HTTP ${res.status}`);
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; packs?: StickerCatalogPack[] };
  if (!json.ok || !Array.isArray(json.packs)) throw new Error("Respuesta inválida");
  return json.packs;
}

async function sendStickerRequest(conversationId: string, stickerId: string) {
  const res = await fetchWithSupabaseSession("/api/chat/send-sticker", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ conversation_id: conversationId, sticker_id: stickerId }),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
}

async function saveStickerFromMessage(opts: {
  messageId: string;
  packId?: string;
  newPackName?: string;
}) {
  const res = await fetchWithSupabaseSession("/api/chat/stickers/save-from-message", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      message_id: opts.messageId,
      pack_id: opts.packId,
      new_pack_name: opts.newPackName,
    }),
  });
  const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
  if (!res.ok || !json.ok) throw new Error(json.error ?? `HTTP ${res.status}`);
}

export default function ConversacionesMobile() {
  const sp = useSearchParams();
  const router = useRouter();
  const selectedId = sp.get("id");

  if (selectedId) {
    return <ChatDetail conversationId={selectedId} onBack={() => router.push("/dashboard/conversaciones")} />;
  }
  return <InboxList />;
}

// ── Lista (inbox) ───────────────────────────────────────────────────────────

function InboxList() {
  const { conversations, isLoading, error } = useMobileInbox();
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return conversations;
    return conversations.filter((c) => {
      const nombre = (c.contact_nombre ?? c.contact_telefono ?? "").toLowerCase();
      const preview = (c.last_message_preview ?? "").toLowerCase();
      return nombre.includes(q) || preview.includes(q);
    });
  }, [conversations, query]);

  const totalUnread = useMemo(
    () => conversations.reduce((s, c) => s + (c.unread_count ?? 0), 0),
    [conversations]
  );

  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      <header className="mb-3">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Conversaciones</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          {conversations.length === 0
            ? "Sin conversaciones."
            : totalUnread > 0
              ? `${conversations.length} chats · ${totalUnread} mensajes sin leer`
              : `${conversations.length} chats`}
        </p>
      </header>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Buscar por nombre, teléfono o mensaje"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#0EA5E9]/40 focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]/30"
        />
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudo cargar el inbox.
        </div>
      ) : null}

      {isLoading && conversations.length === 0 ? (
        <SkeletonList />
      ) : filtered.length === 0 ? (
        <EmptyInbox hayBusqueda={!!query.trim()} />
      ) : (
        <ul className="space-y-2">
          {filtered.map((c) => (
            <ConversationCard key={c.id} conv={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

function ConversationCard({ conv }: { conv: MobileChatConversation }) {
  const nombre = conv.contact_nombre?.trim() || conv.contact_telefono?.trim() || "Sin contacto";
  const inicial = nombre.charAt(0).toUpperCase();
  const unread = conv.unread_count > 0;
  return (
    <li>
      <a
        href={`/dashboard/conversaciones?id=${encodeURIComponent(conv.id)}`}
        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-transform active:scale-[0.99]"
      >
        <div className="relative shrink-0">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#0EA5E9]/10 text-base font-bold text-[#0EA5E9]">
            {inicial}
          </div>
          {unread ? (
            <span
              aria-label={`${conv.unread_count} sin leer`}
              className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#0EA5E9] px-1 text-[10px] font-bold text-white ring-2 ring-white"
            >
              {conv.unread_count > 99 ? "99+" : conv.unread_count}
            </span>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline justify-between gap-2">
            <p className={`truncate text-sm ${unread ? "font-bold text-slate-900" : "font-semibold text-slate-800"}`}>
              {nombre}
            </p>
            {conv.last_message_at ? (
              <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
                {formatRelative(conv.last_message_at)}
              </span>
            ) : null}
          </div>
          <p className={`truncate text-[12px] ${unread ? "text-slate-700" : "text-slate-500"}`}>
            {conv.last_message_preview ?? "Sin mensajes"}
          </p>
          {conv.channel_name ? (
            <p className="mt-0.5 text-[10px] uppercase tracking-wider text-slate-400">
              {conv.channel_name}
            </p>
          ) : null}
        </div>
      </a>
    </li>
  );
}

// ── Detalle (chat individual) ───────────────────────────────────────────────

function ChatDetail({ conversationId, onBack }: { conversationId: string; onBack: () => void }) {
  const { messages, isLoading, mutate } = useMobileMessages(conversationId);
  const { conversations } = useMobileInbox();
  const conv = useMemo(
    () => conversations.find((c) => c.id === conversationId),
    [conversations, conversationId]
  );

  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [recordingSince, setRecordingSince] = useState<number | null>(null);
  const [stickerPickerOpen, setStickerPickerOpen] = useState(false);
  const [stickerCatalog, setStickerCatalog] = useState<StickerCatalogPack[] | null>(null);
  const [stickerCatalogLoading, setStickerCatalogLoading] = useState(false);
  /** Mensaje de sticker entrante seleccionado para guardar en un paquete. */
  const [saveStickerFor, setSaveStickerFor] = useState<MobileChatMessage | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);

  // Auto-scroll al fondo cuando llegan mensajes nuevos.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length]);

  const send = useCallback(async () => {
    const t = text.trim();
    if (!t || sending) return;
    setSending(true);
    setError(null);
    const res = await sendMobileMessage({ conversationId, text: t });
    if (!res.ok) {
      setError(res.error ?? "No se pudo enviar.");
    } else {
      setText("");
      await mutate();
    }
    setSending(false);
  }, [text, sending, conversationId, mutate]);

  /** Progreso de envío múltiple: mostramos "Enviando 2/5…" en el composer. */
  const [uploadQueue, setUploadQueue] = useState<{ current: number; total: number } | null>(null);

  /** Manejador del input file: sube 1..N fotos / documentos vía /api/chat/send-media secuencial. */
  const onPickFile = useCallback(
    async (ev: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(ev.target.files ?? []);
      // Reset del input para permitir seleccionar los mismos archivos dos veces seguidas.
      ev.target.value = "";
      if (files.length === 0) return;

      // Validaciones rápidas antes de arrancar: si UNO falla, cancelamos todo el batch.
      const MAX = 15 * 1024 * 1024;
      const invalid = files.find((f) => f.size < 1 || f.size > MAX);
      if (invalid) {
        setError(
          invalid.size < 1
            ? `El archivo "${invalid.name}" está vacío.`
            : `"${invalid.name}" supera 15 MB.`
        );
        return;
      }

      setSending(true);
      setError(null);
      const errors: string[] = [];

      // Secuencial: WhatsApp preserva el orden de entrega si mandamos uno a uno.
      // Paralelo llegaría más rápido pero mezclaría el orden de los mensajes.
      for (let i = 0; i < files.length; i++) {
        setUploadQueue({ current: i + 1, total: files.length });
        const res = await sendMobileMediaFile({ conversationId, file: files[i] });
        if (!res.ok) {
          errors.push(`${files[i].name}: ${res.error ?? "error"}`);
        }
      }

      setUploadQueue(null);
      if (errors.length > 0) {
        setError(
          errors.length === files.length
            ? "No se pudo enviar ningún archivo."
            : `Fallaron ${errors.length}/${files.length}: ${errors[0]}`
        );
      }
      await mutate();
      setSending(false);
    },
    [conversationId, mutate]
  );

  /** Envía el blob grabado por el MediaRecorder a /api/chat/send-media como audio. */
  const uploadVoiceBlob = useCallback(
    async (blob: Blob) => {
      if (blob.size < 300) return; // recortes accidentales de <300 bytes
      setSending(true);
      setError(null);
      const ext = blob.type.includes("ogg") ? "ogg" : "webm";
      const file = new File([blob], `nota-voz.${ext}`, { type: blob.type || "audio/webm" });
      const res = await sendMobileMediaFile({ conversationId, file });
      if (!res.ok) {
        setError(res.error ?? "No se pudo enviar el audio.");
      } else {
        await mutate();
      }
      setSending(false);
    },
    [conversationId, mutate]
  );

  const toggleRecord = useCallback(async () => {
    if (sending) return;
    const rec = mediaRecorderRef.current;
    if (rec && rec.state === "recording") {
      rec.stop();
      return;
    }
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      recordChunksRef.current = [];
      const mime =
        typeof MediaRecorder !== "undefined" &&
        MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "";
      const mr = mime
        ? new MediaRecorder(stream, { mimeType: mime })
        : new MediaRecorder(stream);
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordChunksRef.current.push(ev.data);
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
        streamRef.current = null;
        const blob = new Blob(recordChunksRef.current, { type: mr.mimeType || "audio/webm" });
        recordChunksRef.current = [];
        setRecording(false);
        setRecordingSince(null);
        void uploadVoiceBlob(blob);
      };
      setRecording(true);
      setRecordingSince(Date.now());
      mr.start(400);
    } catch (e) {
      setError(
        e instanceof Error && e.message
          ? `No se pudo acceder al micrófono: ${e.message}`
          : "No se pudo acceder al micrófono. Otorgá el permiso en la configuración del sistema."
      );
      setRecording(false);
      setRecordingSince(null);
    }
  }, [sending, uploadVoiceBlob]);

  /** Al desmontar (cambio de chat, cierre): detener grabación y liberar micrófono. */
  useEffect(() => {
    return () => {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        /* noop */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      mediaRecorderRef.current = null;
      streamRef.current = null;
    };
  }, [conversationId]);

  /** Contador visible mientras se graba (mm:ss). */
  const [, forceTick] = useState(0);
  useEffect(() => {
    if (!recording) return;
    const id = window.setInterval(() => forceTick((n) => n + 1), 1000);
    return () => window.clearInterval(id);
  }, [recording]);
  const recordingLabel = (() => {
    if (!recording || recordingSince == null) return "";
    const s = Math.floor((Date.now() - recordingSince) / 1000);
    const mm = Math.floor(s / 60).toString().padStart(2, "0");
    const ss = (s % 60).toString().padStart(2, "0");
    return `${mm}:${ss}`;
  })();

  /** Abre el drawer del picker y carga el catálogo si aún no está en memoria. */
  const openStickerPicker = useCallback(async () => {
    setStickerPickerOpen(true);
    if (stickerCatalog !== null) return;
    setStickerCatalogLoading(true);
    try {
      const packs = await fetchStickerCatalog();
      setStickerCatalog(packs);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo cargar el catálogo");
      setStickerPickerOpen(false);
    } finally {
      setStickerCatalogLoading(false);
    }
  }, [stickerCatalog]);

  const onSelectStickerToSend = useCallback(
    async (stickerId: string) => {
      setSending(true);
      setError(null);
      try {
        await sendStickerRequest(conversationId, stickerId);
        setStickerPickerOpen(false);
        await mutate();
      } catch (e) {
        setError(e instanceof Error ? e.message : "No se pudo enviar el sticker");
      } finally {
        setSending(false);
      }
    },
    [conversationId, mutate]
  );

  /** Guarda un sticker entrante en el paquete elegido (o crea uno nuevo). Refresca catálogo. */
  const onSaveIncomingSticker = useCallback(
    async (opts: { messageId: string; packId?: string; newPackName?: string }) => {
      try {
        await saveStickerFromMessage(opts);
        setSaveStickerFor(null);
        // Invalidar catálogo para que aparezca en el picker al toque siguiente
        setStickerCatalog(null);
      } catch (e) {
        throw e; // el modal muestra el error
      }
    },
    []
  );

  const nombre = conv?.contact_nombre?.trim() || conv?.contact_telefono?.trim() || "Conversación";

  return (
    <div className="flex h-full flex-col">
      {/* Header con back */}
      <header className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white/95 px-2 py-2 backdrop-blur-sm">
        <button
          type="button"
          onClick={onBack}
          aria-label="Volver"
          className="flex h-11 w-11 items-center justify-center rounded-lg text-slate-600 transition-colors hover:bg-slate-50"
        >
          <ArrowLeft className="h-5 w-5" />
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{nombre}</p>
          {conv?.channel_name ? (
            <p className="truncate text-[11px] text-slate-500">{conv.channel_name}</p>
          ) : null}
        </div>
      </header>

      {/* Mensajes */}
      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-3 py-3">
        {isLoading && messages.length === 0 ? (
          <div className="space-y-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div
                key={i}
                className={`flex ${i % 2 === 0 ? "justify-start" : "justify-end"}`}
              >
                <div className="h-8 w-40 animate-pulse rounded-2xl bg-slate-200" />
              </div>
            ))}
          </div>
        ) : messages.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-slate-400">Sin mensajes todavía</p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {messages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                onSaveIncomingSticker={() => setSaveStickerFor(m)}
              />
            ))}
          </ul>
        )}
      </div>

      {/* Error de envío */}
      {error ? (
        <div className="border-t border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
      ) : null}

      {/* Composer */}
      <div
        className="shrink-0 border-t border-slate-200 bg-white px-2 py-2"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)" }}
      >
        {recording ? (
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-red-50 px-3 py-2 text-xs text-red-700">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-500" />
            <span>Grabando · {recordingLabel}</span>
            <span className="ml-auto text-red-500">Tocá el cuadrado para enviar</span>
          </div>
        ) : uploadQueue ? (
          <div className="mb-2 flex items-center gap-2 rounded-xl bg-sky-50 px-3 py-2 text-xs text-sky-700">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-sky-500" />
            <span>
              Enviando {uploadQueue.current} de {uploadQueue.total}…
            </span>
          </div>
        ) : null}
        <div className="flex items-end gap-2">
          {/* Input file oculto (foto/imagen/pdf/documento). Al seleccionar se envía directo. */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
            onChange={onPickFile}
            className="hidden"
            aria-hidden="true"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={sending || recording}
            aria-label="Adjuntar foto o documento"
            title="Adjuntar foto o documento"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ImagePlus className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => void openStickerPicker()}
            disabled={sending || recording}
            aria-label="Enviar sticker"
            title="Stickers"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Smile className="h-5 w-5" />
          </button>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder={recording ? "Grabando nota de voz…" : "Escribí un mensaje…"}
            disabled={recording}
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-base text-slate-800 placeholder:text-slate-400 focus:border-[#0EA5E9]/40 focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]/30 disabled:bg-slate-50"
          />
          {text.trim().length > 0 && !recording ? (
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending}
              aria-label="Enviar"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0EA5E9] text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 active:bg-[#0284C7]"
            >
              <Send className="h-4 w-4" />
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void toggleRecord()}
              disabled={sending}
              aria-label={recording ? "Detener grabación y enviar" : "Grabar nota de voz"}
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
                recording ? "bg-red-500 active:bg-red-600" : "bg-[#0EA5E9] active:bg-[#0284C7]"
              }`}
            >
              {recording ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
            </button>
          )}
        </div>
      </div>

      {/* Drawer del picker de stickers (envío) */}
      {stickerPickerOpen ? (
        <StickerPickerDrawer
          packs={stickerCatalog ?? []}
          loading={stickerCatalogLoading}
          disabled={sending}
          onClose={() => setStickerPickerOpen(false)}
          onSelect={onSelectStickerToSend}
        />
      ) : null}

      {/* Modal para guardar sticker recibido */}
      {saveStickerFor ? (
        <SaveStickerModal
          message={saveStickerFor}
          existingPacks={stickerCatalog ?? []}
          onCancel={() => setSaveStickerFor(null)}
          onConfirm={onSaveIncomingSticker}
        />
      ) : null}
    </div>
  );
}

function MessageBubble({
  message,
  onSaveIncomingSticker,
}: {
  message: MobileChatMessage;
  onSaveIncomingSticker?: () => void;
}) {
  const fromMe = message.from_me;
  const ts = formatHora(message.created_at);
  const type = message.message_type || "text";
  const rawPayload = (message.raw_payload ?? null) as RawPayload;
  const mediaUrl =
    getErpAttachmentPublicUrl(rawPayload) ?? getWhatsAppMediaUrlFromRawPayload(rawPayload);
  const caption = attachmentCaptionForDisplay(message.content);
  const isImageLike = type === "image" || type === "sticker";
  const isVideo = type === "video";
  const isAudio = type === "audio";
  const isDocument = type === "document";
  const isText = type === "text";
  const isSticker = type === "sticker";
  const canSaveSticker = isSticker && !fromMe && Boolean(mediaUrl) && Boolean(onSaveIncomingSticker);

  return (
    <li className={`flex ${fromMe ? "justify-end" : "justify-start"}`}>
      <div
        className={`relative max-w-[80%] overflow-visible rounded-2xl text-sm shadow-[0_1px_1px_rgba(15,23,42,0.04)] ${
          isSticker
            ? "bg-transparent shadow-none"
            : fromMe
              ? "rounded-br-sm bg-[#0EA5E9] text-white"
              : "rounded-bl-sm bg-white text-slate-800"
        } ${isSticker ? "" : "px-3 py-2"}`}
      >
        {canSaveSticker ? (
          <button
            type="button"
            onClick={onSaveIncomingSticker}
            aria-label="Guardar sticker en tu biblioteca"
            title="Guardar sticker"
            className="absolute -right-2 -top-2 z-10 flex h-8 w-8 items-center justify-center rounded-full border border-slate-200 bg-white text-amber-500 shadow-md active:scale-95"
          >
            <Star className="h-4 w-4" fill="currentColor" />
          </button>
        ) : null}
        {isImageLike && mediaUrl ? (
          <img
            src={mediaUrl}
            alt={isSticker ? "sticker" : "imagen"}
            className={
              isSticker
                ? "h-32 w-32 object-contain"
                : "max-h-[60vh] w-full rounded-xl object-cover"
            }
            loading="lazy"
          />
        ) : isVideo && mediaUrl ? (
          <video src={mediaUrl} controls className="max-h-[60vh] w-full rounded-xl" />
        ) : isAudio && mediaUrl ? (
          <audio
            src={mediaUrl}
            controls
            preload="metadata"
            className="block w-[240px] max-w-full sm:w-[280px]"
          />
        ) : isDocument && mediaUrl ? (
          <a
            href={mediaUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={`flex items-center gap-2 rounded-xl px-2 py-1 ${
              fromMe ? "text-white" : "text-slate-800"
            }`}
          >
            <FileText className="h-4 w-4 shrink-0" />
            <span className="truncate underline">Ver documento</span>
          </a>
        ) : isText ? (
          <p className="whitespace-pre-wrap break-words">{message.content ?? ""}</p>
        ) : (
          <p className="italic opacity-80">
            [{type}] {message.content ?? "Mensaje no soportado"}
          </p>
        )}
        {caption && !isText ? (
          <p className="mt-1 whitespace-pre-wrap break-words px-1 text-xs opacity-90">
            {caption}
          </p>
        ) : null}
        {!isSticker ? (
          <p
            className={`mt-0.5 text-right text-[10px] tabular-nums ${
              fromMe ? "text-white/70" : "text-slate-400"
            }`}
          >
            {ts}
          </p>
        ) : (
          <p className="mt-0.5 pl-1 text-[10px] tabular-nums text-slate-400">{ts}</p>
        )}
      </div>
    </li>
  );
}

// ── Estados vacíos / skeleton ───────────────────────────────────────────────

function EmptyInbox({ hayBusqueda }: { hayBusqueda: boolean }) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
      <MessageCircle className="mx-auto h-8 w-8 text-slate-300" />
      <p className="mt-2 text-sm font-medium text-slate-700">
        {hayBusqueda ? "Sin resultados" : "Sin conversaciones abiertas"}
      </p>
      {!hayBusqueda ? (
        <p className="mt-1 text-xs text-slate-500">Las nuevas conversaciones aparecerán acá.</p>
      ) : null}
    </div>
  );
}

function SkeletonList() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
          <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-slate-100" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-3/4 animate-pulse rounded bg-slate-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── helpers ──────────────────────────────────────────────────────────────────

function formatRelative(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const now = new Date();
  const diffMin = Math.floor((now.getTime() - d.getTime()) / 60_000);
  if (diffMin < 1) return "ahora";
  if (diffMin < 60) return `${diffMin}m`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h`;
  const sameYear = d.getFullYear() === now.getFullYear();
  return d.toLocaleDateString("es-PY", sameYear ? { day: "2-digit", month: "short" } : { day: "2-digit", month: "short", year: "2-digit" });
}

function formatHora(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ── Drawer picker de stickers ───────────────────────────────────────────────

function StickerPickerDrawer({
  packs,
  loading,
  disabled,
  onClose,
  onSelect,
}: {
  packs: StickerCatalogPack[];
  loading: boolean;
  disabled: boolean;
  onClose: () => void;
  onSelect: (stickerId: string) => void;
}) {
  const [activeTab, setActiveTab] = useState(0);
  useEffect(() => {
    setActiveTab(0);
  }, [packs.length]);
  const activePack = packs[activeTab];

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col justify-end bg-black/40"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label="Elegí un sticker"
        onClick={(ev) => ev.stopPropagation()}
        className="flex max-h-[65svh] flex-col rounded-t-2xl border-t border-slate-200 bg-white"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 4px)" }}
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
          <h3 className="text-sm font-semibold text-slate-800">Stickers</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <p className="p-6 text-center text-sm text-slate-500">Cargando catálogo…</p>
        ) : packs.length === 0 ? (
          <div className="p-6 text-center text-sm text-slate-500">
            <p className="font-medium text-slate-700">Todavía no hay stickers guardados</p>
            <p className="mt-1 text-xs">
              Guardá stickers que te manden los clientes tocando la <Star className="inline h-3 w-3 -translate-y-0.5 text-amber-500" fill="currentColor" /> en su burbuja.
            </p>
          </div>
        ) : (
          <>
            {/* Tabs por paquete */}
            <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-100 px-2 py-2">
              {packs.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setActiveTab(i)}
                  className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                    i === activeTab
                      ? "bg-[#0EA5E9] text-white"
                      : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {p.nombre}
                </button>
              ))}
            </div>
            {/* Grilla */}
            <div className="flex-1 overflow-y-auto p-3">
              {activePack?.stickers.length ? (
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                  {activePack.stickers.map((s) => (
                    <button
                      key={s.id}
                      type="button"
                      disabled={disabled}
                      onClick={() => onSelect(s.id)}
                      className="flex aspect-square items-center justify-center rounded-lg bg-slate-50 p-1 transition-transform active:scale-95 disabled:opacity-40"
                    >
                      <img
                        src={s.public_url}
                        alt="sticker"
                        loading="lazy"
                        className="max-h-full max-w-full object-contain"
                      />
                    </button>
                  ))}
                </div>
              ) : (
                <p className="p-6 text-center text-sm text-slate-500">Paquete vacío</p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Modal para guardar un sticker recibido ──────────────────────────────────

function SaveStickerModal({
  message,
  existingPacks,
  onCancel,
  onConfirm,
}: {
  message: MobileChatMessage;
  existingPacks: StickerCatalogPack[];
  onCancel: () => void;
  onConfirm: (opts: { messageId: string; packId?: string; newPackName?: string }) => Promise<void>;
}) {
  const rawPayload = (message.raw_payload ?? null) as RawPayload;
  const previewUrl =
    getErpAttachmentPublicUrl(rawPayload) ?? getWhatsAppMediaUrlFromRawPayload(rawPayload);

  const NEW_VALUE = "__new__";
  const initialSelection = existingPacks[0]?.id ?? NEW_VALUE;
  const [selectedPackId, setSelectedPackId] = useState<string>(initialSelection);
  const [newPackName, setNewPackName] = useState("Mis stickers");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isNew = selectedPackId === NEW_VALUE || existingPacks.length === 0;

  async function handleConfirm() {
    setError(null);
    if (isNew && !newPackName.trim()) {
      setError("Poné un nombre al nuevo paquete");
      return;
    }
    setSaving(true);
    try {
      await onConfirm(
        isNew
          ? { messageId: message.id, newPackName: newPackName.trim() }
          : { messageId: message.id, packId: selectedPackId }
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo guardar");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      role="presentation"
      onClick={onCancel}
    >
      <div
        role="dialog"
        aria-label="Guardar sticker"
        onClick={(ev) => ev.stopPropagation()}
        className="w-full max-w-sm rounded-2xl bg-white p-4 shadow-xl"
      >
        <div className="flex items-start justify-between gap-2">
          <h3 className="text-base font-semibold text-slate-900">Guardar sticker</h3>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Cancelar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {previewUrl ? (
          <div className="my-3 flex justify-center">
            <img src={previewUrl} alt="sticker" className="h-24 w-24 object-contain" />
          </div>
        ) : null}

        <label className="mt-2 block text-xs font-medium text-slate-600">Guardar en</label>
        {existingPacks.length > 0 ? (
          <select
            value={selectedPackId}
            onChange={(e) => setSelectedPackId(e.target.value)}
            disabled={saving}
            className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
          >
            {existingPacks.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nombre}
              </option>
            ))}
            <option value={NEW_VALUE}>➕ Nuevo paquete…</option>
          </select>
        ) : (
          <p className="mt-1 text-xs text-slate-500">Todavía no tenés paquetes. Se creará uno nuevo.</p>
        )}

        {isNew ? (
          <div className="mt-2">
            <label className="block text-xs font-medium text-slate-600">Nombre del paquete</label>
            <input
              type="text"
              value={newPackName}
              onChange={(e) => setNewPackName(e.target.value)}
              disabled={saving}
              className="mt-1 w-full rounded-lg border border-slate-200 px-2 py-2 text-sm"
              autoFocus
            />
          </div>
        ) : null}

        {error ? (
          <p className="mt-2 rounded-lg bg-red-50 px-2 py-1 text-xs text-red-700">{error}</p>
        ) : null}

        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={saving}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={saving}
            className="rounded-lg bg-[#0EA5E9] px-4 py-2 text-sm font-semibold text-white active:bg-[#0284C7] disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
