"use client";

import useSWR from "swr";
import { getGastos, type Gasto } from "@/lib/gastos/actions";

/** Hook compartido para la lista de gastos. */
export function useGastos() {
  const swr = useSWR<Gasto[]>("gastos:lista", () => getGastos(), {
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
    keepPreviousData: true,
  });
  return {
    gastos: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}
