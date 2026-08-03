"use client";

import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import Sidebar from "./layout/Sidebar";
import Header from "./layout/Header";
import AgentPresenceHeartbeat from "./AgentPresenceHeartbeat";

const STANDALONE_ROUTES = ["/login"];

/** Asistente de ayuda (Neurita) — apagado temporalmente.
 *  Para reactivar: ASSISTANT_KILL_SWITCH = false (y NEXT_PUBLIC_ASSISTANT_ENABLED=1 en Vercel). */
const ASSISTANT_KILL_SWITCH = true;
const ASSISTANT_ENABLED =
  !ASSISTANT_KILL_SWITCH && process.env.NEXT_PUBLIC_ASSISTANT_ENABLED === "1";

/** Carga diferida del widget: react-markdown + lógica del chat NO entran en el bundle principal,
 *  se descargan en un chunk aparte después de que la pantalla actual ya esté interactiva. */
const AssistantWidget = dynamic(() => import("./assistant/AssistantWidget"), { ssr: false });

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // /m/* = app móvil del asesor (Capacitor/APK): pantalla completa, sin sidebar/header del ERP.
  const isStandalone =
    !!pathname && (STANDALONE_ROUTES.includes(pathname) || pathname.startsWith("/m/"));

  /** Sidebar mobile: cerrado por defecto. En desktop (>=md) este estado no aplica:
   *  el sidebar siempre está visible en su flujo normal. */
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  /** Cerrar el sidebar mobile automáticamente al navegar entre pantallas. */
  useEffect(() => {
    setMobileSidebarOpen(false);
  }, [pathname]);

  if (isStandalone) {
    return <>{children}</>;
  }

  return (
    <div id="neura-app-shell" className="flex h-svh min-h-0 overflow-hidden bg-[#F8FAFC]">
      {/* Backdrop solo mobile: aparece cuando el sidebar está abierto en pantallas chicas. */}
      <button
        type="button"
        aria-label="Cerrar menú"
        aria-hidden={!mobileSidebarOpen}
        tabIndex={mobileSidebarOpen ? 0 : -1}
        onClick={() => setMobileSidebarOpen(false)}
        className={`fixed inset-0 z-40 bg-slate-900/55 backdrop-blur-sm transition-opacity duration-200 md:hidden ${
          mobileSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />
      <Sidebar
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />
      <div id="neura-main-column" className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        <Header onOpenMobileSidebar={() => setMobileSidebarOpen(true)} />
        <main id="neura-main-content" className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain p-4 sm:p-6">
          {children}
        </main>
      </div>
      {ASSISTANT_ENABLED && <AssistantWidget />}
      {/* Presencia global del agente: heartbeat en cualquier pantalla del ERP (no solo el inbox). */}
      <AgentPresenceHeartbeat />
    </div>
  );
}
