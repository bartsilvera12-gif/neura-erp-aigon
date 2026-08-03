import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";

/**
 * DELETE /api/suscripciones/:id — elimina una suscripción del cliente.
 *
 * Las facturas ya emitidas se CONSERVAN: el FK `facturas_suscripcion_id_fkey` es
 * ON DELETE SET NULL, así que quedan sin vincular a la suscripción pero intactas
 * (no se borra ni se toca ningún pago). Scoped por empresa_id.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { auth, supabase } = ctx;
    const { id } = await params;
    const suscId = (id ?? "").trim();
    if (!suscId) {
      return NextResponse.json(errorResponse("id es obligatorio"), { status: 400 });
    }

    const { data: existing, error: exErr } = await supabase
      .from("suscripciones")
      .select("id")
      .eq("id", suscId)
      .eq("empresa_id", auth.empresa_id)
      .maybeSingle();
    if (exErr) {
      return NextResponse.json(errorResponse(exErr.message), { status: 400 });
    }
    if (!existing) {
      return NextResponse.json(errorResponse("Suscripción no encontrada"), { status: 404 });
    }

    // Cuántas facturas quedarán desvinculadas (informativo para el response).
    const { count: facturasVinculadas } = await supabase
      .from("facturas")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", auth.empresa_id)
      .eq("suscripcion_id", suscId);

    const { error: delErr } = await supabase
      .from("suscripciones")
      .delete()
      .eq("id", suscId)
      .eq("empresa_id", auth.empresa_id);
    if (delErr) {
      return NextResponse.json(errorResponse(delErr.message), { status: 400 });
    }

    return NextResponse.json(
      successResponse({ id: suscId, deleted: true, facturas_desvinculadas: facturasVinculadas ?? 0 })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
