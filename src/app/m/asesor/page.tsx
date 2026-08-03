"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import CapacitorPushRegister from "@/components/CapacitorPushRegister";
import { attachmentCaptionForDisplay } from "@/lib/chat/message-erp-display";

type Conv = {
  id: string;
  status: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  contact_nombre: string | null;
  contact_telefono: string | null;
  window_open: boolean | null;
};

function shortTime(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "ahora";
  if (min < 60) return `${min}m`;
  const h = Math.floor(min / 60);
  if (h < 24) return `${h}h`;
  return d.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit" });
}

export default function MAsesorInboxPage() {
  const [convs, setConvs] = useState<Conv[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [isAgent, setIsAgent] = useState(true);
  const [q, setQ] = useState("");

  const filtered = (() => {
    const term = q.trim().toLowerCase();
    if (!term) return convs;
    const digits = term.replace(/\D/g, "");
    return convs.filter((c) => {
      const nombre = (c.contact_nombre ?? "").toLowerCase();
      const tel = (c.contact_telefono ?? "").toLowerCase();
      const telDigits = tel.replace(/\D/g, "");
      return (
        nombre.includes(term) ||
        tel.includes(term) ||
        (digits.length >= 3 && telDigits.includes(digits))
      );
    });
  })();

  const load = useCallback(async (silent?: boolean) => {
    if (!silent) setLoading(true);
    try {
      const res = await fetchWithSupabaseSession("/api/mobile/asesor/conversations", { cache: "no-store" });
      const data = await res.json();
      if (!res.ok || !data?.ok) throw new Error(data?.error || "No se pudo cargar");
      setConvs((data.conversations ?? []) as Conv[]);
      setIsAgent(data.is_agent !== false);
      setErr(null);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      if (!silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
    const id = window.setInterval(() => void load(true), 20000);
    const onVis = () => {
      if (document.visibilityState === "visible") void load(true);
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  return (
    <div className="min-h-svh bg-slate-50 flex flex-col">
      {/* Registro de push FCM: solo actúa dentro de la APK (Capacitor nativo); no-op en web. */}
      <CapacitorPushRegister />
      <header className="sticky top-0 z-10 bg-[#3F8E91] text-white px-4 py-3 shadow-sm">
        <h1 className="text-base font-semibold">Mis conversaciones</h1>
        <p className="text-[11px] text-white/80">Contact Center · Neura</p>
        <input
          type="search"
          inputMode="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar por nombre o número…"
          className="mt-2 w-full rounded-xl border border-white/20 bg-white/95 px-3 py-2 text-[13px] text-slate-800 placeholder:text-slate-400 outline-none focus:ring-2 focus:ring-white/40"
          aria-label="Buscar conversación"
        />
      </header>

      <main className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-6 text-center text-slate-400 text-sm animate-pulse">Cargando…</div>
        ) : err ? (
          <div className="p-4 m-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
            {err}
            <button onClick={() => void load()} className="ml-2 underline">
              Reintentar
            </button>
          </div>
        ) : !isAgent ? (
          <div className="p-6 text-center text-slate-500 text-sm">
            Tu usuario no está configurado como asesor de chat.
          </div>
        ) : convs.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">No tenés conversaciones asignadas.</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-sm">Sin resultados para “{q.trim()}”.</div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {filtered.map((c) => {
              const title = c.contact_nombre || c.contact_telefono || "Contacto";
              return (
                <li key={c.id}>
                  <Link
                    href={`/m/asesor/chat/${c.id}`}
                    className="flex items-center gap-3 px-4 py-3 active:bg-slate-100"
                  >
                    <div className="h-10 w-10 shrink-0 rounded-full bg-[#4FAEB2]/15 text-[#3F8E91] grid place-items-center font-semibold">
                      {title.slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate font-medium text-slate-800 text-sm">{title}</span>
                        <span className="shrink-0 text-[11px] text-slate-400">{shortTime(c.last_message_at)}</span>
                      </div>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px] text-slate-500">
                          {attachmentCaptionForDisplay(c.last_message_preview) || "—"}
                        </span>
                        {c.unread_count > 0 ? (
                          <span className="shrink-0 min-w-[18px] h-[18px] px-1 rounded-full bg-[#4FAEB2] text-white text-[10px] font-bold grid place-items-center">
                            {c.unread_count}
                          </span>
                        ) : null}
                      </div>
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </main>
    </div>
  );
}
