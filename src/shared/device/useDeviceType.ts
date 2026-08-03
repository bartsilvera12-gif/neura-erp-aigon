"use client";

import { useEffect, useState } from "react";
import { DESKTOP_MIN_WIDTH_PX, DEVICE_COOKIE_NAME, type DeviceType } from "./detect";

/** Hook reactivo al ancho de viewport.
 *  - Pre-mount: devuelve el valor pasado como `initial` (typicamente lo decidido server-side
 *    desde la cookie/UA) para evitar flash de hidratación.
 *  - Post-mount: subscribe a matchMedia y actualiza si cambia (rotación, resize).
 *  - Si el cliente detecta un tipo distinto al inicial (caso iPad-as-Mac), actualiza la cookie
 *    `neura-device` para que la próxima navegación SSR renderice la UI correcta. NO recarga la
 *    página automáticamente — eso depende del componente padre.
 */
export function useDeviceType(initial: DeviceType): DeviceType {
  const [device, setDevice] = useState<DeviceType>(initial);

  useEffect(() => {
    const mq = window.matchMedia(`(min-width: ${DESKTOP_MIN_WIDTH_PX}px)`);
    const decide = (e: { matches: boolean } | MediaQueryList): DeviceType =>
      e.matches ? "desktop" : "mobile";

    const apply = (next: DeviceType) => {
      setDevice((prev) => (prev === next ? prev : next));
      // Persistimos para que el próximo render SSR ya elija correctamente.
      if (typeof document !== "undefined") {
        const oneYear = 60 * 60 * 24 * 365;
        document.cookie = `${DEVICE_COOKIE_NAME}=${next}; path=/; max-age=${oneYear}; SameSite=Lax`;
      }
    };

    apply(decide(mq));

    const listener = (e: MediaQueryListEvent) => apply(decide(e));
    mq.addEventListener("change", listener);
    return () => mq.removeEventListener("change", listener);
  }, []);

  return device;
}
