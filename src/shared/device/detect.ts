/**
 * Detección de dispositivo — capa compartida server-side y client-side.
 *
 * Política del proyecto:
 *  - Tablets (iPad incluido) se consideran MOBILE.
 *  - Breakpoint client-side: < 1024px (Tailwind `lg`).
 *  - Server-side: regex sobre User-Agent. iPads modernos con iOS 13+ se reportan como
 *    Mac OS, así que cae en "desktop" por UA; el client-side los corrige en el primer
 *    paint (ver useDeviceType.ts).
 */

export type DeviceType = "mobile" | "desktop";

/** Ancho del viewport en píxeles a partir del cual consideramos desktop. */
export const DESKTOP_MIN_WIDTH_PX = 1024;

/** Nombre de la cookie donde persiste la decisión entre navegaciones. */
export const DEVICE_COOKIE_NAME = "neura-device";

/** Regex que matchea User-Agents claramente mobile (phones + Android tablets + iPad legacy). */
const MOBILE_UA_REGEX =
  /Mobi|Android|iPhone|iPod|BlackBerry|IEMobile|Opera Mini|webOS|Windows Phone|iPad/i;

/** Detecta si un User-Agent corresponde a un dispositivo mobile. iPads modernos
 *  (iOS 13+) NO matchean acá porque Apple los reporta como Mac — los detectamos
 *  client-side por ancho de viewport. */
export function isMobileUserAgent(ua: string | null | undefined): boolean {
  if (!ua) return false;
  return MOBILE_UA_REGEX.test(ua);
}

/** Resuelve el tipo de dispositivo desde cookie + UA. La cookie tiene prioridad
 *  si está presente (ya fue resuelta antes, posiblemente con ayuda del client). */
export function resolveDeviceType(opts: {
  cookieValue: string | null | undefined;
  userAgent: string | null | undefined;
}): DeviceType {
  if (opts.cookieValue === "mobile" || opts.cookieValue === "desktop") {
    return opts.cookieValue;
  }
  return isMobileUserAgent(opts.userAgent) ? "mobile" : "desktop";
}
