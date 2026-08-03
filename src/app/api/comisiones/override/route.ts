import { NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import {
  puedeConfigurarComisiones,
  requireComisionesModuleAccess,
} from "@/lib/comisiones/comisiones-auth";
import { errorResponse, successResponse } from "@/lib/api/response";

/**
 * Override manual de comisionabilidad por pago/línea para un período.
 * Solo admin (afecta liquidación de dinero). El preview lo aplica con máxima precedencia.
 *
 *   POST   { periodo_ym, pago_id, factura_id?, decision: 'incluir'|'excluir', motivo }
 *   DELETE { periodo_ym, pago_id }   → quita el override (vuelve a flag/regla automática)
 */

const PERIODO_RE = /^\d{4}-(0[1-9]|1[0-2])$/;

type OverrideBody = {
  periodo_ym?: unknown;
  pago_id?: unknown;
  factura_id?: unknown;
  decision?: unknown;
  motivo?: unknown;
};

async function emailDe(sb: Awaited<ReturnType<typeof getChatServiceClientForEmpresa>>, usuarioId: string): Promise<string | null> {
  try {
    const { data } = await sb.from("usuarios").select("email").eq("id", usuarioId).maybeSingle();
    const email = (data as { email?: string } | null)?.email;
    return typeof email === "string" && email.trim() ? email.trim() : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const auth = await requireComisionesModuleAccess(request);
  if (!auth.ok) return NextResponse.json(errorResponse(auth.message), { status: auth.status });
  if (!puedeConfigurarComisiones(auth.rol)) {
    return NextResponse.json(
      errorResponse("Solo un administrador puede incluir o excluir comisiones."),
      { status: 403 }
    );
  }

  let body: OverrideBody;
  try {
    body = (await request.json()) as OverrideBody;
  } catch {
    return NextResponse.json(errorResponse("Body JSON inválido"), { status: 400 });
  }

  const periodoYm = String(body.periodo_ym ?? "").trim();
  const pagoId = String(body.pago_id ?? "").trim();
  const facturaId = body.factura_id == null ? null : String(body.factura_id).trim() || null;
  const decision = String(body.decision ?? "").trim();
  const motivo = String(body.motivo ?? "").trim();

  if (!PERIODO_RE.test(periodoYm)) {
    return NextResponse.json(errorResponse("periodo_ym inválido (YYYY-MM)"), { status: 400 });
  }
  if (!pagoId) {
    return NextResponse.json(errorResponse("pago_id requerido"), { status: 400 });
  }
  if (decision !== "incluir" && decision !== "excluir") {
    return NextResponse.json(errorResponse("decision debe ser 'incluir' o 'excluir'"), { status: 400 });
  }
  if (!motivo) {
    return NextResponse.json(errorResponse("El motivo es obligatorio"), { status: 400 });
  }

  const sb = await getChatServiceClientForEmpresa(auth.empresaId);
  const empresaId = auth.empresaId;
  const email = await emailDe(sb, auth.usuarioCatalogId);

  try {
    const { data: existing, error: selErr } = await sb
      .from("comision_overrides")
      .select("id")
      .eq("empresa_id", empresaId)
      .eq("periodo_ym", periodoYm)
      .eq("ambito", "pago")
      .eq("pago_id", pagoId)
      .maybeSingle();
    if (selErr) throw new Error(selErr.message);

    if (existing && typeof existing === "object" && "id" in existing) {
      const { error: updErr } = await sb
        .from("comision_overrides")
        .update({
          factura_id: facturaId,
          decision,
          motivo,
          decidido_por: auth.usuarioCatalogId,
          decidido_por_email: email,
        })
        .eq("id", String((existing as { id: string }).id));
      if (updErr) throw new Error(updErr.message);
    } else {
      const { error: insErr } = await sb.from("comision_overrides").insert({
        empresa_id: empresaId,
        periodo_ym: periodoYm,
        ambito: "pago",
        pago_id: pagoId,
        factura_id: facturaId,
        decision,
        motivo,
        decidido_por: auth.usuarioCatalogId,
        decidido_por_email: email,
      });
      if (insErr) throw new Error(insErr.message);
    }

    return NextResponse.json(successResponse({ ok: true, periodo_ym: periodoYm, pago_id: pagoId, decision }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const auth = await requireComisionesModuleAccess(request);
  if (!auth.ok) return NextResponse.json(errorResponse(auth.message), { status: auth.status });
  if (!puedeConfigurarComisiones(auth.rol)) {
    return NextResponse.json(
      errorResponse("Solo un administrador puede modificar comisiones."),
      { status: 403 }
    );
  }

  const url = new URL(request.url);
  let periodoYm = (url.searchParams.get("periodo_ym") ?? "").trim();
  let pagoId = (url.searchParams.get("pago_id") ?? "").trim();
  if (!periodoYm || !pagoId) {
    try {
      const body = (await request.json()) as OverrideBody;
      periodoYm = periodoYm || String(body.periodo_ym ?? "").trim();
      pagoId = pagoId || String(body.pago_id ?? "").trim();
    } catch {
      /* sin body: usar query params */
    }
  }

  if (!PERIODO_RE.test(periodoYm) || !pagoId) {
    return NextResponse.json(errorResponse("periodo_ym (YYYY-MM) y pago_id requeridos"), { status: 400 });
  }

  const sb = await getChatServiceClientForEmpresa(auth.empresaId);
  try {
    const { error } = await sb
      .from("comision_overrides")
      .delete()
      .eq("empresa_id", auth.empresaId)
      .eq("periodo_ym", periodoYm)
      .eq("ambito", "pago")
      .eq("pago_id", pagoId);
    if (error) throw new Error(error.message);
    return NextResponse.json(successResponse({ ok: true }));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
