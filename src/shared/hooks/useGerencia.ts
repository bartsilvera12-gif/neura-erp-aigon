"use client";

import useSWR from "swr";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { ComercialReport } from "@/lib/gerencia/comercial-data";

/** Hook compartido para el reporte gerencial comercial del periodo (YYYY-MM). */
export function useGerenciaComercial(period?: string) {
  const p = period ?? currentPeriod();
  const swr = useSWR<ComercialReport>(
    `gerencia:comercial:${p}`,
    async () => {
      const res = await fetchWithSupabaseSession(`/api/gerencia/comercial?period=${p}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      return res.json();
    },
    { revalidateOnFocus: false, revalidateIfStale: false, dedupingInterval: 5 * 60_000, keepPreviousData: true }
  );
  return {
    report: swr.data,
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}

function currentPeriod(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
