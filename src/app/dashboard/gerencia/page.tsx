import DeviceRouter from "@/shared/device/DeviceRouter";
import GerenciaClient from "./GerenciaClient";
import GerenciaMobile from "@/mobile/pages/GerenciaMobile";

export const dynamic = "force-dynamic";

/** Módulo Gerencia. DeviceRouter elige desktop (tablero completo) vs mobile (KPIs esenciales). */
export default function GerenciaPage() {
  return <DeviceRouter desktop={<GerenciaClient />} mobile={<GerenciaMobile />} />;
}
