import DeviceRouter from "@/shared/device/DeviceRouter";
import MarketingOpsClient from "./components/MarketingOpsClient";
import MarketingOpsMobile from "@/mobile/pages/MarketingOpsMobile";

export default function MarketingOpsPage() {
  return <DeviceRouter desktop={<MarketingOpsClient />} mobile={<MarketingOpsMobile />} />;
}
