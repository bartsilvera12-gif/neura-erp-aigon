import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  listCategoriasProducto,
  insertCategoriaProducto,
} from "@/lib/inventario/server/catalogos-pg";
import { normalizeUpperText, normalizeUpperNullable } from "@/lib/text/normalize";

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const url = new URL(request.url);
    const todas = url.searchParams.get("todas") === "1";
    const rows = await listCategoriasProducto(schema, ctx.auth.empresa_id, { soloActivas: !todas });
    return NextResponse.json(successResponse({ categorias: rows }));
  } catch (err) {
    console.error("[/api/inventario/categorias GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudieron cargar las categorías."), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    const schema = await fetchDataSchemaForEmpresaId(ctx.auth.empresa_id);
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const nombre = normalizeUpperText(body.nombre);
    if (!nombre) return NextResponse.json(errorResponse("El nombre es obligatorio."), { status: 400 });
    try {
      const row = await insertCategoriaProducto(schema, ctx.auth.empresa_id, {
        nombre,
        codigo: normalizeUpperNullable(body.codigo),
        descripcion: normalizeUpperNullable(body.descripcion),
        parent_id: body.parent_id == null ? null : String(body.parent_id),
        activo: body.activo === false ? false : true,
      });
      return NextResponse.json(successResponse({ categoria: row }));
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      if (/uq_categorias_productos_empresa_nombre|duplicate/i.test(msg)) {
        return NextResponse.json(
          errorResponse("Ya existe una categoría con ese nombre."),
          { status: 409 }
        );
      }
      console.error("[/api/inventario/categorias POST]", { schema, msg });
      return NextResponse.json(errorResponse("No se pudo crear la categoría."), { status: 500 });
    }
  } catch (err) {
    console.error("[/api/inventario/categorias POST] outer", err);
    return NextResponse.json(errorResponse("No se pudo crear la categoría."), { status: 500 });
  }
}
