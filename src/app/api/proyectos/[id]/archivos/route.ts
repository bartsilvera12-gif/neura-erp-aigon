import { NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { errorResponse, successResponse } from "@/lib/api/response";
import { requireProyectosApiAccess } from "@/lib/proyectos/proyectos-auth";
import {
  PROYECTOS_ARCHIVO_MAX_BYTES,
  PROYECTOS_BUCKET,
  buildProyectoArchivoPath,
  ensureProyectosBucket,
} from "@/lib/proyectos/proyectos-archivos-storage";

const ARCHIVO_SELECT = "id, nombre, mime_type, size_bytes, uploaded_by, created_at";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireProyectosApiAccess(request);
  if (!auth.ok) {
    return NextResponse.json(errorResponse(auth.message), { status: auth.status });
  }

  const { id } = await params;
  const pid = id?.trim() ?? "";
  if (!pid) return NextResponse.json(errorResponse("id obligatorio"), { status: 400 });

  try {
    const sb = await getChatServiceClientForEmpresa(auth.empresaId);
    const { data, error } = await sb
      .from("proyecto_archivos")
      .select(ARCHIVO_SELECT)
      .eq("empresa_id", auth.empresaId)
      .eq("proyecto_id", pid)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse(data ?? []));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireProyectosApiAccess(request);
  if (!auth.ok) {
    return NextResponse.json(errorResponse(auth.message), { status: auth.status });
  }

  const { id } = await params;
  const pid = id?.trim() ?? "";
  if (!pid) return NextResponse.json(errorResponse("id obligatorio"), { status: 400 });

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
        errorResponse(`El archivo supera el máximo de ${Math.round(PROYECTOS_ARCHIVO_MAX_BYTES / (1024 * 1024))} MB`),
        { status: 400 }
      );
    }

    const nombre = (file.name || "archivo").trim().slice(0, 200) || "archivo";
    const mimeType = file.type || "application/octet-stream";

    const sb = await getChatServiceClientForEmpresa(auth.empresaId);

    // Confirmamos que el proyecto existe y pertenece a la empresa antes de subir nada.
    const { data: proyecto, error: eProyecto } = await sb
      .from("proyectos")
      .select("id")
      .eq("empresa_id", auth.empresaId)
      .eq("id", pid)
      .maybeSingle();
    if (eProyecto) return NextResponse.json(errorResponse(eProyecto.message), { status: 400 });
    if (!proyecto) return NextResponse.json(errorResponse("Proyecto no encontrado"), { status: 404 });

    await ensureProyectosBucket(sb);

    const storagePath = buildProyectoArchivoPath(auth.empresaId, pid, nombre);
    const bytes = new Uint8Array(await file.arrayBuffer());
    const up = await sb.storage.from(PROYECTOS_BUCKET).upload(storagePath, bytes, {
      contentType: mimeType,
      upsert: false,
    });
    if (up.error) {
      return NextResponse.json(errorResponse(up.error.message), { status: 400 });
    }

    const { data: inserted, error: eInsert } = await sb
      .from("proyecto_archivos")
      .insert({
        empresa_id: auth.empresaId,
        proyecto_id: pid,
        nombre,
        storage_bucket: PROYECTOS_BUCKET,
        storage_path: storagePath,
        mime_type: mimeType,
        size_bytes: file.size,
        uploaded_by: auth.usuarioCatalogId,
      })
      .select(ARCHIVO_SELECT);

    if (eInsert) {
      // El registro falló: no dejamos el objeto huérfano en el storage.
      await sb.storage.from(PROYECTOS_BUCKET).remove([storagePath]).catch(() => {});
      return NextResponse.json(errorResponse(eInsert.message), { status: 400 });
    }

    await sb
      .from("proyectos")
      .update({ last_activity_at: new Date().toISOString(), updated_by: auth.usuarioCatalogId })
      .eq("empresa_id", auth.empresaId)
      .eq("id", pid);

    const row = Array.isArray(inserted) ? inserted[0] : inserted;
    return NextResponse.json(successResponse(row));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
