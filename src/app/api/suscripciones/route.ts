import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { emitEvent, EVENT_TYPES } from "@/lib/integrations/events";
import { crearFacturaInicialSuscripcionSiCorresponde } from "@/lib/facturacion/factura-suscripcion-servidor";


export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { auth, supabase } = ctx;

    const { searchParams } = new URL(request.url);
    const clienteId = searchParams.get("cliente_id");

    let query = supabase
      .from("suscripciones")
      .select("*, planes(nombre)")
      .eq("empresa_id", auth.empresa_id)
      .order("created_at", { ascending: false });

    if (clienteId) {
      query = query.eq("cliente_id", clienteId);
    }

    let { data, error } = await query;
    if (error) {
      const q2 = supabase
        .from("suscripciones")
        .select("*")
        .eq("empresa_id", auth.empresa_id)
        .order("created_at", { ascending: false });
      const q2f = clienteId ? q2.eq("cliente_id", clienteId) : q2;
      const r2 = await q2f;
      if (r2.error) {
        return NextResponse.json(errorResponse(error.message), { status: 400 });
      }
      data = r2.data;
      error = null;
    }

    return NextResponse.json(successResponse(data ?? []));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { auth, supabase } = ctx;

    const body = await request.json();
    const { cliente_id, plan_id, precio, moneda, fecha_inicio, duracion_meses, dia_facturacion, dia_vencimiento, generar_factura_este_mes, generar_factura, periodo_factura, fecha_vencimiento_override, permitir_duplicado } = body;

    if (!cliente_id?.trim()) {
      return NextResponse.json(errorResponse("cliente_id es obligatorio"), { status: 400 });
    }

    // Guarda anti-duplicado: un cliente no debería tener 2 suscripciones ACTIVAS del mismo plan.
    // Se avisa (409) salvo que el llamador confirme con `permitir_duplicado: true`.
    const planIdTrim = typeof plan_id === "string" ? plan_id.trim() : "";
    if (planIdTrim && permitir_duplicado !== true) {
      const { data: yaActivas, error: dupErr } = await supabase
        .from("suscripciones")
        .select("id")
        .eq("empresa_id", auth.empresa_id)
        .eq("cliente_id", cliente_id.trim())
        .eq("plan_id", planIdTrim)
        .eq("estado", "activa")
        .limit(1);
      if (!dupErr && yaActivas && yaActivas.length > 0) {
        return NextResponse.json(
          {
            ...errorResponse("El cliente ya tiene una suscripción activa de este plan."),
            code: "suscripcion_duplicada",
          },
          { status: 409 }
        );
      }
    }
    if (precio == null || Number(precio) < 0) {
      return NextResponse.json(errorResponse("precio debe ser >= 0"), { status: 400 });
    }
    if (!fecha_inicio) {
      return NextResponse.json(errorResponse("fecha_inicio es obligatoria"), { status: 400 });
    }

    // Decisión EXPLÍCITA de facturación inicial (el backend no decide en silencio).
    //   periodo_factura: "actual" | "siguiente" | "none"   (canónico)
    //   fecha_vencimiento_override: YYYY-MM-DD              (opcional, gana sobre el período)
    //   legacy: generar_factura_este_mes (boolean) → modo "auto" (regla histórica)
    let debeGenerar = false;
    let vencimiento: { modo: "auto" | "actual" | "siguiente" | "override"; vencimientoOverride?: string } = { modo: "auto" };
    const overrideYmd =
      typeof fecha_vencimiento_override === "string" && /^\d{4}-\d{2}-\d{2}$/.test(fecha_vencimiento_override.trim())
        ? fecha_vencimiento_override.trim()
        : null;

    if (periodo_factura === "none") {
      debeGenerar = false;
    } else if (periodo_factura === "actual" || periodo_factura === "siguiente") {
      debeGenerar = true;
      vencimiento = overrideYmd ? { modo: "override", vencimientoOverride: overrideYmd } : { modo: periodo_factura };
    } else if (periodo_factura != null) {
      return NextResponse.json(
        errorResponse('periodo_factura inválido: usá "actual", "siguiente" o "none".'),
        { status: 400 }
      );
    } else if (generar_factura === true) {
      // Flag nuevo sin período → ambigüedad: rechazar.
      return NextResponse.json(
        errorResponse('Falta periodo_factura ("actual" | "siguiente") cuando generar_factura = true.'),
        { status: 400 }
      );
    } else {
      // Camino legacy: comportamiento seguro/histórico (modo auto).
      debeGenerar = Boolean(generar_factura_este_mes);
      vencimiento = overrideYmd ? { modo: "override", vencimientoOverride: overrideYmd } : { modo: "auto" };
    }

    const insert = {
      empresa_id: auth.empresa_id,
      cliente_id: cliente_id.trim(),
      plan_id: plan_id?.trim() || null,
      precio: Number(precio),
      moneda: moneda === "USD" ? "USD" : "GS",
      fecha_inicio,
      duracion_meses: Number(duracion_meses) || 12,
      dia_facturacion: Math.min(28, Math.max(1, Number(dia_facturacion) || 1)),
      dia_vencimiento: Math.min(31, Math.max(1, Number(dia_vencimiento) || 10)),
      generar_factura_este_mes: debeGenerar,
      // La suscripción ya NO lleva tipo_servicio: la clasificación vive en el cliente
      // (`clientes.tipo_servicio_cliente`). Se persiste null para el registro histórico.
      tipo_servicio: null,
    };

    const { data, error } = await supabase.from("suscripciones").insert([insert]).select("*").single();

    if (error) {
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }

    console.log("[API] About to emit event");
    await emitEvent(EVENT_TYPES.suscripcion_creada, { suscripcion_id: data.id, cliente_id: data.cliente_id });

    if (debeGenerar) {
      await crearFacturaInicialSuscripcionSiCorresponde({
        supabase,
        empresaId: auth.empresa_id,
        suscripcion: {
          id: data.id,
          cliente_id: data.cliente_id,
          plan_id: data.plan_id,
          precio: Number(data.precio),
          moneda: data.moneda,
          dia_facturacion: data.dia_facturacion,
          dia_vencimiento: data.dia_vencimiento,
        },
        vencimiento,
      });
    }

    return NextResponse.json(successResponse(data));
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
