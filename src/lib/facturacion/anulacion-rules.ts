/**
 * Reglas puras para la ANULACIÓN ADMINISTRATIVA de una factura mal cargada.
 *
 * Anulación administrativa = marcar la factura comercial como `Anulado` (saldo 0)
 * SIN eliminación física y SIN tocar la SET. Es para facturas mal cargadas que
 * todavía NO tienen un documento electrónico aprobado ni pagos imputados.
 *
 * Cuando hay pagos o un DE aprobado, la corrección NO es una anulación
 * administrativa: debe ir por cancelación SIFEN (ventana corta) o Nota de Crédito.
 * Para esos casos se reutilizan las reglas de `sifen-cancelacion-rules.ts`.
 *
 * Esta función NO ejecuta IO: solo decide. El endpoint resuelve empresa/schema,
 * carga datos y aplica el resultado.
 */

export const MSG_FACTURA_CON_PAGOS =
  "Esta factura tiene pagos registrados. Para corregirla, primero debe revertirse el pago o emitirse una Nota de Crédito según corresponda.";

/** Estados de `factura_electronica.estado_sifen` que permiten anulación administrativa directa. */
const ESTADOS_SIFEN_ANULABLES = new Set<string>([
  "sin_envio",
  "borrador",
  "rechazado",
  "error_envio",
]);

/**
 * Estados "en vuelo" ante la SET: el documento podría terminar aprobado.
 * Se bloquea por cautela y se deriva a consultar/esperar la resolución SET.
 */
const ESTADOS_SIFEN_EN_VUELO = new Set<string>([
  "generado",
  "firmado",
  "enviado",
  "en_proceso",
]);

export type AnulacionFacturaContext = {
  /** `facturas.estado` actual. */
  estadoFactura: string | null;
  /** Cantidad de filas en `pagos` para esta factura (mismo empresa_id). */
  pagosCount: number;
  /** `factura_electronica.estado_sifen` o `null` si no existe DE asociado. */
  estadoSifen: string | null;
};

export type AnulacionFacturaDecision =
  | { puede_anular: true; motivo_bloqueo: null; derivar_a: null }
  | {
      puede_anular: false;
      motivo_bloqueo: string;
      /** Pista de flujo alternativo para la UI / mensajes. */
      derivar_a: "ya_anulada" | "nota_credito" | "cancelacion_sifen_o_nc" | "esperar_sifen" | "pagos";
    };

/**
 * Decide si una factura puede anularse administrativamente.
 * Orden de evaluación pensado para devolver el mensaje más accionable primero.
 */
export function evaluarAnulacionFactura(ctx: AnulacionFacturaContext): AnulacionFacturaDecision {
  const estado = String(ctx.estadoFactura ?? "").trim();
  const estadoSifen = ctx.estadoSifen == null ? null : String(ctx.estadoSifen).trim();

  // 1) Idempotencia / estados terminales de la factura comercial.
  if (estado === "Anulado") {
    return {
      puede_anular: false,
      motivo_bloqueo: "La factura ya está anulada.",
      derivar_a: "ya_anulada",
    };
  }
  if (estado === "Corregida NC") {
    return {
      puede_anular: false,
      motivo_bloqueo:
        "La factura fue liquidada con nota de crédito aprobada (SET); no corresponde anularla administrativamente.",
      derivar_a: "nota_credito",
    };
  }

  // 2) Pagos imputados: nunca anular administrativamente (descuadra caja/cobros).
  if (ctx.pagosCount > 0) {
    return {
      puede_anular: false,
      motivo_bloqueo: MSG_FACTURA_CON_PAGOS,
      derivar_a: "pagos",
    };
  }

  // 3) Documento electrónico aprobado por la SET: documento fiscal con valor legal.
  if (estadoSifen === "aprobado") {
    return {
      puede_anular: false,
      motivo_bloqueo:
        "La factura tiene un documento electrónico APROBADO por la SET. No puede anularse administrativamente: " +
        "usá la cancelación SIFEN si todavía está dentro del plazo, o emití una Nota de Crédito si ya no puede cancelarse.",
      derivar_a: "cancelacion_sifen_o_nc",
    };
  }

  // 4) Documento electrónico ya cancelado en SET pero factura aún no Anulada (caso borde): permitir.
  if (estadoSifen === "cancelado") {
    return { puede_anular: true, motivo_bloqueo: null, derivar_a: null };
  }

  // 5) Documento en vuelo ante la SET: cautela, podría aprobarse.
  if (estadoSifen != null && ESTADOS_SIFEN_EN_VUELO.has(estadoSifen)) {
    return {
      puede_anular: false,
      motivo_bloqueo:
        "El documento electrónico está en proceso ante la SET. Consultá el estado del envío (consulta de lote) " +
        "y esperá la resolución antes de anular.",
      derivar_a: "esperar_sifen",
    };
  }

  // 6) Sin DE, o DE en estado anulable (sin_envio/borrador/rechazado/error_envio): anulación administrativa permitida.
  if (estadoSifen == null || ESTADOS_SIFEN_ANULABLES.has(estadoSifen)) {
    return { puede_anular: true, motivo_bloqueo: null, derivar_a: null };
  }

  // 7) Cualquier otro estado SIFEN no contemplado: cautela.
  return {
    puede_anular: false,
    motivo_bloqueo:
      `Estado de documento electrónico no anulable de forma administrativa («${estadoSifen}»). ` +
      "Revisá el panel SIFEN de la factura.",
    derivar_a: "esperar_sifen",
  };
}
