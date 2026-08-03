/**
 * Resolución de comisionabilidad de una línea de pago para el preview de comisiones.
 *
 * Precedencia (aprobada por negocio):
 *   1. Override del período por pago:  'excluir' → no comisiona | 'incluir' → comisiona
 *   2. Flag durable de la factura (facturas.comisionable):  true → sí | false → no
 *   3. Regla automática conservadora:
 *        contado + sin suscripción + factura no anulada/corregida + cliente NO recurrente
 *
 * "cliente recurrente" = existe otra factura válida del mismo cliente con
 * fecha de emisión ANTERIOR a la de la factura actual (se resuelve por factura,
 * no por mes). Esa detección se hace en el route y se pasa acá ya calculada.
 */

export type OrigenComisionable =
  | "override_excluir"
  | "override_incluir"
  | "factura"
  | "auto";

export type OverrideDecision = "incluir" | "excluir";

export type ComisionabilidadInput = {
  /** Decisión manual del período para este pago, si existe. */
  override: OverrideDecision | null;
  /** facturas.comisionable: true | false | null (null = resolver por regla auto). */
  facturaComisionable: boolean | null;
  /** facturas.tipo (p. ej. 'contado' | 'suscripcion'). */
  tipo: string | null;
  /** facturas.suscripcion_id presente → recurrente. */
  tieneSuscripcion: boolean;
  /** Factura anulada o corregida por NC → nunca comisiona. */
  facturaInvalida: boolean;
  /** Cliente con factura previa (fecha < fecha de esta factura). */
  clienteEsRecurrente: boolean;
};

export type ComisionabilidadResult = {
  comisiona: boolean;
  origen: OrigenComisionable;
};

/** Regla automática conservadora (solo venta nueva de implementación). */
export function reglaAutomaticaComisiona(input: {
  tipo: string | null;
  tieneSuscripcion: boolean;
  facturaInvalida: boolean;
  clienteEsRecurrente: boolean;
}): boolean {
  if (input.facturaInvalida) return false;
  if (input.tieneSuscripcion) return false;
  if (input.clienteEsRecurrente) return false;
  return String(input.tipo ?? "").trim().toLowerCase() === "contado";
}

export function resolverComisionable(input: ComisionabilidadInput): ComisionabilidadResult {
  // 1) Override del período (gana siempre).
  if (input.override === "excluir") return { comisiona: false, origen: "override_excluir" };
  if (input.override === "incluir") return { comisiona: true, origen: "override_incluir" };

  // 2) Flag durable de la factura.
  if (input.facturaComisionable === true) return { comisiona: true, origen: "factura" };
  if (input.facturaComisionable === false) return { comisiona: false, origen: "factura" };

  // 3) Regla automática conservadora.
  return {
    comisiona: reglaAutomaticaComisiona({
      tipo: input.tipo,
      tieneSuscripcion: input.tieneSuscripcion,
      facturaInvalida: input.facturaInvalida,
      clienteEsRecurrente: input.clienteEsRecurrente,
    }),
    origen: "auto",
  };
}
