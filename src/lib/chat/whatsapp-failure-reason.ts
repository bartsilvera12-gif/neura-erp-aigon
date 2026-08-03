/**
 * Traduce un código/mensaje de error de WhatsApp (Meta/YCloud) a un motivo claro en español
 * para mostrarle al asesor cuando un mensaje NO se entrega. Client-safe (sin `server-only`),
 * se usa tanto en el inbox web como en el chat mobile del asesor.
 */
export type WhatsappFailureInfo = {
  errorCode?: string | number | null;
  errorMessage?: string | null;
};

/** Texto corto para el chip "No entregado". */
export function friendlyWhatsappFailureReason(info: WhatsappFailureInfo | null | undefined): string {
  const code = info?.errorCode != null ? String(info.errorCode).trim() : "";
  const rawMsg = (info?.errorMessage ?? "").toString().trim();
  switch (code) {
    case "131047": // Re-engagement: >24h desde el último mensaje del cliente
    case "470": // variante antigua de la ventana de sesión
      return "Pasaron más de 24 h desde el último mensaje del cliente. Para escribirle, el cliente debe responder primero (o escribile desde tu celular).";
    case "131053": // Media upload/format
      return "WhatsApp rechazó el formato del archivo (audio/media).";
    case "131026": // Undeliverable
      return "No se pudo entregar: el número no tiene WhatsApp o no puede recibir mensajes.";
    case "131049": // Healthy ecosystem pacing
      return "WhatsApp frenó este envío para cuidar la experiencia del usuario. Probá más tarde.";
    case "132000":
    case "132001":
    case "132005":
    case "132007":
      return "La plantilla usada no es válida o no está aprobada.";
    default:
      if (rawMsg) return rawMsg;
      return "WhatsApp no pudo entregar el mensaje.";
  }
}

/**
 * Extrae la info de fallo desde el raw_payload de un mensaje (YCloud primero, luego Meta).
 * Devuelve null si no hay datos de estado de fallo.
 */
export function extractWhatsappFailureInfo(
  rawPayload: Record<string, unknown> | null | undefined
): WhatsappFailureInfo | null {
  if (!rawPayload || typeof rawPayload !== "object") return null;

  const yc = rawPayload["neura_ycloud_status"];
  if (yc && typeof yc === "object" && !Array.isArray(yc)) {
    const o = yc as Record<string, unknown>;
    return {
      errorCode: (o.errorCode as string | number | null | undefined) ?? null,
      errorMessage: (o.errorMessage as string | null | undefined) ?? null,
    };
  }

  const meta = rawPayload["neura_meta_status"];
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const o = meta as Record<string, unknown>;
    const err = o.error;
    if (err && typeof err === "object" && !Array.isArray(err)) {
      const e = err as Record<string, unknown>;
      return {
        errorCode: (e.code as string | number | null | undefined) ?? null,
        errorMessage: (e.message as string | null | undefined) ?? (e.title as string | null | undefined) ?? null,
      };
    }
  }
  return null;
}
