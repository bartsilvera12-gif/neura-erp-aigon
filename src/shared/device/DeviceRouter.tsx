import "server-only";
import { getDeviceTypeFromRequest } from "./server";

/**
 * Conmuta entre dos árboles de UI según el dispositivo detectado server-side.
 *
 * Uso típico (en un layout o página server component):
 *
 *   <DeviceRouter
 *     desktop={<DesktopAppShell>{children}</DesktopAppShell>}
 *     mobile={<MobileAppShell>{children}</MobileAppShell>}
 *   />
 *
 * - El SSR ya elige el árbol correcto (sin flash) usando la cookie `neura-device`
 *   seteada por el middleware.
 * - Si el cliente detecta que el viewport contradice la cookie (caso iPad-as-Mac),
 *   actualiza la cookie y la siguiente navegación renderiza el árbol correcto.
 *
 * Si `mobile` no se provee, se usa `desktop` como fallback — útil para ir portando
 * páginas a la UI mobile gradualmente, módulo por módulo.
 */
export default async function DeviceRouter({
  desktop,
  mobile,
}: {
  desktop: React.ReactNode;
  mobile?: React.ReactNode;
}) {
  const device = await getDeviceTypeFromRequest();
  if (device === "mobile" && mobile !== undefined) return <>{mobile}</>;
  return <>{desktop}</>;
}
