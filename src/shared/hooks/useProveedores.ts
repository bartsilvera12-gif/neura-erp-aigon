"use client";

import useSWR from "swr";
import { getProveedores } from "@/lib/proveedores/storage";
import type { Proveedor } from "@/lib/proveedores/types";

/** Hook compartido para la lista de proveedores. */
export function useProveedores() {
  const swr = useSWR<Proveedor[]>("proveedores:lista", () => getProveedores(), {
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
    keepPreviousData: true,
  });
  return {
    proveedores: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}
