import "server-only";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";

export type QASupabase = Awaited<ReturnType<typeof getChatServiceClientForEmpresa>>;

export const QA_ACCIONES = [
  "grupo_creado","grupo_editado","grupo_eliminado",
  "etapa_creada","etapa_editada","etapa_eliminada",
  "item_creado","item_editado","item_eliminado",
  "item_marcado","item_desmarcado",
  "comentario_editado",
  "archivo_subido","archivo_eliminado",
  "qa_clonado",
] as const;

export type QAAccion = (typeof QA_ACCIONES)[number];

export async function registrarEventoQA(
  sb: QASupabase,
  args: {
    empresaId: string;
    proyectoId: string;
    usuarioId: string | null;
    accion: QAAccion;
    grupoId?: string | null;
    etapaId?: string | null;
    itemId?: string | null;
    payload?: Record<string, unknown>;
  }
) {
  await sb.from("proyecto_qa_eventos").insert({
    empresa_id: args.empresaId,
    proyecto_id: args.proyectoId,
    grupo_id: args.grupoId ?? null,
    etapa_id: args.etapaId ?? null,
    item_id: args.itemId ?? null,
    accion: args.accion,
    payload: args.payload ?? {},
    usuario_id: args.usuarioId,
  });
}

export async function bumpProyectoActividad(
  sb: QASupabase,
  empresaId: string,
  proyectoId: string,
  usuarioId: string | null
) {
  await sb
    .from("proyectos")
    .update({ last_activity_at: new Date().toISOString(), updated_by: usuarioId })
    .eq("empresa_id", empresaId)
    .eq("id", proyectoId);
}

export async function siguienteSortOrder(
  sb: QASupabase,
  table: "proyecto_qa_grupos" | "proyecto_qa_etapas" | "proyecto_qa_items",
  empresaId: string,
  filtro: Record<string, string>
): Promise<number> {
  let q = sb.from(table).select("sort_order").eq("empresa_id", empresaId);
  for (const [k, v] of Object.entries(filtro)) q = q.eq(k, v);
  const { data } = await q.order("sort_order", { ascending: false }).limit(1);
  const row = (data ?? [])[0] as { sort_order?: number } | undefined;
  return (row?.sort_order ?? 0) + 10;
}

export function buildQAArchivoPath(empresaId: string, proyectoId: string, itemId: string, originalName: string) {
  const unique = crypto.randomUUID();
  const trimmed = (originalName || "archivo").trim() || "archivo";
  const dot = trimmed.lastIndexOf(".");
  const base = dot > 0 ? trimmed.slice(0, dot) : trimmed;
  const ext = dot > 0 ? trimmed.slice(dot + 1) : "";
  const safeBase =
    base
      .normalize("NFKD")
      .replace(/[^\w.-]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 80)
      .toLowerCase() || "archivo";
  const safeExt = ext.replace(/[^\w]+/g, "").slice(0, 12).toLowerCase();
  const stem = safeExt ? `${safeBase}.${safeExt}` : safeBase;
  return `${empresaId}/${proyectoId}/qa/${itemId}/${unique}-${stem}`;
}
