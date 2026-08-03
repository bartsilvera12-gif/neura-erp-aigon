"use client";

import useSWR from "swr";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { AgendaCitaEnriquecida } from "@/lib/agenda/types";

/** Hook compartido para listar citas en un rango. */
export function useAgenda(opts: {
  desde: string; // ISO
  hasta: string; // ISO
  estado?: string;
  responsableId?: string;
  q?: string;
}) {
  const params = new URLSearchParams();
  params.set("desde", opts.desde);
  params.set("hasta", opts.hasta);
  if (opts.estado) params.set("estado", opts.estado);
  if (opts.responsableId) params.set("responsable_id", opts.responsableId);
  if (opts.q?.trim()) params.set("q", opts.q.trim());
  const qs = params.toString();
  const swr = useSWR<AgendaCitaEnriquecida[]>(
    `agenda:${qs}`,
    async () => {
      const res = await fetchWithSupabaseSession(`/api/agenda?${qs}`);
      const j = await res.json();
      if (!res.ok || !j?.success) throw new Error(j?.error ?? `Error ${res.status}`);
      return j.data as AgendaCitaEnriquecida[];
    },
    { revalidateOnFocus: false, dedupingInterval: 2 * 60_000, keepPreviousData: true }
  );
  return {
    citas: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}
