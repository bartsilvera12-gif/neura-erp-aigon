import DeviceRouter from "@/shared/device/DeviceRouter";
import ComprasDesktop from "@/desktop/pages/ComprasDesktop";
import ComprasMobile from "@/mobile/pages/ComprasMobile";

/** Módulo Compras. */
export default function Page() {
  return <DeviceRouter desktop={<ComprasDesktop />} mobile={<ComprasMobile />} />;
}
