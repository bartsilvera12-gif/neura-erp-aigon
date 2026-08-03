"use client";

import useSWR from "swr";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export type CampaignRow = {
  id: string;
  name: string;
  channel_id: string;
  provider: string;
  template_name: string;
  template_language: string;
  status: string;
  total_count: number;
  sent_count: number;
  failed_count: number;
  replied_count: number;
  created_at: string;
};

/** Hook compartido para la lista de campañas. */
export function useCampanas() {
  const swr = useSWR<CampaignRow[]>(
    "campanas:lista",
    async () => {
      const res = await fetchWithSupabaseSession("/api/campanas", { cache: "no-store" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const j = (await res.json()) as { data?: CampaignRow[] } | CampaignRow[];
      if (Array.isArray(j)) return j;
      return j.data ?? [];
    },
    { revalidateOnFocus: false, dedupingInterval: 2 * 60_000, keepPreviousData: true }
  );
  return {
    campanas: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}
