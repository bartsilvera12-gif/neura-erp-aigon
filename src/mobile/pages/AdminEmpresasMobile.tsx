"use client";

import DesktopOnlyHint from "@/mobile/components/DesktopOnlyHint";

export default function AdminEmpresasMobile() {
  return (
    <DesktopOnlyHint
      title="Admin Empresas"
      description="La administración de empresas tenant del super-admin requiere acceso a tablas con muchas columnas y acciones críticas. Se opera desde la computadora."
      homeHref="/"
      homeLabel="Volver al inicio"
    />
  );
}
