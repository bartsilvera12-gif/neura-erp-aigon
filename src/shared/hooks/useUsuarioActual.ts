"use client";

import useSWR from "swr";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export type UsuarioActual = {
  nombre: string | null;
  rol: string | null;
  email: string | null;
};

/** Hook compartido que devuelve el usuario logueado actual (nombre, rol, email).
 *  Se usa en el header desktop (Sidebar/Header.tsx) y mobile (MobileHeader, dashboards).
 *  El cache se comparte para que no se haga más de una request por sesión. */
export function useUsuarioActual() {
  const swr = useSWR<UsuarioActual | null>(
    "usuarios:me",
    async () => {
      const res = await fetchWithSupabaseSession("/api/usuarios/me", { cache: "no-store" });
      if (!res.ok) return null;
      const j = (await res.json()) as { usuario?: UsuarioActual };
      return j.usuario ?? null;
    },
    { revalidateOnFocus: false, dedupingInterval: 60_000 }
  );
  return { usuario: swr.data ?? null, isLoading: swr.isLoading };
}
