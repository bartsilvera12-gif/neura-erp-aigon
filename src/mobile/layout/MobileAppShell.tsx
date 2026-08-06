"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import BottomNav from "./BottomNav";
import MobileHeader from "./MobileHeader";
import MobileMenu from "./MobileMenu";
import { useApkView } from "@/shared/hooks/useApkView";
import CapacitorPushRegister from "@/components/CapacitorPushRegister";
import ApkLandingRedirect from "@/components/ApkLandingRedirect";

const STANDALONE_ROUTES = ["/login"];

/**
 * Shell mobile del ERP. Liviano — sin framer-motion.
 *
 *  ┌──────────────────────────────┐
 *  │  MobileHeader (sticky top)   │
 *  ├──────────────────────────────┤
 *  │      Contenido (main)        │
 *  ├──────────────────────────────┤
 *  │  BottomNav (fixed bottom)    │
 *  └──────────────────────────────┘
 *
 *  Menú lateral: MobileMenu (CSS-only) que se desliza desde la izquierda al tocar
 *  el ícono de menú del header o "Más" del bottom nav. NO usa el Sidebar desktop
 *  (que carga framer-motion + favoritos + búsqueda compleja).
 */
export default function MobileAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const apkView = useApkView();
  // /m/* = app móvil del asesor (Capacitor/APK): pantalla completa, sin header/bottom-nav del ERP.
  // apkView (query ?apkView=1 + sessionStorage) = APK Aigon: solo mostramos el contenido.
  const isStandalone =
    apkView ||
    (!!pathname && (STANDALONE_ROUTES.includes(pathname) || pathname.startsWith("/m/")));
  const [menuOpen, setMenuOpen] = useState(false);

  // Cerrar el menú al cambiar de ruta.
  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  if (isStandalone) {
    if (apkView) {
      return (
        <div
          className="flex h-svh min-h-0 flex-col overflow-hidden bg-[#F8FAFC]"
          style={{ paddingTop: "env(safe-area-inset-top)" }}
        >
          {/* Registra el token FCM del dispositivo. No-op fuera de la APK nativa. */}
          <CapacitorPushRegister />
          <ApkLandingRedirect />
          <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain">
            {children}
          </main>
        </div>
      );
    }
    return <>{children}</>;
  }

  return (
    <div
      className="flex h-svh min-h-0 flex-col overflow-hidden bg-[#F8FAFC]"
      style={{ paddingTop: "env(safe-area-inset-top)" }}
    >
      <MobileMenu open={menuOpen} onClose={() => setMenuOpen(false)} />

      <MobileHeader onOpenMenu={() => setMenuOpen(true)} />

      <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain pb-16">
        {children}
      </main>

      <BottomNav onOpenMenu={() => setMenuOpen(true)} />
    </div>
  );
}
