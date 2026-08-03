"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import {
  getErpAttachmentPublicUrl,
  getWhatsAppMediaUrlFromRawPayload,
} from "@/lib/chat/message-erp-display";
import { friendlyWhatsappFailureReason, extractWhatsappFailureInfo } from "@/lib/chat/whatsapp-failure-reason";
import {
  extractBodyPlaceholderKeysOrdered,
  getBodyComponentText,
  PLACEHOLDER_RE,
} from "@/lib/campaigns/campaign-placeholders-shared";

type Msg = {
  id: string;
  from_me: boolean;
  sender_type: string | null;
  content: string;
  message_type: string;
  created_at: string | null;
  raw_payload?: Record<string, unknown> | null;
  whatsapp_delivery_status?: string | null;
};

type Pending = {
  tempId: string;
  status: "sending" | "error";
  kind: "text" | "audio" | "file";
  content: string;
  file?: File;
};

/** Raíz del mensaje dentro del raw_payload (envelope YCloud o Meta directo). */
function messageRoot(raw: Record<string, unknown> | null | undefined): Record<string, unknown> | null {
  if (!raw || typeof raw !== "object") return null;
  const wim = raw["whatsappInboundMessage"];
  if (wim && typeof wim === "object") return wim as Record<string, unknown>;
  const wm = raw["whatsappMessage"];
  if (wm && typeof wm === "object") return wm as Record<string, unknown>;
  return raw as Record<string, unknown>;
}

/** Contacto(s) compartido(s): nombre + teléfono. */
function extractContacts(raw: Record<string, unknown> | null | undefined): { name: string; phone: string }[] {
  const root = messageRoot(raw);
  const arr = root?.["contacts"];
  if (!Array.isArray(arr)) return [];
  return arr.map((c) => {
    const o = (c ?? {}) as Record<string, unknown>;
    const nameObj = (o.name ?? {}) as Record<string, unknown>;
    const name =
      String(nameObj.formatted_name ?? nameObj.first_name ?? "").trim() || "Contacto";
    const phones = Array.isArray(o.phones) ? (o.phones as Record<string, unknown>[]) : [];
    const phone = String(phones[0]?.phone ?? phones[0]?.wa_id ?? "").trim();
    return { name, phone };
  });
}

/** Ubicación compartida: link a mapa + etiqueta. */
function extractLocation(
  raw: Record<string, unknown> | null | undefined
): { lat: number; lng: number; label: string } | null {
  const root = messageRoot(raw);
  const loc = root?.["location"];
  if (!loc || typeof loc !== "object") return null;
  const o = loc as Record<string, unknown>;
  const lat = Number(o.latitude);
  const lng = Number(o.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  const label = String(o.name ?? o.address ?? "").trim();
  return { lat, lng, label };
}

type Tpl = {
  id: string;
  name: string;
  language: string;
  category: string | null;
  components_json: unknown[];
};

const EMOJIS = [
  "😀", "😅", "😂", "🙂", "😉", "😊", "😍", "🙌", "👍", "👌",
  "🙏", "💪", "🔥", "✅", "❤️", "🎉", "🤝", "👋", "📌", "⏰",
];

/** URL reproducible del adjunto (bucket público chat-media o media de WhatsApp). Mismo criterio que desktop. */
function mediaUrl(m: Msg): string | null {
  const raw = (m.raw_payload ?? null) as Parameters<typeof getErpAttachmentPublicUrl>[0];
  return getErpAttachmentPublicUrl(raw) ?? getWhatsAppMediaUrlFromRawPayload(raw) ?? null;
}

function fmtSecs(s: number): string {
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

function MessageBody({ m }: { m: Msg }) {
  if (m.message_type === "text") {
    return <span className="whitespace-pre-wrap break-words">{m.content}</span>;
  }
  const url = mediaUrl(m);
  if (m.message_type === "audio") {
    return url ? (
      <audio controls src={url} preload="metadata" className="h-9 w-56 max-w-full" />
    ) : (
      <span className="italic opacity-80">[audio]</span>
    );
  }
  if (m.message_type === "image") {
    return url ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={url} alt="imagen" className="max-w-[220px] rounded-lg" />
    ) : (
      <span className="italic opacity-80">[imagen]</span>
    );
  }
  if (m.message_type === "video") {
    return url ? (
      <video src={url} controls preload="metadata" className="max-w-[220px] rounded-lg" />
    ) : (
      <span className="italic opacity-80">[video]</span>
    );
  }
  if (m.message_type === "contacts") {
    const cs = extractContacts(m.raw_payload);
    if (cs.length === 0) return <span className="italic opacity-80">[contacto]</span>;
    return (
      <div className="space-y-1">
        {cs.map((c, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-200 text-sm">👤</span>
            <div className="min-w-0">
              <div className="text-sm font-semibold truncate">{c.name}</div>
              {c.phone ? (
                <a href={`tel:${c.phone.replace(/\s+/g, "")}`} className="text-[12px] underline break-all">
                  {c.phone}
                </a>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    );
  }
  if (m.message_type === "location") {
    const loc = extractLocation(m.raw_payload);
    if (!loc) return <span className="italic opacity-80">[ubicación]</span>;
    return (
      <a
        href={`https://www.google.com/maps/search/?api=1&query=${loc.lat},${loc.lng}`}
        target="_blank"
        rel="noreferrer"
        className="flex items-center gap-2 underline"
      >
        <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-slate-200 text-sm">📍</span>
        <span className="text-sm">{loc.label || "Ver ubicación en el mapa"}</span>
      </a>
    );
  }
  return url ? (
    <a href={url} target="_blank" rel="noreferrer" className="break-all underline">
      [{m.message_type}]
    </a>
  ) : (
    <span className="italic opacity-80">[{m.message_type}]</span>
  );
}

export default function MAsesorChatPage() {
  const params = useParams<{ conversationId: string }>();
  const conversationId = (params?.conversationId as string) ?? "";
  const router = useRouter();

  const [messages, setMessages] = useState<Msg[]>([]);
  const [pending, setPending] = useState<Pending[]>([]);
  const [title, setTitle] = useState("Chat");
  const [windowOpen, setWindowOpen] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [showEmoji, setShowEmoji] = useState(false);
  const [micSupported, setMicSupported] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recSecs, setRecSecs] = useState(0);
  // Recontacto con plantilla aprobada.
  const [tplOpen, setTplOpen] = useState(false);
  const [tplList, setTplList] = useState<Tpl[]>([]);
  const [tplLoading, setTplLoading] = useState(false);
  const [tplSelId, setTplSelId] = useState<string | null>(null);
  const [tplVars, setTplVars] = useState<Record<string, string>>({});
  const [tplSending, setTplSending] = useState(false);
  const [tplErr, setTplErr] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const cancelRecRef = useRef(false);
  const recTimerRef = useRef<number | null>(null);

  const load = useCallback(
    async (silent?: boolean) => {
      if (!conversationId) return;
      if (!silent) setLoading(true);
      try {
        const res = await fetchWithSupabaseSession(
          `/api/mobile/asesor/conversations/${conversationId}`,
          { cache: "no-store" }
        );
        const data = await res.json().catch(() => ({}));
        if (res.status === 403) {
          setErr("No tenés acceso a esta conversación.");
          return;
        }
        if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo cargar");
        setMessages((data.messages ?? []) as Msg[]);
        setTitle(data.conversation?.contact_nombre || data.conversation?.contact_telefono || "Chat");
        setWindowOpen(data.conversation?.window_open ?? null);
        setErr(null);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Error");
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [conversationId]
  );

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(true), 12000);
    const onVis = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, pending]);

  // Autogrow del textarea (multilínea sin romper el layout).
  useEffect(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 128)}px`;
  }, [text]);

  // Detección de soporte de grabación (client-only, evita mostrar un botón inútil).
  useEffect(() => {
    setMicSupported(
      typeof navigator !== "undefined" &&
        !!navigator.mediaDevices?.getUserMedia &&
        typeof MediaRecorder !== "undefined"
    );
  }, []);

  // Limpieza: cortar grabación/stream/timer al desmontar.
  useEffect(() => {
    return () => {
      try {
        mediaRecorderRef.current?.stop();
      } catch {
        /* noop */
      }
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (recTimerRef.current) window.clearInterval(recTimerRef.current);
    };
  }, []);

  // ── Envío de texto (optimista, no bloqueante) ──────────────────────────────
  const deliverText = useCallback(
    (tempId: string, msg: string) => {
      void (async () => {
        try {
          const res = await fetchWithSupabaseSession(
            `/api/mobile/asesor/conversations/${conversationId}/send`,
            {
              method: "POST",
              headers: { "content-type": "application/json" },
              body: JSON.stringify({ message: msg }),
            }
          );
          const data = await res.json().catch(() => ({}));
          if (res.status === 409 || data?.code === "whatsapp_window_closed") {
            setWindowOpen(false);
            setSendErr(
              data?.error ||
                "La ventana de 24 h de WhatsApp está cerrada. Para reabrir hay que enviar una plantilla aprobada."
            );
            setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, status: "error" } : x)));
            return;
          }
          if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo enviar");
          await load(true);
          setPending((p) => p.filter((x) => x.tempId !== tempId));
        } catch (e) {
          setSendErr(e instanceof Error ? e.message : "Error al enviar");
          setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, status: "error" } : x)));
        }
      })();
    },
    [conversationId, load]
  );

  // ── Envío de audio (optimista, no bloqueante) ──────────────────────────────
  const deliverAudio = useCallback(
    (tempId: string, file: File) => {
      void (async () => {
        try {
          const fd = new FormData();
          fd.set("file", file, file.name || "nota-voz.webm");
          const res = await fetchWithSupabaseSession(
            `/api/mobile/asesor/conversations/${conversationId}/send-media`,
            { method: "POST", body: fd }
          );
          const data = await res.json().catch(() => ({}));
          if (res.status === 409 || data?.code === "whatsapp_window_closed") {
            setWindowOpen(false);
            setSendErr(
              data?.error ||
                "La ventana de 24 h de WhatsApp está cerrada. Para reabrir hay que enviar una plantilla aprobada."
            );
            setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, status: "error" } : x)));
            return;
          }
          if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo enviar el audio");
          await load(true);
          setPending((p) => p.filter((x) => x.tempId !== tempId));
        } catch (e) {
          setSendErr(e instanceof Error ? e.message : "Error al enviar el audio");
          setPending((p) => p.map((x) => (x.tempId === tempId ? { ...x, status: "error" } : x)));
        }
      })();
    },
    [conversationId, load]
  );

  const send = useCallback(() => {
    const msg = text.trim();
    if (!msg) return;
    const tempId = `tmp-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    setText("");
    setShowEmoji(false);
    setSendErr(null);
    setPending((p) => [...p, { tempId, kind: "text", content: msg, status: "sending" }]);
    deliverText(tempId, msg);
  }, [text, deliverText]);

  const sendAudio = useCallback(
    (file: File) => {
      const tempId = `tmp-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      setSendErr(null);
      setPending((p) => [...p, { tempId, kind: "audio", content: "Nota de voz", file, status: "sending" }]);
      deliverAudio(tempId, file);
    },
    [deliverAudio]
  );

  // Imagen / video: mismo endpoint de media (detecta el tipo por el archivo). Optimista.
  const sendFile = useCallback(
    (file: File) => {
      if (!file || file.size < 1) return;
      const tempId = `tmp-${Date.now()}-${Math.round(Math.random() * 1e6)}`;
      setSendErr(null);
      const label = file.type.startsWith("video/") ? "📹 Video" : file.type.startsWith("image/") ? "🖼️ Imagen" : "📎 Archivo";
      setPending((p) => [...p, { tempId, kind: "file", content: label, file, status: "sending" }]);
      deliverAudio(tempId, file);
    },
    [deliverAudio]
  );

  const retry = useCallback(
    (item: Pending) => {
      setSendErr(null);
      setPending((p) => p.map((x) => (x.tempId === item.tempId ? { ...x, status: "sending" } : x)));
      if (item.kind === "audio" && item.file) deliverAudio(item.tempId, item.file);
      else deliverText(item.tempId, item.content);
    },
    [deliverAudio, deliverText]
  );

  // ── Grabación de nota de voz ────────────────────────────────────────────────
  const startRec = useCallback(async () => {
    setSendErr(null);
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) {
      setSendErr("No se pudo acceder al micrófono");
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];
      cancelRecRef.current = false;
      const mime =
        typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
          ? "audio/webm;codecs=opus"
          : typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported("audio/webm")
            ? "audio/webm"
            : "";
      const rec = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
      mediaRecorderRef.current = rec;
      rec.ondataavailable = (ev) => {
        if (ev.data.size > 0) chunksRef.current.push(ev.data);
      };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        mediaRecorderRef.current = null;
        streamRef.current = null;
        if (recTimerRef.current) {
          window.clearInterval(recTimerRef.current);
          recTimerRef.current = null;
        }
        setRecording(false);
        setRecSecs(0);
        const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
        chunksRef.current = [];
        if (cancelRecRef.current || blob.size < 300) return;
        const ext = blob.type.includes("ogg") ? "ogg" : "webm";
        const file = new File([blob], `nota-voz.${ext}`, { type: blob.type || "audio/webm" });
        sendAudio(file);
      };
      setRecording(true);
      setRecSecs(0);
      recTimerRef.current = window.setInterval(() => setRecSecs((s) => s + 1), 1000);
      rec.start(400);
    } catch {
      setSendErr("No se pudo acceder al micrófono");
      setRecording(false);
    }
  }, [sendAudio]);

  const stopAndSend = useCallback(() => {
    cancelRecRef.current = false;
    try {
      mediaRecorderRef.current?.stop();
    } catch {
      /* noop */
    }
  }, []);

  const cancelRec = useCallback(() => {
    cancelRecRef.current = true;
    try {
      mediaRecorderRef.current?.stop();
    } catch {
      /* noop */
    }
  }, []);

  // ---- Recontacto con plantilla ----
  async function openTpl() {
    setTplOpen(true);
    setTplErr(null);
    setTplSelId(null);
    setTplVars({});
    setTplLoading(true);
    try {
      const res = await fetchWithSupabaseSession(
        `/api/chat/templates?conversation_id=${encodeURIComponent(conversationId)}`,
        { cache: "no-store" }
      );
      const json = (await res.json().catch(() => ({}))) as { data?: Tpl[] };
      setTplList(Array.isArray(json.data) ? json.data : []);
    } catch {
      setTplList([]);
      setTplErr("No se pudieron cargar las plantillas.");
    } finally {
      setTplLoading(false);
    }
  }

  function pickTpl(t: Tpl) {
    setTplSelId(t.id);
    setTplErr(null);
    const slots = extractBodyPlaceholderKeysOrdered(t.components_json ?? []);
    const nombre = /\p{L}/u.test(title) && title !== "Chat" ? title.trim() : "";
    const init: Record<string, string> = {};
    for (const s of slots) {
      const low = s.toLowerCase();
      init[s] = low === "nombre" || low === "1" || low.includes("nombre") ? nombre : "";
    }
    setTplVars(init);
  }

  async function sendTpl() {
    const t = tplList.find((x) => x.id === tplSelId);
    if (!t || tplSending) return;
    const slots = extractBodyPlaceholderKeysOrdered(t.components_json ?? []);
    const missing = slots.filter((s) => !(tplVars[s] ?? "").trim());
    if (missing.length > 0) {
      setTplErr(`Completá: ${missing.join(", ")}`);
      return;
    }
    setTplSending(true);
    setTplErr(null);
    try {
      const res = await fetchWithSupabaseSession("/api/chat/send-template", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversation_id: conversationId, template_id: t.id, variables: tplVars }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || json.ok === false) throw new Error(json.error || `Error ${res.status}`);
      setTplOpen(false);
      setTplSelId(null);
      setTplVars({});
      await load(true);
    } catch (e) {
      setTplErr(e instanceof Error ? e.message : "No se pudo enviar la plantilla");
    } finally {
      setTplSending(false);
    }
  }

  const tplSel = tplList.find((t) => t.id === tplSelId) ?? null;
  const tplSlots = tplSel ? extractBodyPlaceholderKeysOrdered(tplSel.components_json ?? []) : [];
  const tplPreview = tplSel
    ? getBodyComponentText(tplSel.components_json ?? []).replace(PLACEHOLDER_RE, (_m, rawKey: string) => {
        const k = String(rawKey).trim();
        const v = (tplVars[k] ?? "").trim();
        return v || `{{${k}}}`;
      })
    : "";

  return (
    <div className="min-h-svh max-h-svh bg-slate-50 flex flex-col">
      <header className="sticky top-0 z-10 bg-[#3F8E91] text-white px-2 py-2.5 shadow-sm flex items-center gap-2">
        <button onClick={() => router.push("/m/asesor")} aria-label="Volver" className="h-9 w-9 grid place-items-center rounded-full active:bg-white/15 text-lg">
          ‹
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-sm font-semibold leading-tight">{title}</h1>
          <p className="text-[11px] text-white/80 leading-tight">
            {windowOpen === false ? "Ventana 24 h cerrada" : windowOpen === true ? "Ventana 24 h abierta" : "WhatsApp"}
          </p>
        </div>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2">
        {loading ? (
          <div className="text-center text-slate-400 text-sm animate-pulse py-6">Cargando…</div>
        ) : err ? (
          <div className="m-2 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm p-3">{err}</div>
        ) : messages.length === 0 && pending.length === 0 ? (
          <div className="text-center text-slate-400 text-sm py-6">Sin mensajes.</div>
        ) : (
          <>
            {messages.map((m) => (
              <div key={m.id} className={`flex ${m.from_me ? "justify-end" : "justify-start"}`}>
                <div
                  className={`max-w-[78%] rounded-2xl px-3 py-2 text-[14px] leading-snug shadow-sm ${
                    m.from_me ? "bg-[#4FAEB2] text-white rounded-br-md" : "bg-white text-slate-800 border border-slate-100 rounded-bl-md"
                  }`}
                >
                  <MessageBody m={m} />
                  {m.from_me && m.whatsapp_delivery_status === "failed" ? (
                    <div className="mt-1 rounded-md bg-red-50 border border-red-200 px-2 py-1 text-[11px] text-red-700 flex items-start gap-1">
                      <span aria-hidden>⚠</span>
                      <span>
                        <span className="font-semibold">No entregado.</span>{" "}
                        {friendlyWhatsappFailureReason(extractWhatsappFailureInfo(m.raw_payload))}
                      </span>
                    </div>
                  ) : null}
                </div>
              </div>
            ))}
            {pending.map((p) => (
              <div key={p.tempId} className="flex justify-end">
                <div className="max-w-[78%] rounded-2xl rounded-br-md bg-[#4FAEB2]/70 text-white px-3 py-2 text-[14px] leading-snug shadow-sm">
                  <span className="whitespace-pre-wrap break-words">
                    {p.kind === "audio" ? "🎤 Nota de voz" : p.content}
                  </span>
                  <div className="mt-0.5 text-[10px] text-white/85">
                    {p.status === "sending" ? (
                      "enviando…"
                    ) : (
                      <button type="button" onClick={() => retry(p)} className="underline">
                        error · reintentar
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </>
        )}
      </div>

      {windowOpen === false ? (
        <button
          type="button"
          onClick={() => void openTpl()}
          className="w-full text-left px-3 py-2 bg-amber-50 border-t border-amber-200 text-amber-800 text-[12px] active:bg-amber-100"
        >
          Ventana de 24 h cerrada: tocá acá para <b>recontactar con una plantilla</b> aprobada.
        </button>
      ) : null}
      {sendErr ? <div className="px-3 py-1.5 bg-red-50 text-red-700 text-[12px]">{sendErr}</div> : null}

      <div className="sticky bottom-0 bg-white border-t border-slate-200 px-2 py-2">
        {recording ? (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={cancelRec}
              className="shrink-0 h-10 px-3 rounded-2xl border border-slate-200 text-slate-600 text-sm font-semibold active:scale-95"
            >
              Cancelar
            </button>
            <div className="flex-1 flex items-center gap-2 text-red-600 text-sm font-medium">
              <span className="h-2.5 w-2.5 rounded-full bg-red-500 animate-pulse" />
              Grabando {fmtSecs(recSecs)}
            </div>
            <button
              type="button"
              onClick={stopAndSend}
              className="shrink-0 h-10 px-4 rounded-2xl bg-[#3F8E91] text-white text-sm font-semibold active:scale-95"
            >
              Enviar
            </button>
          </div>
        ) : (
          <>
            {showEmoji ? (
              <div className="mb-2 flex flex-wrap gap-1 px-1">
                {EMOJIS.map((e) => (
                  <button
                    key={e}
                    type="button"
                    onClick={() => setText((t) => t + e)}
                    className="p-1 text-xl leading-none active:scale-90"
                    aria-label={`Emoji ${e}`}
                  >
                    {e}
                  </button>
                ))}
              </div>
            ) : null}
            <div className="flex items-end gap-2">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,video/*"
                className="hidden"
                onChange={(e) => {
                  const f = e.target.files?.[0];
                  if (f) sendFile(f);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                aria-label="Adjuntar imagen o video"
                className="shrink-0 h-10 w-10 grid place-items-center rounded-full text-xl text-slate-500 active:bg-slate-100"
              >
                📎
              </button>
              <button
                type="button"
                onClick={() => setShowEmoji((v) => !v)}
                aria-label="Emojis"
                className="shrink-0 h-10 w-10 grid place-items-center rounded-full text-xl active:bg-slate-100"
              >
                😊
              </button>
              <button
                type="button"
                onClick={() => void openTpl()}
                aria-label="Enviar plantilla / recontactar"
                className={`shrink-0 h-10 w-10 grid place-items-center rounded-full text-lg active:scale-95 ${
                  windowOpen === false ? "bg-amber-100 text-amber-700" : "text-slate-500 active:bg-slate-100"
                }`}
              >
                📄
              </button>
              <textarea
                ref={taRef}
                value={text}
                onChange={(e) => setText(e.target.value)}
                rows={1}
                placeholder="Escribí un mensaje…"
                className="flex-1 resize-none rounded-2xl border border-slate-200 px-3 py-2 text-[14px] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40 max-h-32"
              />
              {text.trim() ? (
                <button
                  onClick={send}
                  className="shrink-0 h-10 px-4 rounded-2xl bg-[#3F8E91] text-white text-sm font-semibold active:scale-95 transition"
                >
                  Enviar
                </button>
              ) : micSupported ? (
                <button
                  type="button"
                  onClick={() => void startRec()}
                  aria-label="Grabar nota de voz"
                  className="shrink-0 h-10 w-10 grid place-items-center rounded-full bg-[#3F8E91] text-white text-lg active:scale-95 transition"
                >
                  🎤
                </button>
              ) : null}
            </div>
          </>
        )}
      </div>

      {tplOpen ? (
        <div className="fixed inset-0 z-50 flex flex-col justify-end bg-black/40" onClick={() => setTplOpen(false)}>
          <div
            className="max-h-[80svh] rounded-t-2xl bg-white flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
              <span className="text-sm font-semibold text-slate-800">Recontactar con plantilla</span>
              <button type="button" onClick={() => setTplOpen(false)} className="text-slate-400 text-lg" aria-label="Cerrar">
                ✕
              </button>
            </div>
            <div className="flex-1 overflow-y-auto p-3">
              {tplLoading ? (
                <p className="py-6 text-center text-sm text-slate-400">Cargando plantillas…</p>
              ) : tplList.length === 0 ? (
                <p className="py-6 text-center text-sm text-slate-500">No hay plantillas aprobadas para este canal.</p>
              ) : !tplSel ? (
                <ul className="space-y-1">
                  {tplList.map((t) => (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => pickTpl(t)}
                        className="w-full rounded-xl border border-slate-100 px-3 py-2.5 text-left active:bg-slate-50"
                      >
                        <span className="block text-sm font-semibold text-slate-900">{t.name}</span>
                        <span className="mt-0.5 line-clamp-2 text-[12px] text-slate-500">
                          {getBodyComponentText(t.components_json ?? [])}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="space-y-3">
                  <button
                    type="button"
                    onClick={() => {
                      setTplSelId(null);
                      setTplVars({});
                      setTplErr(null);
                    }}
                    className="text-[12px] text-[#3F8E91]"
                  >
                    ← Elegir otra
                  </button>
                  <p className="text-sm font-semibold text-slate-800">{tplSel.name}</p>
                  {tplSlots.map((s) => (
                    <label key={s} className="block">
                      <span className="mb-1 block text-[12px] font-medium text-slate-600">{s}</span>
                      <input
                        type="text"
                        value={tplVars[s] ?? ""}
                        onChange={(e) => setTplVars((prev) => ({ ...prev, [s]: e.target.value }))}
                        className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/40"
                        placeholder={`Valor para ${s}`}
                      />
                    </label>
                  ))}
                  <div className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2">
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-slate-400">
                      Vista previa
                    </span>
                    <p className="whitespace-pre-wrap break-words text-[13px] text-slate-700">{tplPreview}</p>
                  </div>
                  {tplErr ? <p className="text-[12px] text-red-600">{tplErr}</p> : null}
                  <button
                    type="button"
                    onClick={() => void sendTpl()}
                    disabled={tplSending}
                    className="w-full rounded-2xl bg-[#3F8E91] px-4 py-3 text-sm font-semibold text-white active:scale-95 disabled:bg-slate-200 disabled:text-slate-400"
                  >
                    {tplSending ? "Enviando…" : "Enviar plantilla"}
                  </button>
                </div>
              )}
              {tplErr && !tplSel ? <p className="mt-2 text-center text-[12px] text-red-600">{tplErr}</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
