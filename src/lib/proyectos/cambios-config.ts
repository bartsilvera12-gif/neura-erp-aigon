import "server-only";

import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";

export const PROYECTO_CAMBIOS_SLOTS = [1, 2, 3] as const;
export type ProyectoCambioNro = (typeof PROYECTO_CAMBIOS_SLOTS)[number];
export const PROYECTO_CAMBIOS_PERIODO_DIAS = 30;
export const PROYECTO_ESTADO_ENTREGADO_CODIGO = "publicado";

export type ProyectoCambioRow = {
  id: string;
  empresa_id: string;
  proyecto_id: string;
  nro: ProyectoCambioNro;
  realizado: boolean;
  comentario: string | null;
  realizado_at: string | null;
  realizado_por: string | null;
  created_at: string;
  updated_at: string;
};

export type ProyectoCambioRich = ProyectoCambioRow & {
  realizado_por_nombre: string | null;
};

export type ProyectoCambioPatch = {
  realizado?: boolean;
  comentario?: string | null;
};

export function isValidCambioNro(value: unknown): value is ProyectoCambioNro {
  const n = typeof value === "number" ? value : Number(value);
  return PROYECTO_CAMBIOS_SLOTS.includes(n as ProyectoCambioNro);
}

export function parseCambioPatch(body: unknown): ProyectoCambioPatch {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    throw new Error("Body inválido");
  }
  const r = body as Record<string, unknown>;
  const patch: ProyectoCambioPatch = {};
  if (Object.prototype.hasOwnProperty.call(r, "realizado")) {
    if (typeof r.realizado !== "boolean") throw new Error("realizado debe ser booleano");
    patch.realizado = r.realizado;
  }
  if (Object.prototype.hasOwnProperty.call(r, "comentario")) {
    if (r.comentario === null) {
      patch.comentario = null;
    } else if (typeof r.comentario === "string") {
      const trimmed = r.comentario.trim();
      patch.comentario = trimmed.length > 0 ? trimmed : null;
    } else {
      throw new Error("comentario debe ser texto o null");
    }
  }
  if (Object.keys(patch).length === 0) {
    throw new Error("Nada para actualizar");
  }
  return patch;
}

export async function listProyectoCambios(
  sb: AppSupabaseClient,
  empresaId: string,
  proyectoId: string
): Promise<ProyectoCambioRich[]> {
  const { data, error } = await sb
    .from("proyecto_cambios")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("proyecto_id", proyectoId)
    .order("nro", { ascending: true });
  if (error) throw new Error(error.message);

  const rows = (data ?? []) as ProyectoCambioRow[];
  const userIds = [
    ...new Set(rows.map((c) => c.realizado_por).filter((v): v is string => Boolean(v))),
  ];
  let nameMap = new Map<string, string>();
  if (userIds.length > 0) {
    const catalog = createServiceRoleClient();
    const { data: users } = await catalog
      .from("usuarios")
      .select("id, nombre")
      .eq("empresa_id", empresaId)
      .in("id", userIds);
    nameMap = new Map((users ?? []).map((u) => [u.id as string, (u.nombre as string) ?? ""]));
  }

  const byNro = new Map<number, ProyectoCambioRow>();
  for (const row of rows) byNro.set(row.nro, row);
  return PROYECTO_CAMBIOS_SLOTS.map((nro): ProyectoCambioRich => {
    const existing = byNro.get(nro);
    if (existing) {
      return {
        ...existing,
        realizado_por_nombre: existing.realizado_por
          ? nameMap.get(existing.realizado_por) ?? null
          : null,
      };
    }
    return {
      id: "",
      empresa_id: empresaId,
      proyecto_id: proyectoId,
      nro,
      realizado: false,
      comentario: null,
      realizado_at: null,
      realizado_por: null,
      created_at: "",
      updated_at: "",
      realizado_por_nombre: null,
    };
  });
}

export async function upsertProyectoCambio(
  sb: AppSupabaseClient,
  params: {
    empresaId: string;
    proyectoId: string;
    nro: ProyectoCambioNro;
    patch: ProyectoCambioPatch;
    usuarioCatalogId: string;
  }
): Promise<ProyectoCambioRow> {
  const { empresaId, proyectoId, nro, patch, usuarioCatalogId } = params;

  const { data: proyecto, error: ePr } = await sb
    .from("proyectos")
    .select("id")
    .eq("empresa_id", empresaId)
    .eq("id", proyectoId)
    .maybeSingle();
  if (ePr) throw new Error(ePr.message);
  if (!proyecto) throw new Error("Proyecto no encontrado");

  const { data: existing, error: eEx } = await sb
    .from("proyecto_cambios")
    .select("*")
    .eq("empresa_id", empresaId)
    .eq("proyecto_id", proyectoId)
    .eq("nro", nro)
    .maybeSingle();
  if (eEx) throw new Error(eEx.message);

  const nowIso = new Date().toISOString();
  const realizadoFinal =
    patch.realizado !== undefined ? patch.realizado : (existing?.realizado ?? false);
  const comentarioFinal =
    patch.comentario !== undefined ? patch.comentario : (existing?.comentario ?? null);

  if (existing) {
    const updates: Record<string, unknown> = {
      realizado: realizadoFinal,
      comentario: comentarioFinal,
    };
    if (realizadoFinal) {
      updates.realizado_at = existing.realizado_at ?? nowIso;
      updates.realizado_por = existing.realizado_por ?? usuarioCatalogId;
    } else {
      updates.realizado_at = null;
      updates.realizado_por = null;
    }
    const { data: updated, error: eUp } = await sb
      .from("proyecto_cambios")
      .update(updates)
      .eq("empresa_id", empresaId)
      .eq("id", (existing as ProyectoCambioRow).id)
      .select("*")
      .maybeSingle();
    if (eUp) throw new Error(eUp.message);
    if (!updated) throw new Error("No se pudo actualizar el cambio");
    return updated as ProyectoCambioRow;
  }

  const insertPayload: Record<string, unknown> = {
    empresa_id: empresaId,
    proyecto_id: proyectoId,
    nro,
    realizado: realizadoFinal,
    comentario: comentarioFinal,
    realizado_at: realizadoFinal ? nowIso : null,
    realizado_por: realizadoFinal ? usuarioCatalogId : null,
  };
  const { data: inserted, error: eIn } = await sb
    .from("proyecto_cambios")
    .insert(insertPayload)
    .select("*")
    .maybeSingle();
  if (eIn) throw new Error(eIn.message);
  if (!inserted) throw new Error("No se pudo crear el cambio");
  return inserted as ProyectoCambioRow;
}
