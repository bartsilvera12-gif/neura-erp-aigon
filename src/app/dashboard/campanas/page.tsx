import DeviceRouter from "@/shared/device/DeviceRouter";
import CampanasDesktop from "@/desktop/pages/CampanasDesktop";
import CampanasMobile from "@/mobile/pages/CampanasMobile";

/** Módulo Campañas. */
export default function Page() {
  return <DeviceRouter desktop={<CampanasDesktop />} mobile={<CampanasMobile />} />;
}
