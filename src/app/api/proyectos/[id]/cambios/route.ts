import { NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { errorResponse, successResponse } from "@/lib/api/response";
import { listProyectoCambios } from "@/lib/proyectos/cambios-config";
import { requireProyectosApiAccess } from "@/lib/proyectos/proyectos-auth";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireProyectosApiAccess(request);
  if (!auth.ok) {
    return NextResponse.json(errorResponse(auth.message), { status: auth.status });
  }
  const { id } = await params;
  const pid = id?.trim() ?? "";
  if (!pid) {
    return NextResponse.json(errorResponse("id obligatorio"), { status: 400 });
  }
  try {
    const sb = await getChatServiceClientForEmpresa(auth.empresaId);
    const cambios = await listProyectoCambios(sb, auth.empresaId, pid);
    return NextResponse.json(successResponse({ cambios }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
