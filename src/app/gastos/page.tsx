import DeviceRouter from "@/shared/device/DeviceRouter";
import GastosDesktop from "@/desktop/pages/GastosDesktop";
import GastosMobile from "@/mobile/pages/GastosMobile";

/** Módulo Gastos. */
export default function Page() {
  return <DeviceRouter desktop={<GastosDesktop />} mobile={<GastosMobile />} />;
}
