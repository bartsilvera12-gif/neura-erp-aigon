import { NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { errorResponse, successResponse } from "@/lib/api/response";
import { requireAgendaApiAccess } from "@/lib/agenda/agenda-auth";

/** Tipos de cita sugeridos (Fase 1A: estáticos; catálogo configurable en Fase 1.1). */
const TIPOS_SUGERIDOS = [
  "llamada",
  "demo",
  "visita",
  "consulta",
  "servicio",
  "reunion",
  "seguimiento",
  "otro",
];

/**
 * Datos para poblar selects del formulario:
 *  - responsables: usuarios de la empresa (catálogo zentra_erp).
 *  - clientes: del schema de datos del tenant.
 *  - tipos: sugerencias estáticas.
 */
export async function GET(request: Request) {
  const auth = await requireAgendaApiAccess(request);
  if (!auth.ok) return NextResponse.json(errorResponse(auth.message), { status: auth.status });

  try {
    const empresaId = auth.empresaId;
    const sb = await getChatServiceClientForEmpresa(empresaId);
    const catalog = createServiceRoleClient();

    const [usuariosR, clientesR] = await Promise.all([
      catalog
        .from("usuarios")
        .select("id,nombre,rol,estado")
        .eq("empresa_id", empresaId)
        .order("nombre", { ascending: true }),
      sb
        .from("clientes")
        .select("id,empresa,nombre_contacto,telefono")
        .eq("empresa_id", empresaId)
        .order("nombre_contacto", { ascending: true })
        .limit(1000),
    ]);

    if (usuariosR.error) {
      return NextResponse.json(errorResponse(usuariosR.error.message), { status: 400 });
    }

    const responsables = ((usuariosR.data ?? []) as Record<string, unknown>[])
      .filter((u) => (u.estado == null || u.estado === "activo"))
      .map((u) => ({ id: String(u.id), nombre: (u.nombre as string | null) ?? null, rol: (u.rol as string | null) ?? null }));

    const clientes = ((clientesR.data ?? []) as Record<string, unknown>[]).map((c) => ({
      id: String(c.id),
      nombre:
        ((c.nombre_contacto as string | null)?.trim() ||
          (c.empresa as string | null)?.trim() ||
          null) ?? null,
      telefono: (c.telefono as string | null) ?? null,
    }));

    return NextResponse.json(
      successResponse({ responsables, clientes, tipos: TIPOS_SUGERIDOS })
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
