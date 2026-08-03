import { NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { errorResponse, successResponse } from "@/lib/api/response";
import { requireProyectosApiAccess } from "@/lib/proyectos/proyectos-auth";

type GrupoRow = {
  id: string;
  nombre: string;
  descripcion: string | null;
  sort_order: number;
  created_at: string;
};
type EtapaRow = {
  id: string;
  grupo_id: string;
  nombre: string;
  descripcion: string | null;
  sort_order: number;
};
type ItemRow = {
  id: string;
  etapa_id: string;
  texto: string;
  comentario: string | null;
  sort_order: number;
  completado: boolean;
  completado_por: string | null;
  completado_at: string | null;
  created_at: string;
};
type ArchivoRow = {
  id: string;
  item_id: string;
  nombre: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
};

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

    const [grupos, etapas, items, archivos] = await Promise.all([
      sb
        .from("proyecto_qa_grupos")
        .select("id, nombre, descripcion, sort_order, created_at")
        .eq("empresa_id", auth.empresaId)
        .eq("proyecto_id", pid)
        .order("sort_order", { ascending: true }),
      sb
        .from("proyecto_qa_etapas")
        .select("id, grupo_id, nombre, descripcion, sort_order")
        .eq("empresa_id", auth.empresaId)
        .eq("proyecto_id", pid)
        .order("sort_order", { ascending: true }),
      sb
        .from("proyecto_qa_items")
        .select(
          "id, etapa_id, texto, comentario, sort_order, completado, completado_por, completado_at, created_at"
        )
        .eq("empresa_id", auth.empresaId)
        .eq("proyecto_id", pid)
        .order("sort_order", { ascending: true }),
      sb
        .from("proyecto_qa_item_archivos")
        .select("id, item_id, nombre, mime_type, size_bytes, uploaded_by, created_at")
        .eq("empresa_id", auth.empresaId)
        .eq("proyecto_id", pid)
        .order("created_at", { ascending: false }),
    ]);

    const err =
      grupos.error?.message ?? etapas.error?.message ?? items.error?.message ?? archivos.error?.message;
    if (err) return NextResponse.json(errorResponse(err), { status: 400 });

    return NextResponse.json(
      successResponse({
        grupos: (grupos.data ?? []) as GrupoRow[],
        etapas: (etapas.data ?? []) as EtapaRow[],
        items: (items.data ?? []) as ItemRow[],
        archivos: (archivos.data ?? []) as ArchivoRow[],
      })
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
