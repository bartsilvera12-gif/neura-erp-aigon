/**
 * Emisión de factura de suscripción desde rutas API (sin localStorage / getCurrentUser).
 */
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { montosFacturaItemParaInsert } from "./factura-item-montos";
import { emitEvent, EVENT_TYPES } from "@/lib/integrations/events";
import { fechaVencimientoSuscripcion, vencimientoPeriodo, toCalendarDateStr, hoyYmdLocal } from "@/lib/fechas/calendario";
import { aplicarPlanPendienteSiVencido } from "./suscripcion-plan-pendiente";

/**
 * Reserva el siguiente número de factura SIEMPRE vía el RPC transaccional
 * `next_numero_factura_empresa` (contador `<schema>.factura_correlativos` con lock).
 *
 * ENDURECIDO (Opción A): si el RPC falla o devuelve vacío, LANZA error y NO genera
 * la factura. Antes había un fallback `MAX(numero)+1` sin lock que desincronizaba el
 * contador y producía números duplicados; se eliminó a propósito. Es preferible fallar
 * a duplicar. Todo nuevo camino de emisión debe usar este helper (no calcular números).
 */
export async function obtenerSiguienteNumeroFacturaEmpresa(
  supabase: AppSupabaseClient,
  empresaId: string
): Promise<string> {
  const prefijoDefault = process.env.FACTURA_PREFIJO ?? "FAC-";

  const { data: rpc, error: rpcErr } = await supabase.rpc("next_numero_factura_empresa", {
    p_empresa_id: empresaId,
    p_prefijo_default: prefijoDefault,
  });

  if (rpcErr) {
    throw new Error(
      `No se pudo reservar el número de factura (contador transaccional falló: ${rpcErr.message}). ` +
        `No se generó la factura para evitar numeración duplicada.`
    );
  }
  if (typeof rpc !== "string" || rpc.trim() === "") {
    throw new Error(
      "No se pudo reservar el número de factura (respuesta vacía del contador transaccional). " +
        "No se generó la factura para evitar numeración duplicada."
    );
  }
  return rpc.trim();
}

export type SuscripcionFacturaRow = {
  id: string;
  cliente_id: string;
  plan_id: string | null;
  precio: number;
  moneda: string;
  dia_facturacion?: number | null;
  dia_vencimiento?: number | null;
};

/**
 * Si no hay factura del mes calendario actual para esa suscripción, crea una (equivalente a emitir este mes).
 */
/**
 * Modo de cálculo del vencimiento de la factura inicial:
 *  - "auto": regla histórica (mes de emisión; si el día ya pasó, salta al mes siguiente).
 *  - "actual": vencimiento en el mes de emisión (puede quedar vencido).
 *  - "siguiente": vencimiento en el mes siguiente.
 *  - "override": usa `vencimientoOverride` (YYYY-MM-DD) tal cual.
 */
export type VencimientoFacturaInicial =
  | { modo: "auto" | "actual" | "siguiente" }
  | { modo: "override"; vencimientoOverride: string };

export async function crearFacturaInicialSuscripcionSiCorresponde(opts: {
  supabase: AppSupabaseClient;
  empresaId: string;
  suscripcion: SuscripcionFacturaRow;
  vencimiento?: VencimientoFacturaInicial;
}): Promise<void> {
  const { supabase, empresaId, suscripcion } = opts;
  const vencCfg: VencimientoFacturaInicial = opts.vencimiento ?? { modo: "auto" };
  await aplicarPlanPendienteSiVencido({
    supabase,
    empresaId,
    suscripcionId: suscripcion.id,
  });
  const { data: sRef } = await supabase
    .from("suscripciones")
    .select("id, plan_id, precio, moneda, dia_facturacion, dia_vencimiento, cliente_id")
    .eq("id", suscripcion.id)
    .eq("empresa_id", empresaId)
    .maybeSingle();
  const sRow = sRef
    ? {
        id: sRef.id as string,
        cliente_id: (sRef as { cliente_id: string }).cliente_id,
        plan_id: (sRef as { plan_id: string | null }).plan_id,
        precio: Number((sRef as { precio: number }).precio),
        moneda: (sRef as { moneda: string }).moneda,
        dia_facturacion: (sRef as { dia_facturacion?: number | null }).dia_facturacion,
        dia_vencimiento: (sRef as { dia_vencimiento?: number | null }).dia_vencimiento,
      }
    : suscripcion;
  const hoy = hoyYmdLocal();
  const y = new Date().getFullYear();
  const m = new Date().getMonth() + 1;
  const mesActual = `${y}-${String(m).padStart(2, "0")}`;
  const nextM = m === 12 ? 1 : m + 1;
  const nextY = m === 12 ? y + 1 : y;
  const mesSiguiente = `${nextY}-${String(nextM).padStart(2, "0")}`;

  const { data: existentes } = await supabase
    .from("facturas")
    .select("id")
    .eq("cliente_id", sRow.cliente_id)
    .eq("suscripcion_id", sRow.id)
    .eq("empresa_id", empresaId)
    .gte("fecha", `${mesActual}-01`)
    .lt("fecha", `${mesSiguiente}-01`)
    .limit(1);

  if (existentes && existentes.length > 0) return;

  const monto = Number(sRow.precio);
  if (!Number.isFinite(monto) || monto <= 0) return;

  // Best-effort: si el contador transaccional falla, NO frenamos la creación de la
  // suscripción ni intentamos numerar a mano (evita duplicados). Se loguea y se omite la factura.
  let numeroFactura: string;
  try {
    numeroFactura = await obtenerSiguienteNumeroFacturaEmpresa(supabase, empresaId);
  } catch (e) {
    console.error(
      "[crearFacturaInicialSuscripcionSiCorresponde] no se pudo reservar número, se omite factura inicial:",
      e instanceof Error ? e.message : e
    );
    return;
  }
  const moneda = sRow.moneda === "USD" ? "USD" : "GS";
  const diaVencCfg = Math.min(Math.max(1, Number(sRow.dia_vencimiento) || 10), 31);
  let fechaVenc: string;
  if (vencCfg.modo === "override") {
    const ov = toCalendarDateStr(vencCfg.vencimientoOverride);
    fechaVenc = /^\d{4}-\d{2}-\d{2}$/.test(ov) ? ov : fechaVencimientoSuscripcion(hoy, diaVencCfg);
  } else if (vencCfg.modo === "actual" || vencCfg.modo === "siguiente") {
    fechaVenc = vencimientoPeriodo(hoy, diaVencCfg, vencCfg.modo);
  } else {
    fechaVenc = fechaVencimientoSuscripcion(hoy, diaVencCfg);
  }

  const { data: factura, error: errFact } = await supabase
    .from("facturas")
    .insert({
      empresa_id: empresaId,
      cliente_id: sRow.cliente_id,
      suscripcion_id: sRow.id,
      numero_factura: numeroFactura,
      fecha: hoy,
      fecha_vencimiento: fechaVenc,
      monto,
      saldo: monto,
      estado: "Pendiente",
      tipo: "suscripcion",
      moneda,
    })
    .select()
    .single();

  if (errFact || !factura) {
    console.error("[crearFacturaInicialSuscripcionSiCorresponde]", errFact?.message);
    return;
  }

  let planNombre = "Suscripción";
  if (sRow.plan_id) {
    const { data: plan } = await supabase
      .from("planes")
      .select("nombre")
      .eq("id", sRow.plan_id)
      .maybeSingle();
    if (plan?.nombre) planNombre = plan.nombre;
  }

  const linea = montosFacturaItemParaInsert({
    totalLinea: monto,
    moneda,
    cantidad: 1,
    precioUnitario: monto,
  });

  const { error: errItem } = await supabase.from("factura_items").insert({
    factura_id: factura.id,
    empresa_id: empresaId,
    descripcion: planNombre,
    cantidad: 1,
    precio_unitario: linea.precio_unitario,
    subtotal: linea.subtotal,
    iva: linea.iva,
    total: linea.total,
  });

  if (errItem) {
    console.error("[crearFacturaInicialSuscripcionSiCorresponde] factura_items:", errItem.message);
    await supabase.from("facturas").delete().eq("id", factura.id).eq("empresa_id", empresaId);
    return;
  }

  await emitEvent(EVENT_TYPES.factura_creada, {
    factura_id: factura.id,
    cliente_id: sRow.cliente_id,
    monto: (factura as { monto: number }).monto,
  });
}
