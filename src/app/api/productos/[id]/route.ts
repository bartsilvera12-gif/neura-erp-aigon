import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  updateProductoPg,
  rowToProductoApi,
  getProductoPg,
  DuplicadoError,
} from "@/lib/inventario/server/productos-pg";

/**
 * GET /api/productos/[id] — lee un producto via PG directo.
 */
export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const row = await getProductoPg(schema, ctx.auth.empresa_id, id);
    if (!row) return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    return NextResponse.json(successResponse({ producto: rowToProductoApi(row) }));
  } catch (err) {
    console.error("[/api/productos/[id] GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo cargar el producto."), { status: 500 });
  }
}
import { setCategoriaPrincipal } from "@/lib/inventario/server/catalogos-pg";
import { normalizeUpperText, normalizeUpperCodigoBarras } from "@/lib/text/normalize";
import { getChatPostgresPool, quoteSchemaTable } from "@/lib/supabase/chat-pg-pool";
import { assertAllowedChatDataSchema } from "@/lib/supabase/chat-data-schema";

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
 * PATCH /api/productos/[id]
 *
 * Actualizacion parcial via PG directo (soporta tenants no expuestos).
 * Aplica solo los campos presentes en el body. La capa PG valida ownership
 * (id + empresa_id en el WHERE).
 */
export async function PATCH(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await ctxParams.params;
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

    const patch: Parameters<typeof updateProductoPg>[3] = {};
    if (body.nombre !== undefined) patch.nombre = normalizeUpperText(body.nombre);
    if (body.sku !== undefined) patch.sku = normalizeUpperText(body.sku);
    if (body.costo_promedio !== undefined) patch.costo_promedio = Number(body.costo_promedio) || 0;
    if (body.precio_venta !== undefined) patch.precio_venta = Number(body.precio_venta) || 0;
    if (body.stock_actual !== undefined) patch.stock_actual = Number(body.stock_actual) || 0;
    if (body.stock_minimo !== undefined) patch.stock_minimo = Number(body.stock_minimo) || 0;
    if (body.unidad_medida !== undefined) patch.unidad_medida = normalizeUpperText(body.unidad_medida) || "UNIDAD";
    if (body.metodo_valuacion !== undefined) {
      const mv = body.metodo_valuacion;
      patch.metodo_valuacion = mv === "FIFO" || mv === "LIFO" ? mv : "CPP";
    }
    if (body.codigo_barras !== undefined) {
      patch.codigo_barras = normalizeUpperCodigoBarras(body.codigo_barras);
    }
    if (body.codigo_barras_interno !== undefined) {
      patch.codigo_barras_interno = body.codigo_barras_interno === true;
    }
    if (body.imagen_path !== undefined) {
      const v = body.imagen_path != null ? String(body.imagen_path) : "";
      patch.imagen_path = v || null;
    }
    if (body.imagen_url !== undefined) {
      const v = body.imagen_url != null ? String(body.imagen_url) : "";
      patch.imagen_url = v || null;
    }

    // Relaciones opcionales — validar ownership
    let categoriaCambia = false;
    let categoriaNueva: string | null = null;
    if (body.categoria_principal_id !== undefined) {
      const v = body.categoria_principal_id == null ? null : String(body.categoria_principal_id);
      if (v && !(await existsInTenant(schema, empresaId, "categorias_productos", v))) {
        return NextResponse.json(errorResponse("La categoría seleccionada no existe."), { status: 400 });
      }
      patch.categoria_principal_id = v;
      categoriaCambia = true;
      categoriaNueva = v;
    }
    if (body.ubicacion_principal_id !== undefined) {
      const v = body.ubicacion_principal_id == null ? null : String(body.ubicacion_principal_id);
      if (v && !(await existsInTenant(schema, empresaId, "inventario_ubicaciones", v))) {
        return NextResponse.json(errorResponse("La ubicación seleccionada no existe."), { status: 400 });
      }
      patch.ubicacion_principal_id = v;
    }
    if (body.proveedor_principal_id !== undefined) {
      const v = body.proveedor_principal_id == null ? null : String(body.proveedor_principal_id);
      if (v && !(await existsInTenant(schema, empresaId, "proveedores", v))) {
        return NextResponse.json(errorResponse("El proveedor seleccionado no existe."), { status: 400 });
      }
      patch.proveedor_principal_id = v;
    }

    try {
      const row = await updateProductoPg(schema, empresaId, id, patch);
      if (!row) {
        return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
      }
      // Sincronizar categoria principal en puente producto_categorias
      if (categoriaCambia) {
        try {
          await setCategoriaPrincipal(schema, empresaId, id, categoriaNueva);
        } catch (err) {
          console.error("[/api/productos/[id]] setCategoriaPrincipal fallo", {
            schema, empresaId, id,
            message: err instanceof Error ? err.message : String(err),
          });
        }
      }
      return NextResponse.json(successResponse({ producto: rowToProductoApi(row) }));
    } catch (err) {
      if (err instanceof DuplicadoError) {
        return NextResponse.json(errorResponse(err.message), { status: 409 });
      }
      console.error("[/api/productos/[id] PATCH]", {
        schema,
        empresaId,
        id,
        message: err instanceof Error ? err.message : String(err),
        code: (err as { code?: string })?.code,
      });
      return NextResponse.json(
        errorResponse("No se pudo actualizar el producto. Revisá los datos e intentá nuevamente."),
        { status: 500 }
      );
    }
  } catch (err) {
    console.error("[/api/productos/[id] PATCH] outer", err instanceof Error ? err.message : err);
    return NextResponse.json(
      errorResponse("No se pudo actualizar el producto."),
      { status: 500 }
    );
  }
}
