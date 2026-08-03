"use client";

import useSWR from "swr";
import { getProductos } from "@/lib/inventario/storage";
import type { Producto } from "@/lib/inventario/types";

/** Hook compartido para la lista de productos del inventario. */
export function useProductos() {
  const swr = useSWR<Producto[]>("inventario:productos", () => getProductos(), {
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
    keepPreviousData: true,
  });
  return {
    productos: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}
