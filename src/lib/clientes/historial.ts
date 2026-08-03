import "server-only";

export type AccionCliente =
  | "create"
  | "update"
  | "deactivate"
  | "reactivate"
  | "duplicate_blocked";

/**
 * Registra una entrada de auditoría en `cliente_historial` (tabla existente, RLS por empresa).
 * No-throwing: la auditoría nunca debe romper la operación principal.
 * `detalle` jsonb guarda changed_fields / before / after / source / matches según el caso.
 */
export async function registrarHistorialCliente(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  params: {
    empresaId: string;
    clienteId: string;
    accion: AccionCliente;
    detalle?: Record<string, unknown>;
    authUserId?: string | null;
    email?: string | null;
    source?: "clientes_ui" | "api" | "system";
  }
): Promise<void> {
  try {
    await supabase.from("cliente_historial").insert({
      empresa_id: params.empresaId,
      cliente_id: params.clienteId,
      tipo: "cliente",
      accion: params.accion,
      detalle: { ...(params.detalle ?? {}), source: params.source ?? "api" },
      creado_por_auth_user_id: params.authUserId ?? null,
      creado_por_email: params.email ?? null,
    });
  } catch (e) {
    console.error("[cliente_historial] insert falló:", e instanceof Error ? e.message : e);
  }
}

/** Campos "principales" de cliente a auditar en updates. */
export const CAMPOS_AUDITABLES = [
  "empresa",
  "nombre",
  "nombre_contacto",
  "ruc",
  "documento",
  "tipo_servicio_cliente",
  "tipo_cliente",
  "estado",
  "condicion_pago",
  "moneda_preferida",
  "vendedor_usuario_id",
] as const;

/** Compara antes/después y devuelve { changed_fields, before, after } solo de lo que cambió. */
export function diffCamposCliente(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined
): { changed_fields: string[]; before: Record<string, unknown>; after: Record<string, unknown> } {
  const changed: string[] = [];
  const b: Record<string, unknown> = {};
  const a: Record<string, unknown> = {};
  for (const k of CAMPOS_AUDITABLES) {
    const bv = before?.[k] ?? null;
    const av = after?.[k] ?? null;
    if (String(bv ?? "") !== String(av ?? "")) {
      changed.push(k);
      b[k] = bv;
      a[k] = av;
    }
  }
  return { changed_fields: changed, before: b, after: a };
}
