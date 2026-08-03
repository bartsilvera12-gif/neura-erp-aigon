"use client";

import useSWR from "swr";
import { getProspectos } from "@/lib/crm/storage";
import { getEtapas, type EtapaCrm } from "@/lib/crm/etapas";
import type { Prospecto } from "@/lib/crm/types";

/** Hook compartido para la lista de prospectos del CRM. */
export function useProspectos() {
  const swr = useSWR<Prospecto[]>("crm:prospectos", () => getProspectos(), {
    revalidateOnFocus: true,
    dedupingInterval: 30_000,
    keepPreviousData: true,
  });
  return {
    prospectos: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}

/** Hook compartido para las etapas activas del CRM. */
export function useEtapasCrm() {
  const swr = useSWR<EtapaCrm[]>("crm:etapas", () => getEtapas(), {
    revalidateOnFocus: false,
    dedupingInterval: 5 * 60_000,
    keepPreviousData: true,
  });
  return {
    etapas: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
  };
}
