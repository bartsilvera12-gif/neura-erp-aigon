import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { ymdInicioFinMesLocal } from "@/lib/fechas/calendario";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import {
  assertAllowedChatDataSchema,
  isLikelyUnexposedTenantChatSchema,
} from "@/lib/supabase/chat-data-schema";

/**
 * Fallback PG directo para tablas operativas que necesita el dashboard
 * cuando el tenant `erp_*` no esta expuesto en PostgREST.
 * Por ahora solo cubrimos productos y compras (alimentan DashInventario);
 * el resto de modulos (clientes/facturas/etc.) sigue por supabase.from
 * y degrada silenciosamente con query_errors si el schema no esta expuesto.
 */
async function fallbackProductosPg(schemaRaw: string, empresaId: string): Promise<unknown[]> {
  try {
    const schema = assertAllowedChatDataSchema(schemaRaw);
    const pool = getChatPostgresPool();
    if (!pool) return [];
    const t = quoteSchemaTable(schema, "productos");
    const { rows } = await pool.query(
      `SELECT * FROM ${t} WHERE empresa_id = $1::uuid`,
      [empresaId]
    );
    return rows;
  } catch (e) {
    console.error("[dashboard/tenant-tables] fallbackProductosPg", {
      schema: schemaRaw,
      message: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}

async function fallbackComprasPg(schemaRaw: string, empresaId: string): Promise<unknown[]> {
  try {
    const schema = assertAllowedChatDataSchema(schemaRaw);
    const pool = getChatPostgresPool();
    if (!pool) return [];
    const t = quoteSchemaTable(schema, "compras");
    const { rows } = await pool.query(
      `SELECT * FROM ${t} WHERE empresa_id = $1::uuid`,
      [empresaId]
    );
    return rows;
  } catch (e) {
    console.error("[dashboard/tenant-tables] fallbackComprasPg", {
      schema: schemaRaw,
      message: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}

async function fallbackVentasPg(schemaRaw: string, empresaId: string): Promise<unknown[]> {
  try {
    const schema = assertAllowedChatDataSchema(schemaRaw);
    const pool = getChatPostgresPool();
    if (!pool) return [];
    const t = quoteSchemaTable(schema, "ventas");
    const { rows } = await pool.query(
      `SELECT * FROM ${t} WHERE empresa_id = $1::uuid`,
      [empresaId]
    );
    return rows;
  } catch (e) {
    console.error("[dashboard/tenant-tables] fallbackVentasPg", {
      schema: schemaRaw,
      message: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}

async function fallbackVentasItemsPg(schemaRaw: string, empresaId: string): Promise<unknown[]> {
  try {
    const schema = assertAllowedChatDataSchema(schemaRaw);
    const pool = getChatPostgresPool();
    if (!pool) return [];
    const t = quoteSchemaTable(schema, "ventas_items");
    const { rows } = await pool.query(
      `SELECT * FROM ${t} WHERE empresa_id = $1::uuid`,
      [empresaId]
    );
    return rows;
  } catch (e) {
    console.error("[dashboard/tenant-tables] fallbackVentasItemsPg", {
      schema: schemaRaw,
      message: e instanceof Error ? e.message : String(e),
    });
    return [];
  }
}

type TableKey =
  | "clientes"
  | "facturas"
  | "pagos"
  | "tipificaciones"
  | "productos"
  | "ventas"
  | "ventas_items"
  | "compras"
  | "gastos"
  | "suscripciones"
  | "clientes_baja_mes"
  | "suscripciones_canceladas"
  | "notas_credito";

/**
 * Antes: si **cualquier** consulta fallaba (p. ej. `clientes.deleted_at` inexistente en un tenant clonado),
 * se respondía 400 y el dashboard quedaba **entero** vacío (incluido financiero con facturas/pagos válidos).
 * Ahora: se devuelven arrays por tabla; errores PostgREST van en `query_errors` sin tumbar el resto.
 */
function pickRows<T>(
  key: TableKey,
  result: { data: T[] | null; error: { message: string } | null },
  errors: Partial<Record<TableKey, string>>
): T[] {
  if (result.error) {
    errors[key] = result.error.message;
    return [];
  }
  return result.data ?? [];
}

/**
 * GET /api/dashboard/tenant-tables
 * Filas de tablas operativas para el dashboard (misma empresa, service role + schema tenant).
 * Evita depender del cliente browser + RLS en esquemas `erp_*`.
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { auth, supabase } = ctx;
    const empresaId = auth.empresa_id;

    const now = new Date();
    const { inicioYmd: inicioMes, finYmd: finMes } = ymdInicioFinMesLocal(now);

    const includeDebug = request.nextUrl.searchParams.get("debug") === "1";
    // Resolvemos el schema siempre — lo usamos para fallback PG directo
    // cuando se detecta un tenant no expuesto en PostgREST.
    const dataSchema = await fetchDataSchemaForEmpresaId(empresaId);
    const usarPg = isLikelyUnexposedTenantChatSchema(dataSchema);

    const [
      clientesQ,
      facturasQ,
      pagosQ,
      tipificacionesQ,
      productosQ,
      ventasQ,
      ventasItemsQ,
      comprasQ,
      gastosQ,
      suscripcionesDashQ,
      bajasQ,
      suscBajasQ,
      notaCreditoQ,
    ] = await Promise.all([
      /** Sin `.is("deleted_at", null)` en PostgREST: en tenants viejos la columna puede no existir y rompía todo el batch. */
      supabase.from("clientes").select("*").eq("empresa_id", empresaId),
      supabase.from("facturas").select("*").eq("empresa_id", empresaId),
      supabase.from("pagos").select("id, factura_id, monto, fecha_pago").eq("empresa_id", empresaId),
      supabase.from("tipificaciones").select("*").eq("empresa_id", empresaId),
      supabase.from("productos").select("*").eq("empresa_id", empresaId),
      supabase.from("ventas").select("*").eq("empresa_id", empresaId),
      supabase.from("ventas_items").select("*").eq("empresa_id", empresaId),
      supabase.from("compras").select("*").eq("empresa_id", empresaId),
      supabase.from("gastos").select("id, monto, fecha").eq("empresa_id", empresaId),
      supabase
        .from("suscripciones")
        .select("id, cliente_id, precio, moneda, fecha_inicio, created_at")
        .eq("empresa_id", empresaId),
      supabase
        .from("clientes")
        .select("id")
        .eq("empresa_id", empresaId)
        .not("baja_operativa_at", "is", null)
        .gte("baja_operativa_at", inicioMes)
        .lte("baja_operativa_at", finMes + "T23:59:59.999Z"),
      supabase
        .from("suscripciones")
        .select("cliente_id, precio")
        .eq("empresa_id", empresaId)
        .eq("estado", "cancelada"),
      supabase
        .from("nota_credito")
        .select("id, factura_id, monto, estado_erp")
        .eq("empresa_id", empresaId),
    ]);

    const queryErrors: Partial<Record<TableKey, string>> = {};

    // Productos / compras alimentan DashInventario. Si el supabase.from
    // tira Invalid schema (PGRST106) — caso erp_* no expuesto — caemos a PG directo.
    let productosRows = pickRows("productos", productosQ, queryErrors);
    if ((productosRows.length === 0 && queryErrors.productos) || (usarPg && productosRows.length === 0)) {
      productosRows = await fallbackProductosPg(dataSchema, empresaId);
      if (productosRows.length > 0) delete queryErrors.productos;
    }
    let comprasRows = pickRows("compras", comprasQ, queryErrors);
    if ((comprasRows.length === 0 && queryErrors.compras) || (usarPg && comprasRows.length === 0)) {
      comprasRows = await fallbackComprasPg(dataSchema, empresaId);
      if (comprasRows.length > 0) delete queryErrors.compras;
    }
    let ventasRows = pickRows("ventas", ventasQ, queryErrors);
    if ((ventasRows.length === 0 && queryErrors.ventas) || (usarPg && ventasRows.length === 0)) {
      ventasRows = await fallbackVentasPg(dataSchema, empresaId);
      if (ventasRows.length > 0) delete queryErrors.ventas;
    }
    let ventasItemsRows = pickRows("ventas_items", ventasItemsQ, queryErrors);
    if ((ventasItemsRows.length === 0 && queryErrors.ventas_items) || (usarPg && ventasItemsRows.length === 0)) {
      ventasItemsRows = await fallbackVentasItemsPg(dataSchema, empresaId);
      if (ventasItemsRows.length > 0) delete queryErrors.ventas_items;
    }

    const payload = {
      clientes: pickRows("clientes", clientesQ, queryErrors),
      facturas: pickRows("facturas", facturasQ, queryErrors),
      pagos: pickRows("pagos", pagosQ, queryErrors),
      tipificaciones: pickRows("tipificaciones", tipificacionesQ, queryErrors),
      productos: productosRows,
      ventas: ventasRows,
      ventas_items: ventasItemsRows,
      compras: comprasRows,
      gastos: pickRows("gastos", gastosQ, queryErrors),
      suscripciones: pickRows("suscripciones", suscripcionesDashQ, queryErrors),
      clientes_baja_mes: pickRows("clientes_baja_mes", bajasQ, queryErrors),
      suscripciones_canceladas: pickRows("suscripciones_canceladas", suscBajasQ, queryErrors),
      notas_credito: pickRows("notas_credito", notaCreditoQ, queryErrors),
      ...(Object.keys(queryErrors).length > 0 ? { query_errors: queryErrors } : {}),
      ...(includeDebug && dataSchema ? { _debug_data_schema: dataSchema, _debug_empresa_id: empresaId } : {}),
    };

    return NextResponse.json(successResponse(payload));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
