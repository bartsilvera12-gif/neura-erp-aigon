import DeviceRouter from "@/shared/device/DeviceRouter";
import PagosDesktop from "@/desktop/pages/PagosDesktop";
import PagosMobile from "@/mobile/pages/PagosMobile";

/** Módulo Pagos: gestión de cobros. DeviceRouter elige desktop vs mobile. */
export default function Page() {
  return <DeviceRouter desktop={<PagosDesktop />} mobile={<PagosMobile />} />;
}
