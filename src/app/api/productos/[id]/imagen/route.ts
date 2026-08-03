import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import {
  ALLOWED_IMAGE_MIME,
  MAX_IMAGE_BYTES,
  PRODUCTOS_IMAGENES_BUCKET,
  buildProductoImagenPath,
  ensureProductosImagenesBucket,
  pathBelongsToEmpresa,
  signProductoImagen,
} from "@/lib/inventario/imagen-storage";
import { getProductoPg, updateProductoPg } from "@/lib/inventario/server/productos-pg";

/**
 * GET /api/productos/[id]/imagen — signed URL fresca (TTL 1h).
 * Productos via PG directo (multi-schema), Storage via Supabase Storage
 * (no depende de PostgREST schema).
 */
export async function GET(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productoId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { supabase, auth } = ctx;
    const empresaId = auth.empresa_id;
    const schema = await fetchDataSchemaForEmpresaId(empresaId);

    const prod = await getProductoPg(schema, empresaId, productoId);
    if (!prod) {
      return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    }
    const signed = prod.imagen_path
      ? await signProductoImagen(supabase, prod.imagen_path, 3600)
      : null;
    return NextResponse.json(
      successResponse({ imagen_path: prod.imagen_path, imagen_url: signed })
    );
  } catch (err) {
    console.error("[/api/productos/[id]/imagen GET]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo obtener la imagen."), { status: 500 });
  }
}

/**
 * POST: upload (multipart). Sube al bucket privado y persiste imagen_path
 * via PG directo en la tabla productos del tenant.
 */
export async function POST(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productoId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { supabase, auth } = ctx;
    const empresaId = auth.empresa_id;
    const schema = await fetchDataSchemaForEmpresaId(empresaId);

    // 1) Ownership via PG
    const prod = await getProductoPg(schema, empresaId, productoId);
    if (!prod) {
      return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    }

    // 2) Leer archivo
    const form = await request.formData();
    const file = form.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(errorResponse("Falta el archivo (campo 'file')."), { status: 400 });
    }
    if (!ALLOWED_IMAGE_MIME.has(file.type)) {
      return NextResponse.json(
        errorResponse("Formato no permitido. Usá JPG, PNG o WebP."),
        { status: 400 }
      );
    }
    if (file.size > MAX_IMAGE_BYTES) {
      const mb = (MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0);
      return NextResponse.json(
        errorResponse(`Imagen demasiado grande (máx. ${mb} MB).`),
        { status: 413 }
      );
    }

    // 3) Bucket idempotente
    await ensureProductosImagenesBucket(supabase);

    // 4) Borrar imagen anterior si pertenece a la empresa
    if (prod.imagen_path && pathBelongsToEmpresa(prod.imagen_path, empresaId)) {
      await supabase.storage.from(PRODUCTOS_IMAGENES_BUCKET).remove([prod.imagen_path]);
    }

    // 5) Upload nuevo
    const path = buildProductoImagenPath(empresaId, productoId, file.type);
    const buf = Buffer.from(await file.arrayBuffer());
    const up = await supabase.storage
      .from(PRODUCTOS_IMAGENES_BUCKET)
      .upload(path, buf, { contentType: file.type, upsert: true });
    if (up.error) {
      console.error("[/api/productos/[id]/imagen POST] upload", { schema, empresaId, productoId, message: up.error.message });
      return NextResponse.json(errorResponse("No se pudo subir la imagen."), { status: 500 });
    }

    // 6) Persistir imagen_path via PG directo
    const updated = await updateProductoPg(schema, empresaId, productoId, {
      imagen_path: path,
      imagen_url: null,
    });
    if (!updated) {
      // No deberia ocurrir (ya validamos ownership), pero por las dudas.
      return NextResponse.json(errorResponse("No se pudo asociar la imagen al producto."), { status: 500 });
    }

    // 7) Signed URL para preview
    const signed = await signProductoImagen(supabase, path, 3600);
    return NextResponse.json(successResponse({ imagen_path: path, imagen_url: signed }));
  } catch (err) {
    console.error("[/api/productos/[id]/imagen POST] outer", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo subir la imagen."), { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  ctxParams: { params: Promise<{ id: string }> }
) {
  try {
    const { id: productoId } = await ctxParams.params;
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { supabase, auth } = ctx;
    const empresaId = auth.empresa_id;
    const schema = await fetchDataSchemaForEmpresaId(empresaId);

    const prod = await getProductoPg(schema, empresaId, productoId);
    if (!prod) {
      return NextResponse.json(errorResponse(API_ERRORS.NOT_FOUND), { status: 404 });
    }

    if (prod.imagen_path && pathBelongsToEmpresa(prod.imagen_path, empresaId)) {
      await supabase.storage.from(PRODUCTOS_IMAGENES_BUCKET).remove([prod.imagen_path]);
    }

    await updateProductoPg(schema, empresaId, productoId, {
      imagen_path: null,
      imagen_url: null,
    });

    return NextResponse.json(successResponse({ imagen_path: null, imagen_url: null }));
  } catch (err) {
    console.error("[/api/productos/[id]/imagen DELETE]", err instanceof Error ? err.message : err);
    return NextResponse.json(errorResponse("No se pudo quitar la imagen."), { status: 500 });
  }
}
