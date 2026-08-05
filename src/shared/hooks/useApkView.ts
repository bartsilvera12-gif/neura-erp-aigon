"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";

/**
 * Detecta si la app está corriendo dentro de la APK Capacitor con vista minimal.
 *
 * Se activa cuando la URL trae `?apkView=1` (así la carga la APK en
 * `capacitor.config.ts`) y queda pegado en sessionStorage — mantiene la vista
 * minimal aunque el usuario navegue dentro de la WebView, sin necesidad de
 * arrastrar la query en todos los links.
 */
const STORAGE_KEY = "aigon-apk-view";

export function useApkView(): boolean {
  const searchParams = useSearchParams();
  const [apkView, setApkView] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (searchParams?.get("apkView") === "1") {
        window.sessionStorage.setItem(STORAGE_KEY, "1");
        setApkView(true);
        return;
      }
      if (window.sessionStorage.getItem(STORAGE_KEY) === "1") {
        setApkView(true);
      }
    } catch {
      // sessionStorage puede fallar en modo privado; ignorar.
    }
  }, [searchParams]);

  return apkView;
}
