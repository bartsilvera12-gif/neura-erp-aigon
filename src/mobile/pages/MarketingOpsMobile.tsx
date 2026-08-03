"use client";

import DesktopOnlyHint from "@/mobile/components/DesktopOnlyHint";

/** Marketing Ops en mobile: vista placeholder. El módulo es muy denso (calendario,
 *  piezas, aprobaciones, briefs) y se opera mejor desde desktop. */
export default function MarketingOpsMobile() {
  return (
    <DesktopOnlyHint
      title="Marketing Ops"
      description="El calendario editorial, briefs y aprobaciones de piezas se ven y operan mejor desde la computadora. Pronto añadiremos vistas mobile específicas para revisar tareas asignadas y aprobar piezas."
      homeHref="/dashboard/marketing-ops"
      homeLabel="Abrir en desktop"
    />
  );
}
