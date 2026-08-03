import DeviceRouter from "@/shared/device/DeviceRouter";
import ComisionesDesktop from "@/desktop/pages/ComisionesDesktop";
import ComisionesMobile from "@/mobile/pages/ComisionesMobile";

/** Módulo Comisiones. */
export default function Page() {
  return <DeviceRouter desktop={<ComisionesDesktop />} mobile={<ComisionesMobile />} />;
}
