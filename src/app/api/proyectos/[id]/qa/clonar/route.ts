import { NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { errorResponse, successResponse } from "@/lib/api/response";
import { requireProyectosApiAccess } from "@/lib/proyectos/proyectos-auth";
import { bumpProyectoActividad, registrarEventoQA } from "@/lib/proyectos/qa-shared";

// Clona la estructura de QA (grupos + etapas + ítems sin marcar) desde otro proyecto.
// No copia comentarios, marcaciones, adjuntos ni historial — es un "molde".
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireProyectosApiAccess(request);
  if (!auth.ok) return NextResponse.json(errorResponse(auth.message), { status: auth.status });

  const { id } = await params;
  const pid = id?.trim() ?? "";
  if (!pid) return NextResponse.json(errorResponse("id obligatorio"), { status: 400 });

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    const fromId = typeof body?.from_proyecto_id === "string" ? body.from_proyecto_id.trim() : "";
    if (!fromId) return NextResponse.json(errorResponse("from_proyecto_id obligatorio"), { status: 400 });
    if (fromId === pid) {
      return NextResponse.json(errorResponse("No se puede clonar desde el mismo proyecto"), { status: 400 });
    }

    const sb = await getChatServiceClientForEmpresa(auth.empresaId);

    const [{ data: grupos }, { data: etapas }, { data: items }] = await Promise.all([
      sb
        .from("proyecto_qa_grupos")
        .select("id, nombre, descripcion, sort_order")
        .eq("empresa_id", auth.empresaId)
        .eq("proyecto_id", fromId)
        .order("sort_order", { ascending: true }),
      sb
        .from("proyecto_qa_etapas")
        .select("id, grupo_id, nombre, descripcion, sort_order")
        .eq("empresa_id", auth.empresaId)
        .eq("proyecto_id", fromId)
        .order("sort_order", { ascending: true }),
      sb
        .from("proyecto_qa_items")
        .select("id, etapa_id, texto, sort_order")
        .eq("empresa_id", auth.empresaId)
        .eq("proyecto_id", fromId)
        .order("sort_order", { ascending: true }),
    ]);

    const gruposArr = (grupos ?? []) as Array<{ id: string; nombre: string; descripcion: string | null; sort_order: number }>;
    if (gruposArr.length === 0) {
      return NextResponse.json(errorResponse("El proyecto de origen no tiene grupos de QA"), { status: 400 });
    }

    const grupoMap: Record<string, string> = {};
    for (const g of gruposArr) {
      const { data: ins, error } = await sb
        .from("proyecto_qa_grupos")
        .insert({
          empresa_id: auth.empresaId,
          proyecto_id: pid,
          nombre: g.nombre,
          descripcion: g.descripcion,
          sort_order: g.sort_order,
          created_by: auth.usuarioCatalogId,
        })
        .select("id");
      if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
      const nuevo = (ins as Array<{ id: string }> | null)?.[0]?.id;
      if (nuevo) grupoMap[g.id] = nuevo;
    }

    const etapaMap: Record<string, string> = {};
    for (const e of (etapas ?? []) as Array<{ id: string; grupo_id: string; nombre: string; descripcion: string | null; sort_order: number }>) {
      const nuevoGrupo = grupoMap[e.grupo_id];
      if (!nuevoGrupo) continue;
      const { data: ins, error } = await sb
        .from("proyecto_qa_etapas")
        .insert({
          empresa_id: auth.empresaId,
          proyecto_id: pid,
          grupo_id: nuevoGrupo,
          nombre: e.nombre,
          descripcion: e.descripcion,
          sort_order: e.sort_order,
          created_by: auth.usuarioCatalogId,
        })
        .select("id");
      if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
      const nuevo = (ins as Array<{ id: string }> | null)?.[0]?.id;
      if (nuevo) etapaMap[e.id] = nuevo;
    }

    const itemsArr = (items ?? []) as Array<{ etapa_id: string; texto: string; sort_order: number }>;
    if (itemsArr.length > 0) {
      const payload = itemsArr
        .map((it) => ({
          empresa_id: auth.empresaId,
          proyecto_id: pid,
          etapa_id: etapaMap[it.etapa_id],
          texto: it.texto,
          sort_order: it.sort_order,
          completado: false,
          created_by: auth.usuarioCatalogId,
        }))
        .filter((row) => row.etapa_id);
      if (payload.length > 0) {
        const { error } = await sb.from("proyecto_qa_items").insert(payload);
        if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
      }
    }

    await registrarEventoQA(sb, {
      empresaId: auth.empresaId,
      proyectoId: pid,
      usuarioId: auth.usuarioCatalogId,
      accion: "qa_clonado",
      payload: {
        from_proyecto_id: fromId,
        grupos: gruposArr.length,
        etapas: (etapas ?? []).length,
        items: itemsArr.length,
      },
    });
    await bumpProyectoActividad(sb, auth.empresaId, pid, auth.usuarioCatalogId);

    return NextResponse.json(
      successResponse({
        grupos: gruposArr.length,
        etapas: (etapas ?? []).length,
        items: itemsArr.length,
      })
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
