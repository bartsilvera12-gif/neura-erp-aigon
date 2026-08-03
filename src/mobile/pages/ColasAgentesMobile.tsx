"use client";

import DesktopOnlyHint from "@/mobile/components/DesktopOnlyHint";

export default function ColasAgentesMobile() {
  return (
    <DesktopOnlyHint
      title="Colas y Agentes"
      description="El tablero de operación omnicanal con asignaciones en tiempo real requiere pantalla amplia. Operalo desde la computadora."
      homeHref="/dashboard/conversaciones"
      homeLabel="Ir a Chats"
    />
  );
}
