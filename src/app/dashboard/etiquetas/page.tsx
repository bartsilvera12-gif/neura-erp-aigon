import DeviceRouter from "@/shared/device/DeviceRouter";
import EtiquetasDesktop from "@/desktop/pages/EtiquetasDesktop";
import EtiquetasMobile from "@/mobile/pages/EtiquetasMobile";

export default function Page() {
  return <DeviceRouter desktop={<EtiquetasDesktop />} mobile={<EtiquetasMobile />} />;
}
