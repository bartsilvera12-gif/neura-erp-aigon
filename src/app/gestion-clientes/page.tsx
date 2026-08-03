import DeviceRouter from "@/shared/device/DeviceRouter";
import GestionClientesDesktop from "@/desktop/pages/GestionClientesDesktop";
import GestionClientesMobile from "@/mobile/pages/GestionClientesMobile";

/** Módulo Gestión de Clientes. */
export default function Page() {
  return <DeviceRouter desktop={<GestionClientesDesktop />} mobile={<GestionClientesMobile />} />;
}
