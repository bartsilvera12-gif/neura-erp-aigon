"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
// OJO: el ícono `File` va aliasado. Importarlo con su nombre tapa el constructor global
// `File` del browser y `new File([blob], …)` de la nota de voz devuelve un componente en
// vez de un archivo → el audio se subía vacío y WhatsApp nunca lo recibía.
import { AlertCircle, ArrowLeft, Camera, Clock, File as FileIcon, FileText, Image as ImageIcon, Mic, MessageCircle, Moon, Paperclip, Reply, RotateCw, Search, Send, Smile, Square, Star, Sun, Tag, Trash2, Video, X } from "lucide-react";
import { useChatTheme, type ChatThemeColors } from "@/shared/hooks/useChatTheme";
import { EMOJI_CATEGORIES } from "@/mobile/data/emojis";
import {
  PIPELINE_ESTADOS_ORDER,
  pipelineEstadoInfo,
  type PipelineEstado,
} from "@/lib/chat/pipeline-estado";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import {
  attachmentCaptionForDisplay,
  getErpAttachmentPublicUrl,
  getWhatsAppMediaUrlFromRawPayload,
  type RawPayload,
} from "@/lib/chat/message-erp-display";
import {
  reactToMessage,
  sendMobileMediaFile,
  sendMobileMessage,
  setPipelineEstado,
  useMobileInbox,
  useMobileMessages,
  type MobileChatConversation,
  type MobileChatMessage,
} from "@/shared/hooks/useChatMobile";
import { DeliveryStatusIcon, InboundReadIcon } from "@/components/chat/DeliveryStatusIcon";
import { extensionForMime, micErrorMessage, pickRecordingMime } from "@/lib/chat/voice-recording";
import { SWIPE_REPLY_TRIGGER, useSwipeToReply } from "@/shared/hooks/useSwipeToReply";
import {
  extractWhatsappFailureInfo,
  friendlyWhatsappFailureReason,
} from "@/lib/chat/whatsapp-failure-reason";

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
// ── Optimistic messages ─────────────────────────────────────────────────────

type OptimisticMessage = {
  id: string; // "opt_<random>"
  createdAt: string; // ISO
  type: "text" | "sticker" | "image" | "audio" | "document" | "video";
  content?: string;
  previewUrl?: string; // blob: para archivos locales, https: para stickers
  status: "sending" | "failed";
  errorMessage?: string;
  /** Función para reintentar el envío en caso de failed. */
  retry?: () => void;
  /** Mensaje al que este optimista responde — se muestra como cita mientras sube. */
  quoted?: MobileChatMessage;
};

function makeOptimisticId(): string {
  return `opt_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

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
    return (
      <ChatDetail
        conversationId={selectedId}
        onBack={() => {
          // router.push a la misma ruta con distinto searchParam a veces NO dispara
          // re-render en el WebView Android. Usamos history.back cuando hay historial
          // (caso normal: se entró tocando una conversación desde la lista) y
          // caemos a replace absoluto cuando no lo hay (caso deep link desde push).
          if (typeof window !== "undefined" && window.history.length > 1) {
            router.back();
          } else {
            router.replace("/dashboard/conversaciones?apkView=1");
          }
        }}
      />
    );
  }
  return <InboxList />;
}

// ── Lista (inbox) ───────────────────────────────────────────────────────────

function InboxList() {
  const { conversations, isLoading, error } = useMobileInbox();
  const [query, setQuery] = useState("");
  // Filtro por estado del pipeline. `null` = todos. `"sin_estado"` = los sin definir.
  // Persistido en sessionStorage para que al entrar/salir de un chat quede el filtro.
  const [estadoFiltro, setEstadoFiltro] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    try {
      return window.sessionStorage.getItem("mobile-inbox-estado-filtro") || null;
    } catch {
      return null;
    }
  });
  const setEstadoFiltroPersist = useCallback((v: string | null) => {
    setEstadoFiltro(v);
    try {
      if (v) window.sessionStorage.setItem("mobile-inbox-estado-filtro", v);
      else window.sessionStorage.removeItem("mobile-inbox-estado-filtro");
    } catch {
      /* noop */
    }
  }, []);

  // Conteos por estado — sobre TODAS las conversaciones (no las filtradas por texto).
  const countsByEstado = useMemo(() => {
    const m: Record<string, number> = { __all: conversations.length, sin_estado: 0 };
    for (const c of conversations) {
      const k = c.estado_pipeline ?? "sin_estado";
      m[k] = (m[k] ?? 0) + 1;
    }
    return m;
  }, [conversations]);

  const filtered = useMemo(() => {
    let base = conversations;
    if (estadoFiltro) {
      base = base.filter((c) =>
        estadoFiltro === "sin_estado" ? !c.estado_pipeline : c.estado_pipeline === estadoFiltro
      );
    }
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((c) => {
      const nombre = (c.contact_nombre ?? c.contact_telefono ?? "").toLowerCase();
      const preview = (c.last_message_preview ?? "").toLowerCase();
      return nombre.includes(q) || preview.includes(q);
    });
  }, [conversations, query, estadoFiltro]);

  const totalUnread = useMemo(
    () => conversations.reduce((s, c) => s + (c.unread_count ?? 0), 0),
    [conversations]
  );

  return (
    <div
      className="mx-auto max-w-md p-4 pb-24"
      // Fallback fijo de 32px por si env() devuelve 0 en la WebView.
      style={{ paddingTop: "max(env(safe-area-inset-top), 32px)" }}
    >
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
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#4FAEB2]/40 focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/30"
        />
      </div>

      {/* Tabs por estado del pipeline. Scroll horizontal en pantallas chicas. */}
      <div className="mb-3 -mx-4 overflow-x-auto px-4 pb-1">
        <div className="flex gap-1.5">
          <PipelineTab
            active={estadoFiltro === null}
            onClick={() => setEstadoFiltroPersist(null)}
            label="Todos"
            count={countsByEstado.__all}
          />
          {PIPELINE_ESTADOS_ORDER.map((k) => {
            const info = pipelineEstadoInfo(k)!;
            return (
              <PipelineTab
                key={k}
                active={estadoFiltro === k}
                onClick={() => setEstadoFiltroPersist(k)}
                label={`${info.emoji} ${info.shortLabel}`}
                count={countsByEstado[k] ?? 0}
                activeColor={info.dot}
                activeBg={info.bg}
                activeFg={info.fg}
              />
            );
          })}
          <PipelineTab
            active={estadoFiltro === "sin_estado"}
            onClick={() => setEstadoFiltroPersist("sin_estado")}
            label="Sin estado"
            count={countsByEstado.sin_estado ?? 0}
          />
        </div>
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
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#4FAEB2]/10 text-base font-bold text-[#4FAEB2]">
            {inicial}
          </div>
          {unread ? (
            <span
              aria-label={`${conv.unread_count} sin leer`}
              className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-[#4FAEB2] px-1 text-[10px] font-bold text-white ring-2 ring-white"
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
          <div className="mt-0.5 flex items-center gap-2">
            {conv.channel_name ? (
              <p className="text-[10px] uppercase tracking-wider text-slate-400">
                {conv.channel_name}
              </p>
            ) : null}
            <PipelineChip estado={conv.estado_pipeline} />
          </div>
        </div>
      </a>
    </li>
  );
}

/**
 * Tab del inbox para filtrar por estado del pipeline.
 * Al tocar, la lista se recorta a las conversaciones con ese estado.
 */
function PipelineTab({
  active,
  onClick,
  label,
  count,
  activeColor,
  activeBg,
  activeFg,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  count: number;
  activeColor?: string;
  activeBg?: string;
  activeFg?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full border px-3 py-1.5 text-[11px] font-semibold whitespace-nowrap transition-colors ${
        active ? "" : "border-slate-200 bg-white text-slate-600"
      }`}
      style={
        active
          ? {
              borderColor: activeColor ?? "#4FAEB2",
              backgroundColor: activeBg ?? "#4FAEB2",
              color: activeFg ?? "#FFFFFF",
            }
          : undefined
      }
    >
      {label}
      <span
        className={`ml-1.5 inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px] ${
          active ? "bg-white/80 text-slate-700" : "bg-slate-100 text-slate-500"
        }`}
      >
        {count}
      </span>
    </button>
  );
}

/**
 * Chip pequeño con emoji + label corto del estado del pipeline.
 * No renderiza nada si estado es null.
 */
function PipelineChip({ estado }: { estado: string | null | undefined }) {
  const info = pipelineEstadoInfo(estado);
  if (!info) return null;
  return (
    <span
      className="inline-flex items-center gap-1 rounded-full px-2 py-[1px] text-[9px] font-semibold uppercase tracking-wide"
      style={{ backgroundColor: info.bg, color: info.fg }}
    >
      <span aria-hidden>{info.emoji}</span>
      {info.shortLabel}
    </span>
  );
}

// ── Detalle (chat individual) ───────────────────────────────────────────────

function ChatDetail({ conversationId, onBack }: { conversationId: string; onBack: () => void }) {
  const { messages, isLoading, mutate } = useMobileMessages(conversationId);
  const { conversations, mutate: mutateInbox } = useMobileInbox();
  const conv = useMemo(
    () => conversations.find((c) => c.id === conversationId),
    [conversations, conversationId]
  );
  /** Modal para elegir/cambiar estado del pipeline. */
  const [pipelineModalOpen, setPipelineModalOpen] = useState(false);
  const { isDark, colors: themeColors, toggle: toggleTheme } = useChatTheme();

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
  /**
   * Mensajes salientes optimistas: aparecen INMEDIATO al tocar Enviar y se
   * eliminan cuando mutate() trae la fila real del servidor. Si el envío
   * falla quedan marcados "failed" con opción de reintentar.
   */
  const [optimistic, setOptimistic] = useState<OptimisticMessage[]>([]);
  const scrollRef = useRef<HTMLDivElement>(null);
  /** Input file para foto / galería (multi). */
  const fileInputRef = useRef<HTMLInputElement>(null);
  /** Input file para documento (PDF, office, etc.). Separado del de fotos para que
   *  Android abra el file browser de docs en vez del picker de galería. */
  const docInputRef = useRef<HTMLInputElement>(null);
  /** Cámara nativa modo foto (capture="environment"). */
  const cameraPhotoRef = useRef<HTMLInputElement>(null);
  /** Cámara nativa modo video (capture="environment" + accept video). */
  const cameraVideoRef = useRef<HTMLInputElement>(null);
  /** Menú desplegable con Foto/Video/Cámara foto/Cámara video/Documento. */
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  /** Mensaje al que el operador está por responder (Meta lo muestra citado). */
  const [replyingTo, setReplyingTo] = useState<MobileChatMessage | null>(null);
  /** Mensaje sobre el que se abre el menú de contexto (long-press). */
  const [messageMenu, setMessageMenu] = useState<MobileChatMessage | null>(null);
  /** Mensaje al que se le va a agregar una reacción con el picker completo. */
  const [reactionTarget, setReactionTarget] = useState<MobileChatMessage | null>(null);
  /** Mensaje cuyo bottom-sheet de reacciones esta abierto. */
  const [reactionsDetailFor, setReactionsDetailFor] = useState<MobileChatMessage | null>(null);
  /**
   * Archivos seleccionados en el picker que esperan confirmación antes de enviarse.
   * El usuario puede quitar algunos con la X o cancelar todo antes de mandar.
   * `null` = no hay preview abierto.
   */
  const [pendingFiles, setPendingFiles] = useState<{ file: File; previewUrl: string | null }[] | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recordChunksRef = useRef<Blob[]>([]);

  // Auto-scroll al fondo cuando llegan mensajes nuevos (reales u optimistas).
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages.length, optimistic.length]);

  /** Mapa wa_message_id → mensaje, para resolver citas (reply-to) en cada burbuja. */
  const messagesByWaId = useMemo(() => {
    const map = new Map<string, MobileChatMessage>();
    for (const m of messages) {
      if (m.wa_message_id && m.wa_message_id.length > 0) map.set(m.wa_message_id, m);
    }
    return map;
  }, [messages]);

  /** Resuelve el mensaje citado a partir del raw_payload (context.id o erp.reply_to_wa_message_id). */
  function resolveQuotedFor(m: MobileChatMessage): MobileChatMessage | null {
    const raw = (m.raw_payload ?? null) as
      | (Record<string, unknown> & {
          context?: { id?: string };
          erp?: { reply_to_wa_message_id?: string };
        })
      | null;
    if (!raw) return null;
    const wamid = raw.context?.id ?? raw.erp?.reply_to_wa_message_id;
    if (!wamid) return null;
    return messagesByWaId.get(wamid) ?? null;
  }

  /**
   * Índice de reacciones por wa_message_id del mensaje al que apuntan.
   * Cada entrada agrupa reacciones por emoji con conteo, indicando además si
   * "vos" (el vendedor) reaccionó — para pintar borde propio.
   *
   * Meta manda las reacciones como mensajes con message_type='reaction' y:
   *   - reaction.message_id (webhook entrante — desde el cliente)
   *   - erp.reaction_target_wa_message_id (envío nuestro desde el ERP)
   */
  type ReactionInfo = { emoji: string; count: number; ownedByMe: boolean };
  const reactionsByTarget = useMemo(() => {
    const map = new Map<string, ReactionInfo[]>();
    for (const m of messages) {
      if ((m.message_type || "").toLowerCase() !== "reaction") continue;
      const raw = (m.raw_payload ?? null) as
        | (Record<string, unknown> & {
            reaction?: { message_id?: string; emoji?: string };
            erp?: { reaction_target_wa_message_id?: string };
          })
        | null;
      const target = raw?.reaction?.message_id ?? raw?.erp?.reaction_target_wa_message_id ?? "";
      if (!target) continue;
      const emoji = (raw?.reaction?.emoji ?? m.content ?? "").trim();
      // Emoji vacío = retiro de reacción (Meta). Lo ignoramos para no mostrar
      // reacciones "vacías". La retirada se refleja porque no acumula.
      if (!emoji) continue;
      const arr = map.get(target) ?? [];
      const existing = arr.find((r) => r.emoji === emoji);
      if (existing) {
        existing.count += 1;
        if (m.from_me) existing.ownedByMe = true;
      } else {
        arr.push({ emoji, count: 1, ownedByMe: m.from_me });
      }
      map.set(target, arr);
    }
    return map;
  }, [messages]);

  /**
   * Mensajes visibles en el chat: quitamos los que son puras reacciones (se
   * pintan como chip debajo del mensaje al que apuntan, no como burbuja propia).
   */
  const visibleMessages = useMemo(
    () => messages.filter((m) => (m.message_type || "").toLowerCase() !== "reaction"),
    [messages]
  );

  /**
   * Marcar como leído en Meta → el cliente ve el doble check azul.
   *
   * Se dispara al abrir el chat Y cada vez que entra un mensaje nuevo del cliente con
   * el chat abierto (antes solo al abrir: lo que llegaba después quedaba sin visto).
   * Una sola llamada por último entrante, no en cada poll. Ignoramos errores: si Meta
   * rechaza, la UI sigue funcionando.
   */
  const lastInboundId = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      if (!messages[i].from_me) return messages[i].id;
    }
    return null;
  }, [messages]);

  useEffect(() => {
    if (!conversationId || !lastInboundId) return;
    void (async () => {
      try {
        const res = await fetchWithSupabaseSession("/api/chat/mark-read", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ conversation_id: conversationId }),
        });
        const json = (await res.json().catch(() => ({}))) as { ok?: boolean; read_at?: string };
        // Refrescar para que la palomita del cliente aparezca al toque y no en el próximo poll.
        if (json.read_at) await mutate();
      } catch {
        /* silent — el chat funciona igual sin el check azul */
      }
    })();
  }, [conversationId, lastInboundId, mutate]);

  /**
   * Envío de texto con Optimistic UI.
   * - El mensaje aparece INMEDIATO en el chat con un ícono de reloj.
   * - El textarea se limpia al toque, para no bloquear al agente que escribe rápido.
   * - Si el envío falla, el globo queda marcado con borde rojo y un botón "Reintentar".
   */
  const doSendText = useCallback(
    async (raw: string, replyTo?: string, quoted?: MobileChatMessage) => {
      const t = raw.trim();
      if (!t) return;
      const optId = makeOptimisticId();
      const nowIso = new Date().toISOString();
      setOptimistic((prev) => [
        ...prev,
        { id: optId, createdAt: nowIso, type: "text", content: t, status: "sending", quoted },
      ]);
      const res = await sendMobileMessage({ conversationId, text: t, replyTo });
      if (!res.ok) {
        setOptimistic((prev) =>
          prev.map((m) =>
            m.id === optId
              ? {
                  ...m,
                  status: "failed",
                  errorMessage: res.error ?? "No se pudo enviar",
                  retry: () => {
                    setOptimistic((p) => p.filter((x) => x.id !== optId));
                    void doSendText(t, replyTo, quoted);
                  },
                }
              : m
          )
        );
        return;
      }
      await mutate();
      setOptimistic((prev) => prev.filter((m) => m.id !== optId));
    },
    [conversationId, mutate]
  );

  const send = useCallback(async () => {
    const t = text.trim();
    if (!t) return;
    setError(null);
    setText(""); // limpiar al toque
    const replyTo = replyingTo?.wa_message_id ?? undefined;
    const quoted = replyingTo ?? undefined;
    setReplyingTo(null); // limpiar la cita al enviar
    await doSendText(t, replyTo, quoted);
  }, [text, doSendText, replyingTo]);

  /** Progreso de envío múltiple: mostramos "Enviando 2/5…" en el composer. */
  const [uploadQueue, setUploadQueue] = useState<{ current: number; total: number } | null>(null);

  /**
   * Devuelve el tipo optimista según el mime del File. Para el preview usamos
   * un blob URL local, así el globo aparece con la miniatura al instante.
   */
  function optimisticTypeForFile(f: File): OptimisticMessage["type"] {
    const m = (f.type || "").toLowerCase();
    if (m.startsWith("image/")) return "image";
    if (m.startsWith("video/")) return "video";
    if (m.startsWith("audio/")) return "audio";
    return "document";
  }

  /**
   * Handler de los inputs de archivo: NO envía directo — pone los archivos en
   * `pendingFiles` para que el usuario vea el preview y pueda quitar/agregar
   * antes de mandar. El envío real lo hace `sendPendingFiles`.
   */
  const onPickFile = useCallback((ev: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(ev.target.files ?? []);
    ev.target.value = "";
    if (files.length === 0) return;

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

    setError(null);
    const entries = files.map((f) => {
      const t = optimisticTypeForFile(f);
      const canPreview = t === "image" || t === "video";
      return { file: f, previewUrl: canPreview ? URL.createObjectURL(f) : null };
    });
    // Si ya había pendientes (usuario abrió el picker con archivos ya en cola),
    // AGREGAR — así puede seguir sumando archivos antes de mandar.
    setPendingFiles((prev) => [...(prev ?? []), ...entries]);
  }, []);

  /** Quita un archivo del preview (X sobre la miniatura). */
  const removePendingFile = useCallback((index: number) => {
    setPendingFiles((prev) => {
      if (!prev) return prev;
      const next = [...prev];
      const [removed] = next.splice(index, 1);
      if (removed?.previewUrl) {
        try { URL.revokeObjectURL(removed.previewUrl); } catch { /* noop */ }
      }
      return next.length > 0 ? next : null;
    });
  }, []);

  /** Cancela el preview entero (X del modal). Libera los blob URLs. */
  const cancelPending = useCallback(() => {
    setPendingFiles((prev) => {
      if (prev) {
        for (const e of prev) {
          if (e.previewUrl) {
            try { URL.revokeObjectURL(e.previewUrl); } catch { /* noop */ }
          }
        }
      }
      return null;
    });
  }, []);

  /** Envía todo lo que esté en `pendingFiles` en secuencia, con optimistic UI. */
  const sendPendingFiles = useCallback(async () => {
    const list = pendingFiles ?? [];
    if (list.length === 0) return;

    // La cita del reply-to se aplica SOLO al primer archivo (como hace WhatsApp)
    // y después se limpia para que los subsiguientes vayan como mensajes normales.
    const replyTo = replyingTo?.wa_message_id ?? undefined;
    const quoted = replyingTo ?? undefined;
    setReplyingTo(null);

    // Cerrar el modal ANTES de arrancar para que el usuario vea el chat con los optimistics.
    const entries = list.map((e, i) => {
      const optType = optimisticTypeForFile(e.file);
      return {
        file: e.file,
        opt: {
          id: makeOptimisticId(),
          createdAt: new Date(Date.now() + i).toISOString(),
          type: optType,
          content: e.file.name,
          previewUrl: e.previewUrl ?? undefined,
          status: "sending" as const,
          quoted: i === 0 ? quoted : undefined,
        },
      };
    });
    setOptimistic((prev) => [...prev, ...entries.map((e) => e.opt)]);
    setPendingFiles(null); // NO revocamos los blob URLs — los pasamos al optimistic

    const errors: string[] = [];
    for (let i = 0; i < entries.length; i++) {
      setUploadQueue({ current: i + 1, total: entries.length });
      const { file, opt } = entries[i];
      const res = await sendMobileMediaFile({
        conversationId,
        file,
        replyTo: i === 0 ? replyTo : undefined,
      });
      if (!res.ok) {
        errors.push(`${file.name}: ${res.error ?? "error"}`);
        setOptimistic((prev) =>
          prev.map((m) =>
            m.id === opt.id
              ? { ...m, status: "failed", errorMessage: res.error ?? "No se pudo enviar" }
              : m
          )
        );
      }
    }

    setUploadQueue(null);
    if (errors.length > 0 && errors.length === entries.length) {
      setError("No se pudo enviar ningún archivo.");
    } else if (errors.length > 0) {
      setError(`Fallaron ${errors.length}/${entries.length}: ${errors[0]}`);
    }
    await mutate();
    const okIds = new Set(
      entries
        .filter((e) => !errors.some((err) => err.startsWith(e.file.name + ":")))
        .map((e) => e.opt.id)
    );
    for (const e of entries) {
      if (e.opt.previewUrl && okIds.has(e.opt.id)) {
        try { URL.revokeObjectURL(e.opt.previewUrl); } catch { /* noop */ }
      }
    }
    setOptimistic((prev) => prev.filter((m) => !okIds.has(m.id)));
  }, [pendingFiles, conversationId, mutate, replyingTo]);

  /** Envía el blob grabado por el MediaRecorder a /api/chat/send-media como audio (optimistic). */
  const uploadVoiceBlob = useCallback(
    async (blob: Blob) => {
      if (blob.size === 0) {
        setError("Grabación vacía. Volvé a intentar.");
        return;
      }
      if (blob.size < 500) {
        setError("Grabación demasiado corta. Manteé el botón más tiempo.");
        return;
      }
      setError(null);
      const blobType = blob.type || "audio/webm";
      const file = new File([blob], `nota-voz.${extensionForMime(blobType)}`, { type: blobType });
      const previewUrl = URL.createObjectURL(blob);
      const optId = makeOptimisticId();
      const replyTo = replyingTo?.wa_message_id ?? undefined;
      const quoted = replyingTo ?? undefined;
      setReplyingTo(null);
      setOptimistic((prev) => [
        ...prev,
        {
          id: optId,
          createdAt: new Date().toISOString(),
          type: "audio",
          content: "Nota de voz",
          previewUrl,
          status: "sending",
          quoted,
        },
      ]);
      const res = await sendMobileMediaFile({ conversationId, file, replyTo });
      if (!res.ok) {
        setOptimistic((prev) =>
          prev.map((m) =>
            m.id === optId
              ? { ...m, status: "failed", errorMessage: res.error ?? "No se pudo enviar" }
              : m
          )
        );
        setError(res.error ?? "No se pudo enviar el audio.");
        return;
      }
      await mutate();
      try { URL.revokeObjectURL(previewUrl); } catch { /* noop */ }
      setOptimistic((prev) => prev.filter((m) => m.id !== optId));
    },
    [conversationId, mutate, replyingTo]
  );

  const toggleRecord = useCallback(async () => {
    if (sending) return;
    const rec = mediaRecorderRef.current;
    if (rec && rec.state === "recording") {
      rec.stop();
      return;
    }
    setError(null);

    // WebView sin contexto seguro o sin soporte: mensaje claro en vez de un throw genérico.
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setError("Este dispositivo no habilita el micrófono en la app. Actualizá Android System WebView.");
      return;
    }
    if (typeof MediaRecorder === "undefined") {
      setError("Este dispositivo no soporta grabar audio en la app.");
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      recordChunksRef.current = [];
      // mp4/AAC si el WebView lo soporta: WhatsApp lo acepta tal cual y no hace falta
      // transcodear con ffmpeg en el server. webm queda como último recurso.
      const mime = pickRecordingMime();
      let mr: MediaRecorder;
      try {
        mr = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      } catch {
        // Algunos WebViews declaran soportar un mime y después rechazan el constructor.
        mr = new MediaRecorder(stream);
      }
      mediaRecorderRef.current = mr;
      mr.ondataavailable = (ev) => {
        if (ev.data.size > 0) recordChunksRef.current.push(ev.data);
      };
      mr.onerror = () => {
        setError("Se cortó la grabación. Probá de nuevo.");
      };
      mr.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
        streamRef.current = null;
        const blob = new Blob(recordChunksRef.current, { type: mr.mimeType || mime || "audio/webm" });
        recordChunksRef.current = [];
        setRecording(false);
        setRecordingSince(null);
        void uploadVoiceBlob(blob);
      };
      setRecording(true);
      setRecordingSince(Date.now());
      mr.start(400);
    } catch (e) {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
      setError(micErrorMessage(e));
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

  /** Envío de sticker con Optimistic UI (mismo patrón que texto/media). */
  const onSelectStickerToSend = useCallback(
    async (stickerId: string, previewUrl: string) => {
      setError(null);
      setStickerPickerOpen(false);
      const optId = makeOptimisticId();
      setOptimistic((prev) => [
        ...prev,
        {
          id: optId,
          createdAt: new Date().toISOString(),
          type: "sticker",
          previewUrl,
          status: "sending",
        },
      ]);
      try {
        await sendStickerRequest(conversationId, stickerId);
        await mutate();
        setOptimistic((prev) => prev.filter((m) => m.id !== optId));
      } catch (e) {
        const msg = e instanceof Error ? e.message : "No se pudo enviar";
        setOptimistic((prev) =>
          prev.map((m) =>
            m.id === optId
              ? {
                  ...m,
                  status: "failed",
                  errorMessage: msg,
                  retry: () => {
                    setOptimistic((p) => p.filter((x) => x.id !== optId));
                    void onSelectStickerToSend(stickerId, previewUrl);
                  },
                }
              : m
          )
        );
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
      <header
        className="sticky top-0 z-10 flex shrink-0 items-center gap-2 border-b border-slate-200 bg-white/95 px-2 py-2 backdrop-blur-sm"
        // env(safe-area-inset-top) puede devolver 0 en algunas WebViews Android aunque
        // viewport-fit=cover esté seteado. max(...,32px) garantiza que el header nunca
        // se meta debajo de la status bar del sistema.
        style={{ paddingTop: "max(env(safe-area-inset-top), 32px)" }}
      >
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
        {/* Toggle claro/oscuro para el área de mensajes */}
        <button
          type="button"
          onClick={toggleTheme}
          aria-label={isDark ? "Modo claro" : "Modo oscuro"}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-slate-600 transition-colors hover:bg-slate-100"
        >
          {isDark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>
        {/* Botón de estado pipeline: si hay estado muestra el chip, si no botón "Estado" */}
        <button
          type="button"
          onClick={() => setPipelineModalOpen(true)}
          aria-label="Cambiar estado del pipeline"
          className="flex h-9 shrink-0 items-center gap-1 rounded-full border border-slate-200 px-2 text-[11px] font-semibold text-slate-600 transition-colors active:scale-[0.98]"
          style={(() => {
            const info = pipelineEstadoInfo(conv?.estado_pipeline);
            return info
              ? { borderColor: info.dot, backgroundColor: info.bg, color: info.fg }
              : undefined;
          })()}
        >
          {(() => {
            const info = pipelineEstadoInfo(conv?.estado_pipeline);
            return info ? (
              <>
                <span aria-hidden>{info.emoji}</span>
                <span>{info.shortLabel}</span>
              </>
            ) : (
              <>
                <Tag className="h-3.5 w-3.5" />
                <span>Estado</span>
              </>
            );
          })()}
        </button>
      </header>

      {/* Mensajes */}
      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto px-3 py-3"
        style={{ backgroundColor: themeColors.bg }}
      >
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
        ) : messages.length === 0 && optimistic.length === 0 ? (
          <div className="flex h-full items-center justify-center">
            <p className="text-sm text-slate-400">Sin mensajes todavía</p>
          </div>
        ) : (
          <ul className="space-y-1.5">
            {visibleMessages.map((m) => (
              <MessageBubble
                key={m.id}
                message={m}
                quotedMessage={resolveQuotedFor(m)}
                onSaveIncomingSticker={() => setSaveStickerFor(m)}
                onLongPress={() => setMessageMenu(m)}
                onSwipeReply={() => setReplyingTo(m)}
                themeColors={themeColors}
                reactions={m.wa_message_id ? reactionsByTarget.get(m.wa_message_id) ?? [] : []}
                onOpenReactionsDetail={() => setReactionsDetailFor(m)}
              />
            ))}
            {optimistic.map((m) => (
              <OptimisticBubble key={m.id} opt={m} />
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
        {/* Banner de cita cuando hay un mensaje seleccionado para responder */}
        {replyingTo ? (
          <div className="mb-2 flex items-start gap-2 rounded-xl border-l-4 border-[#4FAEB2] bg-[#4FAEB2]/8 px-2 py-1.5 text-[11px] text-slate-700">
            <div className="min-w-0 flex-1">
              <p className="font-medium text-[#3F8E91]">
                Respondiendo a {replyingTo.from_me ? "vos mismo" : "el cliente"}
              </p>
              <p className="mt-0.5 line-clamp-2 opacity-90">{previewForQuoted(replyingTo)}</p>
            </div>
            <button
              type="button"
              onClick={() => setReplyingTo(null)}
              aria-label="Cancelar cita"
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-slate-500 hover:bg-white/60"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ) : null}
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
        <div className="relative flex items-end gap-2">
          {/* Inputs file ocultos: foto (galería, multi) y documento (browser de archivos). */}
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="image/*,video/*"
            onChange={onPickFile}
            className="hidden"
            aria-hidden="true"
          />
          <input
            ref={docInputRef}
            type="file"
            accept="application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt,*/*"
            onChange={onPickFile}
            className="hidden"
            aria-hidden="true"
          />
          {/* Cámara nativa Android: capture="environment" abre la cámara del sistema directo. */}
          <input
            ref={cameraPhotoRef}
            type="file"
            accept="image/*"
            capture="environment"
            onChange={onPickFile}
            className="hidden"
            aria-hidden="true"
          />
          <input
            ref={cameraVideoRef}
            type="file"
            accept="video/*"
            capture="environment"
            onChange={onPickFile}
            className="hidden"
            aria-hidden="true"
          />

          {/* Menú desplegable de Foto / Documento sobre el botón de clip. */}
          {attachMenuOpen ? (
            <div
              role="menu"
              className="absolute bottom-14 left-0 z-30 flex min-w-[180px] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
            >
              <button
                type="button"
                onClick={() => {
                  setAttachMenuOpen(false);
                  fileInputRef.current?.click();
                }}
                className="flex items-center gap-3 px-4 py-3 text-left text-sm text-slate-800 hover:bg-slate-50"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-purple-100 text-purple-600">
                  <ImageIcon className="h-4 w-4" />
                </span>
                Galería
              </button>
              <button
                type="button"
                onClick={() => {
                  setAttachMenuOpen(false);
                  cameraPhotoRef.current?.click();
                }}
                className="flex items-center gap-3 px-4 py-3 text-left text-sm text-slate-800 hover:bg-slate-50"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-pink-100 text-pink-600">
                  <Camera className="h-4 w-4" />
                </span>
                Cámara (foto)
              </button>
              <button
                type="button"
                onClick={() => {
                  setAttachMenuOpen(false);
                  cameraVideoRef.current?.click();
                }}
                className="flex items-center gap-3 px-4 py-3 text-left text-sm text-slate-800 hover:bg-slate-50"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-red-100 text-red-600">
                  <Video className="h-4 w-4" />
                </span>
                Cámara (video)
              </button>
              <button
                type="button"
                onClick={() => {
                  setAttachMenuOpen(false);
                  docInputRef.current?.click();
                }}
                className="flex items-center gap-3 px-4 py-3 text-left text-sm text-slate-800 hover:bg-slate-50"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sky-100 text-sky-600">
                  <FileIcon className="h-4 w-4" />
                </span>
                Documento
              </button>
            </div>
          ) : null}
          {/* Backdrop para cerrar el menú al tocar fuera. */}
          {attachMenuOpen ? (
            <button
              type="button"
              aria-label="Cerrar menú"
              onClick={() => setAttachMenuOpen(false)}
              className="fixed inset-0 z-20 cursor-default bg-transparent"
            />
          ) : null}

          <button
            type="button"
            onClick={() => setAttachMenuOpen((v) => !v)}
            disabled={recording}
            aria-label="Adjuntar"
            title="Adjuntar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-slate-200 text-slate-600 shadow-sm transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Paperclip className="h-5 w-5" />
          </button>
          <button
            type="button"
            onClick={() => void openStickerPicker()}
            disabled={recording}
            aria-label="Emojis y stickers"
            title="Emojis y stickers"
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
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-base text-slate-800 placeholder:text-slate-400 focus:border-[#4FAEB2]/40 focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/30 disabled:bg-slate-50"
          />
          {text.trim().length > 0 && !recording ? (
            <button
              type="button"
              onClick={() => void send()}
              disabled={sending}
              aria-label="Enviar"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#4FAEB2] text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 active:bg-[#3F8E91]"
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
                recording ? "bg-red-500 active:bg-red-600" : "bg-[#4FAEB2] active:bg-[#3F8E91]"
              }`}
            >
              {recording ? <Square className="h-4 w-4" /> : <Mic className="h-5 w-5" />}
            </button>
          )}
        </div>
      </div>

      {/* Drawer con tabs Emojis / Stickers */}
      {stickerPickerOpen ? (
        <EmojiStickerDrawer
          packs={stickerCatalog ?? []}
          loading={stickerCatalogLoading}
          disabled={sending}
          onClose={() => setStickerPickerOpen(false)}
          onSelectSticker={onSelectStickerToSend}
          onPickEmoji={(emoji) => setText((prev) => prev + emoji)}
        />
      ) : null}

      {/* Menú de contexto: acciones sobre un mensaje (long-press) */}
      {messageMenu ? (
        (() => {
          const mm = messageMenu;
          const mmRaw = (mm.raw_payload ?? null) as RawPayload;
          const mmUrl = getErpAttachmentPublicUrl(mmRaw) ?? getWhatsAppMediaUrlFromRawPayload(mmRaw);
          const mmType = mm.message_type || "text";
          const mmShowThumb = Boolean(mmUrl) && (mmType === "image" || mmType === "sticker" || mmType === "video");
          return (
            <div
              className="fixed inset-0 z-40 flex items-end justify-center bg-black/40 sm:items-center"
              role="presentation"
              onClick={() => setMessageMenu(null)}
            >
              <div
                role="dialog"
                aria-label="Acciones sobre el mensaje"
                onClick={(ev) => ev.stopPropagation()}
                className="w-full max-w-sm rounded-t-2xl bg-white sm:rounded-2xl"
                style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 8px)" }}
              >
                <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                  <p className="text-sm font-semibold text-slate-800">
                    Mensaje de {mm.from_me ? "vos" : "el cliente"}
                  </p>
                  <button
                    type="button"
                    onClick={() => setMessageMenu(null)}
                    aria-label="Cerrar"
                    className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                {/* Preview del mensaje seleccionado — en dark el overlay tapaba el chat
                    y no se veía cuál mensaje habías marcado. */}
                <div className="flex items-start gap-2 border-b border-slate-100 bg-slate-50 px-4 py-2.5">
                  {mmShowThumb ? (
                    <img
                      src={mmUrl!}
                      alt=""
                      className="h-12 w-12 shrink-0 rounded-md object-cover"
                      draggable={false}
                      style={{ pointerEvents: "none" } as React.CSSProperties}
                    />
                  ) : null}
                  <p className="line-clamp-3 min-w-0 flex-1 text-[12px] text-slate-700">
                    {previewForQuoted(mm)}
                  </p>
                </div>
                {/* Reacciones rápidas (6 emojis) + botón + para abrir drawer completo.
                    Solo disponibles si el mensaje tiene wa_message_id (los optimistas aún no). */}
                {mm.wa_message_id ? (
                  <div className="flex items-center gap-1 border-b border-slate-100 px-3 py-2">
                    {["👍", "❤️", "😂", "😮", "😢", "🙏"].map((e) => (
                      <button
                        key={e}
                        type="button"
                        onClick={() => {
                          void reactToMessage({
                            conversationId,
                            waMessageId: mm.wa_message_id!,
                            emoji: e,
                          }).then((res) => {
                            if (!res.ok) setError(res.error ?? "No se pudo reaccionar");
                            else void mutate();
                          });
                          setMessageMenu(null);
                        }}
                        className="flex h-9 w-9 items-center justify-center rounded-full text-xl transition-transform active:scale-125 hover:bg-slate-100"
                        aria-label={`Reaccionar con ${e}`}
                      >
                        {e}
                      </button>
                    ))}
                    <button
                      type="button"
                      onClick={() => {
                        // Reusa el drawer del composer. Al elegir un emoji, envía la
                        // reacción en vez de agregarlo al input.
                        setReactionTarget(mm);
                        setMessageMenu(null);
                      }}
                      className="ml-1 flex h-9 w-9 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
                      aria-label="Más emojis"
                    >
                      +
                    </button>
                  </div>
                ) : null}
                <div className="flex flex-col py-1">
                  <button
                    type="button"
                    onClick={() => {
                      setReplyingTo(mm);
                      setMessageMenu(null);
                    }}
                    className="flex items-center gap-3 px-4 py-3 text-left text-sm text-slate-800 hover:bg-slate-50"
                  >
                    <span className="flex h-8 w-8 items-center justify-center rounded-full bg-[#4FAEB2]/10 text-[#3F8E91]">
                      <Reply className="h-4 w-4" />
                    </span>
                    Responder
                  </button>
                </div>
              </div>
            </div>
          );
        })()
      ) : null}

      {/* Preview de archivos seleccionados antes de mandar */}
      {pendingFiles && pendingFiles.length > 0 ? (
        <PendingFilesPreview
          files={pendingFiles}
          onRemove={removePendingFile}
          onCancel={cancelPending}
          onSend={() => void sendPendingFiles()}
          onAddMore={() => fileInputRef.current?.click()}
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

      {/* Bottom-sheet con detalle de reacciones al tocar el chip. Muestra quién
          reaccionó con qué emoji, y permite quitar la propia con un tap. */}
      {reactionsDetailFor ? (
        <ReactionsDetailSheet
          message={reactionsDetailFor}
          reactionsByTarget={reactionsByTarget}
          contactName={conv?.contact_nombre ?? conv?.contact_telefono ?? "Cliente"}
          onClose={() => setReactionsDetailFor(null)}
          onRemoveMine={(emoji) => {
            const target = reactionsDetailFor;
            setReactionsDetailFor(null);
            if (!target?.wa_message_id) return;
            void reactToMessage({
              conversationId,
              waMessageId: target.wa_message_id,
              emoji: "", // vacío = quitar
            }).then((res) => {
              if (!res.ok) setError(res.error ?? "No se pudo quitar la reacción");
              else void mutate();
            });
          }}
          onAddMine={(emoji) => {
            const target = reactionsDetailFor;
            setReactionsDetailFor(null);
            if (!target?.wa_message_id) return;
            void reactToMessage({
              conversationId,
              waMessageId: target.wa_message_id,
              emoji,
            }).then((res) => {
              if (!res.ok) setError(res.error ?? "No se pudo agregar la reacción");
              else void mutate();
            });
          }}
        />
      ) : null}

      {/* Picker completo de emojis para reaccionar (abierto desde el "+" del menu) */}
      {reactionTarget ? (
        <ReactionEmojiPicker
          onClose={() => setReactionTarget(null)}
          onPick={(emoji) => {
            const target = reactionTarget;
            setReactionTarget(null);
            if (!target?.wa_message_id) return;
            void reactToMessage({
              conversationId,
              waMessageId: target.wa_message_id,
              emoji,
            }).then((res) => {
              if (!res.ok) setError(res.error ?? "No se pudo reaccionar");
              else void mutate();
            });
          }}
        />
      ) : null}

      {/* Modal selector de estado del pipeline */}
      {pipelineModalOpen ? (
        <PipelineEstadoModal
          conversationId={conversationId}
          estadoActual={conv?.estado_pipeline ?? null}
          fechaActual={conv?.seguimiento_fecha ?? null}
          onClose={() => setPipelineModalOpen(false)}
          onSaved={() => {
            setPipelineModalOpen(false);
            // Refrescar inbox para que el chip del header y la card se actualicen.
            void mutateInbox();
          }}
        />
      ) : null}
    </div>
  );
}

/**
 * Modal bottom-sheet para elegir estado del pipeline. Muestra 5 opciones + pedido de
 * fecha (Seguimiento) o monto (Pagado y Entregado). El submit llama al endpoint y
 * mueve el estado local vía el callback onSaved (que hace mutateInbox).
 */
function PipelineEstadoModal({
  conversationId,
  estadoActual,
  fechaActual,
  onClose,
  onSaved,
}: {
  conversationId: string;
  estadoActual: string | null;
  fechaActual: string | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [selected, setSelected] = useState<PipelineEstado | null>(
    (estadoActual as PipelineEstado | null) ?? null
  );
  const [fecha, setFecha] = useState<string>(fechaActual ?? "");
  const [monto, setMonto] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const info = selected ? pipelineEstadoInfo(selected) : null;

  const submit = async () => {
    if (!selected || !info) {
      setError("Elegí un estado");
      return;
    }
    if (info.needsDate && !fecha) {
      setError("Fecha requerida para seguimiento");
      return;
    }
    if (info.needsAmount) {
      const n = Number(monto);
      if (!Number.isFinite(n) || n < 0) {
        setError("Monto requerido (>= 0)");
        return;
      }
    }
    setSaving(true);
    setError(null);
    const res = await setPipelineEstado({
      conversationId,
      estado: selected,
      seguimientoFecha: info.needsDate ? fecha : null,
      ventaMonto: info.needsAmount ? Number(monto) : null,
    });
    setSaving(false);
    if (!res.ok) {
      setError(res.error ?? "No se pudo guardar");
      return;
    }
    onSaved();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-4 shadow-lg"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">Estado del pipeline</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <ul className="space-y-1.5">
          {PIPELINE_ESTADOS_ORDER.map((k) => {
            const it = pipelineEstadoInfo(k)!;
            const active = selected === k;
            return (
              <li key={k}>
                <button
                  type="button"
                  onClick={() => setSelected(k)}
                  className={`flex w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-left text-sm transition-colors ${
                    active
                      ? "border-slate-900 bg-slate-50"
                      : "border-slate-200 bg-white hover:bg-slate-50"
                  }`}
                >
                  <span className="text-lg" aria-hidden>
                    {it.emoji}
                  </span>
                  <span className="flex-1 font-medium text-slate-800">{it.label}</span>
                  {active ? (
                    <span
                      className="h-2 w-2 rounded-full"
                      style={{ backgroundColor: it.dot }}
                    />
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>

        {info?.needsDate ? (
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Fecha de seguimiento
            </label>
            <input
              type="date"
              value={fecha}
              onChange={(e) => setFecha(e.target.value)}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
              min={new Date().toISOString().slice(0, 10)}
            />
            <p className="mt-1 text-[11px] text-slate-500">
              Recibirás una notificación push ese día.
            </p>
          </div>
        ) : null}

        {info?.needsAmount ? (
          <div className="mt-3">
            <label className="mb-1 block text-xs font-medium text-slate-600">
              Monto de la venta (Gs)
            </label>
            <input
              type="number"
              inputMode="numeric"
              value={monto}
              onChange={(e) => setMonto(e.target.value)}
              placeholder="0"
              min={0}
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm tabular-nums"
            />
          </div>
        ) : null}

        {error ? (
          <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-xs text-red-700">{error}</p>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-300 py-2.5 text-sm font-semibold text-slate-700"
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={() => void submit()}
            disabled={saving || !selected}
            className="flex-1 rounded-lg bg-[#4FAEB2] py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving ? "Guardando..." : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({
  message,
  quotedMessage,
  onSaveIncomingSticker,
  onLongPress,
  onSwipeReply,
  themeColors,
  reactions,
  onOpenReactionsDetail,
}: {
  message: MobileChatMessage;
  /** Mensaje al que este responde (resuelto por wa_message_id). */
  quotedMessage?: MobileChatMessage | null;
  onSaveIncomingSticker?: () => void;
  onLongPress?: () => void;
  /** Deslizar la burbuja en horizontal (como WhatsApp) para citarla. */
  onSwipeReply?: () => void;
  /** Paleta compartida (light/dark). Aplica solo a burbujas ENTRANTES; salientes siguen teal. */
  themeColors: ChatThemeColors;
  /** Reacciones agrupadas por emoji apuntando a este mensaje. */
  reactions?: Array<{ emoji: string; count: number; ownedByMe: boolean }>;
  /** Abrir bottom-sheet con detalle de reacciones (quitar propia, agregar, etc.). */
  onOpenReactionsDetail?: () => void;
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

  // ── Long-press → dispara onLongPress. Cancela si el usuario mueve el dedo
  //    (evita chocarse con el scroll de la lista).
  const longPressTimerRef = useRef<number | null>(null);
  const longPressFiredRef = useRef(false);
  const longPressStartRef = useRef<{ x: number; y: number } | null>(null);
  const cancelLongPress = () => {
    if (longPressTimerRef.current != null) {
      window.clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    longPressStartRef.current = null;
  };
  // Swipe horizontal → responder (como WhatsApp).
  const swipe = useSwipeToReply(onSwipeReply, () => cancelLongPress());
  const dragX = swipe.dragX;

  const handlePointerDown = (ev: React.PointerEvent) => {
    swipe.handlers.onPointerDown(ev);
    if (!onLongPress) return;
    longPressFiredRef.current = false;
    longPressStartRef.current = { x: ev.clientX, y: ev.clientY };
    longPressTimerRef.current = window.setTimeout(() => {
      longPressFiredRef.current = true;
      // Vibración corta como feedback táctil — Android soporta navigator.vibrate.
      try { navigator.vibrate?.(30); } catch { /* noop */ }
      onLongPress();
    }, 500);
  };

  const handlePointerMove = (ev: React.PointerEvent) => {
    const s = longPressStartRef.current;
    if (s) {
      const adx = Math.abs(ev.clientX - s.x);
      const ady = Math.abs(ev.clientY - s.y);
      if (adx > 10 || ady > 10) cancelLongPress();
    }
    swipe.handlers.onPointerMove(ev);
  };

  const handlePointerUp = () => {
    cancelLongPress();
    swipe.handlers.onPointerUp();
  };

  const handlePointerCancel = () => {
    cancelLongPress();
    swipe.handlers.onPointerCancel();
  };

  return (
    <li
      id={`msg-${message.id}`}
      className={`relative flex ${fromMe ? "justify-end" : "justify-start"} ${
        reactions && reactions.length > 0 ? "mb-3" : ""
      }`}
    >
      {/* Ícono que asoma mientras arrastrás: se llena a medida que te acercás al umbral. */}
      {dragX !== 0 ? (
        <span
          aria-hidden
          className={`pointer-events-none absolute top-1/2 -translate-y-1/2 text-[#3F8E91] ${
            dragX > 0 ? "left-1" : "right-1"
          }`}
          style={{ opacity: Math.min(1, Math.abs(dragX) / SWIPE_REPLY_TRIGGER) }}
        >
          <Reply className="h-4 w-4" />
        </span>
      ) : null}
      <div
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerCancel}
        style={
          // Inbound + no sticker: mergeamos color de tema encima del transform de swipe.
          // Saliente (teal fijo) y sticker (sin burbuja) usan solo swipe.style.
          !fromMe && !isSticker
            ? { ...(swipe.style ?? {}), backgroundColor: themeColors.inboundBg, color: themeColors.inboundText }
            : swipe.style
        }
        className={`relative max-w-[80%] select-none overflow-visible rounded-2xl text-sm shadow-[0_1px_1px_rgba(15,23,42,0.04)] ${
          isSticker
            ? "bg-transparent shadow-none"
            : fromMe
              ? "rounded-br-sm bg-[#4FAEB2] text-white"
              : "rounded-bl-sm"
        } ${isSticker ? "" : "px-3 py-2"}`}
      >
        {/* Bloque de cita (mensaje al que este responde). Si la cita es una
            imagen/video/sticker, mostramos un thumbnail al costado del texto. */}
        {quotedMessage && !isSticker ? (
          (() => {
            const qRaw = (quotedMessage.raw_payload ?? null) as RawPayload;
            const qUrl =
              getErpAttachmentPublicUrl(qRaw) ?? getWhatsAppMediaUrlFromRawPayload(qRaw);
            const qType = quotedMessage.message_type || "text";
            const showThumb = Boolean(qUrl) && (qType === "image" || qType === "sticker" || qType === "video");
            return (
              <button
                type="button"
                onClick={(e) => {
                  // Al tocar la cita, saltamos al mensaje original y lo destacamos.
                  // stopPropagation para que el long-press del bubble no se dispare.
                  e.stopPropagation();
                  const target = document.getElementById(`msg-${quotedMessage.id}`);
                  if (!target) return;
                  target.scrollIntoView({ behavior: "smooth", block: "center" });
                  target.classList.add("ring-2", "ring-[#4FAEB2]", "rounded-2xl");
                  window.setTimeout(() => {
                    target.classList.remove("ring-2", "ring-[#4FAEB2]", "rounded-2xl");
                  }, 1400);
                }}
                className={`mb-1.5 flex w-full items-start gap-2 rounded-lg border-l-4 px-2 py-1 text-left text-[11px] transition-opacity active:opacity-70 ${
                  fromMe
                    ? "border-white/60 bg-white/15 text-white/90"
                    : "border-[#4FAEB2] bg-[#4FAEB2]/8 text-slate-700"
                }`}
              >
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {quotedMessage.from_me ? "Vos" : "Cliente"}
                  </p>
                  <p className="line-clamp-2 opacity-90">
                    {previewForQuoted(quotedMessage)}
                  </p>
                </div>
                {showThumb ? (
                  <img
                    src={qUrl!}
                    alt=""
                    className="h-10 w-10 shrink-0 rounded-md object-cover"
                    draggable={false}
                    style={{ pointerEvents: "none" } as React.CSSProperties}
                  />
                ) : null}
              </button>
            );
          })()
        ) : null}
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
            // En Android WebView el <img> nativo captura el long-press/swipe (para
            // "guardar imagen") y bloquea la respuesta con cita. draggable={false} +
            // callout/select en none dejan que los pointer events lleguen a la burbuja.
            draggable={false}
            style={{
              WebkitUserSelect: "none",
              userSelect: "none",
              WebkitTouchCallout: "none",
              WebkitUserDrag: "none",
            } as React.CSSProperties}
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
            className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] tabular-nums ${
              fromMe ? "text-white/70" : "text-slate-400"
            }`}
          >
            <span>{ts}</span>
            {fromMe ? (
              <DeliveryStatusIcon status={message.whatsapp_delivery_status ?? null} />
            ) : (
              <InboundReadIcon readAt={message.whatsapp_read_at ?? null} />
            )}
          </p>
        ) : (
          <p className="mt-0.5 flex items-center gap-1 pl-1 text-[10px] tabular-nums text-slate-400">
            <span>{ts}</span>
            {fromMe ? (
              <DeliveryStatusIcon status={message.whatsapp_delivery_status ?? null} />
            ) : (
              <InboundReadIcon readAt={message.whatsapp_read_at ?? null} />
            )}
          </p>
        )}
        {/* Motivo del fallo: sin esto el ⓘ no dice nada y hay que ir a los logs. */}
        {fromMe && message.whatsapp_delivery_status === "failed" ? (
          <p className="mt-1 rounded-md bg-red-50 px-2 py-1 text-[10px] leading-snug text-red-700">
            <span className="font-semibold">No entregado.</span>{" "}
            {friendlyWhatsappFailureReason(
              extractWhatsappFailureInfo(message.raw_payload as Record<string, unknown> | null)
            )}
          </p>
        ) : null}
        {/* Reacciones al mensaje — chip estilo WhatsApp que se solapa con la
            esquina inferior de la burbuja. Tap = abre bottom sheet con detalle.
            El bubble tiene overflow-visible, así que puede sobresalir para abajo. */}
        {reactions && reactions.length > 0 ? (
          <div
            className={`absolute -bottom-2.5 flex gap-0.5 ${fromMe ? "right-1.5" : "left-1.5"}`}
          >
            {reactions.map((r) => (
              <button
                key={r.emoji}
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onOpenReactionsDetail?.();
                }}
                aria-label="Ver reacciones"
                className="inline-flex items-center gap-0.5 rounded-full border px-1.5 text-[11px] leading-none shadow-sm transition-transform active:scale-90"
                style={{
                  backgroundColor: themeColors.inboundBg,
                  color: themeColors.inboundText,
                  borderColor: r.ownedByMe ? "#4FAEB2" : "transparent",
                  minHeight: 22,
                }}
              >
                <span aria-hidden style={{ fontSize: 13 }}>{r.emoji}</span>
                {r.count > 1 ? (
                  <span className="text-[10px] font-semibold opacity-70">{r.count}</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
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

/** Texto corto para representar un mensaje citado (bloque arriba del contenido). */
function previewForQuoted(m: MobileChatMessage): string {
  const t = m.message_type || "text";
  if (t === "text") return (m.content ?? "").slice(0, 140) || "Mensaje";
  if (t === "image") return "📷 Imagen";
  if (t === "video") return "🎥 Video";
  if (t === "audio") return "🎤 Nota de voz";
  if (t === "sticker") return "🌟 Sticker";
  if (t === "document") return "📎 Documento";
  return "Mensaje";
}

function formatHora(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

// ── Drawer picker de stickers ───────────────────────────────────────────────

// ── Preview de archivos antes de enviar ─────────────────────────────────────

function PendingFilesPreview({
  files,
  onRemove,
  onCancel,
  onSend,
  onAddMore,
}: {
  files: { file: File; previewUrl: string | null }[];
  onRemove: (index: number) => void;
  onCancel: () => void;
  onSend: () => void;
  onAddMore: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-slate-900/95"
      role="dialog"
      aria-label="Previsualizar archivos antes de enviar"
    >
      {/* Header */}
      <div
        className="flex shrink-0 items-center justify-between px-3 py-2 text-white"
        style={{ paddingTop: "max(env(safe-area-inset-top), 32px)" }}
      >
        <button
          type="button"
          onClick={onCancel}
          aria-label="Cancelar"
          className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10"
        >
          <X className="h-5 w-5" />
        </button>
        <p className="text-sm font-medium">
          {files.length} {files.length === 1 ? "archivo" : "archivos"}
        </p>
        <button
          type="button"
          onClick={onAddMore}
          aria-label="Agregar más"
          title="Agregar más"
          className="flex h-11 w-11 items-center justify-center rounded-lg hover:bg-white/10"
        >
          <ImageIcon className="h-5 w-5" />
        </button>
      </div>

      {/* Grid de previews */}
      <div className="flex-1 overflow-y-auto p-3">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {files.map((entry, i) => {
            const isImage = (entry.file.type || "").startsWith("image/");
            const isVideo = (entry.file.type || "").startsWith("video/");
            return (
              <div
                key={i}
                className="relative aspect-square overflow-hidden rounded-xl bg-slate-800"
              >
                {isImage && entry.previewUrl ? (
                  <img
                    src={entry.previewUrl}
                    alt={entry.file.name}
                    className="h-full w-full object-cover"
                  />
                ) : isVideo && entry.previewUrl ? (
                  <video
                    src={entry.previewUrl}
                    className="h-full w-full object-cover"
                    muted
                    playsInline
                  />
                ) : (
                  <div className="flex h-full w-full flex-col items-center justify-center gap-1 p-3 text-center text-white/80">
                    <FileText className="h-8 w-8" />
                    <span className="line-clamp-2 text-[11px]">{entry.file.name}</span>
                  </div>
                )}

                {/* Botón X para quitar */}
                <button
                  type="button"
                  onClick={() => onRemove(i)}
                  aria-label={`Quitar ${entry.file.name}`}
                  className="absolute right-1 top-1 flex h-8 w-8 items-center justify-center rounded-full bg-black/60 text-white shadow-md active:scale-95"
                >
                  <Trash2 className="h-4 w-4" />
                </button>

                {/* Nombre + tamaño abajo */}
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 text-[10px] text-white">
                  <p className="truncate">{entry.file.name}</p>
                  <p className="opacity-75">{formatFileSize(entry.file.size)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer con botón Enviar */}
      <div
        className="shrink-0 border-t border-white/10 bg-slate-900 p-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
      >
        <button
          type="button"
          onClick={onSend}
          disabled={files.length === 0}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#4FAEB2] px-4 py-3 text-sm font-semibold text-white active:bg-[#3F8E91] disabled:opacity-40"
        >
          <Send className="h-4 w-4" />
          Enviar {files.length > 1 ? `(${files.length})` : ""}
        </button>
      </div>
    </div>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

// ── Bubble optimista (mientras se envía) ────────────────────────────────────

function OptimisticBubble({ opt }: { opt: OptimisticMessage }) {
  const ts = formatHora(opt.createdAt);
  const isSticker = opt.type === "sticker";
  const isImage = opt.type === "image" && opt.previewUrl;
  const isVideo = opt.type === "video" && opt.previewUrl;
  const isAudio = opt.type === "audio" && opt.previewUrl;
  const isDocument = opt.type === "document";
  const isText = opt.type === "text";
  const failed = opt.status === "failed";

  return (
    <li className="flex justify-end">
      <div
        className={`relative max-w-[80%] overflow-visible rounded-2xl text-sm shadow-[0_1px_1px_rgba(15,23,42,0.04)] ${
          isSticker
            ? "bg-transparent shadow-none"
            : "rounded-br-sm bg-[#4FAEB2] text-white"
        } ${isSticker ? "" : "px-3 py-2"} ${failed ? "opacity-95 ring-2 ring-red-400" : "opacity-70"}`}
      >
        {opt.quoted && !isSticker ? (
          <div className="mb-1.5 rounded-lg border-l-4 border-white/60 bg-white/15 px-2 py-1 text-[11px] text-white/90">
            <p className="truncate font-medium">
              {opt.quoted.from_me ? "Vos" : "Cliente"}
            </p>
            <p className="line-clamp-2 opacity-90">{previewForQuoted(opt.quoted)}</p>
          </div>
        ) : null}
        {isImage ? (
          <img
            src={opt.previewUrl}
            alt="imagen"
            className="max-h-[60vh] w-full rounded-xl object-cover"
          />
        ) : isVideo ? (
          <video
            src={opt.previewUrl}
            controls
            preload="metadata"
            className="max-h-[60vh] w-full rounded-xl"
          />
        ) : isSticker ? (
          <img
            src={opt.previewUrl}
            alt="sticker"
            className="h-32 w-32 object-contain"
          />
        ) : isAudio ? (
          <audio
            src={opt.previewUrl}
            controls
            preload="metadata"
            className="block w-[240px] max-w-full sm:w-[280px]"
          />
        ) : isDocument ? (
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 shrink-0" />
            <span className="truncate">{opt.content ?? "Documento"}</span>
          </div>
        ) : isText ? (
          <p className="whitespace-pre-wrap break-words">{opt.content}</p>
        ) : (
          <p className="italic opacity-90">Enviando…</p>
        )}

        <div
          className={`mt-0.5 flex items-center justify-end gap-1 text-[10px] tabular-nums ${
            isSticker ? "pl-1 text-slate-400" : "text-white/80"
          }`}
        >
          {failed ? (
            <>
              <AlertCircle className="h-3 w-3 text-red-100" />
              <span>No se envió</span>
              {opt.retry ? (
                <button
                  type="button"
                  onClick={opt.retry}
                  className="ml-1 inline-flex items-center gap-0.5 rounded px-1 text-white underline"
                  aria-label="Reintentar envío"
                >
                  <RotateCw className="h-3 w-3" />
                  Reintentar
                </button>
              ) : null}
            </>
          ) : (
            <>
              <Clock className="h-3 w-3" />
              <span>{ts}</span>
            </>
          )}
        </div>

        {failed && opt.errorMessage ? (
          <p className="mt-1 text-[10px] text-red-100">{opt.errorMessage}</p>
        ) : null}
      </div>
    </li>
  );
}

/**
 * Drawer estilo WhatsApp con dos modos:
 *  - Emojis: grilla categorizada, insert al textarea (drawer queda abierto).
 *  - Stickers: catálogo por paquete, envía al toque y cierra.
 */
function EmojiStickerDrawer({
  packs,
  loading,
  disabled,
  onClose,
  onSelectSticker,
  onPickEmoji,
}: {
  packs: StickerCatalogPack[];
  loading: boolean;
  disabled: boolean;
  onClose: () => void;
  onSelectSticker: (stickerId: string, previewUrl: string) => void;
  onPickEmoji: (emoji: string) => void;
}) {
  const [mode, setMode] = useState<"emojis" | "stickers">("emojis");
  const [emojiCat, setEmojiCat] = useState(0);
  const [packTab, setPackTab] = useState(0);
  useEffect(() => {
    setPackTab(0);
  }, [packs.length]);
  const activePack = packs[packTab];
  const activeEmojiCat = EMOJI_CATEGORIES[emojiCat];

  return (
    <div
      className="fixed inset-0 z-40 flex flex-col justify-end bg-black/40"
      role="presentation"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-label={mode === "emojis" ? "Elegí un emoji" : "Elegí un sticker"}
        onClick={(ev) => ev.stopPropagation()}
        className="flex max-h-[65svh] flex-col rounded-t-2xl border-t border-slate-200 bg-white"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 4px)" }}
      >
        {/* Header con tabs de modo + cerrar */}
        <div className="flex items-center justify-between border-b border-slate-100 px-2 py-2">
          <div className="flex gap-1">
            <button
              type="button"
              onClick={() => setMode("emojis")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                mode === "emojis"
                  ? "bg-[#4FAEB2]/10 text-[#3F8E91]"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              Emojis
            </button>
            <button
              type="button"
              onClick={() => setMode("stickers")}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                mode === "stickers"
                  ? "bg-[#4FAEB2]/10 text-[#3F8E91]"
                  : "text-slate-500 hover:bg-slate-50"
              }`}
            >
              Stickers
            </button>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-50"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Modo Emojis */}
        {mode === "emojis" ? (
          <>
            <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-100 px-2 py-2">
              {EMOJI_CATEGORIES.map((c, i) => (
                <button
                  key={c.label}
                  type="button"
                  onClick={() => setEmojiCat(i)}
                  aria-label={c.label}
                  className={`shrink-0 rounded-full px-2 py-1 text-lg leading-none ${
                    i === emojiCat ? "bg-[#4FAEB2]/10" : "hover:bg-slate-50"
                  }`}
                >
                  {c.icon}
                </button>
              ))}
            </div>
            <div className="flex-1 overflow-y-auto p-2">
              <div className="grid grid-cols-8 gap-1 sm:grid-cols-10">
                {activeEmojiCat.emojis.map((e, i) => (
                  <button
                    key={`${activeEmojiCat.label}-${i}`}
                    type="button"
                    onClick={() => onPickEmoji(e)}
                    className="flex aspect-square items-center justify-center rounded-lg text-2xl transition-transform active:scale-95 hover:bg-slate-50"
                  >
                    {e}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          /* Modo Stickers */
          <>
            {loading ? (
              <p className="p-6 text-center text-sm text-slate-500">Cargando catálogo…</p>
            ) : packs.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                <p className="font-medium text-slate-700">Todavía no hay stickers guardados</p>
                <p className="mt-1 text-xs">
                  Guardá stickers que te manden los clientes tocando la{" "}
                  <Star
                    className="inline h-3 w-3 -translate-y-0.5 text-amber-500"
                    fill="currentColor"
                  />{" "}
                  en su burbuja.
                </p>
              </div>
            ) : (
              <>
                <div className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-100 px-2 py-2">
                  {packs.map((p, i) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setPackTab(i)}
                      className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${
                        i === packTab
                          ? "bg-[#4FAEB2] text-white"
                          : "bg-slate-100 text-slate-600"
                      }`}
                    >
                      {p.nombre}
                    </button>
                  ))}
                </div>
                <div className="flex-1 overflow-y-auto p-3">
                  {activePack?.stickers.length ? (
                    <div className="grid grid-cols-4 gap-2 sm:grid-cols-5">
                      {activePack.stickers.map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          disabled={disabled}
                          onClick={() => onSelectSticker(s.id, s.public_url)}
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
          </>
        )}
      </div>
    </div>
  );
}

// ── Bottom-sheet con detalle de reacciones ──────────────────────────────────

/**
 * Detalle de las reacciones a un mensaje. Estilo WhatsApp:
 *   Tabs: "Todas (N)" | "👍 N" | "❤️ N" | ...
 *   Lista: cada persona con su emoji. "Tú - Toca para quitar" es tappeable.
 *   Extra: al lado del emoji del cliente, botón "+ Yo también" para agregar la misma.
 */
function ReactionsDetailSheet({
  message,
  reactionsByTarget,
  contactName,
  onClose,
  onRemoveMine,
  onAddMine,
}: {
  message: MobileChatMessage;
  reactionsByTarget: Map<string, Array<{ emoji: string; count: number; ownedByMe: boolean }>>;
  contactName: string;
  onClose: () => void;
  onRemoveMine: (emoji: string) => void;
  onAddMine: (emoji: string) => void;
}) {
  const target = message.wa_message_id ?? "";
  const grouped = target ? reactionsByTarget.get(target) ?? [] : [];
  // Total flat (para header "N reacciones").
  const total = grouped.reduce((s, r) => s + r.count, 0);
  const [selectedEmoji, setSelectedEmoji] = useState<string | "all">("all");
  const visibleRows = grouped.filter((r) => selectedEmoji === "all" || r.emoji === selectedEmoji);

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-slate-200" />
        <div className="px-4 pt-3 pb-2">
          <p className="text-sm font-semibold text-slate-800">
            {total} {total === 1 ? "reacción" : "reacciones"}
          </p>
        </div>
        {/* Tabs por emoji */}
        <div className="flex gap-1.5 overflow-x-auto px-4 pb-2">
          <button
            type="button"
            onClick={() => setSelectedEmoji("all")}
            className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold whitespace-nowrap ${
              selectedEmoji === "all"
                ? "bg-slate-900 text-white"
                : "bg-slate-100 text-slate-600"
            }`}
          >
            Todas {total}
          </button>
          {grouped.map((r) => (
            <button
              key={r.emoji}
              type="button"
              onClick={() => setSelectedEmoji(r.emoji)}
              className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-semibold whitespace-nowrap ${
                selectedEmoji === r.emoji
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600"
              }`}
            >
              <span aria-hidden style={{ fontSize: 14 }}>{r.emoji}</span> {r.count}
            </button>
          ))}
        </div>
        {/* Lista de reacciones. Cada grupo puede tener 1 tuya + 1 del cliente (Meta
            solo permite 1 reacción por persona por mensaje). */}
        <ul className="max-h-[60vh] overflow-y-auto">
          {visibleRows.length === 0 ? (
            <li className="px-4 py-4 text-center text-sm text-slate-400">
              Sin reacciones para este emoji.
            </li>
          ) : null}
          {visibleRows.flatMap((r) => {
            // Cada r puede representar hasta 2 personas: vos y el cliente.
            const rows: Array<{ who: "me" | "them"; emoji: string }> = [];
            if (r.ownedByMe) rows.push({ who: "me", emoji: r.emoji });
            // Si count > (ownedByMe ? 1 : 0), hubo al menos una del cliente.
            const otherCount = r.count - (r.ownedByMe ? 1 : 0);
            for (let i = 0; i < otherCount; i++) rows.push({ who: "them", emoji: r.emoji });
            return rows.map((row, idx) => (
              <li key={`${r.emoji}-${row.who}-${idx}`} className="flex items-center gap-3 px-4 py-3 border-t border-slate-100 first:border-t-0">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-slate-100 text-sm font-semibold text-slate-600">
                  {row.who === "me" ? "T" : contactName.charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-slate-800">
                    {row.who === "me" ? "Tú" : contactName}
                  </p>
                  {row.who === "me" ? (
                    <button
                      type="button"
                      onClick={() => onRemoveMine(row.emoji)}
                      className="text-[12px] text-[#3F8E91] underline"
                    >
                      Toca para quitar
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => onAddMine(row.emoji)}
                      className="text-[12px] text-slate-500"
                    >
                      + Yo también
                    </button>
                  )}
                </div>
                <span aria-hidden style={{ fontSize: 22 }}>{row.emoji}</span>
              </li>
            ));
          })}
        </ul>
      </div>
    </div>
  );
}

// ── Picker de emojis dedicado a reacciones ──────────────────────────────────

/**
 * Bottom-sheet con todas las categorías de emojis. Al tocar uno, llama `onPick`.
 * Es más chico que el drawer de composer (no muestra stickers ni buscador) —
 * solo la biblioteca completa de EMOJI_CATEGORIES.
 */
function ReactionEmojiPicker({
  onClose,
  onPick,
}: {
  onClose: () => void;
  onPick: (emoji: string) => void;
}) {
  const [cat, setCat] = useState(0);
  const current = EMOJI_CATEGORIES[cat] ?? EMOJI_CATEGORIES[0];
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-t-2xl bg-white p-3"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 12px)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-2 flex items-center justify-between">
          <p className="text-sm font-semibold text-slate-800">Elegí una reacción</p>
          <button
            type="button"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full text-slate-500 hover:bg-slate-100"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {/* Tabs de categoría */}
        <div className="mb-2 flex gap-1 overflow-x-auto pb-1">
          {EMOJI_CATEGORIES.map((c, i) => (
            <button
              key={c.label}
              type="button"
              onClick={() => setCat(i)}
              className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap ${
                i === cat ? "bg-[#4FAEB2] text-white" : "bg-slate-100 text-slate-600"
              }`}
            >
              {c.icon} {c.label}
            </button>
          ))}
        </div>
        {/* Grid de emojis */}
        <div className="grid max-h-[45vh] grid-cols-8 gap-1 overflow-y-auto">
          {current.emojis.map((e, i) => (
            <button
              key={`${cat}-${i}`}
              type="button"
              onClick={() => onPick(e)}
              className="flex h-9 w-9 items-center justify-center rounded-lg text-xl transition-transform active:scale-125 hover:bg-slate-100"
            >
              {e}
            </button>
          ))}
        </div>
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
            className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white active:bg-[#3F8E91] disabled:opacity-50"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
