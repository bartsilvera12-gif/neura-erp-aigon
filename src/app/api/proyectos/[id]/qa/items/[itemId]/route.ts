import { NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { errorResponse, successResponse } from "@/lib/api/response";
import { requireProyectosApiAccess } from "@/lib/proyectos/proyectos-auth";
import { bumpProyectoActividad, registrarEventoQA } from "@/lib/proyectos/qa-shared";

type ItemActual = {
  id: string;
  texto: string;
  comentario: string | null;
  completado: boolean;
  etapa_id: string;
};

export async function PATCH(
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
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body) return NextResponse.json(errorResponse("Body inválido"), { status: 400 });

    const sb = await getChatServiceClientForEmpresa(auth.empresaId);

    const { data: actual, error: errA } = await sb
      .from("proyecto_qa_items")
      .select("id, texto, comentario, completado, etapa_id")
      .eq("empresa_id", auth.empresaId)
      .eq("proyecto_id", pid)
      .eq("id", iid)
      .maybeSingle();
    if (errA) return NextResponse.json(errorResponse(errA.message), { status: 400 });
    if (!actual) return NextResponse.json(errorResponse("Ítem no encontrado"), { status: 404 });
    const prev = actual as ItemActual;

    const patch: Record<string, unknown> = {};
    const eventos: Array<{ accion: Parameters<typeof registrarEventoQA>[1]["accion"]; payload: Record<string, unknown> }> = [];

    if (typeof body.texto === "string") {
      const t = body.texto.trim();
      if (!t) return NextResponse.json(errorResponse("texto vacío"), { status: 400 });
      if (t !== prev.texto) {
        patch.texto = t;
        eventos.push({ accion: "item_editado", payload: { texto_anterior: prev.texto, texto_nuevo: t } });
      }
    }

    if (Object.prototype.hasOwnProperty.call(body, "comentario")) {
      const c = typeof body.comentario === "string" ? body.comentario.trim() : "";
      const nuevo = c || null;
      if (nuevo !== prev.comentario) {
        patch.comentario = nuevo;
        eventos.push({
          accion: "comentario_editado",
          payload: { comentario_anterior: prev.comentario, comentario_nuevo: nuevo },
        });
      }
    }

    if (typeof body.sort_order === "number") {
      patch.sort_order = Math.floor(body.sort_order);
    }

    if (typeof body.etapa_id === "string" && body.etapa_id.trim() && body.etapa_id !== prev.etapa_id) {
      const eid = body.etapa_id.trim();
      const { data: et } = await sb
        .from("proyecto_qa_etapas")
        .select("id")
        .eq("empresa_id", auth.empresaId)
        .eq("proyecto_id", pid)
        .eq("id", eid)
        .maybeSingle();
      if (!et) return NextResponse.json(errorResponse("Etapa destino no encontrada"), { status: 400 });
      patch.etapa_id = eid;
    }

    if (typeof body.completado === "boolean" && body.completado !== prev.completado) {
      patch.completado = body.completado;
      patch.completado_por = body.completado ? auth.usuarioCatalogId : null;
      patch.completado_at = body.completado ? new Date().toISOString() : null;
      eventos.push({
        accion: body.completado ? "item_marcado" : "item_desmarcado",
        payload: { texto: prev.texto },
      });
    }

    if (Object.keys(patch).length === 0) {
      return NextResponse.json(successResponse(prev));
    }

    const { data, error } = await sb
      .from("proyecto_qa_items")
      .update(patch)
      .eq("empresa_id", auth.empresaId)
      .eq("proyecto_id", pid)
      .eq("id", iid)
      .select("*");
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });

    for (const ev of eventos) {
      await registrarEventoQA(sb, {
        empresaId: auth.empresaId,
        proyectoId: pid,
        usuarioId: auth.usuarioCatalogId,
        accion: ev.accion,
        itemId: iid,
        etapaId: prev.etapa_id,
        payload: ev.payload,
      });
    }
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
  { params }: { params: Promise<{ id: string; itemId: string }> }
) {
  const auth = await requireProyectosApiAccess(request);
  if (!auth.ok) return NextResponse.json(errorResponse(auth.message), { status: auth.status });

  const { id, itemId } = await params;
  const pid = id?.trim() ?? "";
  const iid = itemId?.trim() ?? "";
  if (!pid || !iid) return NextResponse.json(errorResponse("ids obligatorios"), { status: 400 });

  try {
    const sb = await getChatServiceClientForEmpresa(auth.empresaId);
    const { data: item } = await sb
      .from("proyecto_qa_items")
      .select("texto, etapa_id")
      .eq("empresa_id", auth.empresaId)
      .eq("proyecto_id", pid)
      .eq("id", iid)
      .maybeSingle();

    const { error } = await sb
      .from("proyecto_qa_items")
      .delete()
      .eq("empresa_id", auth.empresaId)
      .eq("proyecto_id", pid)
      .eq("id", iid);
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });

    await registrarEventoQA(sb, {
      empresaId: auth.empresaId,
      proyectoId: pid,
      usuarioId: auth.usuarioCatalogId,
      accion: "item_eliminado",
      payload: { id: iid, texto: (item as { texto?: string } | null)?.texto ?? null },
    });
    await bumpProyectoActividad(sb, auth.empresaId, pid, auth.usuarioCatalogId);

    return NextResponse.json(successResponse({ id: iid }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
