import "server-only";
import { emitEvent, EVENT_TYPES } from "@/lib/integrations/events";
import { toCalendarDateStr } from "@/lib/fechas/calendario";
import { validarPagoMasVieja, type FacturaMasVieja } from "@/lib/pagos/oldest-first";

/**
 * Servicio ÚNICO de registro de pagos. Fuente de verdad compartida por:
 *  - módulo Pagos (POST /api/pagos)
 *  - módulo Cobranzas (POST /api/cobranzas/registrar-pago)
 *
 * Mantiene EXACTAMENTE las validaciones, mensajes y flujo del POST original de Pagos
 * (insert pago → update saldo/estado factura → rollback si falla → emitir evento).
 */

export type RegistrarPagoInput = {
  factura_id?: unknown;
  monto?: unknown;
  fecha_pago?: unknown;
  metodo_pago?: unknown;
  referencia?: unknown;
};

export type RegistrarPagoAuth = {
  empresa_id: string;
  user?: { id?: string | null } | null;
};

export type RegistrarPagoResult =
  | { ok: true; pago: Record<string, unknown>; nuevoSaldo: number; nuevoEstado: string }
  | { ok: false; status: number; message: string; code?: string; oldest?: FacturaMasVieja };

const METODOS_VALIDOS = ["efectivo", "transferencia", "cheque", "tarjeta", "otro"];

export async function registrarPago(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  auth: RegistrarPagoAuth,
  input: RegistrarPagoInput
): Promise<RegistrarPagoResult> {
  const factura_id = typeof input.factura_id === "string" ? input.factura_id : "";
  const monto = input.monto;
  const fecha_pago = input.fecha_pago;
  const metodo_pago = input.metodo_pago;
  const referencia = typeof input.referencia === "string" ? input.referencia : undefined;

  if (!factura_id?.trim()) {
    return { ok: false, status: 400, message: "factura_id es obligatorio" };
  }
  if (monto == null || Number(monto) <= 0) {
    return { ok: false, status: 400, message: "monto debe ser mayor a 0" };
  }
  if (!fecha_pago) {
    return { ok: false, status: 400, message: "fecha_pago es obligatoria" };
  }
  const fechaPagoNorm = toCalendarDateStr(String(fecha_pago));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fechaPagoNorm)) {
    return { ok: false, status: 400, message: "fecha_pago inválida" };
  }

  const { data: factura, error: errFactura } = await supabase
    .from("facturas")
    .select("id, monto, saldo, estado, cliente_id")
    .eq("id", factura_id)
    .eq("empresa_id", auth.empresa_id)
    .single();

  if (errFactura || !factura) {
    return { ok: false, status: 404, message: "Factura no encontrada" };
  }

  const estadoFac = String(factura.estado ?? "");
  if (estadoFac === "Anulado") {
    return { ok: false, status: 400, message: "No se puede registrar pago sobre una factura anulada" };
  }
  if (estadoFac === "Corregida NC") {
    return {
      ok: false,
      status: 400,
      message: "La factura fue liquidada con nota de crédito aprobada (SET); no admite cobros adicionales.",
    };
  }
  if (estadoFac === "Pagado" && Number(factura.saldo) <= 0) {
    return { ok: false, status: 400, message: "La factura ya está pagada" };
  }

  // Regla oldest-first (por cliente): no se permite pagar una factura posterior si
  // existe una anterior con saldo. Guarda centralizada → aplica a Pagos y Cobranzas.
  const vMasVieja = await validarPagoMasVieja(supabase, auth.empresa_id, factura_id.trim());
  if (vMasVieja.ok && !vMasVieja.esMasVieja) {
    const old = vMasVieja.oldest;
    return {
      ok: false,
      status: 409,
      code: "PAY_OLDEST_FIRST",
      oldest: old,
      message: `Este cliente tiene una factura más antigua pendiente. Registrá primero el pago de ${old.numero_factura ?? "la factura anterior"}.`,
    };
  }

  const saldoActual = Number(factura.saldo);
  const montoNum = Number(monto);
  if (montoNum > saldoActual) {
    return {
      ok: false,
      status: 400,
      message: "El monto del pago no puede superar el saldo pendiente de la factura",
    };
  }
  const nuevoSaldo = Math.max(0, saldoActual - montoNum);
  /** CHECK en BD solo admite Pagado | Pendiente | Vencido | Anulado — nunca "Parcial". */
  const nuevoEstado = nuevoSaldo <= 0 ? "Pagado" : estadoFac === "Vencido" ? "Vencido" : "Pendiente";

  const metodo = METODOS_VALIDOS.includes(metodo_pago as string) ? (metodo_pago as string) : "efectivo";

  const insertData: Record<string, unknown> = {
    empresa_id: auth.empresa_id,
    factura_id: factura_id.trim(),
    monto: montoNum,
    fecha_pago: fechaPagoNorm,
    metodo_pago: metodo,
    referencia: referencia?.trim() || null,
    cliente_id: factura.cliente_id ?? null,
    usuario_id: auth.user?.id ?? null,
  };

  const { data, error } = await supabase.from("pagos").insert(insertData).select().single();

  if (error) {
    return { ok: false, status: 400, message: error.message };
  }

  const { error: errUpdFactura } = await supabase
    .from("facturas")
    .update({ saldo: nuevoSaldo, estado: nuevoEstado, updated_at: new Date().toISOString() })
    .eq("id", factura_id.trim())
    .eq("empresa_id", auth.empresa_id);

  if (errUpdFactura) {
    await supabase.from("pagos").delete().eq("id", data.id);
    return {
      ok: false,
      status: 500,
      message: `El pago no pudo aplicarse al saldo (${errUpdFactura.message}). Verifique el estado de la factura.`,
    };
  }

  await emitEvent(EVENT_TYPES.pago_registrado, { pago_id: data.id, factura_id, monto: montoNum });

  return { ok: true, pago: data as Record<string, unknown>, nuevoSaldo, nuevoEstado };
}
