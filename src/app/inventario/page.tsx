import DeviceRouter from "@/shared/device/DeviceRouter";
import InventarioDesktop from "@/desktop/pages/InventarioDesktop";
import InventarioMobile from "@/mobile/pages/InventarioMobile";

/** Módulo Inventario: lista de productos. DeviceRouter elige desktop vs mobile. */
export default function Page() {
  return <DeviceRouter desktop={<InventarioDesktop />} mobile={<InventarioMobile />} />;
}
