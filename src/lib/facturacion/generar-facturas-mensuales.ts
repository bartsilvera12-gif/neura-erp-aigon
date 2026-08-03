import "server-only";
import type { AppSupabaseClient } from "@/lib/supabase/schema";
import { montosFacturaItemParaInsert } from "./factura-item-montos";
import { obtenerSiguienteNumeroFacturaEmpresa } from "./factura-suscripcion-servidor";
import { vencimientoPeriodo } from "@/lib/fechas/calendario";

/**
 * Motor de FACTURACIÓN MENSUAL automática de suscripciones (server-only).
 *
 * Regla de negocio:
 *  - Una factura por cada SUSCRIPCIÓN activa (no por cliente). Multi-servicio: el
 *    tipo/plan sale de la suscripción, no de `clientes.tipo_servicio_cliente`.
 *  - fecha_emision = día 01 del período; fecha_vencimiento = mismo mes, `dia_vencimiento`
 *    de la suscripción (fallback 10). NO se empuja al mes siguiente (el cron corre el 01).
 *  - Idempotente por PERÍODO EXPLÍCITO: no crea si ya existe una factura tipo suscripción de
 *    esa suscripción con `periodo_facturado = período` (excluye Anulado / Corregida NC). NO
 *    depende de `fecha_vencimiento` para deduplicar (evita confundir "emitida en N con venc
 *    en N+1" con "factura de N+1"). Cada factura creada se marca con `periodo_facturado`.
 *  - Solo clientes vigentes: salta eliminados, inactivos y dados de baja operativa.
 *  - Numeración SIEMPRE por el RPC transaccional (sin MAX+1). El contador avanza solo al crear.
 *
 * No toca pagos / SIFEN / numeración histórica. No envía emails ni DE. No emite eventos
 * (evita webhooks en lote). Solo crea facturas + factura_items "hacia adelante".
 */

const ESTADOS_FACTURA_NO_CUENTA = new Set(["anulado", "corregida nc"]);
const ESTADOS_CLIENTE_INACTIVO = new Set(["inactivo", "baja", "dado de baja", "suspendido"]);

export type ErrorSuscripcion = { suscripcion_id: string; error: string };

export type ResumenFacturacionMensual = {
  periodo: string; // YYYY-MM
  empresa_id: string;
  dry_run: boolean;
  fecha_emision: string; // YYYY-MM-01
  total_suscripciones_activas: number;
  facturas_a_crear: number;
  facturas_creadas: number;
  skipped_existente: number;
  skipped_cliente_inactivo: number;
  /** Facturas tipo=suscripcion de la empresa sin `periodo_facturado` (legacy sin backfill). */
  legacy_sin_periodo: number;
  errores: ErrorSuscripcion[];
};

type SuscRow = {
  id: string;
  cliente_id: string | null;
  plan_id: string | null;
  precio: number | null;
  moneda: string | null;
  dia_vencimiento: number | null;
  tipo_servicio: string | null;
};

function periodoActualYmd(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

export async function generarFacturasMensuales(opts: {
  supabase: AppSupabaseClient;
  empresaId: string;
  /** YYYY-MM. Default: mes corriente. */
  periodo?: string;
  dryRun?: boolean;
  /** Solo procesar estas suscripciones (para QA/targeted). Si se omite, todas las activas. */
  suscripcionIds?: string[];
}): Promise<ResumenFacturacionMensual> {
  const { supabase, empresaId } = opts;
  const dryRun = opts.dryRun ?? false;
  const periodo = /^\d{4}-\d{2}$/.test(opts.periodo ?? "") ? (opts.periodo as string) : periodoActualYmd();
  const emision = `${periodo}-01`;

  const resumen: ResumenFacturacionMensual = {
    periodo,
    empresa_id: empresaId,
    dry_run: dryRun,
    fecha_emision: emision,
    total_suscripciones_activas: 0,
    facturas_a_crear: 0,
    facturas_creadas: 0,
    skipped_existente: 0,
    skipped_cliente_inactivo: 0,
    legacy_sin_periodo: 0,
    errores: [],
  };

  // 1) Suscripciones activas (fuente real = suscripciones)
  let q = supabase
    .from("suscripciones")
    .select("id, cliente_id, plan_id, precio, moneda, dia_vencimiento, tipo_servicio")
    .eq("empresa_id", empresaId)
    .eq("estado", "activa");
  if (opts.suscripcionIds && opts.suscripcionIds.length > 0) {
    q = q.in("id", opts.suscripcionIds);
  }
  const { data: suscData, error: suscErr } = await q;
  if (suscErr) throw new Error(`No se pudieron leer suscripciones: ${suscErr.message}`);
  const suscripciones = (suscData ?? []) as unknown as SuscRow[];
  resumen.total_suscripciones_activas = suscripciones.length;

  // Diagnóstico: facturas de suscripción sin periodo_facturado (legacy sin backfill).
  // La idempotencia por período no las reconoce; útil para detectar backfill pendiente.
  const { count: legacyCount } = await supabase
    .from("facturas")
    .select("id", { count: "exact", head: true })
    .eq("empresa_id", empresaId)
    .eq("tipo", "suscripcion")
    .is("periodo_facturado", null);
  resumen.legacy_sin_periodo = legacyCount ?? 0;

  if (suscripciones.length === 0) return resumen;

  // 2) Estado de clientes (filtrar eliminados / inactivos / baja)
  const clienteIds = [...new Set(suscripciones.map((s) => String(s.cliente_id ?? "")).filter(Boolean))];
  const clienteMap = new Map<string, { estado: string | null; deleted_at: string | null; baja_operativa_at: string | null }>();
  if (clienteIds.length > 0) {
    const { data: cliData, error: cliErr } = await supabase
      .from("clientes")
      .select("id, estado, deleted_at, baja_operativa_at")
      .in("id", clienteIds);
    if (cliErr) throw new Error(`No se pudieron leer clientes: ${cliErr.message}`);
    for (const c of (cliData ?? []) as Record<string, unknown>[]) {
      clienteMap.set(String(c.id), {
        estado: (c.estado as string) ?? null,
        deleted_at: (c.deleted_at as string) ?? null,
        baja_operativa_at: (c.baja_operativa_at as string) ?? null,
      });
    }
  }

  // 3) Planes (nombre para descripción + fallback de monto)
  const planIds = [...new Set(suscripciones.map((s) => String(s.plan_id ?? "")).filter(Boolean))];
  const planMap = new Map<string, { nombre: string | null; precio: number }>();
  if (planIds.length > 0) {
    const { data: planData } = await supabase.from("planes").select("id, nombre, precio").in("id", planIds);
    for (const p of (planData ?? []) as Record<string, unknown>[]) {
      planMap.set(String(p.id), { nombre: (p.nombre as string) ?? null, precio: Number(p.precio) || 0 });
    }
  }

  function clienteVigente(clienteId: string): boolean {
    const c = clienteMap.get(clienteId);
    if (!c) return false;
    if (c.deleted_at != null && String(c.deleted_at).trim() !== "") return false;
    if (c.baja_operativa_at != null && String(c.baja_operativa_at).trim() !== "") return false;
    const estado = String(c.estado ?? "activo").trim().toLowerCase();
    if (ESTADOS_CLIENTE_INACTIVO.has(estado)) return false;
    return true;
  }

  // 4) Iterar suscripciones
  for (const s of suscripciones) {
    const suscId = String(s.id);
    const clienteId = String(s.cliente_id ?? "");

    if (!clienteId || !clienteVigente(clienteId)) {
      resumen.skipped_cliente_inactivo++;
      continue;
    }

    // Idempotencia por PERÍODO EXPLÍCITO (suscripcion_id + periodo_facturado). No usa
    // fecha_vencimiento: una factura emitida en N con venc en N+1 ya no confunde períodos.
    const { data: existentes, error: exErr } = await supabase
      .from("facturas")
      .select("id, estado")
      .eq("empresa_id", empresaId)
      .eq("suscripcion_id", suscId)
      .eq("tipo", "suscripcion")
      .eq("periodo_facturado", periodo);
    if (exErr) {
      resumen.errores.push({ suscripcion_id: suscId, error: `idempotencia: ${exErr.message}` });
      continue;
    }
    const yaExiste = ((existentes ?? []) as Record<string, unknown>[]).some(
      (f) => !ESTADOS_FACTURA_NO_CUENTA.has(String(f.estado ?? "").trim().toLowerCase())
    );
    if (yaExiste) {
      resumen.skipped_existente++;
      continue;
    }

    // Monto: suscripción, fallback al plan
    let monto = Number(s.precio);
    if (!Number.isFinite(monto) || monto <= 0) {
      const p = s.plan_id ? planMap.get(String(s.plan_id)) : null;
      monto = p ? Number(p.precio) : NaN;
    }
    if (!Number.isFinite(monto) || monto <= 0) {
      resumen.errores.push({ suscripcion_id: suscId, error: "monto inválido (suscripción/plan sin precio)" });
      continue;
    }

    const diaVenc = Math.min(31, Math.max(1, Number(s.dia_vencimiento) || 10));
    const fechaVenc = vencimientoPeriodo(emision, diaVenc, "actual");

    resumen.facturas_a_crear++;
    if (dryRun) continue;

    try {
      const numeroFactura = await obtenerSiguienteNumeroFacturaEmpresa(supabase, empresaId);
      const moneda = String(s.moneda) === "USD" ? "USD" : "GS";

      const { data: factura, error: fErr } = await supabase
        .from("facturas")
        .insert({
          empresa_id: empresaId,
          cliente_id: clienteId,
          suscripcion_id: suscId,
          numero_factura: numeroFactura,
          fecha: emision,
          fecha_vencimiento: fechaVenc,
          periodo_facturado: periodo,
          monto,
          saldo: monto,
          estado: "Pendiente",
          tipo: "suscripcion",
          moneda,
        })
        .select()
        .single();
      if (fErr || !factura) {
        resumen.errores.push({ suscripcion_id: suscId, error: `factura: ${fErr?.message ?? "insert vacío"}` });
        continue;
      }

      // Concepto = nombre del plan (fuente natural del servicio). Ya NO se usa el
      // `tipo_servicio` de la suscripción (modelo unificado: el tipo vive en el cliente,
      // no en la suscripción/plan). Fallback genérico "Suscripción" si no hay plan.
      const planNombre =
        (s.plan_id ? planMap.get(String(s.plan_id))?.nombre : null) || "Suscripción";
      const linea = montosFacturaItemParaInsert({ totalLinea: monto, moneda, cantidad: 1, precioUnitario: monto });
      const { error: iErr } = await supabase.from("factura_items").insert({
        factura_id: (factura as { id: string }).id,
        empresa_id: empresaId,
        descripcion: planNombre,
        cantidad: 1,
        precio_unitario: linea.precio_unitario,
        subtotal: linea.subtotal,
        iva: linea.iva,
        total: linea.total,
      });
      if (iErr) {
        // Compensar: borrar la factura para no dejarla sin ítem (el número queda consumido, hueco aceptable).
        await supabase.from("facturas").delete().eq("id", (factura as { id: string }).id).eq("empresa_id", empresaId);
        resumen.errores.push({ suscripcion_id: suscId, error: `factura_items: ${iErr.message} (factura revertida)` });
        continue;
      }
      resumen.facturas_creadas++;
    } catch (e) {
      resumen.errores.push({ suscripcion_id: suscId, error: e instanceof Error ? e.message : String(e) });
    }
  }

  return resumen;
}
