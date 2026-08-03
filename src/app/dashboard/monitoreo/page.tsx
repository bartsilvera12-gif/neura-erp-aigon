import DeviceRouter from "@/shared/device/DeviceRouter";
import MonitoreoDesktop from "@/desktop/pages/MonitoreoDesktop";
import MonitoreoMobile from "@/mobile/pages/MonitoreoMobile";

export default function Page() {
  return <DeviceRouter desktop={<MonitoreoDesktop />} mobile={<MonitoreoMobile />} />;
}
