"use client";

import { SWRConfig } from "swr";
import { useEffect, useRef } from "react";

/**
 * Provider de SWR con cache persistido en localStorage.
 *
 * Beneficio: la SEGUNDA visita a cualquier pantalla mobile (y desktop, en hooks
 * compartidos) muestra los datos de la sesión anterior INSTANTÁNEAMENTE. SWR
 * revalida en background — el usuario ve datos al primer paint, no skeletons.
 *
 * Mecánica:
 *  - Al montar, hidratamos el Map de SWR desde localStorage.
 *  - Antes del unmount (o cada cambio), serializamos el Map de vuelta.
 *  - Solo cacheamos data + timestamp por key. Sin metadata interna ni errores.
 *  - Limpiamos entradas más viejas que 24h para no acumular basura.
 */

const STORAGE_KEY = "neura-swr-cache-v1";
const MAX_AGE_MS = 24 * 60 * 60 * 1000; // 24h

type PersistedEntry = { data: unknown; ts: number };
type PersistedMap = Record<string, PersistedEntry>;

function hydrate(): Map<string, { data: unknown }> {
  const map = new Map<string, { data: unknown }>();
  if (typeof window === "undefined") return map;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return map;
    const parsed = JSON.parse(raw) as PersistedMap;
    const now = Date.now();
    for (const [k, entry] of Object.entries(parsed)) {
      if (!entry || typeof entry !== "object") continue;
      if (now - (entry.ts ?? 0) > MAX_AGE_MS) continue;
      map.set(k, { data: entry.data });
    }
  } catch {
    /* corrupto: empezamos vacío */
  }
  return map;
}

function persist(map: Map<string, unknown>) {
  if (typeof window === "undefined") return;
  try {
    const obj: PersistedMap = {};
    const ts = Date.now();
    for (const [k, v] of map.entries()) {
      const entry = v as { data?: unknown } | undefined;
      // SWR guarda objetos { data, error, isValidating, ... } internamente.
      // Solo persistimos `data` resuelto (no errores ni estados intermedios).
      if (!entry || typeof entry !== "object") continue;
      if (!("data" in entry) || entry.data === undefined) continue;
      // Saltamos keys con tipo no serializable (Date, Map, etc.).
      try {
        // Probar serialización antes de guardar.
        JSON.stringify(entry.data);
        obj[k] = { data: entry.data, ts };
      } catch {
        /* no serializable, skip */
      }
    }
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
  } catch {
    /* quota / private mode: silenciar */
  }
}

export default function SWRPersistedProvider({ children }: { children: React.ReactNode }) {
  // Map estable entre renders.
  const cacheRef = useRef<Map<string, unknown> | null>(null);
  if (cacheRef.current === null) {
    cacheRef.current = hydrate() as Map<string, unknown>;
  }
  const cache = cacheRef.current;

  // Persistir periódicamente y al cambio de visibilidad.
  useEffect(() => {
    const save = () => persist(cache);

    // Debounce: 1.5s de inactividad sin updates → persistimos.
    const interval = window.setInterval(save, 30_000);
    window.addEventListener("beforeunload", save);
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "hidden") save();
    });

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("beforeunload", save);
    };
  }, [cache]);

  return (
    <SWRConfig
      value={{
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        provider: () => cache as unknown as Map<string, any>,
        // Defaults globales más conservadores que SWR (que revalida agresivamente).
        revalidateOnFocus: false,
        revalidateIfStale: true,
        keepPreviousData: true,
        dedupingInterval: 60_000,
      }}
    >
      {children}
    </SWRConfig>
  );
}
