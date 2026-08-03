"use client";

import useSWR from "swr";
import { getDashboardData, type DashboardData } from "@/lib/dashboard/data";

/**
 * Hook compartido (desktop y mobile) para los datos del dashboard.
 * Envuelve `getDashboardData()` (que ya hace todo el fetching contra
 * /api/dashboard/tenant-tables) con SWR para tener:
 *   - cache compartido entre componentes que lo monten en paralelo
 *   - revalidación automática al volver el foco
 *   - dedupe de requests concurrentes
 *
 * El refresh se dispara cada vez que el usuario vuelve a la pestaña/app
 * (revalidateOnFocus) y dedupea agresivamente: una misma sesión de uso no va
 * a pegarle al endpoint más de una vez por 30s.
 */
export function useDashboardData() {
  // Endpoint pesado (tenant-tables): cacheamos 5min y NO revalidamos al focus.
  // El usuario puede tirar de pull-to-refresh manualmente si quisiera (TODO).
  const swr = useSWR<DashboardData>("dashboard:data", () => getDashboardData(), {
    revalidateOnFocus: false,
    revalidateIfStale: false,
    dedupingInterval: 5 * 60_000,
    keepPreviousData: true,
  });

  return {
    data: swr.data,
    error: swr.error as Error | undefined,
    isLoading: swr.isLoading,
    isValidating: swr.isValidating,
    mutate: swr.mutate,
  };
}
