import DeviceRouter from "@/shared/device/DeviceRouter";
import AdminEmpresasDesktop from "@/desktop/pages/AdminEmpresasDesktop";
import AdminEmpresasMobile from "@/mobile/pages/AdminEmpresasMobile";

export default function Page() {
  return <DeviceRouter desktop={<AdminEmpresasDesktop />} mobile={<AdminEmpresasMobile />} />;
}
