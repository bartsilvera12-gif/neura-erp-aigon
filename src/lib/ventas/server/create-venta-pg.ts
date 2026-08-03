import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";

export interface CreateVentaItemInput {
  producto_id: string;
  producto_nombre: string;
  sku: string;
  cantidad: number;
  precio_venta_original: number;
  precio_venta: number;
  tipo_iva: "EXENTA" | "5%" | "10%";
  subtotal: number;
  monto_iva: number;
  total_linea: number;
}

export interface CreateVentaPgParams {
  schema: string;
  empresaId: string;
  clienteId: string | null;
  observaciones: string | null;
  moneda: "GS" | "USD";
  tipoCambio: number;
  tipoVenta: "CONTADO" | "CREDITO";
  plazoDias: number | null;
  items: CreateVentaItemInput[];
  /** Totales enviados por el cliente (se contrastan con el recálculo). */
  subtotalDeclarado: number;
  montoIvaDeclarado: number;
  totalDeclarado: number;
}

function qTable(schema: string, table: string): string {
  return quoteSchemaTable(schema, table);
}

function recalcTotals(items: CreateVentaItemInput[]) {
  let subtotal = 0;
  let montoIva = 0;
  let total = 0;
  for (const it of items) {
    subtotal += it.subtotal;
    montoIva += it.monto_iva;
    total += it.total_linea;
  }
  return { subtotal, montoIva, total };
}

const TOL = 2; // guaraníes — tolerancia de redondeo

/**
 * Crea venta + ítems + movimientos + descuenta stock en una transacción Postgres.
 * Requiere SUPABASE_DB_URL / DIRECT_URL / DATABASE_URL en el servidor.
 */
export async function createVentaTransaccionalPg(
  params: CreateVentaPgParams
): Promise<{ ventaId: string; numeroControl: string; fechaIso: string }> {
  const pool = getChatPostgresPool();
  if (!pool) {
    throw new Error("Sin conexión directa a Postgres (configura SUPABASE_DB_URL).");
  }

  const items = params.items;
  if (!items.length) {
    throw new Error("La venta debe tener al menos un ítem.");
  }

  const calc = recalcTotals(items);
  if (
    Math.abs(calc.subtotal - params.subtotalDeclarado) > TOL ||
    Math.abs(calc.montoIva - params.montoIvaDeclarado) > TOL ||
    Math.abs(calc.total - params.totalDeclarado) > TOL
  ) {
    throw new Error("Los totales no coinciden con los ítems; revisá el carrito.");
  }

  const qtyByProduct = new Map<string, number>();
  for (const it of items) {
    const prev = qtyByProduct.get(it.producto_id) ?? 0;
    qtyByProduct.set(it.producto_id, prev + it.cantidad);
  }

  const ventasT = qTable(params.schema, "ventas");
  const itemsT = qTable(params.schema, "ventas_items");
  const movT = qTable(params.schema, "movimientos_inventario");
  const prodT = qTable(params.schema, "productos");
  const cliT = qTable(params.schema, "clientes");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    if (params.clienteId) {
      const ck = await client.query<{ ok: number }>(
        `SELECT 1 AS ok FROM ${cliT} WHERE id = $1 AND empresa_id = $2 LIMIT 1`,
        [params.clienteId, params.empresaId]
      );
      if (ck.rows.length === 0) {
        throw new Error("Cliente no encontrado en esta empresa.");
      }
    }

    const ids = [...qtyByProduct.keys()];
    const lockSql = `
      SELECT id, stock_actual, costo_promedio, nombre, sku
      FROM ${prodT}
      WHERE empresa_id = $1 AND id = ANY($2::uuid[])
      FOR UPDATE
    `;
    const locked = await client.query<{
      id: string;
      stock_actual: string;
      costo_promedio: string;
      nombre: string;
      sku: string;
    }>(lockSql, [params.empresaId, ids]);

    if (locked.rows.length !== ids.length) {
      throw new Error("Uno o más productos no existen o no pertenecen a esta empresa.");
    }

    const stockMap = new Map<
      string,
      { stock: number; costo: number; nombre: string; sku: string }
    >();
    for (const row of locked.rows) {
      stockMap.set(row.id, {
        stock: Number(row.stock_actual),
        costo: Number(row.costo_promedio),
        nombre: row.nombre,
        sku: row.sku,
      });
    }

    for (const [pid, need] of qtyByProduct) {
      const p = stockMap.get(pid)!;
      if (p.stock < need) {
        throw new Error(
          `Stock insuficiente para "${p.nombre}". Disponible: ${p.stock} u.; requerido: ${need}.`
        );
      }
    }

    const maxRow = await client.query<{ mx: string | null }>(
      `
      SELECT COALESCE(MAX(
        CASE
          WHEN numero_control ~ '^VTA-[0-9]+$'
          THEN substring(numero_control from '[0-9]+$')::bigint
          ELSE NULL::bigint
        END
      ), 0)::text AS mx
      FROM ${ventasT}
      WHERE empresa_id = $1
      `,
      [params.empresaId]
    );
    const nextNum = BigInt(maxRow.rows[0]?.mx ?? "0") + BigInt(1);
    const numeroControl = `VTA-${String(nextNum).padStart(6, "0")}`;

    const fechaIso = new Date().toISOString();

    const insVenta = await client.query<{ id: string }>(
      `
      INSERT INTO ${ventasT} (
        empresa_id, cliente_id, numero_control, moneda, tipo_cambio,
        subtotal, monto_iva, total, estado, tipo_venta, plazo_dias, fecha, observaciones
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, 'completada', $9, $10, $11::timestamptz, $12
      )
      RETURNING id
      `,
      [
        params.empresaId,
        params.clienteId,
        numeroControl,
        params.moneda,
        params.tipoCambio,
        calc.subtotal,
        calc.montoIva,
        calc.total,
        params.tipoVenta,
        params.plazoDias,
        fechaIso,
        params.observaciones,
      ]
    );

    const ventaId = insVenta.rows[0].id;

    for (const line of items) {
      const p = stockMap.get(line.producto_id)!;
      await client.query(
        `
        INSERT INTO ${itemsT} (
          empresa_id, venta_id, producto_id, producto_nombre, sku,
          cantidad, precio_venta_original, precio_venta, tipo_iva,
          subtotal, monto_iva, total_linea
        ) VALUES (
          $1, $2, $3, $4, $5,
          $6, $7, $8, $9,
          $10, $11, $12
        )
        `,
        [
          params.empresaId,
          ventaId,
          line.producto_id,
          line.producto_nombre,
          line.sku,
          line.cantidad,
          line.precio_venta_original,
          line.precio_venta,
          line.tipo_iva,
          line.subtotal,
          line.monto_iva,
          line.total_linea,
        ]
      );

      const nuevoStock = p.stock - line.cantidad;
      await client.query(
        `UPDATE ${prodT} SET stock_actual = $1 WHERE id = $2 AND empresa_id = $3`,
        [nuevoStock, line.producto_id, params.empresaId]
      );
      p.stock = nuevoStock;

      await client.query(
        `
        INSERT INTO ${movT} (
          empresa_id, producto_id, producto_nombre, producto_sku,
          tipo, cantidad, costo_unitario, origen, referencia, fecha, venta_id
        ) VALUES (
          $1, $2, $3, $4,
          'SALIDA', $5, $6, 'venta', $7, $8::timestamptz, $9
        )
        `,
        [
          params.empresaId,
          line.producto_id,
          line.producto_nombre,
          line.sku,
          line.cantidad,
          p.costo,
          numeroControl,
          fechaIso,
          ventaId,
        ]
      );
    }

    await client.query("COMMIT");
    return { ventaId, numeroControl, fechaIso };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
