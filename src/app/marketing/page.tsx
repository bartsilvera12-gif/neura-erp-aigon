import DeviceRouter from "@/shared/device/DeviceRouter";
import MarketingLegacyDesktop from "@/desktop/pages/MarketingLegacyDesktop";
import MarketingLegacyMobile from "@/mobile/pages/MarketingLegacyMobile";

export default function Page() {
  return <DeviceRouter desktop={<MarketingLegacyDesktop />} mobile={<MarketingLegacyMobile />} />;
}
