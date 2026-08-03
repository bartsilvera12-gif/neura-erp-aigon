import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { getFacturasServiceClientForEmpresa } from "@/lib/facturacion/facturas-service-client";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { evaluarAnulacionFactura } from "@/lib/facturacion/anulacion-rules";

/**
 * POST /api/facturas/[id]/anular
 *
 * Anulación ADMINISTRATIVA de una factura mal cargada (sin pagos y sin DE aprobado):
 * marca `facturas.estado = 'Anulado'`, `saldo = 0` y registra auditoría.
 *
 * NO elimina físicamente la factura. NO ejecuta DELETE. NO toca pagos ni la SET.
 * Para facturas con pagos o DE aprobado, deriva a reversión de pago / cancelación
 * SIFEN (api/facturas/[id]/sifen/cancelar) / Nota de crédito.
 *
 * Filtra siempre por empresa_id y opera sobre el schema resuelto de la empresa
 * (`getFacturasServiceClientForEmpresa`: zentra_erp o tenant erp_* vía shim).
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth?.empresa_id) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    if (!isAdmin(auth)) {
      return NextResponse.json(
        errorResponse("Solo usuarios administradores pueden anular facturas."),
        { status: 403 }
      );
    }

    const { id } = await params;
    const fid = id?.trim();
    if (!fid) {
      return NextResponse.json(errorResponse("id de factura es obligatorio"), { status: 400 });
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json(errorResponse("Cuerpo JSON inválido"), { status: 400 });
    }
    const b = body != null && typeof body === "object" ? (body as Record<string, unknown>) : {};
    const motivo = typeof b.motivo === "string" ? b.motivo.trim() : "";
    if (motivo.length < 5) {
      return NextResponse.json(
        errorResponse("El motivo es obligatorio (mínimo 5 caracteres) para registrar la anulación."),
        { status: 400 }
      );
    }
    if (motivo.length > 2000) {
      return NextResponse.json(errorResponse("El motivo no puede superar 2000 caracteres."), { status: 400 });
    }

    const supabase = await getFacturasServiceClientForEmpresa(auth.empresa_id);

    // 1) Cargar factura por id + empresa_id (aislamiento por empresa/schema).
    const { data: factura, error: errF } = await supabase
      .from("facturas")
      .select("id, empresa_id, cliente_id, numero_factura, estado, saldo, monto")
      .eq("id", fid)
      .eq("empresa_id", auth.empresa_id)
      .maybeSingle();

    if (errF) {
      return NextResponse.json(errorResponse(errF.message), { status: 400 });
    }
    if (!factura) {
      return NextResponse.json(errorResponse("Factura no encontrada"), { status: 404 });
    }

    // 2) Pagos asociados + documento electrónico (lectura).
    const [pagosRes, feRes] = await Promise.all([
      supabase
        .from("pagos")
        .select("id", { count: "exact", head: true })
        .eq("factura_id", fid)
        .eq("empresa_id", auth.empresa_id),
      supabase
        .from("factura_electronica")
        .select("estado_sifen")
        .eq("factura_id", fid)
        .eq("empresa_id", auth.empresa_id)
        .maybeSingle(),
    ]);

    if (pagosRes.error) {
      return NextResponse.json(errorResponse(pagosRes.error.message), { status: 400 });
    }
    const pagosCount = pagosRes.count ?? 0;
    const estadoSifen =
      feRes.data && typeof feRes.data === "object"
        ? ((feRes.data as { estado_sifen?: string | null }).estado_sifen ?? null)
        : null;

    // 3) Decisión por reglas puras.
    const decision = evaluarAnulacionFactura({
      estadoFactura: factura.estado as string,
      pagosCount,
      estadoSifen,
    });

    if (!decision.puede_anular) {
      // Idempotencia: factura ya anulada → 200 con flag, sin error duro.
      if (decision.derivar_a === "ya_anulada") {
        return NextResponse.json(
          successResponse({
            factura_id: fid,
            estado: "Anulado",
            ya_estaba_anulada: true,
            mensaje: decision.motivo_bloqueo,
          })
        );
      }
      // 409: conflicto de estado (pagos / SIFEN aprobado / en vuelo / NC).
      return NextResponse.json(
        errorResponse(decision.motivo_bloqueo),
        { status: 409 }
      );
    }

    // 4) Aplicar anulación administrativa (sin DELETE, sin tocar pagos/SET).
    const now = new Date().toISOString();
    const { data: updated, error: errUpd } = await supabase
      .from("facturas")
      .update({
        estado: "Anulado",
        saldo: 0,
        anulado_at: now,
        anulado_por: auth.user.id,
        anulacion_motivo: motivo,
        updated_at: now,
      })
      .eq("id", fid)
      .eq("empresa_id", auth.empresa_id)
      .neq("estado", "Anulado")
      .select("id, estado, saldo, anulado_at")
      .maybeSingle();

    if (errUpd) {
      return NextResponse.json(
        errorResponse(`No se pudo anular la factura: ${errUpd.message}`),
        { status: 500 }
      );
    }
    if (!updated) {
      // Carrera: otra anulación llegó primero. Idempotente.
      return NextResponse.json(
        successResponse({ factura_id: fid, estado: "Anulado", ya_estaba_anulada: true })
      );
    }

    // 5) Auditoría en cliente_historial (best-effort: no revierte la anulación si falla).
    if (factura.cliente_id) {
      const { error: errHist } = await supabase.from("cliente_historial").insert({
        empresa_id: auth.empresa_id,
        cliente_id: factura.cliente_id,
        tipo: "factura_anulada",
        accion: `Anulación de factura ${factura.numero_factura ?? fid}`,
        factura_id: fid,
        creado_por_auth_user_id: auth.user.id ?? null,
        creado_por_email: auth.user.email ?? null,
        detalle: {
          evento: "factura_anulada_administrativa",
          factura_id: fid,
          numero_factura: factura.numero_factura ?? null,
          motivo,
          monto_previo: Number(factura.monto ?? 0),
          saldo_previo: Number(factura.saldo ?? 0),
          estado_sifen_previo: estadoSifen,
          pagos_count: pagosCount,
          at_iso: now,
        },
      });
      if (errHist) {
        console.error("[api/facturas/[id]/anular] cliente_historial:", errHist.message);
      }
    }

    return NextResponse.json(
      successResponse({
        factura_id: fid,
        estado: "Anulado",
        saldo: 0,
        anulado_at: now,
        ya_estaba_anulada: false,
      })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
