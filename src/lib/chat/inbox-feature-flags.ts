/**
 * Feature flags para la mejora de arquitectura de Conversaciones (Inbox).
 *
 * TODOS los flags están apagados por defecto. El comportamiento productivo
 * actual (polling cada ~2.8s + Realtime mejor esfuerzo + queries por hilo)
 * no cambia salvo que se encienda explícitamente vía env.
 *
 * Esta fase es solo observabilidad + gatekeeping. Ningún call site usa los
 * flags todavía para alterar lógica; los flags están listos para fases
 * posteriores (realtime primary, query unificada, reconcile poll diferido).
 *
 * Nombres de ENV:
 *   Client side (Next.js):
 *     NEXT_PUBLIC_INBOX_REALTIME_PRIMARY        (default: false)
 *     NEXT_PUBLIC_CHAT_INBOX_UNIFIED_QUERY      (default: false)
 *     NEXT_PUBLIC_CHAT_INBOX_OBSERVABILITY      (default: false)
 *     NEXT_PUBLIC_INBOX_RECONCILE_INTERVAL_MS   (default: 30000, sin uso aún)
 *   Server side (Node/runtime Vercel):
 *     INBOX_REALTIME_PRIMARY
 *     CHAT_INBOX_UNIFIED_QUERY
 *     CHAT_INBOX_OBSERVABILITY
 *     INBOX_RECONCILE_INTERVAL_MS
 *
 * La lectura es defensiva: en SSR/server reads desde process.env solo si está
 * definido; en cliente reads NEXT_PUBLIC_*. Ambos toleran undefined.
 */

const DEFAULT_RECONCILE_INTERVAL_MS = 30_000;
const MIN_RECONCILE_INTERVAL_MS = 5_000;
const MAX_RECONCILE_INTERVAL_MS = 300_000;

function readEnvFlag(serverKey: string, clientKey: string): boolean {
  const server = typeof process !== "undefined" ? process.env?.[serverKey] : undefined;
  const client = typeof process !== "undefined" ? process.env?.[clientKey] : undefined;
  const raw = (server ?? client ?? "").trim().toLowerCase();
  if (!raw) return false;
  return raw === "true" || raw === "1" || raw === "yes" || raw === "on";
}

function readEnvInt(serverKey: string, clientKey: string, fallback: number, min: number, max: number): number {
  const server = typeof process !== "undefined" ? process.env?.[serverKey] : undefined;
  const client = typeof process !== "undefined" ? process.env?.[clientKey] : undefined;
  const raw = (server ?? client ?? "").trim();
  if (!raw) return fallback;
  const n = Number.parseInt(raw, 10);
  if (Number.isNaN(n)) return fallback;
  if (n < min) return min;
  if (n > max) return max;
  return n;
}

export function isInboxRealtimePrimary(): boolean {
  return readEnvFlag("INBOX_REALTIME_PRIMARY", "NEXT_PUBLIC_INBOX_REALTIME_PRIMARY");
}

export function isChatInboxUnifiedQuery(): boolean {
  return readEnvFlag("CHAT_INBOX_UNIFIED_QUERY", "NEXT_PUBLIC_CHAT_INBOX_UNIFIED_QUERY");
}

export function isChatInboxObservabilityEnabled(): boolean {
  return readEnvFlag("CHAT_INBOX_OBSERVABILITY", "NEXT_PUBLIC_CHAT_INBOX_OBSERVABILITY");
}

export function getInboxReconcileIntervalMs(): number {
  return readEnvInt(
    "INBOX_RECONCILE_INTERVAL_MS",
    "NEXT_PUBLIC_INBOX_RECONCILE_INTERVAL_MS",
    DEFAULT_RECONCILE_INTERVAL_MS,
    MIN_RECONCILE_INTERVAL_MS,
    MAX_RECONCILE_INTERVAL_MS,
  );
}

/** Snapshot de los flags actuales — útil para log al boot del cliente. */
export function getInboxFlagsSnapshot(): {
  realtime_primary: boolean;
  unified_query: boolean;
  observability: boolean;
  reconcile_interval_ms: number;
} {
  return {
    realtime_primary: isInboxRealtimePrimary(),
    unified_query: isChatInboxUnifiedQuery(),
    observability: isChatInboxObservabilityEnabled(),
    reconcile_interval_ms: getInboxReconcileIntervalMs(),
  };
}
