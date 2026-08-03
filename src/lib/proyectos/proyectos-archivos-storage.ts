import "server-only";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

/**
 * Bucket único (global del proyecto Supabase) para los archivos de los proyectos.
 * El aislamiento por empresa/proyecto se hace por path: `${empresaId}/${proyectoId}/...`.
 * Es privado: el acceso se sirve siempre con signed URLs de corta duración.
 */
export const PROYECTOS_BUCKET = "proyectos";

/** Límite por archivo. Documentos, imágenes, PDFs, comprimidos, etc. */
export const PROYECTOS_ARCHIVO_MAX_BYTES = 50 * 1024 * 1024; // 50 MB

/** Vigencia de los signed URL de vista previa / descarga. */
export const PROYECTOS_SIGNED_URL_TTL = 60 * 10; // 10 minutos

/** Crea el bucket privado si todavía no existe (idempotente). */
export async function ensureProyectosBucket(sb: AppSupabaseClient): Promise<void> {
  const { data, error } = await sb.storage.listBuckets();
  if (error) throw new Error(error.message);
  if ((data ?? []).some((b) => b.name === PROYECTOS_BUCKET)) return;
  const { error: createErr } = await sb.storage.createBucket(PROYECTOS_BUCKET, {
    public: false,
    fileSizeLimit: PROYECTOS_ARCHIVO_MAX_BYTES,
  });
  if (createErr && !createErr.message.toLowerCase().includes("already exists")) {
    throw new Error(createErr.message);
  }
}

/** Normaliza el nombre original para usarlo en el storage path (sin romper la unicidad). */
function sanitizeFileNameForPath(name: string): string {
  const trimmed = name.trim() || "archivo";
  const dot = trimmed.lastIndexOf(".");
  const base = dot > 0 ? trimmed.slice(0, dot) : trimmed;
  const ext = dot > 0 ? trimmed.slice(dot + 1) : "";
  const safeBase = base
    .normalize("NFKD")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80)
    .toLowerCase();
  const safeExt = ext.replace(/[^\w]+/g, "").slice(0, 12).toLowerCase();
  const stem = safeBase || "archivo";
  return safeExt ? `${stem}.${safeExt}` : stem;
}

/** Path de storage namespaced por empresa + proyecto, con prefijo aleatorio para evitar colisiones. */
export function buildProyectoArchivoPath(
  empresaId: string,
  proyectoId: string,
  originalName: string
): string {
  const unique = crypto.randomUUID();
  return `${empresaId}/${proyectoId}/${unique}-${sanitizeFileNameForPath(originalName)}`;
}

const PREVIEWABLE_PREFIXES = ["image/", "text/", "audio/", "video/"];
const PREVIEWABLE_EXACT = new Set(["application/pdf"]);

/** ¿El navegador puede mostrar el archivo inline (imagen, PDF, texto…)? */
export function isPreviewableMime(mime: string | null | undefined): boolean {
  if (!mime) return false;
  const m = mime.toLowerCase();
  if (PREVIEWABLE_EXACT.has(m)) return true;
  return PREVIEWABLE_PREFIXES.some((p) => m.startsWith(p));
}
