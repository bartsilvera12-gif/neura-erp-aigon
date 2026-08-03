import DeviceRouter from "@/shared/device/DeviceRouter";
import ReportesDesktop from "@/desktop/pages/ReportesDesktop";
import ReportesMobile from "@/mobile/pages/ReportesMobile";

/** Módulo Reportes. */
export default function Page() {
  return <DeviceRouter desktop={<ReportesDesktop />} mobile={<ReportesMobile />} />;
}
