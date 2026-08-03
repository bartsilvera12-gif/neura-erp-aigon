"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  LayoutDashboard,
  ShoppingCart,
  Package,
  Users,
  FileText,
  Settings,
  UserCog,
  Building2,
  ChevronDown,
  ChevronRight,
  Star,
  Sparkles,
  PanelLeftClose,
  PanelLeft,
  Search,
  Receipt,
  Banknote,
  Megaphone,
  Ticket,
  SendHorizontal,
  MessageCircle,
  History,
  Activity,
  TrendingUp,
  ScrollText,
  ListChecks,
  FolderKanban,
  Percent,
  Tags,
  CalendarDays,
  BarChart3,
  HandCoins,
} from "lucide-react";
import type { Session } from "@supabase/supabase-js";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { getCurrentUser } from "@/lib/auth";
import { isBootstrapSuperAdminEmail } from "@/lib/auth/super-admin-bootstrap-email";
import { supabase } from "@/lib/supabase";
import type { ModuloEmpresa } from "@/lib/empresas/actions";
import { getFavoritos, toggleFavorito } from "@/lib/favorites";
import { canAccessSidebarSlug } from "@/lib/modulos/route-slug-map";
import { useBoot } from "@/components/BootContext";

type MenuItem = {
  key: string;
  slug: string;
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  children?: { label: string; href: string; exactMatch?: boolean }[];
  showWhen?: string;
};

function menuChildPathActive(path: string, childHref: string, exactMatch?: boolean): boolean {
  if (path === childHref) return true;
  if (exactMatch) return false;
  return path.startsWith(`${childHref}/`);
}

/** Normaliza texto para búsqueda en el menú (sin acentos, minúsculas). */
function normalizeMenuSearch(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "");
}

function menuItemMatchesQuery(item: MenuItem, queryRaw: string): boolean {
  const q = normalizeMenuSearch(queryRaw);
  if (!q) return true;
  if (normalizeMenuSearch(item.label).includes(q)) return true;
  return item.children?.some((c) => normalizeMenuSearch(c.label).includes(q)) ?? false;
}

function adminEmpresasMatchesQuery(queryRaw: string): boolean {
  const q = normalizeMenuSearch(queryRaw);
  if (!q) return true;
  const label = normalizeMenuSearch("Admin Empresas");
  return label.includes(q) || normalizeMenuSearch("empresas").includes(q);
}

const MENU_STRUCTURE: MenuItem[] = [
  { key: "dashboard", slug: "dashboard", label: "Dashboard", href: "/", icon: LayoutDashboard },
  { key: "gerencia", slug: "gerencia", label: "Gerencia", href: "/dashboard/gerencia", icon: TrendingUp },
  { key: "reportes", slug: "reportes", label: "Reportes", href: "/reportes", icon: BarChart3 },
  {
    key: "conversaciones",
    slug: "conversaciones",
    label: "Conversaciones",
    href: "/dashboard/conversaciones",
    icon: MessageCircle,
  },
  {
    key: "historial-omnicanal",
    slug: "historial-omnicanal",
    label: "Historial omnicanal",
    href: "/dashboard/historial-omnicanal",
    icon: History,
  },
  {
    key: "conversaciones-finalizadas",
    slug: "conversaciones-finalizadas",
    label: "Finalizadas",
    href: "/dashboard/conversaciones-finalizadas",
    icon: ListChecks,
  },
  {
    key: "monitoreo",
    slug: "monitoreo",
    label: "Monitoreo",
    href: "/dashboard/monitoreo",
    icon: Activity,
  },
  { key: "ventas", slug: "ventas", label: "Caja", href: "/ventas", icon: ShoppingCart },
  { key: "inventario", slug: "inventario", label: "Inventario", href: "/inventario", icon: Package, children: [
    { label: "Productos", href: "/inventario" },
    { label: "Movimientos", href: "/inventario/movimientos" },
    { label: "Categorías", href: "/inventario/categorias" },
    { label: "Depósitos / Ubicaciones", href: "/inventario/ubicaciones" },
  ]},
  { key: "clientes", slug: "clientes", label: "Clientes", href: "/clientes", icon: Users },
  {
    key: "compras",
    slug: "compras",
    label: "Compras",
    href: "/compras",
    icon: Package,
    children: [
      { label: "Órdenes", href: "/compras" },
      { label: "Proveedores", href: "/proveedores" },
    ],
  },
  { key: "gastos", slug: "gastos", label: "Gastos", href: "/gastos", icon: Receipt },
  { key: "pagos", slug: "pagos", label: "Pagos", href: "/pagos", icon: Banknote },
  { key: "cobranzas", slug: "cobranzas", label: "Cobranzas", href: "/cobranzas", icon: HandCoins },
  { key: "comisiones", slug: "comisiones", label: "Comisiones", href: "/comisiones", icon: Percent },
  {
    key: "notas_credito",
    slug: "notas_credito",
    label: "Notas de crédito",
    href: "/notas-credito",
    icon: ScrollText,
  },
  { key: "usuarios", slug: "usuarios", label: "Usuarios", href: "/usuarios", icon: UserCog },
  {
    key: "configuracion",
    slug: "configuracion",
    label: "Configuración",
    href: "/configuracion",
    icon: Settings,
    children: [
      { label: "Facturación", href: "/configuracion/facturacion" },
      { label: "Equipos y supervisión", href: "/configuracion/omnicanal-equipos" },
    ],
  },
  { key: "planes", slug: "planes", label: "Planes", href: "/planes", icon: FileText },
  { key: "gestion-clientes", slug: "gestion-clientes", label: "Gestión Clientes", href: "/gestion-clientes", icon: Users },
  { key: "crm", slug: "crm", label: "CRM Funnel", href: "/crm", icon: Sparkles },
  { key: "marketing", slug: "marketing", label: "Marketing Legacy", href: "/marketing", icon: Megaphone },
  { key: "marketing_ops", slug: "marketing_ops", label: "Marketing Ops", href: "/dashboard/marketing-ops", icon: Megaphone },
  {
    key: "campanas",
    slug: "campanas",
    label: "Campañas",
    href: "/dashboard/campanas",
    icon: SendHorizontal,
  },
  {
    key: "proyectos",
    slug: "proyectos",
    label: "Proyectos",
    href: "/dashboard/proyectos",
    icon: FolderKanban,
  },
  {
    key: "agenda",
    slug: "agenda",
    label: "Agenda",
    href: "/dashboard/agenda",
    icon: CalendarDays,
  },
  {
    key: "sorteos",
    slug: "sorteos",
    label: "Sorteos",
    href: "/sorteos",
    icon: Ticket,
    children: [{ label: "Tickets / Comprobantes", href: "/sorteos/tickets", exactMatch: true }],
  },
  {
    key: "etiquetas",
    slug: "etiquetas",
    label: "Etiquetas",
    href: "/dashboard/etiquetas",
    icon: Tags,
  },
];

/**
 * Agrupamiento VISUAL del menú por familias. Solo reordena el render: no cambia
 * slugs, rutas, permisos ni `MENU_STRUCTURE`. Cada entrada referencia `MenuItem.key`
 * de ítems que YA existen en esta instancia. Cualquier ítem accesible no listado
 * acá cae automáticamente en la familia "Otros" (red de seguridad: nada se oculta).
 */
const MENU_FAMILIES: { id: string; title: string; itemKeys: string[] }[] = [
  { id: "inicio", title: "Inicio", itemKeys: ["dashboard", "gerencia"] },
  {
    id: "comercial",
    title: "Comercial",
    itemKeys: ["clientes", "crm", "gestion-clientes", "ventas", "comisiones", "planes", "agenda"],
  },
  { id: "finanzas", title: "Finanzas", itemKeys: ["pagos", "gastos", "notas_credito", "reportes"] },
  { id: "operaciones", title: "Operaciones", itemKeys: ["cobranzas", "inventario", "compras", "proyectos"] },
  {
    id: "omnicanal",
    title: "Omnicanal",
    itemKeys: [
      "conversaciones",
      "conversaciones-finalizadas",
      "monitoreo",
      "historial-omnicanal",
      "campanas",
      "etiquetas",
    ],
  },
  {
    id: "marketing",
    title: "Marketing y Automatización",
    itemKeys: ["marketing", "marketing_ops", "sorteos"],
  },
  { id: "administracion", title: "Administración", itemKeys: ["usuarios", "configuracion"] },
];

function modulosSyntheticFromMenu(): ModuloEmpresa[] {
  return MENU_STRUCTURE.map((item) => ({
    id: item.slug,
    nombre: item.label,
    slug: item.slug,
  }));
}

function NavItem({
  item,
  itemId,
  isActive,
  isFavorito,
  onToggleFavorito,
  hasAccess,
  collapsed,
  expanded,
  onToggleExpand,
}: {
  item: MenuItem;
  itemId: string;
  isActive: boolean;
  isFavorito: boolean;
  onToggleFavorito: (id: string) => void;
  hasAccess: boolean;
  collapsed: boolean;
  expanded: boolean;
  onToggleExpand: () => void;
}) {
  const Icon = item.icon;
  const p = usePathname() ?? "";

  if (!hasAccess) return null;

  const childActive = item.children?.some((c) => menuChildPathActive(p, c.href, c.exactMatch));

  if (item.children) {
    const active = isActive || !!childActive;
    return (
      <div className="space-y-0.5">
        <div
          className={`group/parent relative flex items-center gap-0.5 rounded-xl text-sm transition-all ${
            active
              ? "bg-gradient-to-r from-[#7DCFD2]/22 via-[#7DCFD2]/12 to-transparent text-white"
              : "text-slate-300 hover:bg-white/[0.04] hover:text-white"
          }`}
        >
          {active ? (
            <span
              aria-hidden="true"
              className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-[#7DCFD2] shadow-[0_0_12px_rgba(125,207,210,0.7)]"
            />
          ) : null}
          <Link
            href={item.href}
            className={`flex min-w-0 flex-1 items-center gap-3 px-3 py-2.5 ${active ? "font-semibold" : "font-medium"}`}
            title={item.label}
          >
            <Icon
              className={`h-[18px] w-[18px] shrink-0 transition-colors ${
                active ? "text-[#7DCFD2]" : "text-slate-400 group-hover/parent:text-slate-200"
              }`}
            />
            {!collapsed && <span className="flex-1 truncate">{item.label}</span>}
          </Link>
          {!collapsed && (
            <>
              <button
                type="button"
                onClick={() => onToggleFavorito(itemId)}
                className={`shrink-0 rounded-md p-1 transition-colors ${
                  isFavorito
                    ? "text-amber-300"
                    : "text-slate-500 opacity-0 hover:text-amber-300 group-hover/parent:opacity-100"
                }`}
                aria-label="Favorito"
              >
                <Star className={`h-3.5 w-3.5 ${isFavorito ? "fill-current" : ""}`} />
              </button>
              <button
                type="button"
                onClick={() => onToggleExpand()}
                className="mr-1.5 shrink-0 rounded-md p-1 text-slate-400 transition-colors hover:bg-white/[0.06] hover:text-[#7DCFD2]"
                aria-expanded={expanded}
                aria-label={expanded ? "Contraer submenú" : "Expandir submenú"}
              >
                {expanded ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
              </button>
            </>
          )}
        </div>
        <AnimatePresence>
          {expanded && !collapsed && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.18, ease: "easeOut" }}
              className="overflow-hidden"
            >
              <div className="relative ml-6 mt-1 space-y-0.5 border-l border-white/[0.08] pl-3">
                {item.children.map((c) => {
                  const childActive2 = menuChildPathActive(p, c.href, c.exactMatch);
                  return (
                    <Link
                      key={c.href}
                      href={c.href}
                      className={`relative block rounded-lg px-3 py-1.5 text-[13px] transition-all ${
                        childActive2
                          ? "bg-[#7DCFD2]/14 font-medium text-white"
                          : "text-slate-400 hover:bg-white/[0.04] hover:text-slate-200"
                      }`}
                    >
                      {childActive2 ? (
                        <span
                          aria-hidden="true"
                          className="absolute -left-[13px] top-1/2 h-1.5 w-1.5 -translate-y-1/2 rounded-full bg-[#7DCFD2] shadow-[0_0_10px_rgba(125,207,210,0.8)]"
                        />
                      ) : null}
                      {c.label}
                    </Link>
                  );
                })}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <Link
      href={item.href}
      className={`group relative flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-all ${
        isActive
          ? "bg-gradient-to-r from-[#7DCFD2]/22 via-[#7DCFD2]/12 to-transparent font-semibold text-white"
          : "font-medium text-slate-300 hover:bg-white/[0.04] hover:text-white"
      }`}
      title={item.label}
    >
      {isActive ? (
        <span
          aria-hidden="true"
          className="absolute inset-y-1.5 left-0 w-[3px] rounded-r-full bg-[#7DCFD2] shadow-[0_0_12px_rgba(125,207,210,0.7)]"
        />
      ) : null}
      <Icon
        className={`h-[18px] w-[18px] shrink-0 transition-colors ${
          isActive ? "text-[#7DCFD2]" : "text-slate-400 group-hover:text-slate-200"
        }`}
      />
      {!collapsed && (
        <>
          <span className="flex-1 truncate">{item.label}</span>
          <button
            type="button"
            onClick={(e) => { e.preventDefault(); onToggleFavorito(itemId); }}
            className={`rounded-md p-1 transition-all ${
              isFavorito
                ? "text-amber-300 opacity-100"
                : "text-slate-500 opacity-0 hover:text-amber-300 group-hover:opacity-100"
            }`}
            aria-label="Favorito"
          >
            <Star className={`h-3.5 w-3.5 ${isFavorito ? "fill-current" : ""}`} />
          </button>
        </>
      )}
    </Link>
  );
}

type SidebarProps = {
  /** En mobile (<md) el sidebar está oculto por defecto y se abre como sheet desde la izquierda.
   *  En desktop (>=md) este prop se ignora — el sidebar siempre está visible en el flujo normal. */
  mobileOpen?: boolean;
  onCloseMobile?: () => void;
};

export default function Sidebar({ mobileOpen = false, onCloseMobile }: SidebarProps = {}) {
  const pathname = usePathname();
  const [modulos, setModulos] = useState<ModuloEmpresa[]>([]);
  const [favoritos, setFavoritos] = useState<string[]>([]);
  const [collapsed, setCollapsed] = useState(false);
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({
    inventario: true,
    sorteos: true,
    compras: true,
  });
  /** Familias colapsadas (solo visual). Ausente = expandida. */
  const [collapsedFamilies, setCollapsedFamilies] = useState<Record<string, boolean>>({});
  const [cargando, setCargando] = useState(true);
  const [esSuperAdmin, setEsSuperAdmin] = useState(false);
  /** Filtro visual del menú (no altera permisos ni rutas). */
  const [menuSearchQuery, setMenuSearchQuery] = useState("");
  const { setSidebarReady } = useBoot();

  /** Sincroniza el estado de carga del menú con el BootContext: cuando el
   * Sidebar vuelve a cargar (p. ej. al recuperar foco de la pestaña), el
   * AuthGuard muestra el ZentraLoader hasta que termine. */
  useEffect(() => {
    setSidebarReady(!cargando);
  }, [cargando, setSidebarReady]);

  useEffect(() => {
    setFavoritos(getFavoritos());
  }, []);

  /**
   * Cargamos el menú una sola vez al montar. Para los eventos posteriores de
   * Supabase auth aplicamos dos filtros:
   *  - Ignoramos `TOKEN_REFRESHED` e `INITIAL_SESSION` (cuando el JWT se
   *    refresca al volver a la pestaña no hay nada nuevo que recargar).
   *  - Para `SIGNED_IN`, `SIGNED_OUT` y `USER_UPDATED` recargamos el menú
   *    en modo silencioso (sin volver a mostrar el loader) si ya cargamos
   *    al menos una vez. Así el sidebar se mantiene visible mientras se
   *    actualiza en background.
   */
  const hasLoadedOnceRef = useRef(false);
  useEffect(() => {
    let cancelled = false;

    async function cargarMenuDesdeSesion(session: Session | null, silent: boolean) {
      try {
        if (!silent) setCargando(true);
        if (cancelled) return;
        if (!session?.user) {
          setModulos([]);
          setEsSuperAdmin(false);
          return;
        }

        const res = await fetchWithSupabaseSession("/api/empresas/module-access", {
          cache: "no-store",
        });
        if (cancelled) return;

        let superA = false;
        let modList: ModuloEmpresa[] = [];
        const bootstrapSuper = isBootstrapSuperAdminEmail(session.user.email ?? null);

        if (res.ok) {
          const body = (await res.json()) as {
            superAdmin?: boolean;
            modulos?: ModuloEmpresa[];
          };
          superA = !!body.superAdmin || bootstrapSuper;
          modList = Array.isArray(body.modulos) ? body.modulos : [];
        } else {
          superA = bootstrapSuper;
        }

        if (!superA) {
          try {
            const cu = await getCurrentUser();
            if ((cu?.rol ?? "").trim() === "super_admin") {
              superA = true;
              const mr = await fetchWithSupabaseSession("/api/admin/modulos", { cache: "no-store" });
              if (mr.ok) {
                const raw = (await mr.json()) as { id?: string; nombre?: string; slug?: string }[];
                if (Array.isArray(raw) && raw.length > 0) {
                  modList = raw.map((m) => ({
                    id: m.id ?? "",
                    nombre: m.nombre ?? "",
                    slug: m.slug ?? "",
                  }));
                }
              }
            }
          } catch {
            /* getCurrentUser puede fallar si RLS; el servidor ya intentó */
          }
        }

        if (superA && modList.length === 0) {
          modList = modulosSyntheticFromMenu();
        }

        if (cancelled) return;
        setEsSuperAdmin(superA);
        setModulos(modList);
      } catch {
        if (!cancelled) {
          setModulos([]);
          setEsSuperAdmin(false);
        }
      } finally {
        if (!cancelled) {
          hasLoadedOnceRef.current = true;
          if (!silent) setCargando(false);
        }
      }
    }

    void supabase.auth.getSession().then(({ data: { session } }) => {
      if (!cancelled) void cargarMenuDesdeSesion(session, false);
    });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (cancelled) return;
      // Eventos silenciosos de Supabase: no hay cambios en el usuario ni sus módulos.
      // Si recargamos acá, el loader full-screen reaparece cada vez que el usuario
      // vuelve a la pestaña (Supabase refresca el JWT en background).
      if (event === "TOKEN_REFRESHED" || event === "INITIAL_SESSION") return;
      // Cambios reales (login/logout/perfil): refrescamos. Si ya hicimos la carga
      // inicial, lo hacemos en modo silencioso para que el menú se mantenga visible.
      void cargarMenuDesdeSesion(session, hasLoadedOnceRef.current);
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, []);

  const handleToggleFavorito = (id: string) => {
    setFavoritos(toggleFavorito(id));
  };

  const modulosSlugs = new Set(modulos.map((m) => m.slug));
  const hasAccess = (slug: string) => canAccessSidebarSlug(slug, modulosSlugs, esSuperAdmin);

  const isActive = (slug: string, href: string) => {
    const p = pathname ?? "";
    if (slug === "dashboard") return p === "/";
    return p === href || p.startsWith(href + "/");
  };

  const toggleExpand = (menuKey: string) => {
    setExpandedItems((prev) => ({ ...prev, [menuKey]: !prev[menuKey] }));
  };

  const slugToId = (slug: string) => modulos.find((m) => m.slug === slug)?.id ?? slug;

  const favoritosItemsFiltered = useMemo(() => {
    const slugs = new Set(modulos.map((m) => m.slug));
    const idForSlug = (slug: string) => modulos.find((m) => m.slug === slug)?.id ?? slug;
    const access = (slug: string) => canAccessSidebarSlug(slug, slugs, esSuperAdmin);
    return MENU_STRUCTURE.filter(
      (item) =>
        favoritos.includes(idForSlug(item.slug)) &&
        access(item.slug) &&
        menuItemMatchesQuery(item, menuSearchQuery)
    );
  }, [favoritos, menuSearchQuery, modulos, esSuperAdmin]);

  const mainItemsFiltered = useMemo(() => {
    const slugs = new Set(modulos.map((m) => m.slug));
    const idForSlug = (slug: string) => modulos.find((m) => m.slug === slug)?.id ?? slug;
    const access = (slug: string) => canAccessSidebarSlug(slug, slugs, esSuperAdmin);
    return MENU_STRUCTURE.filter(
      (item) =>
        !favoritos.includes(idForSlug(item.slug)) &&
        access(item.slug) &&
        menuItemMatchesQuery(item, menuSearchQuery)
    );
  }, [favoritos, menuSearchQuery, modulos, esSuperAdmin]);

  /** Agrupa `mainItemsFiltered` por familia (preservando acceso/búsqueda/favoritos ya aplicados). */
  const familiesToRender = useMemo(() => {
    const byKey = new Map(mainItemsFiltered.map((it) => [it.key, it]));
    const assigned = new Set<string>();
    const fams = MENU_FAMILIES.map((fam) => {
      const items = fam.itemKeys
        .map((k) => byKey.get(k))
        .filter((x): x is MenuItem => Boolean(x));
      items.forEach((it) => assigned.add(it.key));
      return { id: fam.id, title: fam.title, items };
    });
    const otros = mainItemsFiltered.filter((it) => !assigned.has(it.key));
    if (otros.length > 0) fams.push({ id: "otros", title: "Otros", items: otros });
    return fams.filter((f) => f.items.length > 0);
  }, [mainItemsFiltered]);

  const toggleFamily = (id: string) =>
    setCollapsedFamilies((prev) => ({ ...prev, [id]: !prev[id] }));

  const anyMenuVisible =
    favoritosItemsFiltered.length > 0 ||
    mainItemsFiltered.length > 0 ||
    (esSuperAdmin && adminEmpresasMatchesQuery(menuSearchQuery));

  const showMenuNoResults =
    !cargando && normalizeMenuSearch(menuSearchQuery).length > 0 && !anyMenuVisible;

  useEffect(() => {
    const q = menuSearchQuery.trim();
    if (!q) return;
    const n = normalizeMenuSearch(q);
    setExpandedItems((prev) => {
      const next = { ...prev };
      for (const item of MENU_STRUCTURE) {
        if (item.children?.some((c) => normalizeMenuSearch(c.label).includes(n))) {
          next[item.key] = true;
        }
      }
      return next;
    });
  }, [menuSearchQuery]);

  return (
    <motion.aside
      id="neura-sidebar"
      initial={false}
      animate={{ width: collapsed ? 80 : 260 }}
      transition={{ duration: 0.2 }}
      data-mobile-open={mobileOpen ? "true" : "false"}
      className={`
        flex h-svh min-h-0 shrink-0 flex-col border-r border-[color:var(--zentra-sidebar-border)] bg-[color:var(--zentra-sidebar)]
        max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:!w-[280px]
        max-md:shadow-2xl max-md:transition-transform max-md:duration-200 max-md:ease-out
        ${mobileOpen ? "max-md:translate-x-0" : "max-md:-translate-x-full"}
      `}
    >
      {/* Logo oficial ZENTRA (blanco sobre azul marca) */}
      <div className="flex h-[7.25rem] shrink-0 items-center justify-between gap-2 border-b border-[color:var(--zentra-sidebar-border)] bg-[color:var(--zentra-sidebar-elevated)]/35 px-3 py-2.5">
        <Link href="/" className={`flex items-center justify-center min-w-0 flex-1 overflow-hidden`}>
          <div
            className={`relative flex items-center justify-center ${collapsed ? "h-11 w-11" : "h-[4.5rem] w-full max-w-[200px]"}`}
          >
            <Image
              src="/brand/zentra-logo-official.png"
              alt="ZENTRA"
              width={400}
              height={220}
              sizes={collapsed ? "44px" : "200px"}
              className="h-full w-full object-contain object-center"
              priority
            />
          </div>
        </Link>
        {/* Toggle colapsar (solo desktop): en mobile el sidebar es un sheet que se cierra
            con el backdrop o cambio de ruta, no tiene estado intermedio. */}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          className="hidden rounded-lg p-2 text-slate-400 transition-colors hover:bg-[color:var(--zentra-sidebar-hover)] hover:text-white md:inline-flex"
          aria-label={collapsed ? "Expandir sidebar" : "Colapsar sidebar"}
        >
          {collapsed ? <PanelLeft className="h-5 w-5" /> : <PanelLeftClose className="h-5 w-5" />}
        </button>
        {/* En mobile, botón de cerrar el sheet. */}
        <button
          type="button"
          onClick={() => onCloseMobile?.()}
          className="flex h-10 w-10 items-center justify-center rounded-lg text-slate-300 transition-colors hover:bg-[color:var(--zentra-sidebar-hover)] hover:text-white md:hidden"
          aria-label="Cerrar menú"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
          </svg>
        </button>
      </div>

      {!collapsed && (
        <div className="shrink-0 border-b border-[color:var(--zentra-sidebar-border)] px-3 py-3">
          <label htmlFor="sidebar-menu-search" className="sr-only">
            Buscar en el menú
          </label>
          <div className="group relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400 transition-colors group-focus-within:text-[#7DCFD2]"
              aria-hidden
            />
            <input
              id="sidebar-menu-search"
              type="search"
              autoComplete="off"
              placeholder="Buscar en el menú…"
              value={menuSearchQuery}
              onChange={(e) => setMenuSearchQuery(e.target.value)}
              className="w-full rounded-xl border border-white/[0.08] bg-white/[0.04] py-2 pl-9 pr-3 text-base text-white outline-none transition-[border-color,background-color,box-shadow] placeholder:text-slate-500 hover:border-white/[0.14] hover:bg-white/[0.06] focus:border-[#7DCFD2]/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-[#7DCFD2]/30 md:text-xs"
            />
          </div>
        </div>
      )}

      <nav
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden overscroll-y-contain px-2.5 py-3 [scrollbar-width:thin] [scrollbar-color:rgba(125,207,210,0.30)_transparent]"
      >
        {showMenuNoResults ? (
          <p className="px-2 py-6 text-center text-xs text-slate-400">Sin resultados</p>
        ) : null}

        {/* Favoritos */}
        {favoritosItemsFiltered.length > 0 && !collapsed && (
          <div className="mb-5">
            <div className="mb-2 flex items-center gap-2 px-3">
              <Star className="h-3 w-3 fill-current text-[#7DCFD2]" />
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
                Favoritos
              </p>
              <span className="h-px flex-1 bg-gradient-to-r from-white/[0.08] to-transparent" />
            </div>
            <div className="space-y-0.5">
              {favoritosItemsFiltered.map((item) => (
                <NavItem
                  key={item.key}
                  item={item}
                  itemId={slugToId(item.slug)}
                  isActive={isActive(item.slug, item.href)}
                  isFavorito={true}
                  onToggleFavorito={handleToggleFavorito}
                  hasAccess={hasAccess(item.slug)}
                  collapsed={collapsed}
                  expanded={expandedItems[item.key] ?? false}
                  onToggleExpand={() => toggleExpand(item.key)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Menú principal por familias (solo agrupamiento visual) */}
        {cargando ? (
          <div className="space-y-1 px-3 py-2">
            <div className="h-8 animate-pulse rounded-lg bg-white/[0.04]" />
            <div className="h-8 animate-pulse rounded-lg bg-white/[0.04]" />
            <div className="h-8 animate-pulse rounded-lg bg-white/[0.04]" />
          </div>
        ) : collapsed ? (
          /* Modo icono (80px): lista plana, sin encabezados de familia. */
          <div className="space-y-0.5">
            {mainItemsFiltered.map((item) => (
              <NavItem
                key={item.key}
                item={item}
                itemId={slugToId(item.slug)}
                isActive={isActive(item.slug, item.href)}
                isFavorito={favoritos.includes(slugToId(item.slug))}
                onToggleFavorito={handleToggleFavorito}
                hasAccess={hasAccess(item.slug)}
                collapsed={collapsed}
                expanded={expandedItems[item.key] ?? false}
                onToggleExpand={() => toggleExpand(item.key)}
              />
            ))}
          </div>
        ) : (
          <div className="space-y-4">
            {familiesToRender.map((fam) => {
              const searching = normalizeMenuSearch(menuSearchQuery).length > 0;
              const open = searching || !collapsedFamilies[fam.id];
              return (
                <div key={fam.id} className="space-y-0.5">
                  <button
                    type="button"
                    onClick={() => toggleFamily(fam.id)}
                    className="group/fam mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 transition-colors hover:bg-white/[0.05]"
                    aria-expanded={open}
                    title={open ? `Colapsar ${fam.title}` : `Expandir ${fam.title}`}
                  >
                    <span className="h-1 w-1 shrink-0 rounded-full bg-[#7DCFD2]" />
                    <span className="text-[13px] font-bold uppercase tracking-[0.1em] text-slate-300 transition-colors group-hover/fam:text-white">
                      {fam.title}
                    </span>
                    <span className="h-px flex-1 bg-gradient-to-r from-white/[0.08] to-transparent" />
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-slate-300 transition-colors group-hover/fam:bg-white/10 group-hover/fam:text-white">
                      {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                    </span>
                  </button>
                  {open && (
                    <div className="space-y-0.5">
                      {fam.items.map((item) => (
                        <NavItem
                          key={item.key}
                          item={item}
                          itemId={slugToId(item.slug)}
                          isActive={isActive(item.slug, item.href)}
                          isFavorito={favoritos.includes(slugToId(item.slug))}
                          onToggleFavorito={handleToggleFavorito}
                          hasAccess={hasAccess(item.slug)}
                          collapsed={collapsed}
                          expanded={expandedItems[item.key] ?? false}
                          onToggleExpand={() => toggleExpand(item.key)}
                        />
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

      </nav>
    </motion.aside>
  );
}
