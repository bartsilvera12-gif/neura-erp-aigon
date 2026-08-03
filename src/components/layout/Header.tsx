"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Bell, ChevronDown, LogOut, Menu } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { signOut } from "@/lib/auth";

type HeaderUsuario = {
  nombre: string | null;
  rol: string | null;
  email: string | null;
};

function clean(value: string | null | undefined): string {
  return (value ?? "").trim();
}

function roleLabel(rol: string | null | undefined): string {
  const r = clean(rol).toLowerCase();
  const labels: Record<string, string> = {
    admin: "Admin",
    administrador: "Admin",
    super_admin: "Super admin",
    supervisor: "Supervisor",
    vendedor: "Vendedor",
    asesor: "Asesor",
    comercial: "Comercial",
    "asesor comercial": "Asesor comercial",
    usuario: "Usuario",
  };
  if (labels[r]) return labels[r];
  if (!r) return "Usuario";
  return r
    .split(/[\s_]+/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

type HeaderProps = {
  onOpenMobileSidebar?: () => void;
};

export default function Header({ onOpenMobileSidebar }: HeaderProps = {}) {
  const router = useRouter();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const [usuario, setUsuario] = useState<HeaderUsuario | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setUserMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => {
    let alive = true;
    async function loadUsuario() {
      try {
        const res = await fetchWithSupabaseSession("/api/usuarios/me", { cache: "no-store" });
        if (!res.ok) throw new Error(`Error ${res.status}`);
        const json = (await res.json()) as { usuario?: HeaderUsuario };
        if (alive) setUsuario(json.usuario ?? null);
      } catch {
        if (alive) setUsuario(null);
      }
    }
    void loadUsuario();
    return () => {
      alive = false;
    };
  }, []);

  const nombreReal = clean(usuario?.nombre);
  const fallbackEmail = clean(usuario?.email);
  const displayName = nombreReal || fallbackEmail || "Usuario";
  const dropdownName = nombreReal || "Usuario";
  const avatarInitial = (nombreReal || fallbackEmail || "Usuario").charAt(0).toUpperCase();
  const displayRole = roleLabel(usuario?.rol);

  return (
    <header
      id="neura-header"
      className="z-40 flex h-16 shrink-0 items-center justify-between gap-3 border-b border-slate-200/90 bg-white/95 px-3 sm:px-6 shadow-[inset_0_-1px_0_0_rgba(10,37,64,0.05)] backdrop-blur-sm"
    >
      {/* Hamburguesa: solo mobile. Abre el sidebar como sheet desde la izquierda. */}
      <button
        type="button"
        onClick={() => onOpenMobileSidebar?.()}
        aria-label="Abrir menú"
        className="-ml-1 flex h-11 w-11 items-center justify-center rounded-lg text-[#475569] transition-colors hover:bg-slate-50 hover:text-[#0EA5E9] md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>
      {/* Spacer en desktop para mantener el justify-end original. */}
      <span className="hidden md:block" />

      <div className="flex items-center gap-2">
        {/* Asistente de ayuda (Neurita) — desactivado temporalmente. */}

        {/* Notificaciones */}
        <button
          type="button"
          className="relative rounded-lg p-2 text-[#475569] transition-colors hover:bg-slate-50 hover:text-[#0EA5E9]"
          aria-label="Notificaciones"
        >
          <Bell className="h-5 w-5" />
          <span className="absolute -right-0.5 -top-0.5 flex h-4 w-4 items-center justify-center rounded-full bg-[#0EA5E9] text-[10px] font-bold text-white">
            0
          </span>
        </button>

        {/* Avatar + menú usuario */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setUserMenuOpen(!userMenuOpen)}
            className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 transition-colors hover:bg-slate-100"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[color:var(--zentra-sidebar)] text-white ring-1 ring-sky-400/35">
              <span className="text-sm font-bold">{avatarInitial}</span>
            </div>
            <div className="hidden text-left sm:block">
              <p className="max-w-[180px] truncate text-sm font-medium text-[#0F172A]">{displayName}</p>
              <p className="text-xs text-[#475569]">{displayRole}</p>
            </div>
            <ChevronDown className={`h-4 w-4 text-slate-500 transition-transform ${userMenuOpen ? "rotate-180" : ""}`} />
          </button>

          <div
            className={`absolute right-0 top-full mt-1 w-48 rounded-lg border border-slate-200 bg-white py-1 shadow-lg ${
              userMenuOpen ? "block" : "hidden"
            }`}
          >
            <div className="border-b border-slate-200 px-4 py-2">
              <p className="truncate text-sm font-medium text-[#0F172A]">{dropdownName}</p>
            </div>
            <button
              type="button"
              onClick={async () => {
                await signOut();
                router.push("/login");
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-sm text-[#475569] transition-colors hover:bg-slate-50 hover:text-[#0EA5E9]"
            >
              <LogOut className="h-4 w-4" />
              Cerrar sesión
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
