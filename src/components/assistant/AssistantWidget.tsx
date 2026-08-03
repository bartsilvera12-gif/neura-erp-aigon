"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ImagePlus, Loader2, RotateCcw, Send, X } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

/** Renderer compacto para el chat (sin h1/h2 grandes, sin imágenes, listas apretadas). */
const MD_COMPONENTS = {
  p: (props: React.HTMLAttributes<HTMLParagraphElement>) => (
    <p className="mb-1.5 last:mb-0" {...props} />
  ),
  strong: (props: React.HTMLAttributes<HTMLElement>) => (
    <strong className="font-semibold text-slate-900" {...props} />
  ),
  em: (props: React.HTMLAttributes<HTMLElement>) => <em className="italic" {...props} />,
  ul: (props: React.HTMLAttributes<HTMLUListElement>) => (
    <ul className="mb-1.5 list-disc space-y-0.5 pl-4 last:mb-0" {...props} />
  ),
  ol: (props: React.OlHTMLAttributes<HTMLOListElement>) => (
    <ol className="mb-1.5 list-decimal space-y-0.5 pl-4 last:mb-0" {...props} />
  ),
  li: (props: React.LiHTMLAttributes<HTMLLIElement>) => <li className="leading-snug" {...props} />,
  h1: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <p className="mb-1 mt-1.5 text-[13px] font-semibold text-slate-900 first:mt-0" {...props} />
  ),
  h2: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <p className="mb-1 mt-1.5 text-[13px] font-semibold text-slate-900 first:mt-0" {...props} />
  ),
  h3: (props: React.HTMLAttributes<HTMLHeadingElement>) => (
    <p className="mb-1 mt-1.5 text-xs font-semibold text-slate-900 first:mt-0" {...props} />
  ),
  hr: () => <hr className="my-2 border-slate-200" />,
  code: ({ inline, ...props }: { inline?: boolean } & React.HTMLAttributes<HTMLElement>) =>
    inline ? (
      <code
        className="rounded bg-slate-200/70 px-1 py-px font-mono text-[11px] text-slate-800"
        {...props}
      />
    ) : (
      <code
        className="block overflow-x-auto rounded-md bg-slate-900/95 p-2 font-mono text-[11px] text-slate-100"
        {...props}
      />
    ),
  pre: (props: React.HTMLAttributes<HTMLPreElement>) => (
    <pre className="my-1.5 overflow-x-auto" {...props} />
  ),
  a: ({ href, ...props }: React.AnchorHTMLAttributes<HTMLAnchorElement>) => {
    const isInternal = typeof href === "string" && href.startsWith("/");
    return (
      <a
        href={href}
        {...props}
        {...(isInternal ? {} : { target: "_blank", rel: "noopener noreferrer" })}
        className="font-medium text-[#0EA5E9] underline underline-offset-2 hover:text-[#0284C7]"
      />
    );
  },
  blockquote: (props: React.HTMLAttributes<HTMLQuoteElement>) => (
    <blockquote
      className="my-1 border-l-2 border-slate-300 pl-2 text-slate-600"
      {...props}
    />
  ),
};

/**
 * Asistente de ayuda (Fase 1 MVP) — panel flotante.
 * Solo se monta cuando NEXT_PUBLIC_ASSISTANT_ENABLED === "1" (ver AppShell).
 * Consume /api/assistant/chat por SSE (streaming).
 */

type ChatMessage = { role: "user" | "assistant"; content: string };
type Source = { doc: string; title: string; heading: string | null };

const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const STORAGE_KEY = "neura-assistant-chat-v1";

type PersistedChat = {
  messages: ChatMessage[];
  sources: Source[];
  conversationId: string | null;
};

export default function AssistantWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [sources, setSources] = useState<Source[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingImage, setPendingImage] = useState<{ mediaType: string; dataBase64: string; name: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => {
    const toggle = () => setOpen((v) => !v);
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("neura:assistant:toggle", toggle);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("neura:assistant:toggle", toggle);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  // Hidratar chat persistido al montar.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const parsed = JSON.parse(raw) as PersistedChat;
      if (Array.isArray(parsed.messages)) setMessages(parsed.messages);
      if (Array.isArray(parsed.sources)) setSources(parsed.sources);
      if (typeof parsed.conversationId === "string") setConversationId(parsed.conversationId);
    } catch {
      /* storage corrupto: lo ignoramos */
    }
  }, []);

  // Persistir cambios del chat. Evita escribir durante el streaming en cada token.
  useEffect(() => {
    if (loading) return;
    try {
      const payload: PersistedChat = { messages, sources, conversationId };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    } catch {
      /* quota / privacy mode: silenciar */
    }
  }, [messages, sources, conversationId, loading]);

  const clearChat = useCallback(() => {
    setMessages([]);
    setSources([]);
    setConversationId(null);
    setError(null);
    setPendingImage(null);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* noop */
    }
  }, []);

  const onPickImage = useCallback(async (file: File | null) => {
    if (!file) return;
    if (file.size > MAX_IMAGE_BYTES) {
      setError("La imagen supera los 4 MB.");
      return;
    }
    const buf = await file.arrayBuffer();
    let binary = "";
    const bytes = new Uint8Array(buf);
    for (let i = 0; i < bytes.length; i += 0x8000) {
      binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    setPendingImage({ mediaType: file.type, dataBase64: btoa(binary), name: file.name });
    setError(null);
  }, []);

  const send = useCallback(async () => {
    const question = input.trim();
    if (!question || loading) return;
    setError(null);
    setInput("");
    const image = pendingImage;
    setPendingImage(null);
    const history = messages.slice(-6);
    setMessages((prev) => [...prev, { role: "user", content: question }, { role: "assistant", content: "" }]);
    setLoading(true);

    try {
      const res = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: question,
          pathname,
          conversationId,
          history,
          ...(image ? { image: { mediaType: image.mediaType, dataBase64: image.dataBase64 } } : {}),
        }),
      });

      if (!res.ok || !res.body) {
        const detail = await res.json().catch(() => null);
        const code = (detail as { error?: string } | null)?.error;
        throw new Error(
          code === "cuota_diaria_superada"
            ? "Alcanzaste el límite diario de consultas al asistente."
            : "El asistente no está disponible en este momento."
        );
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      const appendDelta = (text: string) => {
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === "assistant") {
            next[next.length - 1] = { ...last, content: last.content + text };
          }
          return next;
        });
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const frames = buffer.split("\n\n");
        buffer = frames.pop() ?? "";
        for (const frame of frames) {
          const eventMatch = frame.match(/^event: (.+)$/m);
          const dataMatch = frame.match(/^data: (.+)$/m);
          if (!eventMatch || !dataMatch) continue;
          const eventName = eventMatch[1];
          let data: unknown;
          try {
            data = JSON.parse(dataMatch[1]);
          } catch {
            continue;
          }
          if (eventName === "delta") {
            appendDelta((data as { text?: string }).text ?? "");
          } else if (eventName === "meta") {
            const meta = data as { conversationId?: string | null; sources?: Source[] };
            if (meta.conversationId) setConversationId(meta.conversationId);
            setSources(meta.sources ?? []);
          } else if (eventName === "error") {
            throw new Error((data as { message?: string }).message ?? "Error del asistente.");
          }
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado.");
      setMessages((prev) => (prev[prev.length - 1]?.content === "" ? prev.slice(0, -1) : prev));
    } finally {
      setLoading(false);
    }
  }, [input, loading, messages, pathname, conversationId, pendingImage]);

  if (!open) return null;

  return (
    <>
      {/* Panel anclado bajo el header, alineado al icono de ayuda */}
      <div className="fixed right-4 top-[4.5rem] z-50 flex h-[min(34rem,calc(100dvh-6rem))] w-[min(24rem,calc(100vw-2rem))] flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 bg-[#4FAEB2] px-4 py-3 text-white">
            <div>
              <p className="text-sm font-semibold">Neurita</p>
              <p className="text-[11px] text-white/85">Tu asistente de ayuda del sistema</p>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  type="button"
                  aria-label="Limpiar chat e iniciar uno nuevo"
                  title="Nuevo chat"
                  onClick={clearChat}
                  disabled={loading}
                  className="rounded-md p-1 text-white/85 transition-colors hover:bg-white/15 hover:text-white disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <RotateCcw className="h-4 w-4" />
                </button>
              )}
              <button
                type="button"
                aria-label="Cerrar asistente"
                onClick={() => setOpen(false)}
                className="rounded-md p-1 text-white/85 transition-colors hover:bg-white/15 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
            {messages.length === 0 && (
              <div className="rounded-xl bg-slate-50 p-3 text-xs text-slate-600">
                <p className="text-sm font-medium text-slate-800">¡Hola, soy Neurita! 👋</p>
                <p className="mt-0.5">¿En qué puedo ayudarte hoy?</p>
                <p className="mt-2">Algunos ejemplos:</p>
                <ul className="mt-1 list-disc pl-4">
                  <li>¿Cómo creo una nota de crédito?</li>
                  <li>¿Por qué no puedo agendar una cita?</li>
                  <li>¿Cómo lanzo una campaña de WhatsApp?</li>
                </ul>
                <p className="mt-2 text-slate-500">También podés adjuntar una captura de un error.</p>
              </div>
            )}
            {messages.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                {m.role === "user" ? (
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-sm bg-[#4FAEB2] px-3 py-2 text-xs text-white">
                    {m.content}
                  </div>
                ) : (
                  <div className="max-w-[88%] rounded-2xl rounded-bl-sm bg-slate-100 px-3 py-2 text-xs leading-relaxed text-slate-800">
                    {m.content ? (
                      <ReactMarkdown remarkPlugins={[remarkGfm]} components={MD_COMPONENTS}>
                        {m.content}
                      </ReactMarkdown>
                    ) : loading && i === messages.length - 1 ? (
                      "…"
                    ) : (
                      ""
                    )}
                  </div>
                )}
              </div>
            ))}
            {sources.length > 0 && !loading && (
              <p className="px-1 text-[10px] text-slate-400">
                Fuentes: {sources.map((s) => s.title).filter((v, i, a) => a.indexOf(v) === i).join(" · ")}
              </p>
            )}
            {error && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700">{error}</p>
            )}
          </div>

          <div className="border-t border-slate-100 p-2.5">
            {pendingImage && (
              <div className="mb-1.5 flex items-center justify-between rounded-lg bg-slate-50 px-2 py-1 text-[11px] text-slate-600">
                <span className="truncate">📎 {pendingImage.name}</span>
                <button type="button" onClick={() => setPendingImage(null)} className="ml-2 text-slate-400 hover:text-slate-700">
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <div className="flex items-end gap-1.5">
              <input
                ref={fileRef}
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                className="hidden"
                onChange={(e) => onPickImage(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                aria-label="Adjuntar captura"
                onClick={() => fileRef.current?.click()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-50 hover:text-[#4FAEB2]"
              >
                <ImagePlus className="h-4 w-4" />
              </button>
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder="Escribí tu pregunta…"
                className="max-h-24 min-h-9 flex-1 resize-none rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]"
              />
              <button
                type="button"
                aria-label="Enviar"
                onClick={() => void send()}
                disabled={loading || !input.trim()}
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-[#4FAEB2] text-white transition-colors disabled:cursor-not-allowed disabled:opacity-40"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
              </button>
            </div>
            <p className="mt-1 px-1 text-[9px] text-slate-300">
              El asistente responde según la documentación del producto; puede cometer errores.
            </p>
          </div>
        </div>
    </>
  );
}
