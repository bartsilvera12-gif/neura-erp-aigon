"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, MessageCircle, Search, Send } from "lucide-react";
import {
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
  const scrollRef = useRef<HTMLDivElement>(null);

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
              <MessageBubble key={m.id} message={m} />
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
        <div className="flex items-end gap-2">
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
            placeholder="Escribí un mensaje…"
            className="max-h-32 min-h-[44px] flex-1 resize-none rounded-xl border border-slate-200 px-3 py-2.5 text-base text-slate-800 placeholder:text-slate-400 focus:border-[#0EA5E9]/40 focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]/30"
          />
          <button
            type="button"
            onClick={() => void send()}
            disabled={sending || !text.trim()}
            aria-label="Enviar"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[#0EA5E9] text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40 active:bg-[#0284C7]"
          >
            <Send className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function MessageBubble({ message }: { message: MobileChatMessage }) {
  const fromMe = message.from_me;
  const ts = formatHora(message.created_at);
  const isText = message.message_type === "text" || !message.message_type;
  const content = message.content ?? "";

  return (
    <li className={`flex ${fromMe ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm shadow-[0_1px_1px_rgba(15,23,42,0.04)] ${
          fromMe
            ? "rounded-br-sm bg-[#0EA5E9] text-white"
            : "rounded-bl-sm bg-white text-slate-800"
        }`}
      >
        {isText ? (
          <p className="whitespace-pre-wrap break-words">{content}</p>
        ) : (
          <p className="italic opacity-80">
            [{message.message_type}] {content || "Mensaje no soportado en mobile"}
          </p>
        )}
        <p
          className={`mt-0.5 text-right text-[10px] tabular-nums ${
            fromMe ? "text-white/70" : "text-slate-400"
          }`}
        >
          {ts}
        </p>
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
