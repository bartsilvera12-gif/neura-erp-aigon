"use client";

import DesktopOnlyHint from "@/mobile/components/DesktopOnlyHint";

export default function ConversacionesFinalizadasMobile() {
  return (
    <DesktopOnlyHint
      title="Conversaciones finalizadas"
      description="El listado de conversaciones finalizadas con métricas y filtros se ve mejor desde la computadora."
      homeHref="/dashboard/conversaciones"
      homeLabel="Ir a Chats"
    />
  );
}
