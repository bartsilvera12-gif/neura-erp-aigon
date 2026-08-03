"use client";

import useSWR from "swr";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export type MobileChatConversation = {
  id: string;
  status: string;
  last_message_at: string | null;
  last_message_preview: string | null;
  unread_count: number;
  contact_nombre: string | null;
  contact_telefono: string | null;
  channel_name: string | null;
  channel_provider: string | null;
};

export type MobileChatMessage = {
  id: string;
  from_me: boolean;
  message_type: string;
  content: string | null;
  raw_payload: unknown;
  created_at: string;
};

/** Inbox mobile: hasta 50 conversaciones abiertas/pendientes. */
export function useMobileInbox(opts?: { onlyOpen?: boolean }) {
  const onlyOpen = opts?.onlyOpen !== false;
  const swr = useSWR<{ conversations: MobileChatConversation[] }>(
    `chat:mobile-inbox:${onlyOpen ? "1" : "0"}`,
    async () => {
      const res = await fetchWithSupabaseSession(
        `/api/chat/mobile-inbox?only_open=${onlyOpen ? "1" : "0"}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const j = (await res.json()) as {
        success?: boolean;
        data?: { conversations: MobileChatConversation[] };
        error?: string;
      };
      if (!j.success || !j.data) throw new Error(j.error ?? "Respuesta inválida");
      return j.data;
    },
    {
      // Para chat: revalidar al focus tiene sentido (usuario vuelve y quiere ver lo último).
      revalidateOnFocus: true,
      dedupingInterval: 15_000,
      refreshInterval: 30_000,
      keepPreviousData: true,
    }
  );
  return {
    conversations: swr.data?.conversations ?? [],
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}

/** Mensajes de una conversación. Usa el endpoint /api/chat/messages existente. */
export function useMobileMessages(conversationId: string | null) {
  const swr = useSWR<MobileChatMessage[]>(
    conversationId ? `chat:messages:${conversationId}` : null,
    async () => {
      const res = await fetchWithSupabaseSession(
        `/api/chat/messages?conversation_id=${encodeURIComponent(conversationId!)}`,
        { cache: "no-store" }
      );
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const j = (await res.json()) as {
        success?: boolean;
        data?: MobileChatMessage[];
        error?: string;
      };
      if (!j.success) throw new Error(j.error ?? "Respuesta inválida");
      return j.data ?? [];
    },
    {
      revalidateOnFocus: true,
      dedupingInterval: 5_000,
      refreshInterval: 10_000,
      keepPreviousData: true,
    }
  );
  return {
    messages: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}

/** Envía un mensaje de texto a una conversación usando /api/chat/send. */
export async function sendMobileMessage(opts: {
  conversationId: string;
  text: string;
}): Promise<{ ok: boolean; error?: string }> {
  try {
    const res = await fetchWithSupabaseSession("/api/chat/send", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_id: opts.conversationId,
        message_type: "text",
        text: opts.text,
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, error: text || `Error ${res.status}` };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Error de red" };
  }
}
