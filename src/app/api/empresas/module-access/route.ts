import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { getAuthUserForApiRoute } from "@/lib/auth/get-auth-user-for-api-route";
import { resolveUsuarioErpFromAuthUser } from "@/lib/auth/resolve-usuario-erp";
import { isBootstrapSuperAdminEmail } from "@/lib/auth/super-admin-bootstrap-email";
import { NextResponse } from "next/server";
import { resolveEffectiveModules } from "@/lib/modulos/resolve-effective-modules";

/**
 * Slugs de módulos efectivos para el usuario autenticado (intersección empresa ∩ usuario).
 * super_admin → todos los slugs del catálogo.
 */
export async function GET(request: Request) {
  try {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!url || !anonKey || !serviceKey) {
      return NextResponse.json({ error: "Config no disponible" }, { status: 500 });
    }

    const user = await getAuthUserForApiRoute(request);
    if (!user?.id) {
      return NextResponse.json({ error: "No autenticado" }, { status: 401 });
    }

    const supabase = createServiceRoleClient();

    const usuario = await resolveUsuarioErpFromAuthUser(supabase, user);

    if (!usuario) {
      if (isBootstrapSuperAdminEmail(user.email)) {
        const modulos = await resolveEffectiveModules(supabase, {
          id: user.id,
          empresa_id: null,
          rol: "super_admin",
        });
        return NextResponse.json({
          superAdmin: true,
          slugs: modulos.map((m) => m.slug).filter(Boolean),
          modulos: modulos.map((m) => ({ id: m.id, nombre: m.nombre, slug: m.slug })),
        });
      }
      return NextResponse.json({ superAdmin: false, slugs: [], modulos: [] });
    }

    const modulos = await resolveEffectiveModules(supabase, {
      id: usuario.id,
      empresa_id: usuario.empresa_id,
      rol: usuario.rol,
    });

    const superAdmin = (usuario.rol ?? "").trim() === "super_admin";

    return NextResponse.json({
      superAdmin,
      slugs: modulos.map((m) => m.slug).filter(Boolean),
      modulos: modulos.map((m) => ({ id: m.id, nombre: m.nombre, slug: m.slug })),
    });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
