"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Landing de la APK: fuerza `/dashboard/conversaciones` cuando la WebView abre en `/`.
 *
 * Capacitor no garantiza respetar el path de `server.url` (según versión y plataforma
 * carga solo el origen), así que la APK terminaba en el Dashboard. Este redirect lo
 * resuelve del lado de la app, que sí es determinista.
 *
 * Solo actúa en modo apkView y solo desde la raíz: si el usuario navegó a otra pantalla
 * (o entró por el deep link de una notificación) no lo movemos de lugar.
 */
export default function ApkLandingRedirect() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (pathname === "/") {
      router.replace("/dashboard/conversaciones");
    }
  }, [pathname, router]);

  return null;
}
