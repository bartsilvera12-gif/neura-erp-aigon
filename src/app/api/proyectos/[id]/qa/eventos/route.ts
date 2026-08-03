import { NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { errorResponse, successResponse } from "@/lib/api/response";
import { requireProyectosApiAccess } from "@/lib/proyectos/proyectos-auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireProyectosApiAccess(request);
  if (!auth.ok) return NextResponse.json(errorResponse(auth.message), { status: auth.status });

  const { id } = await params;
  const pid = id?.trim() ?? "";
  if (!pid) return NextResponse.json(errorResponse("id obligatorio"), { status: 400 });

  const url = new URL(request.url);
  const itemId = url.searchParams.get("item_id")?.trim() ?? "";
  const limit = Math.min(200, Math.max(1, Number(url.searchParams.get("limit") ?? "50") | 0));

  try {
    const sb = await getChatServiceClientForEmpresa(auth.empresaId);
    let q = sb
      .from("proyecto_qa_eventos")
      .select("id, item_id, etapa_id, grupo_id, accion, payload, usuario_id, created_at")
      .eq("empresa_id", auth.empresaId)
      .eq("proyecto_id", pid)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (itemId) q = q.eq("item_id", itemId);

    const { data, error } = await q;
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    return NextResponse.json(successResponse(data ?? []));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
