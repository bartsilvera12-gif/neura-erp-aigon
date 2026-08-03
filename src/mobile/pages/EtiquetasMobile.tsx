"use client";

import DesktopOnlyHint from "@/mobile/components/DesktopOnlyHint";

export default function EtiquetasMobile() {
  return (
    <DesktopOnlyHint
      title="Etiquetas"
      description="La administración de etiquetas para conversaciones, clientes y CRM se hace desde la computadora."
      homeHref="/"
      homeLabel="Volver al inicio"
    />
  );
}
