"use client";

import useSWR from "swr";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export type UsuarioRow = {
  id: string;
  nombre: string | null;
  email: string;
  telefono: string | null;
  rol: string | null;
  estado: string | null;
  created_at: string;
};

/** Hook compartido para la lista de usuarios de la empresa actual. */
export function useUsuarios() {
  const swr = useSWR<UsuarioRow[]>(
    "usuarios:empresa",
    async () => {
      const res = await fetchWithSupabaseSession("/api/empresas/usuarios", { cache: "no-store" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const j = (await res.json()) as { data?: UsuarioRow[] } | UsuarioRow[];
      if (Array.isArray(j)) return j;
      return j.data ?? [];
    },
    { revalidateOnFocus: false, dedupingInterval: 2 * 60_000, keepPreviousData: true }
  );
  return {
    usuarios: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}
