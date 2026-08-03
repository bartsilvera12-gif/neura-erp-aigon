"use client";

import useSWR from "swr";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { NotaCreditoGlobalListItemDTO } from "@/lib/nota-credito/types";

type ApiResp = { items?: NotaCreditoGlobalListItemDTO[] } | NotaCreditoGlobalListItemDTO[];

/** Hook compartido (desktop y mobile) para la lista de notas de crédito. */
export function useNotasCredito(opts?: { estado_erp?: string; estado_sifen?: string }) {
  const params = new URLSearchParams();
  if (opts?.estado_erp) params.set("estado_erp", opts.estado_erp);
  if (opts?.estado_sifen) params.set("estado_sifen", opts.estado_sifen);
  const qs = params.toString();
  const url = `/api/notas-credito${qs ? `?${qs}` : ""}`;

  const swr = useSWR<NotaCreditoGlobalListItemDTO[]>(`notas-credito:${qs}`, async () => {
    const res = await fetchWithSupabaseSession(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Error ${res.status}`);
    const j = (await res.json()) as ApiResp;
    if (Array.isArray(j)) return j;
    return j.items ?? [];
  }, {
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
    keepPreviousData: true,
  });

  return {
    notas: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}
