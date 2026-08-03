"use client";

import useSWR from "swr";
import { getCompras } from "@/lib/compras/storage";
import type { Compra } from "@/lib/compras/types";

/** Hook compartido para la lista de compras. */
export function useCompras() {
  const swr = useSWR<Compra[]>("compras:lista", () => getCompras(), {
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
    keepPreviousData: true,
  });
  return {
    compras: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}
