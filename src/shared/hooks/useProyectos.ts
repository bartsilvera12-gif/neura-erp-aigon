"use client";

import useSWR from "swr";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

export type EstadoProyecto = {
  id: string;
  nombre: string;
  codigo: string;
  color: string;
  sort_order: number;
  cuenta_sla?: boolean;
  sla_horas_objetivo?: number | null;
  es_estado_final?: boolean;
};

export type ProyectoCard = Record<string, unknown> & {
  id: string;
  titulo: string;
  prioridad: string;
  estado_id: string;
  last_activity_at?: string;
  fecha_ingreso?: string;
  fecha_prometida?: string | null;
  bloqueado?: boolean;
  archivado?: boolean;
  proyecto_tipo?: { nombre?: string; codigo?: string } | null;
  proyecto_estado?: {
    nombre?: string;
    codigo?: string;
    color?: string;
  } | null;
  cliente?: { empresa?: string | null; nombre_contacto?: string | null } | null;
  responsable_comercial?: { nombre?: string | null } | null;
  responsable_tecnico?: { nombre?: string | null } | null;
};

/** Hook compartido para la lista de proyectos (sin archivados por defecto). */
export function useProyectos(opts?: { archivado?: boolean }) {
  const params = new URLSearchParams();
  if (opts?.archivado === true) params.set("archivado", "1");
  const qs = params.toString();
  const swr = useSWR<ProyectoCard[]>(
    `proyectos:lista:${qs}`,
    async () => {
      const res = await fetchWithSupabaseSession(`/api/proyectos${qs ? `?${qs}` : ""}`, {
        cache: "no-store",
      });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const j = (await res.json()) as { success?: boolean; data?: ProyectoCard[] };
      return j.data ?? [];
    },
    { revalidateOnFocus: false, dedupingInterval: 2 * 60_000, keepPreviousData: true }
  );
  return {
    proyectos: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
    mutate: swr.mutate,
  };
}

/** Hook compartido para los estados (columnas del kanban). */
export function useEstadosProyecto() {
  const swr = useSWR<EstadoProyecto[]>(
    "proyectos:estados",
    async () => {
      const res = await fetchWithSupabaseSession("/api/proyectos/estados", { cache: "no-store" });
      if (!res.ok) throw new Error(`Error ${res.status}`);
      const j = (await res.json()) as { success?: boolean; data?: EstadoProyecto[] };
      return (j.data ?? []).slice().sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
    },
    { revalidateOnFocus: false, dedupingInterval: 5 * 60_000, keepPreviousData: true }
  );
  return {
    estados: swr.data ?? [],
    isLoading: swr.isLoading,
    error: swr.error as Error | undefined,
  };
}
