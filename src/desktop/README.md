# `src/desktop/`

UI desktop del ERP. Conserva la implementación original — **no se altera visualmente
ni en comportamiento** durante el refactor mobile.

A partir de la Fase 2 del proyecto mobile, las páginas grandes (Dashboard, etc.) se van
moviendo desde `src/app/**/page.tsx` hacia acá como componentes nombrados, y el
`page.tsx` correspondiente queda como un wrapper fino que delega al `DeviceRouter`.

Ejemplo:

```tsx
// src/app/page.tsx
import DeviceRouter from "@/shared/device/DeviceRouter";
import DashboardDesktop from "@/desktop/pages/DashboardDesktop";
import DashboardMobile from "@/mobile/pages/DashboardMobile";

export default function Page() {
  return <DeviceRouter desktop={<DashboardDesktop />} mobile={<DashboardMobile />} />;
}
```

## Regla

NO se introducen cambios visuales ni cambios de comportamiento desktop durante el
proyecto mobile. Si una refactorización beneficia a ambas UIs (ej. dedup de utilidades),
se hace cuando exista una segunda motivación independiente, no por estética.
