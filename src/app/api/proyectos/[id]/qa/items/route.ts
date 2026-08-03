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
    const texto = typeof body?.texto === "string" ? body.texto.trim() : "";
    const etapa_id = typeof body?.etapa_id === "string" ? body.etapa_id.trim() : "";
    if (!texto) return NextResponse.json(errorResponse("texto obligatorio"), { status: 400 });
    if (!etapa_id) return NextResponse.json(errorResponse("etapa_id obligatorio"), { status: 400 });

    const sb = await getChatServiceClientForEmpresa(auth.empresaId);
    const { data: etapa, error: errE } = await sb
      .from("proyecto_qa_etapas")
      .select("id, grupo_id")
      .eq("empresa_id", auth.empresaId)
      .eq("proyecto_id", pid)
      .eq("id", etapa_id)
      .maybeSingle();
    if (errE) return NextResponse.json(errorResponse(errE.message), { status: 400 });
    if (!etapa) return NextResponse.json(errorResponse("Etapa no encontrada"), { status: 404 });

    const sort_order = await siguienteSortOrder(sb, "proyecto_qa_items", auth.empresaId, {
      etapa_id,
    });

    const { data, error } = await sb
      .from("proyecto_qa_items")
      .insert({
        empresa_id: auth.empresaId,
        proyecto_id: pid,
        etapa_id,
        texto,
        sort_order,
        completado: false,
        created_by: auth.usuarioCatalogId,
      })
      .select("*");
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });

    const row = Array.isArray(data) ? data[0] : data;
    await registrarEventoQA(sb, {
      empresaId: auth.empresaId,
      proyectoId: pid,
      usuarioId: auth.usuarioCatalogId,
      accion: "item_creado",
      etapaId: etapa_id,
      grupoId: (etapa as { grupo_id?: string }).grupo_id ?? null,
      itemId: row?.id,
      payload: { texto },
    });
    await bumpProyectoActividad(sb, auth.empresaId, pid, auth.usuarioCatalogId);

    return NextResponse.json(successResponse(row));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
