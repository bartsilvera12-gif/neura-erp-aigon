"use client";

import useSWR from "swr";
import { getFacturas } from "@/lib/gestion-clientes/storage";
import type { Factura } from "@/lib/gestion-clientes/types";

/** Hook compartido para la lista de facturas. */
export function useFacturas(clienteId?: string) {
  const key = clienteId ? `facturas:cliente:${clienteId}` : "facturas:todas";
  const swr = useSWR<Factura[]>(key, () => getFacturas(clienteId), {
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
    keepPreviousData: true,
  });
  return {
    facturas: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}
