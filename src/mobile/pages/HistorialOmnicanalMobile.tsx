"use client";

import DesktopOnlyHint from "@/mobile/components/DesktopOnlyHint";

export default function HistorialOmnicanalMobile() {
  return (
    <DesktopOnlyHint
      title="Historial Omnicanal"
      description="El historial completo de conversaciones, transferencias y eventos es una tabla densa con muchas columnas. Se ve mejor desde la computadora. En mobile podés acceder a las conversaciones activas desde la pestaña Chats."
      homeHref="/dashboard/conversaciones"
      homeLabel="Ir a Chats"
    />
  );
}
