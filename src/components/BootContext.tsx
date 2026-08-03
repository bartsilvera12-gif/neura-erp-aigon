"use client";

import { createContext, useContext, useState } from "react";

type BootContextValue = {
  /** El Sidebar terminó de cargar los módulos del usuario. */
  sidebarReady: boolean;
  /** Marca el estado de carga del sidebar. true = listo, false = volvió a cargar. */
  setSidebarReady: (v: boolean) => void;
};

const BootContext = createContext<BootContextValue>({
  sidebarReady: false,
  setSidebarReady: () => {},
});

/**
 * Provider de señales de arranque del shell. Permite al AuthGuard mantener
 * la pantalla de carga visible hasta que el Sidebar haya completado su
 * fetch de módulos. Se mantiene reactivo a recargas posteriores (p. ej.
 * al volver a la pestaña, supabase emite un auth event que recarga el
 * menú; mostramos el loader durante esa recarga también).
 */
export function BootProvider({ children }: { children: React.ReactNode }) {
  // Default true: NO bloqueamos el primer paint esperando al Sidebar. El sidebar
  // tiene su propio skeleton interno mientras carga los módulos. En mobile, el
  // Sidebar ni siquiera se monta — antes el loader quedaba colgado para siempre.
  const [sidebarReady, setSidebarReady] = useState(true);

  return (
    <BootContext.Provider value={{ sidebarReady, setSidebarReady }}>
      {children}
    </BootContext.Provider>
  );
}

export function useBoot() {
  return useContext(BootContext);
}
