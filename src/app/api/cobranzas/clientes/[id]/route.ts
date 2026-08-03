import { NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { requireCobranzasModuleAccess } from "@/lib/cobranzas/cobranzas-auth";
import { cargarDetalleCliente, hoyAsuncionYmd } from "@/lib/cobranzas/cobranzas-data";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { errorResponse, successResponse } from "@/lib/api/response";

/** GET — detalle read-only de un cliente (facturas pendientes/vencidas, pagos, tramo). */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireCobranzasModuleAccess(_request);
  if (!auth.ok) return NextResponse.json(errorResponse(auth.message), { status: auth.status });

  try {
    const { id } = await params;
    if (!id) return NextResponse.json(errorResponse("id requerido"), { status: 400 });
    const sb = await getChatServiceClientForEmpresa(auth.empresaId);
    const hoy = hoyAsuncionYmd(new Date());
    const detalle = await cargarDetalleCliente(sb, auth.empresaId, id, hoy);
    if (!detalle) return NextResponse.json(errorResponse("Cliente no encontrado"), { status: 404 });
    const puede_registrar = esRolAdminEmpresaOGlobal(auth.rol);
    return NextResponse.json(successResponse({ hoy, puede_registrar, ...detalle }));
  } catch (e) {
    return NextResponse.json(errorResponse(e instanceof Error ? e.message : "Error"), { status: 500 });
  }
}
