"use client";

import DesktopOnlyHint from "@/mobile/components/DesktopOnlyHint";

export default function ConfiguracionMobile() {
  return (
    <DesktopOnlyHint
      title="Configuración"
      description="La configuración del ERP (facturación, equipos, métricas, políticas, preferencias) se ajusta desde la computadora para evitar errores con formularios extensos."
      homeHref="/"
      homeLabel="Volver al inicio"
    />
  );
}
