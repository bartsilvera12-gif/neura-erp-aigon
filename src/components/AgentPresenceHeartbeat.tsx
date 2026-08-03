"use client";

import { useEffect, useState } from "react";
import { INBOX_HEARTBEAT_INTERVAL_MS } from "@/lib/chat/agent-presence";
import {
  getMyAgentOperationalPresence,
  touchChatAgentInboxHeartbeat,
} from "@/lib/chat/chat-ops-actions";

/**
 * Heartbeat de presencia GLOBAL del agente omnicanal.
 *
 * Se monta en el AppShell autenticado → corre en CUALQUIER pantalla del ERP
 * (Agenda, Comisiones, Clientes, etc.), no solo en Conversaciones. Así un asesor
 * con el ERP abierto cuenta como "En línea" aunque no esté mirando el inbox.
 *
 * Reglas:
 *  - Solo pinguea si el usuario es agente en cola (`in_queues`). Para el resto es
 *    no-op: tras un único chequeo inicial no hace nada (no activa a no-agentes).
 *  - Actualiza `chat_agents.last_heartbeat_at` cada ~30s mientras la pestaña esté visible.
 *  - Al cerrar/ocultar la pestaña deja de pinguear → el heartbeat caduca (ventana de 60s)
 *    → el agente pasa a offline. Cubre navegador cerrado / sesión perdida / inactividad.
 *
 * Separación de conceptos: "En línea" = heartbeat global reciente (lo gobierna este
 * componente). "Sesión en inbox" = estar en Conversaciones (lo sigue el propio inbox).
 *
 * NO toca el reparto (`cc_assign_conversation`), el contador diario, el cron SLA, FCM
 * ni Telegram. La elegibilidad de asignación (ready/receives_new_chats/is_active) la
 * sigue evaluando la RPC; este heartbeat solo aporta la dimensión de presencia.
 */
export default function AgentPresenceHeartbeat() {
  const [isAgent, setIsAgent] = useState(false);

  // ¿El usuario actual es agente en cola? Se resuelve una sola vez (el AppShell
  // persiste entre navegaciones, así que no se reconsulta en cada pantalla).
  useEffect(() => {
    let cancelled = false;
    getMyAgentOperationalPresence()
      .then((p) => {
        if (!cancelled && p.in_queues) setIsAgent(true);
      })
      .catch(() => {
        /* silencioso: si el chequeo falla, no se pinguea; nunca bloquea el ERP */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Heartbeat periódico mientras sea agente y la pestaña esté visible.
  useEffect(() => {
    if (!isAgent) return;
    const ping = () => {
      if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
      void touchChatAgentInboxHeartbeat();
    };
    ping(); // primer ping inmediato al activarse
    const id = window.setInterval(ping, INBOX_HEARTBEAT_INTERVAL_MS);
    const onVisible = () => ping();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [isAgent]);

  return null;
}
