import { NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { requireCobranzasModuleAccess } from "@/lib/cobranzas/cobranzas-auth";
import { errorResponse, successResponse } from "@/lib/api/response";

/**
 * POST — registrar una promesa de pago (seguimiento) para un cliente.
 * Cualquier usuario con acceso al módulo Cobranzas (no requiere admin).
 * Solo fecha (la promesa la define el cliente). estado='pendiente'.
 */
const FECHA_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

export async function POST(request: Request) {
  const auth = await requireCobranzasModuleAccess(request);
  if (!auth.ok) return NextResponse.json(errorResponse(auth.message), { status: auth.status });

  let body: { cliente_id?: unknown; fecha_promesa?: unknown };
  try {
    body = (await request.json()) as { cliente_id?: unknown; fecha_promesa?: unknown };
  } catch {
    return NextResponse.json(errorResponse("Body JSON inválido"), { status: 400 });
  }
  const clienteId = typeof body.cliente_id === "string" ? body.cliente_id.trim() : "";
  const fecha = typeof body.fecha_promesa === "string" ? body.fecha_promesa.trim() : "";
  if (!clienteId) return NextResponse.json(errorResponse("cliente_id requerido"), { status: 400 });
  if (!FECHA_RE.test(fecha)) {
    return NextResponse.json(errorResponse("fecha_promesa inválida (YYYY-MM-DD)"), { status: 400 });
  }

  try {
    const sb = await getChatServiceClientForEmpresa(auth.empresaId);

    let email: string | null = null;
    try {
      const { data } = await sb.from("usuarios").select("email").eq("id", auth.usuarioCatalogId).maybeSingle();
      const e = (data as { email?: string } | null)?.email;
      email = typeof e === "string" && e.trim() ? e.trim() : null;
    } catch {
      /* email opcional */
    }

    const { error } = await sb.from("cobranza_promesas").insert({
      empresa_id: auth.empresaId,
      cliente_id: clienteId,
      fecha_promesa: fecha,
      estado: "pendiente",
      creado_por: auth.usuarioCatalogId,
      creado_por_email: email,
    });
    if (error) throw new Error(error.message);

    return NextResponse.json(successResponse({ ok: true, cliente_id: clienteId, fecha_promesa: fecha }));
  } catch (e) {
    return NextResponse.json(errorResponse(e instanceof Error ? e.message : "Error"), { status: 500 });
  }
}
