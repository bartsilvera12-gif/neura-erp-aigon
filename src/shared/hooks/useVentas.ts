"use client";

import useSWR from "swr";
import { getVentas } from "@/lib/ventas/storage";
import type { Venta } from "@/lib/ventas/types";

/** Hook compartido (desktop y mobile) para la lista completa de ventas del tenant.
 *  Wrapper SWR alrededor de getVentas() — cache compartido, dedupe 30s. */
export function useVentas() {
  const swr = useSWR<Venta[]>("ventas:lista", () => getVentas(), {
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
    keepPreviousData: true,
  });
  return {
    ventas: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}
