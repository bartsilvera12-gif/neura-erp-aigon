"use client";

import useSWR from "swr";
import { getSorteos } from "@/lib/sorteos/actions";
import type { Sorteo } from "@/lib/sorteos/types";

/** Hook compartido para la lista de sorteos. */
export function useSorteos() {
  const swr = useSWR<Sorteo[]>("sorteos:lista", () => getSorteos(), {
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
    keepPreviousData: true,
  });
  return {
    sorteos: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}
