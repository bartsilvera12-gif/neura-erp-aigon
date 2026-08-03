import DeviceRouter from "@/shared/device/DeviceRouter";
import AgendaClient from "./AgendaClient";
import AgendaMobile from "@/mobile/pages/AgendaMobile";

export const dynamic = "force-dynamic";

/** Módulo Agenda. DeviceRouter elige desktop (calendario completo) vs mobile (agenda del día). */
export default function AgendaPage() {
  return <DeviceRouter desktop={<AgendaClient />} mobile={<AgendaMobile />} />;
}
