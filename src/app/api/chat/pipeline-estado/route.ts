import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";

export const runtime = "nodejs";

/**
 * Estados válidos del pipeline de ventas por conversación.
 * El orden refleja el flujo natural: nuevo → seguimiento → confirmado →
 * pagado_entregado. `perdido` es terminal alternativo.
 */
const ESTADOS_VALIDOS = new Set([
  "nuevo",
  "seguimiento",
  "confirmado",
  "pagado_entregado",
  "perdido",
]);

type Body = {
  conversation_id?: string;
  estado?: string;
  /** Requerido si estado='seguimiento'. Formato YYYY-MM-DD. */
  seguimiento_fecha?: string | null;
  /** Requerido si estado='pagado_entregado'. Guaraníes, número entero o decimal. */
  venta_monto?: number | string | null;
  notas?: string | null;
};

/**
 * POST /api/chat/pipeline-estado
 *
 * Cambia el estado de pipeline de una conversación y registra el evento en el
 * historial (chat_conversation_pipeline_events). El nombre del usuario que
 * cambió queda guardado tanto por FK (`estado_pipeline_updated_by`) como
 * snapshot textual en el evento (por si el usuario se borra después).
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth?.empresa_id) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }

    const body = (await request.json().catch(() => null)) as Body | null;
    const conversationId = typeof body?.conversation_id === "string" ? body.conversation_id.trim() : "";
    const estado = typeof body?.estado === "string" ? body.estado.trim() : "";
    const seguimientoFechaRaw = body?.seguimiento_fecha ?? null;
    const ventaMontoRaw = body?.venta_monto ?? null;
    const notas = typeof body?.notas === "string" ? body.notas.trim().slice(0, 500) : null;

    if (!conversationId) {
      return NextResponse.json({ ok: false, error: "conversation_id requerido" }, { status: 400 });
    }
    if (!estado || !ESTADOS_VALIDOS.has(estado)) {
      return NextResponse.json({ ok: false, error: "estado inválido" }, { status: 400 });
    }

    // Validación específica por estado.
    let seguimientoFecha: string | null = null;
    if (estado === "seguimiento") {
      if (!seguimientoFechaRaw || typeof seguimientoFechaRaw !== "string") {
        return NextResponse.json(
          { ok: false, error: "seguimiento_fecha requerida para estado 'seguimiento'" },
          { status: 400 }
        );
      }
      // Formato ISO YYYY-MM-DD. No aceptamos timestamps.
      if (!/^\d{4}-\d{2}-\d{2}$/.test(seguimientoFechaRaw)) {
        return NextResponse.json(
          { ok: false, error: "seguimiento_fecha debe ser YYYY-MM-DD" },
          { status: 400 }
        );
      }
      seguimientoFecha = seguimientoFechaRaw;
    }

    let ventaMonto: number | null = null;
    if (estado === "pagado_entregado") {
      const parsed =
        typeof ventaMontoRaw === "number" ? ventaMontoRaw : Number(ventaMontoRaw ?? NaN);
      if (!Number.isFinite(parsed) || parsed < 0) {
        return NextResponse.json(
          { ok: false, error: "venta_monto requerido y >= 0 para estado 'pagado_entregado'" },
          { status: 400 }
        );
      }
      ventaMonto = Math.round(parsed * 100) / 100; // 2 decimales
    }

    const supabase = await getChatServiceClientForEmpresa(auth.empresa_id);

    // Cargar conversación para validar empresa y leer estado anterior.
    const { data: conv, error: cErr } = await supabase
      .from("chat_conversations")
      .select("id, empresa_id, estado_pipeline")
      .eq("id", conversationId)
      .maybeSingle();

    if (cErr) {
      return NextResponse.json({ ok: false, error: cErr.message }, { status: 500 });
    }
    if (!conv) {
      return NextResponse.json({ ok: false, error: "Conversación no encontrada" }, { status: 404 });
    }
    if ((conv as { empresa_id: string }).empresa_id !== auth.empresa_id) {
      return NextResponse.json({ ok: false, error: "No autorizado" }, { status: 403 });
    }

    const estadoAnterior = (conv as { estado_pipeline: string | null }).estado_pipeline ?? null;
    const now = new Date().toISOString();
    const usuarioId = auth.user?.id ?? null;
    const usuarioNombre = auth.nombre ?? auth.user?.email ?? null;

    // Update denormalizado (para queries rápidas en inbox y admin).
    // Cuando el estado NO es 'seguimiento', limpiamos seguimiento_fecha para
    // que el cron no lo levante por error. Idem venta_monto fuera de 'pagado_entregado'
    // — así el reporte por vendedor no suma montos de estados intermedios.
    const updatePatch: Record<string, unknown> = {
      estado_pipeline: estado,
      estado_pipeline_updated_at: now,
      estado_pipeline_updated_by: usuarioId,
      seguimiento_fecha: estado === "seguimiento" ? seguimientoFecha : null,
      venta_monto: estado === "pagado_entregado" ? ventaMonto : null,
      updated_at: now,
    };

    const { error: uErr } = await supabase
      .from("chat_conversations")
      .update(updatePatch)
      .eq("id", conversationId)
      .eq("empresa_id", auth.empresa_id);

    if (uErr) {
      return NextResponse.json({ ok: false, error: uErr.message }, { status: 500 });
    }

    // Historial inmutable. Un fallo aquí NO revierte el update — el estado nuevo
    // ya está guardado. Loggeamos y devolvemos ok con nota.
    const { error: hErr } = await supabase
      .from("chat_conversation_pipeline_events")
      .insert({
        empresa_id: auth.empresa_id,
        conversation_id: conversationId,
        estado_anterior: estadoAnterior,
        estado_nuevo: estado,
        cambiado_por: usuarioId,
        cambiado_por_nombre: usuarioNombre,
        seguimiento_fecha: seguimientoFecha,
        venta_monto: ventaMonto,
        notas,
      });

    if (hErr) {
      console.warn("[api/chat/pipeline-estado] historial_no_guardado", hErr.message);
    }

    return NextResponse.json({
      ok: true,
      estado,
      seguimiento_fecha: seguimientoFecha,
      venta_monto: ventaMonto,
      updated_at: now,
    });
  } catch (e) {
    console.error("[api/chat/pipeline-estado]", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
