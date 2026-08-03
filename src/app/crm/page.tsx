import DeviceRouter from "@/shared/device/DeviceRouter";
import CrmDesktop from "@/desktop/pages/CrmDesktop";
import CrmMobile from "@/mobile/pages/CrmMobile";

/** Módulo CRM. */
export default function Page() {
  return <DeviceRouter desktop={<CrmDesktop />} mobile={<CrmMobile />} />;
}
