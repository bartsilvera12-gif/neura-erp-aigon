import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";

export const runtime = "nodejs";

/**
 * GET /api/pipeline-ventas/resumen
 *
 * Devuelve:
 *   por_estado: { nuevo, seguimiento, confirmado, pagado_entregado, perdido, sin_estado }
 *               (cada uno con { count })
 *   ventas_por_vendedor: [{ vendedor_usuario_id, cantidad, monto_total }]
 *               (solo cuenta 'pagado_entregado')
 *   seguimientos_hoy: N (con seguimiento_fecha = hoy)
 *
 * Query params opcionales:
 *   desde, hasta (YYYY-MM-DD) — filtra por estado_pipeline_updated_at para el conteo por estado
 *                                y por evento en ventas_por_vendedor.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth?.empresa_id) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    if (!isAdmin(auth)) {
      return NextResponse.json({ ok: false, error: "Solo admin" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const desde = (sp.get("desde") ?? "").trim();
    const hasta = (sp.get("hasta") ?? "").trim();

    const supabase = await getChatServiceClientForEmpresa(auth.empresa_id);

    // === Conteo por estado ===
    // Traemos solo la columna estado y filtramos en memoria (barato: pipeline es
    // el subset de conversaciones activas). Evita 6 queries separadas.
    let q = supabase
      .from("chat_conversations")
      .select("estado_pipeline, venta_monto, assigned_agent_id, estado_pipeline_updated_at")
      .eq("empresa_id", auth.empresa_id);
    if (desde) q = q.gte("estado_pipeline_updated_at", `${desde}T00:00:00Z`);
    if (hasta) q = q.lt("estado_pipeline_updated_at", `${hasta}T00:00:00Z`);

    const { data: rows, error } = await q;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    const conv = (rows ?? []) as Array<{
      estado_pipeline: string | null;
      venta_monto: number | string | null;
      assigned_agent_id: string | null;
      estado_pipeline_updated_at: string | null;
    }>;

    const estados = ["nuevo", "seguimiento", "confirmado", "pagado_entregado", "perdido"] as const;
    const porEstado: Record<string, number> = {
      sin_estado: 0,
      nuevo: 0,
      seguimiento: 0,
      confirmado: 0,
      pagado_entregado: 0,
      perdido: 0,
    };
    // Ventas: agentId → { cantidad, monto_total }
    const ventasPorAgente = new Map<string, { cantidad: number; monto_total: number }>();

    for (const r of conv) {
      const k = r.estado_pipeline ?? "sin_estado";
      if (k in porEstado) porEstado[k] += 1;
      if (r.estado_pipeline === "pagado_entregado" && r.assigned_agent_id) {
        const acc = ventasPorAgente.get(r.assigned_agent_id) ?? { cantidad: 0, monto_total: 0 };
        acc.cantidad += 1;
        acc.monto_total += Number(r.venta_monto ?? 0);
        ventasPorAgente.set(r.assigned_agent_id, acc);
      }
    }

    // Resolver vendedor (chat_agents.usuario_id) para las ventas.
    const agentIds = [...ventasPorAgente.keys()];
    const agentToUsuario = new Map<string, string | null>();
    if (agentIds.length > 0) {
      const { data: ags } = await supabase
        .from("chat_agents")
        .select("id, usuario_id")
        .in("id", agentIds);
      for (const a of (ags ?? []) as Array<{ id: string; usuario_id: string | null }>) {
        agentToUsuario.set(a.id, a.usuario_id ?? null);
      }
    }
    const ventasPorVendedor = [...ventasPorAgente.entries()].map(([agentId, v]) => ({
      agent_id: agentId,
      vendedor_usuario_id: agentToUsuario.get(agentId) ?? null,
      cantidad: v.cantidad,
      monto_total: Math.round(v.monto_total * 100) / 100,
    })).sort((a, b) => b.monto_total - a.monto_total);

    // Seguimientos de HOY (independiente del filtro de fechas — es "para hoy").
    const hoy = new Date().toISOString().slice(0, 10);
    const { count: seguimientosHoy } = await supabase
      .from("chat_conversations")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", auth.empresa_id)
      .eq("estado_pipeline", "seguimiento")
      .eq("seguimiento_fecha", hoy);

    return NextResponse.json({
      ok: true,
      por_estado: Object.fromEntries(
        [...estados, "sin_estado"].map((k) => [k, { count: porEstado[k] ?? 0 }])
      ),
      ventas_por_vendedor: ventasPorVendedor,
      seguimientos_hoy: seguimientosHoy ?? 0,
    });
  } catch (e) {
    console.error("[api/pipeline-ventas/resumen]", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
