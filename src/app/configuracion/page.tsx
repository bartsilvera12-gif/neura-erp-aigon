import DeviceRouter from "@/shared/device/DeviceRouter";
import ConfiguracionDesktop from "@/desktop/pages/ConfiguracionDesktop";
import ConfiguracionMobile from "@/mobile/pages/ConfiguracionMobile";

export default function Page() {
  return <DeviceRouter desktop={<ConfiguracionDesktop />} mobile={<ConfiguracionMobile />} />;
}
