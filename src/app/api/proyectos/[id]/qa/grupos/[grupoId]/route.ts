import { NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { errorResponse, successResponse } from "@/lib/api/response";
import { requireProyectosApiAccess } from "@/lib/proyectos/proyectos-auth";
import { bumpProyectoActividad, registrarEventoQA } from "@/lib/proyectos/qa-shared";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; grupoId: string }> }
) {
  const auth = await requireProyectosApiAccess(request);
  if (!auth.ok) return NextResponse.json(errorResponse(auth.message), { status: auth.status });

  const { id, grupoId } = await params;
  const pid = id?.trim() ?? "";
  const gid = grupoId?.trim() ?? "";
  if (!pid || !gid) return NextResponse.json(errorResponse("ids obligatorios"), { status: 400 });

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const patch: Record<string, unknown> = {};
    if (typeof body?.nombre === "string") {
      const n = body.nombre.trim();
      if (!n) return NextResponse.json(errorResponse("nombre vacío"), { status: 400 });
      patch.nombre = n;
    }
    if (typeof body?.descripcion === "string") {
      const d = body.descripcion.trim();
      patch.descripcion = d || null;
    }
    if (typeof body?.sort_order === "number") {
      patch.sort_order = Math.floor(body.sort_order);
    }
    if (Object.keys(patch).length === 0) {
      return NextResponse.json(errorResponse("Nada para actualizar"), { status: 400 });
    }

    const sb = await getChatServiceClientForEmpresa(auth.empresaId);
    const { data, error } = await sb
      .from("proyecto_qa_grupos")
      .update(patch)
      .eq("empresa_id", auth.empresaId)
      .eq("proyecto_id", pid)
      .eq("id", gid)
      .select("*");
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });

    await registrarEventoQA(sb, {
      empresaId: auth.empresaId,
      proyectoId: pid,
      usuarioId: auth.usuarioCatalogId,
      accion: "grupo_editado",
      grupoId: gid,
      payload: patch,
    });
    await bumpProyectoActividad(sb, auth.empresaId, pid, auth.usuarioCatalogId);

    const row = Array.isArray(data) ? data[0] : data;
    return NextResponse.json(successResponse(row));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; grupoId: string }> }
) {
  const auth = await requireProyectosApiAccess(request);
  if (!auth.ok) return NextResponse.json(errorResponse(auth.message), { status: auth.status });

  const { id, grupoId } = await params;
  const pid = id?.trim() ?? "";
  const gid = grupoId?.trim() ?? "";
  if (!pid || !gid) return NextResponse.json(errorResponse("ids obligatorios"), { status: 400 });

  try {
    const sb = await getChatServiceClientForEmpresa(auth.empresaId);
    const { data: grupo } = await sb
      .from("proyecto_qa_grupos")
      .select("nombre")
      .eq("empresa_id", auth.empresaId)
      .eq("proyecto_id", pid)
      .eq("id", gid)
      .maybeSingle();

    const { error } = await sb
      .from("proyecto_qa_grupos")
      .delete()
      .eq("empresa_id", auth.empresaId)
      .eq("proyecto_id", pid)
      .eq("id", gid);
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });

    await registrarEventoQA(sb, {
      empresaId: auth.empresaId,
      proyectoId: pid,
      usuarioId: auth.usuarioCatalogId,
      accion: "grupo_eliminado",
      payload: { id: gid, nombre: (grupo as { nombre?: string } | null)?.nombre ?? null },
    });
    await bumpProyectoActividad(sb, auth.empresaId, pid, auth.usuarioCatalogId);

    return NextResponse.json(successResponse({ id: gid }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
