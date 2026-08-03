import "server-only";

/**
 * Regla "pago a la factura más antigua primero" (oldest-first), por CLIENTE.
 * Fuente de verdad única, usada dentro de `registrarPago` (núcleo compartido por
 * el módulo Pagos y Cobranzas). Alcance: por cliente global (no por servicio/suscripción).
 *
 * Orden de antigüedad: fecha_vencimiento ASC → fecha (emisión) ASC → numero_factura ASC.
 * Deuda = saldo > 0 y estado de deuda (excluye Pagado / Anulado / Corregida NC).
 */

const ESTADOS_NO_DEUDA = new Set(["pagado", "anulado", "corregida nc"]);

function ymd(s: string | null | undefined): string {
  return s ? String(s).slice(0, 10) : "";
}

function esDeuda(estado: string | null | undefined): boolean {
  return !ESTADOS_NO_DEUDA.has(String(estado ?? "").trim().toLowerCase());
}

function numInt(n: unknown): number {
  const m = String(n ?? "").replace(/\D/g, "");
  return m ? parseInt(m, 10) : Number.MAX_SAFE_INTEGER;
}

export type FacturaMasVieja = {
  id: string;
  numero_factura: string | null;
  fecha_vencimiento: string | null;
  saldo: number;
};

export type ValidacionMasVieja =
  | { ok: false; motivo: string }
  | { ok: true; esMasVieja: boolean; oldest: FacturaMasVieja };

/**
 * Determina la cuota MÁS VIEJA pendiente del cliente dueño de `facturaId` y si
 * `facturaId` es esa cuota. El caller bloquea el pago cuando `esMasVieja` es false.
 */
export async function validarPagoMasVieja(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  empresaId: string,
  facturaId: string
): Promise<ValidacionMasVieja> {
  const { data: tRows } = await supabase
    .from("facturas")
    .select("id, cliente_id")
    .eq("empresa_id", empresaId)
    .eq("id", facturaId)
    .limit(1);
  const target = ((tRows ?? []) as Record<string, unknown>[])[0];
  if (!target) return { ok: false, motivo: "Factura no encontrada" };
  const clienteId = String(target.cliente_id ?? "");
  if (!clienteId) return { ok: false, motivo: "Factura sin cliente" };

  const { data: fRows } = await supabase
    .from("facturas")
    .select("id, numero_factura, fecha, fecha_vencimiento, saldo, estado")
    .eq("empresa_id", empresaId)
    .eq("cliente_id", clienteId);

  const pendientes = ((fRows ?? []) as Record<string, unknown>[]).filter(
    (f) => (Number(f.saldo) || 0) > 0 && esDeuda(f.estado as string)
  );
  if (pendientes.length === 0) return { ok: false, motivo: "La factura no tiene saldo pendiente" };

  pendientes.sort((a, b) => {
    const va = ymd(a.fecha_vencimiento as string);
    const vb = ymd(b.fecha_vencimiento as string);
    if (va !== vb) return va < vb ? -1 : 1;
    const ea = ymd(a.fecha as string);
    const eb = ymd(b.fecha as string);
    if (ea !== eb) return ea < eb ? -1 : 1;
    return numInt(a.numero_factura) - numInt(b.numero_factura);
  });

  const oldest = pendientes[0]!;
  return {
    ok: true,
    esMasVieja: String(oldest.id) === facturaId,
    oldest: {
      id: String(oldest.id),
      numero_factura: (oldest.numero_factura as string) ?? null,
      fecha_vencimiento: (oldest.fecha_vencimiento as string) ?? null,
      saldo: Number(oldest.saldo) || 0,
    },
  };
}
