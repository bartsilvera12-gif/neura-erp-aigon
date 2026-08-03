/**
 * Observabilidad de Conversaciones (Inbox).
 *
 * Counters por minuto + logs estructurados detrás del feature flag
 * `CHAT_INBOX_OBSERVABILITY`. Con el flag apagado (default), todas las
 * funciones son no-op — cero overhead, cero logs, comportamiento idéntico
 * al actual. Diseñado para activarse temporalmente en producción para medir
 * carga de polling/realtime antes de cambiar arquitectura.
 *
 * IMPORTANTE — qué NO loguear:
 *   - tokens de attribution_token / ref=…
 *   - contenido completo de mensajes (solo lengths o conteos)
 *   - phone_number completo (solo últimos 4 dígitos o longitud)
 *   - claves Supabase / Meta access tokens
 *
 * Los IDs UUID son aceptables (no son secretos) pero recortados a 8 chars
 * para mantener líneas de log legibles.
 */

import { isChatInboxObservabilityEnabled } from "@/lib/chat/inbox-feature-flags";

const LOG = "[inbox-observability]" as const;

type CounterKey =
  | "polling_list"
  | "polling_thread"
  | "realtime_event_conv"
  | "realtime_event_msg_list"
  | "realtime_event_msg_thread";

type CounterState = { count: number; windowStartMs: number };

const WINDOW_MS = 60_000;

const counters = new Map<CounterKey, CounterState>();

function shortId(id: string | null | undefined): string | null {
  if (!id || typeof id !== "string") return null;
  const t = id.trim();
  if (!t) return null;
  return t.length <= 8 ? t : t.slice(0, 8);
}

function flushAndIncrement(key: CounterKey, now: number): { rolled: boolean; previous: number } {
  const prev = counters.get(key);
  if (!prev) {
    counters.set(key, { count: 1, windowStartMs: now });
    return { rolled: false, previous: 0 };
  }
  if (now - prev.windowStartMs >= WINDOW_MS) {
    const previous = prev.count;
    counters.set(key, { count: 1, windowStartMs: now });
    return { rolled: true, previous };
  }
  prev.count += 1;
  return { rolled: false, previous: prev.count - 1 };
}

/**
 * Cuenta un tick de polling/realtime. Cada 60s emite el total de la ventana
 * cerrada (no por cada llamada — evita ruido). No-op si el flag está apagado.
 */
function tickCounter(key: CounterKey, extra?: Record<string, unknown>): void {
  if (!isChatInboxObservabilityEnabled()) return;
  const now = Date.now();
  const { rolled, previous } = flushAndIncrement(key, now);
  if (rolled) {
    console.info(LOG, "counter_window_closed", {
      key,
      previous_window_count: previous,
      window_ms: WINDOW_MS,
      ...extra,
    });
  }
}

export function trackInboxPollingList(extra?: Record<string, unknown>): void {
  tickCounter("polling_list", extra);
}

export function trackInboxPollingThread(extra?: Record<string, unknown>): void {
  tickCounter("polling_thread", extra);
}

export function trackInboxRealtimeEvent(
  kind: "conversation" | "message_list" | "message_thread",
  extra?: Record<string, unknown>,
): void {
  const key: CounterKey =
    kind === "conversation"
      ? "realtime_event_conv"
      : kind === "message_list"
        ? "realtime_event_msg_list"
        : "realtime_event_msg_thread";
  tickCounter(key, extra);
}

/**
 * Log estructurado del estado de un canal Supabase Realtime al subscribirse.
 * Se llama desde el callback de `.subscribe(status, err)`. No emite el JWT,
 * keys, ni payload — solo el status string, schema, tabla, channel name.
 */
export function logRealtimeChannelState(input: {
  channel_name: string;
  schema: string;
  table: string;
  status: string;
  error_message?: string | null;
}): void {
  if (!isChatInboxObservabilityEnabled()) return;
  console.info(LOG, "realtime_channel_state", {
    channel_name: input.channel_name,
    schema: input.schema,
    table: input.table,
    status: input.status,
    error_message: input.error_message ?? null,
  });
}

/**
 * Wrapper genérico para medir duración de una función async sin alterar su
 * resultado. Si el flag está apagado, se ejecuta sin medir.
 */
export async function withInboxLatencyMeasure<T>(
  label: string,
  fn: () => Promise<T>,
  context?: Record<string, unknown>,
): Promise<T> {
  if (!isChatInboxObservabilityEnabled()) {
    return fn();
  }
  const startedAt = Date.now();
  try {
    const result = await fn();
    const elapsedMs = Date.now() - startedAt;
    console.info(LOG, "latency_measure", {
      label,
      ok: true,
      elapsed_ms: elapsedMs,
      ...context,
    });
    return result;
  } catch (e) {
    const elapsedMs = Date.now() - startedAt;
    console.warn(LOG, "latency_measure", {
      label,
      ok: false,
      elapsed_ms: elapsedMs,
      error: e instanceof Error ? e.message : String(e),
      ...context,
    });
    throw e;
  }
}

/** Log de boot — emite snapshot de flags una vez al cargar la UI. */
export function logInboxFlagsBoot(snapshot: Record<string, unknown>): void {
  if (!isChatInboxObservabilityEnabled()) return;
  console.info(LOG, "flags_boot", snapshot);
}

/** Helper exportado por si algún caller quiere un id corto coherente. */
export { shortId as shortIdForLog };
