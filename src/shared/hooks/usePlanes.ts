"use client";

import useSWR from "swr";
import { getPlanes } from "@/lib/planes/storage";
import type { Plan } from "@/lib/planes/types";

/** Hook compartido para la lista de planes. */
export function usePlanes() {
  const swr = useSWR<Plan[]>("planes:lista", () => getPlanes(), {
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
    keepPreviousData: true,
  });
  return {
    planes: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}
