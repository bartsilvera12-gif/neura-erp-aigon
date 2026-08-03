import { NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { errorResponse, successResponse } from "@/lib/api/response";
import { requireProyectosApiAccess } from "@/lib/proyectos/proyectos-auth";
import {
  PROYECTOS_ARCHIVO_MAX_BYTES,
  PROYECTOS_BUCKET,
  ensureProyectosBucket,
} from "@/lib/proyectos/proyectos-archivos-storage";
import {
  bumpProyectoActividad,
  buildQAArchivoPath,
  registrarEventoQA,
} from "@/lib/proyectos/qa-shared";

const ARCHIVO_SELECT = "id, item_id, nombre, mime_type, size_bytes, uploaded_by, created_at";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const auth = await requireProyectosApiAccess(request);
  if (!auth.ok) return NextResponse.json(errorResponse(auth.message), { status: auth.status });

  const { id, itemId } = await params;
  const pid = id?.trim() ?? "";
  const iid = itemId?.trim() ?? "";
  if (!pid || !iid) return NextResponse.json(errorResponse("ids obligatorios"), { status: 400 });

  try {
    const form = await request.formData().catch(() => null);
    const file = form?.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json(errorResponse("Archivo requerido"), { status: 400 });
    }
    if (file.size === 0) {
      return NextResponse.json(errorResponse("El archivo está vacío"), { status: 400 });
    }
    if (file.size > PROYECTOS_ARCHIVO_MAX_BYTES) {
      return NextResponse.json(
        errorResponse(
          `El archivo supera el máximo de ${Math.round(PROYECTOS_ARCHIVO_MAX_BYTES / (1024 * 1024))} MB`
        ),
        { status: 400 }
      );
    }

    const nombre = (file.name || "archivo").trim().slice(0, 200) || "archivo";
    const mimeType = file.type || "application/octet-stream";

    const sb = await getChatServiceClientForEmpresa(auth.empresaId);

    const { data: item, error: errI } = await sb
      .from("proyecto_qa_items")
      .select("id, etapa_id")
      .eq("empresa_id", auth.empresaId)
      .eq("proyecto_id", pid)
      .eq("id", iid)
      .maybeSingle();
    if (errI) return NextResponse.json(errorResponse(errI.message), { status: 400 });
    if (!item) return NextResponse.json(errorResponse("Ítem no encontrado"), { status: 404 });

    await ensureProyectosBucket(sb);

    const storagePath = buildQAArchivoPath(auth.empresaId, pid, iid, nombre);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const up = await sb.storage.from(PROYECTOS_BUCKET).upload(storagePath, bytes, {
      contentType: mimeType,
      upsert: false,
    });
    if (up.error) return NextResponse.json(errorResponse(up.error.message), { status: 400 });

    const { data, error } = await sb
      .from("proyecto_qa_item_archivos")
      .insert({
        empresa_id: auth.empresaId,
        proyecto_id: pid,
        item_id: iid,
        nombre,
        storage_bucket: PROYECTOS_BUCKET,
        storage_path: storagePath,
        mime_type: mimeType,
        size_bytes: file.size,
        uploaded_by: auth.usuarioCatalogId,
      })
      .select(ARCHIVO_SELECT);
    if (error) {
      await sb.storage.from(PROYECTOS_BUCKET).remove([storagePath]).catch(() => {});
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }

    await registrarEventoQA(sb, {
      empresaId: auth.empresaId,
      proyectoId: pid,
      usuarioId: auth.usuarioCatalogId,
      accion: "archivo_subido",
      itemId: iid,
      etapaId: (item as { etapa_id?: string }).etapa_id ?? null,
      payload: { nombre, size: file.size },
    });
    await bumpProyectoActividad(sb, auth.empresaId, pid, auth.usuarioCatalogId);

    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json(successResponse(row));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
