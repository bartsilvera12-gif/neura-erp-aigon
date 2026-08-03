import DeviceRouter from "@/shared/device/DeviceRouter";
import UsuariosDesktop from "@/desktop/pages/UsuariosDesktop";
import UsuariosMobile from "@/mobile/pages/UsuariosMobile";

/** Módulo Usuarios. */
export default function Page() {
  return <DeviceRouter desktop={<UsuariosDesktop />} mobile={<UsuariosMobile />} />;
}
