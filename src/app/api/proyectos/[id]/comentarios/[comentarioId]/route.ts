import { NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { errorResponse, successResponse } from "@/lib/api/response";
import { requireProyectosApiAccess } from "@/lib/proyectos/proyectos-auth";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string; comentarioId: string }> }
) {
  const auth = await requireProyectosApiAccess(request);
  if (!auth.ok) {
    return NextResponse.json(errorResponse(auth.message), { status: auth.status });
  }

  const { id, comentarioId } = await params;
  const pid = id?.trim() ?? "";
  const cid = comentarioId?.trim() ?? "";
  if (!pid || !cid) {
    return NextResponse.json(errorResponse("ids obligatorios"), { status: 400 });
  }

  try {
    const body = (await request.json().catch(() => null)) as { comentario?: string } | null;
    const texto = typeof body?.comentario === "string" ? body.comentario.trim() : "";
    if (!texto) {
      return NextResponse.json(errorResponse("comentario obligatorio"), { status: 400 });
    }

    const sb = await getChatServiceClientForEmpresa(auth.empresaId);

    const { data: actual, error: eActual } = await sb
      .from("proyecto_comentarios")
      .select("usuario_id")
      .eq("empresa_id", auth.empresaId)
      .eq("proyecto_id", pid)
      .eq("id", cid)
      .maybeSingle();

    if (eActual) return NextResponse.json(errorResponse(eActual.message), { status: 400 });
    if (!actual) return NextResponse.json(errorResponse("No encontrado"), { status: 404 });
    if ((actual as { usuario_id?: string }).usuario_id !== auth.usuarioCatalogId) {
      return NextResponse.json(
        errorResponse("Solo el autor puede editar este comentario"),
        { status: 403 }
      );
    }

    const { data, error } = await sb
      .from("proyecto_comentarios")
      .update({ comentario: texto })
      .eq("empresa_id", auth.empresaId)
      .eq("proyecto_id", pid)
      .eq("id", cid)
      .select("*");

    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return NextResponse.json(errorResponse("No encontrado"), { status: 404 });

    await sb
      .from("proyectos")
      .update({ last_activity_at: new Date().toISOString(), updated_by: auth.usuarioCatalogId })
      .eq("empresa_id", auth.empresaId)
      .eq("id", pid);

    const catalog = createServiceRoleClient();
    const { data: u } = await catalog
      .from("usuarios")
      .select("nombre")
      .eq("id", auth.usuarioCatalogId)
      .maybeSingle();

    return NextResponse.json(
      successResponse({
        ...row,
        usuario_nombre: (u as { nombre?: string } | null)?.nombre ?? null,
      })
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string; comentarioId: string }> }
) {
  const auth = await requireProyectosApiAccess(request);
  if (!auth.ok) {
    return NextResponse.json(errorResponse(auth.message), { status: auth.status });
  }

  const { id, comentarioId } = await params;
  const pid = id?.trim() ?? "";
  const cid = comentarioId?.trim() ?? "";
  if (!pid || !cid) {
    return NextResponse.json(errorResponse("ids obligatorios"), { status: 400 });
  }

  try {
    const sb = await getChatServiceClientForEmpresa(auth.empresaId);

    const { data: actual, error: eActual } = await sb
      .from("proyecto_comentarios")
      .select("usuario_id")
      .eq("empresa_id", auth.empresaId)
      .eq("proyecto_id", pid)
      .eq("id", cid)
      .maybeSingle();

    if (eActual) return NextResponse.json(errorResponse(eActual.message), { status: 400 });
    if (!actual) return NextResponse.json(errorResponse("No encontrado"), { status: 404 });
    if ((actual as { usuario_id?: string }).usuario_id !== auth.usuarioCatalogId) {
      return NextResponse.json(
        errorResponse("Solo el autor puede eliminar este comentario"),
        { status: 403 }
      );
    }

    const { error } = await sb
      .from("proyecto_comentarios")
      .delete()
      .eq("empresa_id", auth.empresaId)
      .eq("proyecto_id", pid)
      .eq("id", cid);

    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });

    await sb
      .from("proyectos")
      .update({ last_activity_at: new Date().toISOString(), updated_by: auth.usuarioCatalogId })
      .eq("empresa_id", auth.empresaId)
      .eq("id", pid);

    return NextResponse.json(successResponse({ id: cid }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
