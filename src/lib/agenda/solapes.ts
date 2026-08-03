import "server-only";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

export type CitaConflicto = {
  id: string;
  titulo: string | null;
  inicio_at: string;
  fin_at: string;
  estado: string;
};

/**
 * Anti-doble-reserva (Fase 1A, validación server-side).
 *
 * Busca una cita ACTIVA del mismo responsable cuyo rango [inicio, fin) se solape
 * con el rango propuesto. Dos rangos se solapan sii  a.inicio < b.fin && a.fin > b.inicio.
 * Los estados `cancelada` y `reprogramada` NO ocupan horario y se excluyen.
 *
 * `excludeId` permite ignorar la propia cita al editar/reprogramar.
 * Devuelve el primer conflicto encontrado, o `null` si el horario está libre.
 *
 * Nota: el cliente Supabase ya viene apuntando al schema de datos del tenant
 * (getChatServiceClientForEmpresa); aquí solo se filtra por empresa_id + RLS.
 */
export async function buscarConflictoHorario(params: {
  sb: AppSupabaseClient;
  empresaId: string;
  responsableId: string;
  inicioIso: string;
  finIso: string;
  excludeId?: string | null;
}): Promise<CitaConflicto | null> {
  const { sb, empresaId, responsableId, inicioIso, finIso, excludeId } = params;

  let q = sb
    .from("agenda_citas")
    .select("id,titulo,inicio_at,fin_at,estado")
    .eq("empresa_id", empresaId)
    .eq("responsable_id", responsableId)
    .not("estado", "in", "(cancelada,reprogramada)")
    .lt("inicio_at", finIso)
    .gt("fin_at", inicioIso)
    .order("inicio_at", { ascending: true })
    .limit(1);

  if (excludeId) q = q.neq("id", excludeId);

  const { data, error } = await q;
  if (error) {
    throw new Error(error.message);
  }
  const row = (data?.[0] ?? null) as CitaConflicto | null;
  return row;
}

/** Mensaje 409 legible a partir de un conflicto. */
export function mensajeConflicto(c: CitaConflicto): string {
  const ini = new Date(c.inicio_at);
  const fin = new Date(c.fin_at);
  const fmt = (d: Date) =>
    Number.isNaN(d.getTime())
      ? "?"
      : d.toLocaleString("es-PY", {
          timeZone: "America/Asuncion",
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
  const titulo = c.titulo?.trim() || "otra cita";
  return `El responsable ya tiene una cita en ese horario: "${titulo}" (${fmt(ini)} – ${fmt(fin)}).`;
}
