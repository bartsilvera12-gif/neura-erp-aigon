import DeviceRouter from "@/shared/device/DeviceRouter";
import ClientesDesktop from "@/desktop/pages/ClientesDesktop";
import ClientesMobile from "@/mobile/pages/ClientesMobile";

/** Módulo Clientes: lista de clientes. DeviceRouter elige desktop vs mobile. */
export default function Page() {
  return <DeviceRouter desktop={<ClientesDesktop />} mobile={<ClientesMobile />} />;
}
