"use client";

import DesktopOnlyHint from "@/mobile/components/DesktopOnlyHint";

export default function MonitoreoMobile() {
  return (
    <DesktopOnlyHint
      title="Monitoreo"
      description="El panel de monitoreo en tiempo real muestra muchos paneles simultáneos (conexiones, agentes activos, alertas) que requieren pantalla amplia para ser útiles. Operalo desde la computadora."
      homeHref="/dashboard/monitoreo"
      homeLabel="Abrir en desktop"
    />
  );
}
