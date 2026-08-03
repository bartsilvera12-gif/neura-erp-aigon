/**
 * Helpers para formato de teléfono Paraguay.
 * Soporta dos formatos:
 *   - Local: 0981100453 (10 dígitos, empieza con 09) → "0981 100 453"
 *   - Internacional: 595981100453 (12 dígitos, empieza con 595) → "+595 981 100 453"
 * Valor guardado: sólo dígitos, sin espacios ni símbolos.
 */

/** Extrae sólo dígitos. No aplica recorte: preserva el número completo. */
function extractDigits(value: string): string {
  return value.replace(/\D/g, "");
}

/**
 * Formatea el número para mostrar en pantalla.
 * Ejemplos:
 *   "0981100453"     → "0981 100 453"
 *   "595981100453"   → "+595 981 100 453"
 *   "+595 981-1004"  → "+595 981 100 4"     (incompleto, agrupa lo que hay)
 */
export function formatTelefonoDisplay(value: string): string {
  const d = extractDigits(value);
  if (d.length === 0) return "";

  // PY internacional (12 dígitos, "595" + 9 dígitos).
  if (d.length === 12 && d.startsWith("595")) {
    return `+595 ${d.slice(3, 6)} ${d.slice(6, 9)} ${d.slice(9)}`;
  }

  // PY local (10 dígitos, "09XXXXXXXX").
  if (d.length === 10) {
    return `${d.slice(0, 4)} ${d.slice(4, 7)} ${d.slice(7)}`;
  }

  // Casos cortos durante tipeo.
  if (d.length <= 4) return d;
  if (d.length <= 7) return `${d.slice(0, 4)} ${d.slice(4)}`;

  // Cualquier otra longitud: agrupar los últimos 6 en 3+3 y dejar el resto al frente.
  const head = d.slice(0, d.length - 6);
  return `${head} ${d.slice(-6, -3)} ${d.slice(-3)}`;
}

/**
 * Limpia el número para guardar en base de datos / copiar al clipboard.
 * Devuelve todos los dígitos tal como fueron ingresados.
 */
export function cleanTelefono(value: string): string {
  return extractDigits(value);
}

/**
 * Valida formato Paraguay aceptando:
 *   - Local: 10 dígitos, empieza con "09"
 *   - Internacional: 12 dígitos, empieza con "5959" (código país + móvil)
 */
export function isValidTelefono(value: string): boolean {
  const cleaned = cleanTelefono(value);
  if (cleaned.length === 10 && cleaned.startsWith("09")) return true;
  if (cleaned.length === 12 && cleaned.startsWith("5959")) return true;
  return false;
}
