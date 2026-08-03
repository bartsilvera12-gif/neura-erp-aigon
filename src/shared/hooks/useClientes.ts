"use client";

import useSWR from "swr";
import { getClientes } from "@/lib/clientes/storage";
import type { Cliente } from "@/lib/clientes/types";

/** Hook compartido (desktop y mobile) para la lista de clientes del tenant.
 *  Wrapper SWR alrededor de getClientes(). */
export function useClientes(opts?: { incluirEliminados?: boolean; incluirPlanActivo?: boolean }) {
  const key = `clientes:lista:${opts?.incluirEliminados ? "1" : "0"}:${opts?.incluirPlanActivo ? "1" : "0"}`;
  const swr = useSWR<Cliente[]>(key, () => getClientes(opts), {
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
    keepPreviousData: true,
  });
  return {
    clientes: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}
