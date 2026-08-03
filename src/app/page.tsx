import { getDeviceTypeFromRequest } from "@/shared/device/server";
import { fetchDashboardMobileSummary } from "@/lib/dashboard/mobile-summary";
import DashboardDesktop from "@/desktop/pages/DashboardDesktop";
import DashboardMobile from "@/mobile/pages/DashboardMobile";

/**
 * Home / Dashboard.
 *
 * Optimización: para mobile, pre-fetchamos los KPIs server-side y los pasamos como
 * `initialData` al cliente. SWR los muestra ANTES de hidratar — sin skeleton flash.
 * Desktop sigue intacto, monta su componente client como antes.
 */
export default async function Page() {
  const device = await getDeviceTypeFromRequest();
  if (device === "mobile") {
    // Pre-warm: server fetch antes del primer paint. Si falla, el cliente se cae
    // al fetch normal (SWR muestra skeleton). Sin bloquear el render por errores.
    const initialData = await fetchDashboardMobileSummary(null).catch(() => null);
    return <DashboardMobile initialData={initialData ?? undefined} />;
  }
  return <DashboardDesktop />;
}
