import "server-only";

/** Normaliza documento (RUC/cédula): solo alfanumérico, mayúsculas. */
export function normalizarDocumento(v: unknown): string {
  return String(v ?? "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
}

/** Normaliza nombre principal: sin acentos, espacios colapsados, mayúsculas, trim. */
export function normalizarNombre(v: unknown): string {
  return String(v ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toUpperCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type DuplicadoMatch = {
  cliente_id: string;
  nombre: string;
  documento: string | null;
  estado: string;
  activo: boolean;
  tipo_servicio: string | null;
  match_type: "documento" | "nombre" | "ambos";
  display_url: string;
};

/**
 * Busca clientes existentes (no eliminados) que dupliquen por DOCUMENTO o por NOMBRE PRINCIPAL.
 * Nombre principal = empresa/razón social, o `nombre` (persona). NO usa contacto/teléfono/email.
 */
export async function buscarDuplicadosCliente(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  empresaId: string,
  input: { nombre?: string | null; documento?: string | null; excluirClienteId?: string | null }
): Promise<DuplicadoMatch[]> {
  const docN = normalizarDocumento(input.documento);
  const nameN = normalizarNombre(input.nombre);
  if (!docN && !nameN) return [];

  const { data, error } = await supabase
    .from("clientes")
    .select("id, empresa, nombre, ruc, documento, estado, tipo_servicio_cliente, deleted_at")
    .eq("empresa_id", empresaId)
    .is("deleted_at", null);
  if (error) throw new Error(error.message);

  const out: DuplicadoMatch[] = [];
  for (const c of (data ?? []) as Record<string, unknown>[]) {
    const cid = String(c.id ?? "");
    if (!cid || (input.excluirClienteId && cid === input.excluirClienteId)) continue;
    const cdoc = normalizarDocumento((c.ruc as string) || (c.documento as string));
    const cname = normalizarNombre((c.empresa as string) || (c.nombre as string));
    const matchDoc = !!docN && cdoc === docN;
    const matchName = !!nameN && cname === nameN;
    if (!matchDoc && !matchName) continue;
    const estado = String(c.estado ?? "activo");
    out.push({
      cliente_id: cid,
      nombre: String((c.empresa as string) || (c.nombre as string) || "").trim(),
      documento: ((c.ruc as string) || (c.documento as string) || null) as string | null,
      estado,
      activo: estado.trim().toLowerCase() === "activo",
      tipo_servicio: (c.tipo_servicio_cliente as string) ?? null,
      match_type: matchDoc && matchName ? "ambos" : matchDoc ? "documento" : "nombre",
      display_url: `/clientes/${cid}`,
    });
  }
  out.sort((a, b) => Number(b.activo) - Number(a.activo));
  return out;
}
