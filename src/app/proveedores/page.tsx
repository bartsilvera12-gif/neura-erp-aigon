import DeviceRouter from "@/shared/device/DeviceRouter";
import ProveedoresDesktop from "@/desktop/pages/ProveedoresDesktop";
import ProveedoresMobile from "@/mobile/pages/ProveedoresMobile";

/** Módulo Proveedores. */
export default function Page() {
  return <DeviceRouter desktop={<ProveedoresDesktop />} mobile={<ProveedoresMobile />} />;
}
