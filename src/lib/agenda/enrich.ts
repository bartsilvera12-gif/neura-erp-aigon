import "server-only";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import type { AgendaCitaEnriquecida, AgendaCitaRow } from "@/lib/agenda/types";

function uniq(ids: (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((x): x is string => typeof x === "string" && x.length > 0))];
}

/**
 * Agrega datos de cliente (schema de datos vía `sb`) y responsable (catálogo
 * `zentra_erp.usuarios` vía service role) a las filas de agenda, igual que
 * `enrichProyectosRows`.
 */
export async function enrichAgendaRows(
  sb: AppSupabaseClient,
  empresaId: string,
  rows: AgendaCitaRow[]
): Promise<AgendaCitaEnriquecida[]> {
  if (rows.length === 0) return [];

  const clienteIds = uniq(rows.map((r) => r.cliente_id));
  const userIds = uniq(rows.map((r) => r.responsable_id));

  const catalog = createServiceRoleClient();

  const [clientesR, usersR] = await Promise.all([
    clienteIds.length
      ? sb
          .from("clientes")
          .select("id,empresa,nombre_contacto,telefono")
          .eq("empresa_id", empresaId)
          .in("id", clienteIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
    userIds.length
      ? catalog.from("usuarios").select("id,nombre").eq("empresa_id", empresaId).in("id", userIds)
      : Promise.resolve({ data: [] as Record<string, unknown>[] }),
  ]);

  const clientesMap = new Map(
    (clientesR.data ?? []).map((t) => {
      const row = t as { id: string };
      return [row.id, row] as const;
    })
  );
  const usersMap = new Map(
    (usersR.data ?? []).map((t) => {
      const row = t as { id: string };
      return [row.id, row] as const;
    })
  );

  return rows.map((r) => {
    const out: AgendaCitaEnriquecida = { ...r };
    if (r.cliente_id) {
      const c = clientesMap.get(r.cliente_id) as
        | { id: string; empresa?: string | null; nombre_contacto?: string | null; telefono?: string | null }
        | undefined;
      out.cliente = c
        ? {
            id: c.id,
            nombre: (c.nombre_contacto?.trim() || c.empresa?.trim() || null) ?? null,
            telefono: c.telefono ?? null,
          }
        : { id: r.cliente_id, nombre: null, telefono: null };
    } else {
      out.cliente = null;
    }
    const u = usersMap.get(r.responsable_id) as { id: string; nombre?: string } | undefined;
    out.responsable = u ? { id: u.id, nombre: u.nombre ?? null } : { id: r.responsable_id, nombre: null };
    return out;
  });
}
