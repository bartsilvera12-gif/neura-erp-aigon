import DeviceRouter from "@/shared/device/DeviceRouter";
import NotasCreditoDesktop from "@/desktop/pages/NotasCreditoDesktop";
import NotasCreditoMobile from "@/mobile/pages/NotasCreditoMobile";

/** Módulo Notas de Crédito. DeviceRouter elige desktop vs mobile. */
export default function Page() {
  return <DeviceRouter desktop={<NotasCreditoDesktop />} mobile={<NotasCreditoMobile />} />;
}
