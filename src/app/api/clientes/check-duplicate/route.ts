import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { getClientesSupabaseFromAuthWithRol } from "@/lib/clientes/clientes-service-client";
import { buscarDuplicadosCliente } from "@/lib/clientes/dedupe";

/**
 * GET /api/clientes/check-duplicate?nombre=&documento=&excluir=
 * Verificación en vivo de duplicados por DOCUMENTO (RUC/cédula) o NOMBRE PRINCIPAL
 * (empresa/razón social o nombre persona). NO usa teléfono/correo/contacto.
 * `excluir` = cliente_id a ignorar (para edición de ficha).
 */
export async function GET(request: NextRequest) {
  try {
    const ctx = await getClientesSupabaseFromAuthWithRol(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { auth, supabase } = ctx;

    const sp = request.nextUrl.searchParams;
    const nombre = sp.get("nombre");
    const documento = sp.get("documento");
    const excluir = sp.get("excluir");

    if (!nombre?.trim() && !documento?.trim()) {
      return NextResponse.json(
        successResponse({ exists: false, match_type: null, hay_inactivo: false, matches: [] })
      );
    }

    const matches = await buscarDuplicadosCliente(supabase, auth.empresa_id, {
      nombre,
      documento,
      excluirClienteId: excluir,
    });

    const tipos = new Set(matches.map((m) => m.match_type));
    const match_type =
      matches.length === 0
        ? null
        : tipos.has("ambos") || (tipos.has("documento") && tipos.has("nombre"))
          ? "ambos"
          : tipos.has("documento")
            ? "documento"
            : "nombre";

    return NextResponse.json(
      successResponse({
        exists: matches.length > 0,
        match_type,
        hay_inactivo: matches.some((m) => !m.activo),
        matches,
      })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
