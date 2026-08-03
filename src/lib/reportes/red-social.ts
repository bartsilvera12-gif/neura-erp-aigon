/**
 * Inferencia de red social desde el `source_url` del referral CTWA.
 *
 * Decisión basada en auditoría sobre 653 atribuciones reales en `neura`:
 *  - YCloud NO entrega `publisher_platform` / `placement` / `source_platform` en
 *    su payload (0 ocurrencias en 9.891 mensajes auditados).
 *  - La única señal confiable es el dominio de `meta_source_url`:
 *      instagram.com / ig.me                → Instagram
 *      facebook.com / fb.me                 → Facebook
 *      cualquier otro o ausente             → No identificado
 *
 * Para precisión total (audience network, breakdown por placement, costo, ROAS)
 * haría falta integrar Meta Marketing API/Insights — fuera de alcance del
 * reporte actual. Esto es best-effort sobre dato real, sin inventar nada.
 */

export type RedSocial = "instagram" | "facebook" | "no_identificado";

export interface RedSocialBreakdown {
  instagram: number;
  facebook: number;
  no_identificado: number;
}

export function inferirRedSocial(sourceUrl: string | null | undefined): RedSocial {
  const u = (sourceUrl ?? "").trim().toLowerCase();
  if (!u) return "no_identificado";
  if (u.includes("instagram.com") || u.includes("ig.me/")) return "instagram";
  if (u.includes("facebook.com") || u.includes("fb.me/")) return "facebook";
  return "no_identificado";
}

export function etiquetaRedSocial(r: RedSocial): string {
  if (r === "instagram") return "Instagram";
  if (r === "facebook") return "Facebook";
  return "No identificado";
}
