"use client";

import { AlertCircle, Check, CheckCheck, Clock } from "lucide-react";

/**
 * Palomitas estilo WhatsApp para mensajes salientes.
 *  - pending / null → reloj
 *  - sent          → un check gris
 *  - delivered     → doble check gris
 *  - read          → doble check azul
 *  - failed        → círculo de alerta rojo
 *
 * El estado lo escribe el webhook en `chat_messages.whatsapp_delivery_status`.
 * `tone` ajusta el contraste: "on-accent" para burbujas de color, "on-light" para fondo claro.
 */
export function DeliveryStatusIcon({
  status,
  tone = "on-accent",
}: {
  status: string | null | undefined;
  tone?: "on-accent" | "on-light";
}) {
  const s = (status ?? "").toLowerCase();
  const readColor = tone === "on-accent" ? "text-sky-300" : "text-sky-500";
  const failedColor = tone === "on-accent" ? "text-red-300" : "text-red-500";

  if (s === "read") {
    return <CheckCheck className={`h-3 w-3 ${readColor}`} aria-label="Leído" />;
  }
  if (s === "delivered") {
    return <CheckCheck className="h-3 w-3 opacity-90" aria-label="Entregado" />;
  }
  if (s === "sent") {
    return <Check className="h-3 w-3 opacity-90" aria-label="Enviado" />;
  }
  if (s === "failed") {
    return <AlertCircle className={`h-3 w-3 ${failedColor}`} aria-label="No entregado" />;
  }
  return <Clock className="h-3 w-3 opacity-70" aria-label="Pendiente" />;
}
