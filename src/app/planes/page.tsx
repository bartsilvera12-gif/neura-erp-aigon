import DeviceRouter from "@/shared/device/DeviceRouter";
import PlanesDesktop from "@/desktop/pages/PlanesDesktop";
import PlanesMobile from "@/mobile/pages/PlanesMobile";

/** Módulo Planes. */
export default function Page() {
  return <DeviceRouter desktop={<PlanesDesktop />} mobile={<PlanesMobile />} />;
}
