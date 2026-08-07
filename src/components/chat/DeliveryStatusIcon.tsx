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

/**
 * Palomita en el mensaje ENTRANTE (burbuja del cliente): confirma que le mandamos el
 * acuse de lectura a WhatsApp, o sea que al cliente le quedó el doble check azul de su lado.
 *
 * `whatsapp_read_at` lo sella POST /api/chat/mark-read cuando Meta acepta el acuse. Si todavía
 * no salió, no dibujamos nada — mejor vacío que una palomita que miente.
 */
export function InboundReadIcon({ readAt }: { readAt: string | null | undefined }) {
  if (!readAt) return null;
  return (
    <span title="Le marcaste como leído" className="inline-flex">
      <CheckCheck className="h-3 w-3 text-sky-500" aria-label="Le marcaste como leído" />
    </span>
  );
}
