import { NextResponse } from "next/server";
import { resolveApiAuthContext } from "@/lib/middleware/api-auth-context";
import { getComercialReport } from "@/lib/gerencia/comercial-data";

export const dynamic = "force-dynamic";

/**
 * GET /api/gerencia/comercial?period=YYYY-MM
 * Reportería gerencial comercial (read-only) para la empresa autenticada.
 * No escribe datos. Lee las views neura.v_*.
 */
export async function GET(request: Request) {
  const r = await resolveApiAuthContext(request);
  if (!r.ok) {
    return NextResponse.json({ error: "No autorizado", code: r.code }, { status: 401 });
  }
  const empresaId = r.ctx.empresa_id;
  if (!empresaId) {
    return NextResponse.json({ error: "Usuario sin empresa" }, { status: 403 });
  }

  const url = new URL(request.url);
  const period = url.searchParams.get("period") || undefined;

  try {
    const report = await getComercialReport(empresaId, period);
    return NextResponse.json(report, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    console.error("[api/gerencia/comercial]", e instanceof Error ? e.message : e);
    return NextResponse.json({ error: "Error generando reporte" }, { status: 500 });
  }
}
