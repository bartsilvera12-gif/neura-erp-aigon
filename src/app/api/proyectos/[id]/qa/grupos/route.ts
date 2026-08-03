import { NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { errorResponse, successResponse } from "@/lib/api/response";
import { requireProyectosApiAccess } from "@/lib/proyectos/proyectos-auth";
import { bumpProyectoActividad, registrarEventoQA, siguienteSortOrder } from "@/lib/proyectos/qa-shared";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireProyectosApiAccess(request);
  if (!auth.ok) return NextResponse.json(errorResponse(auth.message), { status: auth.status });

  const { id } = await params;
  const pid = id?.trim() ?? "";
  if (!pid) return NextResponse.json(errorResponse("id obligatorio"), { status: 400 });

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const nombre = typeof body?.nombre === "string" ? body.nombre.trim() : "";
    if (!nombre) return NextResponse.json(errorResponse("nombre obligatorio"), { status: 400 });

    const descripcion = typeof body?.descripcion === "string" ? body.descripcion.trim() : "";
    const sb = await getChatServiceClientForEmpresa(auth.empresaId);

    const sort_order = await siguienteSortOrder(sb, "proyecto_qa_grupos", auth.empresaId, {
      proyecto_id: pid,
    });

    const { data, error } = await sb
      .from("proyecto_qa_grupos")
      .insert({
        empresa_id: auth.empresaId,
        proyecto_id: pid,
        nombre,
        descripcion: descripcion || null,
        sort_order,
        created_by: auth.usuarioCatalogId,
      })
      .select("*");

    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    const row = Array.isArray(data) ? data[0] : data;

    await registrarEventoQA(sb, {
      empresaId: auth.empresaId,
      proyectoId: pid,
      usuarioId: auth.usuarioCatalogId,
      accion: "grupo_creado",
      grupoId: row?.id,
      payload: { nombre },
    });
    await bumpProyectoActividad(sb, auth.empresaId, pid, auth.usuarioCatalogId);

    return NextResponse.json(successResponse(row));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
