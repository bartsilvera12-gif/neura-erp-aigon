import { NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { requireCobranzasModuleAccess } from "@/lib/cobranzas/cobranzas-auth";
import { cargarCobranzas, hoyAsuncionYmd } from "@/lib/cobranzas/cobranzas-data";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { errorResponse, successResponse } from "@/lib/api/response";

/** GET — lista read-only de clientes con deuda + resumen/tramos del período. */
export async function GET(request: Request) {
  const auth = await requireCobranzasModuleAccess(request);
  if (!auth.ok) return NextResponse.json(errorResponse(auth.message), { status: auth.status });

  try {
    const sb = await getChatServiceClientForEmpresa(auth.empresaId);
    const hoy = hoyAsuncionYmd(new Date());
    const { resumen, clientes } = await cargarCobranzas(sb, auth.empresaId, hoy);
    const puede_registrar = esRolAdminEmpresaOGlobal(auth.rol);
    return NextResponse.json(successResponse({ hoy, puede_registrar, resumen, clientes }));
  } catch (e) {
    return NextResponse.json(errorResponse(e instanceof Error ? e.message : "Error"), { status: 500 });
  }
}
