"use client";

import DesktopOnlyHint from "@/mobile/components/DesktopOnlyHint";

export default function MarketingLegacyMobile() {
  return (
    <DesktopOnlyHint
      title="Marketing"
      description="Esta es la vista legacy del módulo Marketing. La nueva versión optimizada para mobile vive en Marketing Ops y Campañas (acceso desde el menú principal)."
      homeHref="/dashboard/marketing-ops"
      homeLabel="Ir a Marketing Ops"
    />
  );
}
