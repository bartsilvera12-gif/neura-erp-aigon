"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Banknote,
  Building2,
  CalendarDays,
  FileText,
  FolderKanban,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Megaphone,
  MessageCircle,
  Package,
  Percent,
  Receipt,
  ScrollText,
  Search,
  SendHorizontal,
  Settings,
  ShoppingCart,
  Sparkles,
  Tags,
  Ticket,
  TrendingUp,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { signOut } from "@/lib/auth";
import { useRouter } from "next/navigation";

/**
 * Menú lateral mobile (sheet) — versión liviana.
 *
 * NO usa framer-motion, NO carga la búsqueda de favoritos ni submenús expandibles.
 * Solo CSS transitions (translate-x). Sirve como nav lateral cuando el usuario toca
 * el botón "☰" del header o "Más" del bottom nav. La autenticación / módulos
 * habilitados se respetan: los items deshabilitados igual aparecen pero el routing
 * server-side los rechazará (lo mismo hace la versión desktop si el usuario hace
 * click sin permiso).
 *
 * Performance: render ~50ms vs ~4s del Sidebar desktop con framer.
 */

type Item = {
  href: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
};

type Section = {
  title: string;
  items: Item[];
};

/**
 * Mismas familias que el sidebar desktop (Sidebar.tsx · MENU_FAMILIES), para que
 * la navegación sea coherente en ambos dispositivos. Solo agrupamiento visual:
 * mismas rutas/labels, sin inventar módulos ni cambiar permisos.
 */
const SECTIONS: Section[] = [
  {
    title: "Inicio",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/dashboard/gerencia", label: "Gerencia", icon: TrendingUp },
    ],
  },
  {
    title: "Comercial",
    items: [
      { href: "/clientes", label: "Clientes", icon: Users },
      { href: "/crm", label: "CRM Funnel", icon: Sparkles },
      { href: "/gestion-clientes", label: "Gestión Clientes", icon: Users },
      { href: "/ventas", label: "Ventas", icon: ShoppingCart },
      { href: "/comisiones", label: "Comisiones", icon: Percent },
      { href: "/planes", label: "Planes", icon: FileText },
      { href: "/dashboard/agenda", label: "Agenda", icon: CalendarDays },
    ],
  },
  {
    title: "Finanzas",
    items: [
      { href: "/pagos", label: "Pagos", icon: Banknote },
      { href: "/gastos", label: "Gastos", icon: Receipt },
      { href: "/notas-credito", label: "Notas de crédito", icon: ScrollText },
      { href: "/reportes", label: "Reportes", icon: BarChart3 },
    ],
  },
  {
    title: "Operaciones",
    items: [
      { href: "/inventario", label: "Inventario", icon: Package },
      { href: "/compras", label: "Compras", icon: Package },
      { href: "/proveedores", label: "Proveedores", icon: Building2 },
      { href: "/dashboard/proyectos", label: "Proyectos", icon: FolderKanban },
    ],
  },
  {
    title: "Omnicanal",
    items: [
      { href: "/dashboard/conversaciones", label: "Conversaciones", icon: MessageCircle },
      { href: "/dashboard/conversaciones-finalizadas", label: "Finalizadas", icon: ListChecks },
      { href: "/dashboard/monitoreo", label: "Monitoreo", icon: Sparkles },
      { href: "/dashboard/campanas", label: "Campañas", icon: SendHorizontal },
      { href: "/dashboard/etiquetas", label: "Etiquetas", icon: Tags },
    ],
  },
  {
    title: "Marketing y Automatización",
    items: [
      { href: "/dashboard/marketing-ops", label: "Marketing Ops", icon: Megaphone },
      { href: "/sorteos", label: "Sorteos", icon: Ticket },
    ],
  },
  {
    title: "Administración",
    items: [
      { href: "/usuarios", label: "Usuarios", icon: UserCog },
      { href: "/configuracion", label: "Configuración", icon: Settings },
    ],
  },
];

export default function MobileMenu({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const pathname = usePathname() ?? "/";
  const router = useRouter();
  const [query, setQuery] = useState("");

  // ESC para cerrar.
  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll cuando está abierto.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Limpiar búsqueda al cerrar.
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const filteredSections = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SECTIONS;
    return SECTIONS
      .map((s) => ({
        ...s,
        items: s.items.filter((it) => it.label.toLowerCase().includes(q)),
      }))
      .filter((s) => s.items.length > 0);
  }, [query]);

  return (
    <>
      {/* Backdrop */}
      <button
        type="button"
        aria-label="Cerrar menú"
        aria-hidden={!open}
        tabIndex={open ? 0 : -1}
        onClick={onClose}
        className={`fixed inset-0 z-40 bg-slate-900/55 backdrop-blur-sm transition-opacity duration-150 md:hidden ${
          open ? "opacity-100" : "pointer-events-none opacity-0"
        }`}
      />

      {/* Sheet panel */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[280px] max-w-[85vw] flex-col bg-[color:var(--zentra-sidebar)] shadow-2xl transition-transform duration-200 ease-out md:hidden ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        aria-label="Menú principal"
      >
        {/* Header del menú */}
        <div className="flex shrink-0 items-center justify-between gap-2 border-b border-[color:var(--zentra-sidebar-border)] bg-[color:var(--zentra-sidebar-elevated)]/35 px-3 py-3">
          <Link href="/" onClick={onClose} className="flex items-center">
            <Image
              src="/brand/zentra-logo-official.png"
              alt="ZENTRA"
              width={160}
              height={48}
              sizes="160px"
              className="h-10 w-auto object-contain"
              priority={false}
            />
          </Link>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar menú"
            className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Búsqueda */}
        <div className="shrink-0 border-b border-[color:var(--zentra-sidebar-border)] px-3 py-2.5">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              placeholder="Buscar…"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-lg border border-white/[0.08] bg-white/[0.04] py-2 pl-9 pr-3 text-base text-white outline-none placeholder:text-slate-500 focus:border-[#7DCFD2]/40 focus:bg-white/[0.06]"
            />
          </div>
        </div>

        {/* Lista de secciones */}
        <nav className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-2 py-2 [scrollbar-width:thin]">
          {filteredSections.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-slate-400">Sin resultados</p>
          ) : (
            filteredSections.map((section) => (
              <div key={section.title} className="mb-4">
                <p className="mb-1 px-3 text-[13px] font-bold uppercase tracking-[0.1em] text-slate-300">
                  {section.title}
                </p>
                <ul>
                  {section.items.map((item) => {
                    const Icon = item.icon;
                    const active =
                      pathname === item.href ||
                      (item.href !== "/" && pathname.startsWith(item.href + "/"));
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onClose}
                          className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                            active
                              ? "bg-[#7DCFD2]/15 font-semibold text-white"
                              : "text-slate-300 hover:bg-white/[0.04] hover:text-white"
                          }`}
                        >
                          <Icon
                            className={`h-[18px] w-[18px] shrink-0 ${
                              active ? "text-[#7DCFD2]" : "text-slate-400"
                            }`}
                          />
                          <span className="flex-1 truncate">{item.label}</span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </nav>

        {/* Footer con logout */}
        <div className="shrink-0 border-t border-[color:var(--zentra-sidebar-border)] p-2">
          <button
            type="button"
            onClick={async () => {
              onClose();
              await signOut();
              router.push("/login");
            }}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-slate-300 transition-colors hover:bg-white/[0.04] hover:text-white"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      </aside>
    </>
  );
}
