import { NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { errorResponse, successResponse } from "@/lib/api/response";
import {
  isValidCambioNro,
  listProyectoCambios,
  parseCambioPatch,
  upsertProyectoCambio,
  type ProyectoCambioNro,
} from "@/lib/proyectos/cambios-config";
import { requireProyectosApiAccess } from "@/lib/proyectos/proyectos-auth";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string; nro: string }> }
) {
  const auth = await requireProyectosApiAccess(request);
  if (!auth.ok) {
    return NextResponse.json(errorResponse(auth.message), { status: auth.status });
  }
  const { id, nro } = await params;
  const pid = id?.trim() ?? "";
  if (!pid) {
    return NextResponse.json(errorResponse("id obligatorio"), { status: 400 });
  }
  const nroNum = Number(nro);
  if (!isValidCambioNro(nroNum)) {
    return NextResponse.json(errorResponse("nro debe ser 1, 2 o 3"), { status: 400 });
  }

  try {
    const body = await request.json().catch(() => null);
    const patch = parseCambioPatch(body);
    const sb = await getChatServiceClientForEmpresa(auth.empresaId);

    await upsertProyectoCambio(sb, {
      empresaId: auth.empresaId,
      proyectoId: pid,
      nro: nroNum as ProyectoCambioNro,
      patch,
      usuarioCatalogId: auth.usuarioCatalogId,
    });

    const cambios = await listProyectoCambios(sb, auth.empresaId, pid);
    return NextResponse.json(successResponse({ cambios }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 400 });
  }
}
