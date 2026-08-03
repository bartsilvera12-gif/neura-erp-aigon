import DeviceRouter from "@/shared/device/DeviceRouter";
import VentasDesktop from "@/desktop/pages/VentasDesktop";
import VentasMobile from "@/mobile/pages/VentasMobile";

/** Módulo Ventas: lista de ventas. DeviceRouter elige desktop vs mobile. */
export default function Page() {
  return <DeviceRouter desktop={<VentasDesktop />} mobile={<VentasMobile />} />;
}
