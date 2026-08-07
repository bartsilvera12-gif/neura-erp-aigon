/**
 * Utilidades de grabación de notas de voz (browser / WebView de la APK).
 *
 * El backend transcodea a MP3 cualquier audio grabado (ver /api/chat/send-media), así que
 * acá NO importa que el contenedor sea uno que WhatsApp acepte — importa que ffmpeg lo lea
 * bien y que el WebView lo produzca de forma predecible.
 *
 * Por qué webm/opus primero y no mp4: el mp4 que produce MediaRecorder es fragmentado y
 * WhatsApp lo acepta por API pero después marca el mensaje como FALLIDO. Preferir mp4
 * (para ahorrarse el transcode) rompió las notas de voz en produccion; webm/opus es el
 * camino probado. El mp4 queda como fallback para WebViews que no sepan grabar webm.
 */

const RECORDING_MIME_CANDIDATES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/ogg;codecs=opus",
  "audio/mp4;codecs=mp4a.40.2",
  "audio/mp4",
  "audio/aac",
];

/** Primer mime soportado por el dispositivo, o "" para dejar que el MediaRecorder elija. */
export function pickRecordingMime(): string {
  if (typeof MediaRecorder === "undefined") return "";
  for (const m of RECORDING_MIME_CANDIDATES) {
    try {
      if (MediaRecorder.isTypeSupported(m)) return m;
    } catch {
      /* algunos WebViews tiran excepción con mimes que no conocen */
    }
  }
  return "";
}

export function extensionForMime(mime: string): string {
  const m = (mime || "").toLowerCase();
  if (m.includes("mp4") || m.includes("aac")) return "m4a";
  if (m.includes("ogg")) return "ogg";
  if (m.includes("mpeg")) return "mp3";
  return "webm";
}

/** Mensaje accionable según por qué falló getUserMedia dentro de la APK. */
export function micErrorMessage(e: unknown): string {
  const name = e instanceof DOMException ? e.name : e instanceof Error ? e.name : "";
  if (name === "NotAllowedError" || name === "SecurityError") {
    return "Permiso de micrófono denegado. Andá a Ajustes → Apps → Aigon ERP → Permisos → Micrófono y activalo.";
  }
  if (name === "NotFoundError" || name === "DevicesNotFoundError") {
    return "No se encontró micrófono en el dispositivo.";
  }
  if (name === "NotReadableError" || name === "TrackStartError") {
    return "El micrófono está ocupado por otra app. Cerrala y probá de nuevo.";
  }
  const msg = e instanceof Error && e.message ? e.message : "";
  return msg ? `No se pudo acceder al micrófono: ${msg}` : "No se pudo acceder al micrófono.";
}

/** true si el entorno puede grabar (mediaDevices + MediaRecorder disponibles). */
export function canRecordAudio(): boolean {
  return (
    typeof navigator !== "undefined" &&
    !!navigator.mediaDevices?.getUserMedia &&
    typeof MediaRecorder !== "undefined"
  );
}
