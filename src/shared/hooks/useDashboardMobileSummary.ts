"use client";

import useSWR from "swr";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export type DashboardMobileSummary = {
  ventasMes: number;
  porCobrar: number;
  facturasPendientes: number;
  clientesActivos: number;
  stockCritico: number;
  facturasRecientes: Array<{
    id: string;
    numero_factura: string;
    fecha: string;
    monto: number;
    estado: string;
    cliente_nombre: string | null;
  }>;
};

/**
 * Hook MOBILE-ONLY para el dashboard.
 *
 * Acepta `initialData` opcional (pre-fetched server-side por page.tsx) — cuando se
 * provee, SWR usa eso como fallback inmediato sin esperar al fetch del cliente.
 * Resultado: el usuario ve los KPIs en el primer paint, no skeletons.
 */
export function useDashboardMobileSummary(initialData?: DashboardMobileSummary) {
  const swr = useSWR<DashboardMobileSummary>(
    "dashboard:mobile-summary",
    async () => {
      const res = await fetchWithSupabaseSession("/api/dashboard/mobile-summary", { cache: "no-store" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const j = (await res.json()) as { success?: boolean; data?: DashboardMobileSummary; error?: string };
      if (!j.success || !j.data) throw new Error(j.error ?? "Respuesta inválida");
      return j.data;
    },
    {
      fallbackData: initialData,
      revalidateOnFocus: false,
      revalidateIfStale: false,
      dedupingInterval: 5 * 60_000,
      keepPreviousData: true,
    }
  );
  return {
    data: swr.data,
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}
