import { redirect } from "next/navigation";
import { getDeviceTypeFromRequest } from "@/shared/device/server";
import { fetchDashboardMobileSummary } from "@/lib/dashboard/mobile-summary";
import DashboardDesktop from "@/desktop/pages/DashboardDesktop";
import DashboardMobile from "@/mobile/pages/DashboardMobile";
import { resolveUsuarioErpFromAuthUser } from "@/lib/auth/resolve-usuario-erp";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { resolveEffectiveModules } from "@/lib/modulos/resolve-effective-modules";
import { firstAccessibleHref, canAccessSidebarSlug } from "@/lib/modulos/route-slug-map";
import { isBootstrapSuperAdminEmail } from "@/lib/auth/super-admin-bootstrap-email";

/**
 * Home / Dashboard.
 *
 * Usuarios SIN módulo dashboard (típicos vendedores omnicanal) NO deben caer aquí
 * — redirigimos server-side a su primera ruta accesible (usualmente
 * /dashboard/conversaciones). Evita ver un dashboard vacío o error 403.
 */
export default async function Page() {
  // Gate por módulos: si no puede entrar al dashboard, se lo lleva a su home real.
  try {
    const catalogClient = await createSupabaseServerClient();
    const { data: { user } } = await catalogClient.auth.getUser();
    if (user?.id) {
      const sb = createServiceRoleClient();
      const usuario = await resolveUsuarioErpFromAuthUser(sb, user);
      const isSuper = usuario
        ? (usuario.rol ?? "").trim() === "super_admin"
        : isBootstrapSuperAdminEmail(user.email);
      if (!isSuper && usuario) {
        const modulos = await resolveEffectiveModules(sb, {
          id: usuario.id,
          empresa_id: usuario.empresa_id,
          rol: usuario.rol,
        });
        const slugs = new Set(modulos.map((m) => m.slug).filter(Boolean));
        if (!canAccessSidebarSlug("dashboard", slugs, false)) {
          const target = firstAccessibleHref(slugs, { superAdmin: false });
          if (target && target !== "/") redirect(target);
        }
      }
    }
  } catch (e) {
    // `redirect()` de Next.js lanza un error especial que NO hay que tragar.
    if (e && typeof e === "object" && "digest" in e) throw e;
    // Otras excepciones: la resolución falló, dejamos cargar normal.
  }

  const device = await getDeviceTypeFromRequest();
  if (device === "mobile") {
    const initialData = await fetchDashboardMobileSummary(null).catch(() => null);
    return <DashboardMobile initialData={initialData ?? undefined} />;
  }
  return <DashboardDesktop />;
}
