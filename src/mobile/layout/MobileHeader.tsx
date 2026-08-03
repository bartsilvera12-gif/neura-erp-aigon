"use client";

import { Bell, Menu } from "lucide-react";
import { useUsuarioActual } from "@/shared/hooks/useUsuarioActual";

/**
 * Header mobile: 48px de alto, sticky top. Contenido:
 *  - Botón menú (izquierda) — abre el sheet con el menú completo.
 *  - Marca "Zentra" (centro, lectura rápida).
 *  - Notificaciones (derecha) — placeholder por ahora.
 *
 * Usa el hook compartido useUsuarioActual (SWR con dedupe largo) para no
 * disparar una request por cada navegación entre pantallas mobile.
 */

export default function MobileHeader({ onOpenMenu }: { onOpenMenu: () => void }) {
  const { usuario } = useUsuarioActual();
  const avatarInitial = (usuario?.nombre ?? usuario?.email ?? "U").trim().charAt(0).toUpperCase();

  return (
    <header className="z-30 flex h-12 shrink-0 items-center justify-between gap-2 border-b border-slate-200 bg-white/95 px-2 backdrop-blur-sm">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Abrir menú"
        className="flex h-11 w-11 items-center justify-center rounded-lg text-[#475569] transition-colors hover:bg-slate-50 hover:text-[#0EA5E9]"
      >
        <Menu className="h-5 w-5" />
      </button>

      <h1 className="text-sm font-semibold tracking-tight text-[#0F172A]">ZENTRA</h1>

      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Notificaciones"
          className="relative flex h-11 w-11 items-center justify-center rounded-lg text-[#475569] transition-colors hover:bg-slate-50 hover:text-[#0EA5E9]"
        >
          <Bell className="h-5 w-5" />
        </button>
        <div
          aria-label={usuario?.nombre ?? "Usuario"}
          className="flex h-8 w-8 items-center justify-center rounded-full bg-[color:var(--zentra-sidebar)] text-[13px] font-bold text-white ring-1 ring-sky-400/35"
        >
          {avatarInitial}
        </div>
      </div>
    </header>
  );
}
