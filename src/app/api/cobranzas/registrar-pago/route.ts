import { NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { requireCobranzasModuleAccess } from "@/lib/cobranzas/cobranzas-auth";
import { esRolAdminEmpresaOGlobal } from "@/lib/auth/rol-empresa";
import { registrarPago } from "@/lib/pagos/registrar-pago";
import { errorResponse, successResponse } from "@/lib/api/response";

/**
 * POST — registrar pago desde Cobranzas. Reutiliza el servicio único `registrarPago`
 * (mismas validaciones que el módulo Pagos). Fase 2: solo admin/super_admin.
 */
export async function POST(request: Request) {
  const access = await requireCobranzasModuleAccess(request);
  if (!access.ok) {
    return NextResponse.json(errorResponse(access.message), { status: access.status });
  }
  if (!esRolAdminEmpresaOGlobal(access.rol)) {
    return NextResponse.json(
      errorResponse("Solo un administrador puede registrar pagos desde Cobranzas."),
      { status: 403 }
    );
  }

  const ctx = await getTenantSupabaseFromAuth(request);
  if (!ctx) {
    return NextResponse.json(errorResponse("No autenticado"), { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json(errorResponse("Body JSON inválido"), { status: 400 });
  }

  // Regla oldest-first centralizada en `registrarPago` (aplica a Pagos y Cobranzas).
  const result = await registrarPago(ctx.supabase, ctx.auth, body as Record<string, unknown>);
  if (!result.ok) {
    if (result.code === "PAY_OLDEST_FIRST") {
      return NextResponse.json(
        { success: false, error: result.message, code: result.code, oldest: result.oldest },
        { status: result.status }
      );
    }
    return NextResponse.json(errorResponse(result.message), { status: result.status });
  }
  return NextResponse.json(successResponse(result.pago));
}
