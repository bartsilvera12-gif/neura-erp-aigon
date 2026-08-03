"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LayoutDashboard, MessageCircle, ShoppingCart, Users, Menu } from "lucide-react";

/**
 * Navegación inferior fija para la UI mobile. 5 secciones primarias + "Más" que abre
 * el menú completo en un sheet desde la izquierda (reutiliza el sidebar existente
 * inicialmente; más adelante se reemplaza por una pantalla de menú nativa mobile).
 *
 * Diseño:
 *  - Altura 56px (estándar Material/iOS bottom nav).
 *  - Safe area bottom (env(safe-area-inset-bottom)) para iPhones con notch.
 *  - Activo: ícono + label en color de marca.
 *  - Inactivo: ícono outline + label en muted.
 */

type NavItem = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  matchPrefix?: string;
};

const NAV_ITEMS: NavItem[] = [
  { href: "/", label: "Inicio", icon: LayoutDashboard },
  {
    href: "/dashboard/conversaciones",
    label: "Chats",
    icon: MessageCircle,
    matchPrefix: "/dashboard/conversaciones",
  },
  { href: "/ventas", label: "Ventas", icon: ShoppingCart, matchPrefix: "/ventas" },
  { href: "/clientes", label: "Clientes", icon: Users, matchPrefix: "/clientes" },
];

export default function BottomNav({ onOpenMenu }: { onOpenMenu: () => void }) {
  const pathname = usePathname() ?? "/";

  const isActive = (item: NavItem): boolean => {
    if (item.matchPrefix) {
      return pathname === item.matchPrefix || pathname.startsWith(item.matchPrefix + "/");
    }
    return pathname === item.href;
  };

  return (
    <nav
      aria-label="Navegación principal"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 backdrop-blur-md"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
    >
      <ul className="mx-auto flex h-14 max-w-3xl items-stretch justify-around">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item);
          return (
            <li key={item.href} className="flex-1">
              <Link
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={`flex h-full min-h-[44px] flex-col items-center justify-center gap-0.5 px-1 transition-colors ${
                  active ? "text-[#0EA5E9]" : "text-slate-500 hover:text-slate-700"
                }`}
              >
                <Icon className="h-5 w-5" aria-hidden />
                <span className="text-[10px] font-medium tracking-tight">{item.label}</span>
              </Link>
            </li>
          );
        })}
        <li className="flex-1">
          <button
            type="button"
            onClick={onOpenMenu}
            className="flex h-full min-h-[44px] w-full flex-col items-center justify-center gap-0.5 px-1 text-slate-500 transition-colors hover:text-slate-700"
            aria-label="Abrir menú completo"
          >
            <Menu className="h-5 w-5" aria-hidden />
            <span className="text-[10px] font-medium tracking-tight">Más</span>
          </button>
        </li>
      </ul>
    </nav>
  );
}
