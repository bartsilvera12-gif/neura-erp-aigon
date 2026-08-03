import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  insertProducto,
  insertMovimientoInicial,
  rowToProductoApi,
  DuplicadoError,
} from "@/lib/inventario/server/productos-pg";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { queryWithRetry } from "@/lib/supabase/pg-retry";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";
import { normalizeUpperText, normalizeUpperCodigoBarras } from "@/lib/text/normalize";

/**
 * GET /api/productos — lista todos los productos activos via PG directo
 * (soporta tenants erp_* no expuestos por PostgREST).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const empresaId = ctx.auth.empresa_id;
    const schemaRaw = await fetchDataSchemaForEmpresaId(empresaId);
    const schema = assertAllowedChatDataSchema(schemaRaw);
    const pool = getChatPostgresPool();
    if (!pool) {
      return NextResponse.json(errorResponse("Pool no disponible."), { status: 500 });
    }
    const t = quoteSchemaTable(schema, "productos");
    const { rows } = await queryWithRetry(pool,
      `SELECT id, empresa_id, nombre, sku, costo_promedio, precio_venta, stock_actual, stock_minimo,
              unidad_medida, metodo_valuacion, activo, created_at, updated_at,
              codigo_barras, codigo_barras_interno, imagen_path, imagen_url,
              categoria_principal_id, ubicacion_principal_id, proveedor_principal_id
         FROM ${t}
        WHERE empresa_id = $1::uuid AND activo = true
        ORDER BY nombre`,
      [empresaId]
    );
    return NextResponse.json(successResponse({ productos: rows }));
  } catch (err) {
    console.error("[/api/productos GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar los productos."), { status: 500 });
  }
}
import {
  setCategoriaPrincipal,
  setStockUbicacionInicial,
} from "@/lib/inventario/server/catalogos-pg";

/** Valida que un id existe en la tabla indicada para la empresa. Devuelve true si OK, false si no. */
async function existsInTenant(
  schema: string,
  empresaId: string,
  table: "categorias_productos" | "inventario_ubicaciones" | "proveedores",
  id: string
): Promise<boolean> {
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Pool no disponible.");
  const s = assertAllowedChatDataSchema(schema);
  const t = quoteSchemaTable(s, table);
  const { rows } = await pool.query<{ ok: number }>(
    `SELECT 1 AS ok FROM ${t} WHERE id = $1::uuid AND empresa_id = $2::uuid LIMIT 1`,
    [id, empresaId]
  );
  return rows.length > 0;
}

/**
 * POST /api/productos
 *
 * Alta server-side via PG directo (soporta tenants `erp_*` NO expuestos por
 * PostgREST, evita PGRST106 "Invalid schema"). Si stock_actual > 0, graba
 * movimiento de inventario_inicial en el mismo handler.
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const empresaId = ctx.auth.empresa_id;
    const schema = await fetchDataSchemaForEmpresaId(empresaId);

    let body: Record<string, unknown>;
    try {
      body = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(errorResponse("JSON inválido."), { status: 400 });
    }

    const nombre = normalizeUpperText(body.nombre);
    const sku = normalizeUpperText(body.sku);
    if (!nombre) return NextResponse.json(errorResponse("El nombre es obligatorio."), { status: 400 });
    if (!sku) return NextResponse.json(errorResponse("El SKU es obligatorio."), { status: 400 });

    const codigoBarras = normalizeUpperCodigoBarras(body.codigo_barras);
    const codigoBarrasInterno = codigoBarras != null && body.codigo_barras_interno === true;
    const stockActual = Number(body.stock_actual ?? 0) || 0;
    const costoPromedio = Number(body.costo_promedio ?? 0) || 0;
    const stockMinimo = Number(body.stock_minimo ?? 0) || 0;
    const precioVenta = Number(body.precio_venta ?? 0) || 0;
    const unidadMedida = normalizeUpperText(body.unidad_medida) || "UNIDAD";
    const metodoValuacion =
      body.metodo_valuacion === "FIFO" || body.metodo_valuacion === "LIFO"
        ? (body.metodo_valuacion as "FIFO" | "LIFO")
        : "CPP";

    // Relaciones opcionales — validar ownership en mismo tenant
    const categoriaPrincipalId = body.categoria_principal_id ? String(body.categoria_principal_id) : null;
    const ubicacionPrincipalId = body.ubicacion_principal_id ? String(body.ubicacion_principal_id) : null;
    const proveedorPrincipalId = body.proveedor_principal_id ? String(body.proveedor_principal_id) : null;

    if (categoriaPrincipalId && !(await existsInTenant(schema, empresaId, "categorias_productos", categoriaPrincipalId))) {
      return NextResponse.json(errorResponse("La categoría seleccionada no existe."), { status: 400 });
    }
    if (ubicacionPrincipalId && !(await existsInTenant(schema, empresaId, "inventario_ubicaciones", ubicacionPrincipalId))) {
      return NextResponse.json(errorResponse("La ubicación seleccionada no existe."), { status: 400 });
    }
    if (proveedorPrincipalId && !(await existsInTenant(schema, empresaId, "proveedores", proveedorPrincipalId))) {
      return NextResponse.json(errorResponse("El proveedor seleccionado no existe."), { status: 400 });
    }

    try {
      const row = await insertProducto(schema, empresaId, {
        nombre,
        sku,
        costo_promedio: costoPromedio,
        precio_venta: precioVenta,
        stock_actual: stockActual,
        stock_minimo: stockMinimo,
        unidad_medida: unidadMedida,
        metodo_valuacion: metodoValuacion,
        codigo_barras: codigoBarras,
        codigo_barras_interno: codigoBarrasInterno,
        categoria_principal_id: categoriaPrincipalId,
        ubicacion_principal_id: ubicacionPrincipalId,
        proveedor_principal_id: proveedorPrincipalId,
      });

      // Inventario inicial (mismo schema, via PG directo).
      // Si falla aqui, el producto YA fue creado — registramos el error en
      // logs y devolvemos warning al cliente, pero no perdemos el producto.
      let movWarning: string | null = null;
      if (stockActual > 0) {
        try {
          await insertMovimientoInicial(schema, empresaId, {
            producto_id: row.id,
            producto_nombre: row.nombre,
            producto_sku: row.sku,
            cantidad: stockActual,
            costo_unitario: costoPromedio,
            created_by: ctx.auth.usuarioCatalogId ?? null,
            usuario_nombre: ctx.auth.user?.email ?? null,
          });
        } catch (movErr) {
          const message = movErr instanceof Error ? movErr.message : String(movErr);
          console.error("[/api/productos] inventario_inicial fallo", {
            schema,
            empresaId,
            productoId: row.id,
            message,
            code: (movErr as { code?: string })?.code,
            detail: (movErr as { detail?: string })?.detail,
            constraint: (movErr as { constraint?: string })?.constraint,
          });
          movWarning = "El producto se guardó pero no se pudo registrar el movimiento inicial de stock. Avisá al equipo técnico.";
        }
      }

      // Categoria principal: tambien insertar en puente producto_categorias.
      if (categoriaPrincipalId) {
        try {
          await setCategoriaPrincipal(schema, empresaId, row.id, categoriaPrincipalId);
        } catch (err) {
          console.error("[/api/productos] setCategoriaPrincipal fallo", {
            schema, empresaId, productoId: row.id,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }

      // Stock inicial por ubicacion (no reemplaza productos.stock_actual).
      if (ubicacionPrincipalId && stockActual > 0) {
        try {
          await setStockUbicacionInicial(schema, empresaId, row.id, ubicacionPrincipalId, stockActual);
        } catch (err) {
          console.error("[/api/productos] setStockUbicacionInicial fallo", {
            schema, empresaId, productoId: row.id,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }

      return NextResponse.json(
        successResponse({ producto: rowToProductoApi(row), warning: movWarning })
      );
    } catch (err) {
      if (err instanceof DuplicadoError) {
        return NextResponse.json(errorResponse(err.message), { status: 409 });
      }
      console.error("[/api/productos POST]", {
        schema,
        empresaId,
        message: err instanceof Error ? err.message : String(err),
        code: (err as { code?: string })?.code,
      });
      return NextResponse.json(
        errorResponse("No se pudo guardar el producto. Revisá los datos e intentá nuevamente."),
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("[/api/productos POST] outer", err instanceof Error ? err.message : err);
    return NextResponse.json(
      errorResponse("No se pudo guardar el producto. Revisá los datos e intentá nuevamente."),
      { status: 500 }
    );
  }
}
