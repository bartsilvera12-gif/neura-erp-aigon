import SorteosListClient from "./SorteosListClient";
import { getSorteosVentasKpis } from "@/lib/sorteos/ventas-kpis";
import { getDeviceTypeFromRequest } from "@/shared/device/server";
import SorteosMobile from "@/mobile/pages/SorteosMobile";

/** KPIs dependen de sesión y ventana calendario Paraguay; evitar cache estático de respuestas en 0. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function SorteosPage() {
  // Mobile no usa los KPIs server-rendered del desktop — corta antes del fetch.
  const device = await getDeviceTypeFromRequest();
  if (device === "mobile") {
    return <SorteosMobile />;
  }

  let ventasKpis = {
    boletosHoy: 0,
    boletosMes: 0,
    montoHoy: 0,
    montoMes: 0,
  };
  try {
    ventasKpis = await getSorteosVentasKpis();
  } catch {
    /* sin sesión o error de red: KPIs en cero */
  }
  return <SorteosListClient ventasKpis={ventasKpis} />;
}
