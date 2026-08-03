"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Search, UserCog } from "lucide-react";
import { useUsuarios, type UsuarioRow } from "@/shared/hooks/useUsuarios";

/** Lista mobile de Usuarios de la empresa. */
export default function UsuariosMobile() {
  const { usuarios, isLoading, error } = useUsuarios();
  const [query, setQuery] = useState("");

  const filtrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ord = [...usuarios].sort((a, b) =>
      (a.nombre ?? a.email).localeCompare(b.nombre ?? b.email, "es")
    );
    if (!q) return ord;
    return ord.filter((u) =>
      (u.nombre ?? "").toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.rol ?? "").toLowerCase().includes(q)
    );
  }, [usuarios, query]);

  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      <header className="mb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Usuarios</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {usuarios.length === 0 ? "Sin usuarios cargados." : `${usuarios.length} usuarios`}
            </p>
          </div>
          <Link
            href="/usuarios/nuevo"
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#0EA5E9] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors active:bg-[#0284C7]"
          >
            <Plus className="h-4 w-4" />
            Nuevo
          </Link>
        </div>
      </header>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Nombre, email o rol"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#0EA5E9]/40 focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]/30"
        />
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar los usuarios.
        </div>
      ) : null}

      {isLoading ? (
        <SkeletonList />
      ) : filtrados.length === 0 ? (
        <EmptyState hayBusqueda={!!query.trim()} total={usuarios.length} />
      ) : (
        <ul className="space-y-2">
          {filtrados.map((u) => (
            <UsuarioCard key={u.id} usuario={u} />
          ))}
        </ul>
      )}
    </div>
  );
}

function UsuarioCard({ usuario }: { usuario: UsuarioRow }) {
  const nombre = usuario.nombre ?? usuario.email;
  const inicial = nombre.charAt(0).toUpperCase();
  const rolKey = (usuario.rol ?? "").trim().toLowerCase();
  const estadoActivo = (usuario.estado ?? "").trim().toLowerCase() === "activo";
  return (
    <li>
      <Link
        href={`/usuarios/${usuario.id}`}
        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-transform active:scale-[0.99]"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[color:var(--zentra-sidebar)] text-base font-bold text-white ring-1 ring-sky-400/35">
          {inicial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{nombre}</p>
          <p className="truncate text-[11px] text-slate-500">{usuario.email}</p>
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <RolBadge rol={rolKey} />
            {!estadoActivo ? (
              <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-500">
                {usuario.estado ?? "Inactivo"}
              </span>
            ) : null}
          </div>
        </div>
      </Link>
    </li>
  );
}

function RolBadge({ rol }: { rol: string }) {
  const labels: Record<string, { label: string; cls: string }> = {
    super_admin: { label: "Super admin", cls: "bg-[#4FAEB2]/10 text-[#3F8E91]" },
    admin_empresa: { label: "Admin", cls: "bg-[#4FAEB2]/10 text-[#3F8E91]" },
    admin: { label: "Admin", cls: "bg-[#4FAEB2]/10 text-[#3F8E91]" },
    supervisor: { label: "Supervisor", cls: "bg-violet-50 text-violet-700" },
    vendedor: { label: "Vendedor", cls: "bg-emerald-50 text-emerald-700" },
    asesor: { label: "Asesor", cls: "bg-emerald-50 text-emerald-700" },
    usuario: { label: "Usuario", cls: "bg-slate-100 text-slate-600" },
  };
  const cfg = labels[rol] ?? { label: rol || "—", cls: "bg-slate-100 text-slate-600" };
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

function EmptyState({ hayBusqueda, total }: { hayBusqueda: boolean; total: number }) {
  if (hayBusqueda) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <Search className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 text-sm font-medium text-slate-700">Sin resultados</p>
      </div>
    );
  }
  if (total === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <UserCog className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 text-sm font-medium text-slate-700">Sin usuarios cargados</p>
      </div>
    );
  }
  return null;
}

function SkeletonList() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
          <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-slate-100" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-100" />
            <div className="h-2.5 w-1/2 animate-pulse rounded bg-slate-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}
