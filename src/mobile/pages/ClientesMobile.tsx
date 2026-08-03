"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus, Search, Users } from "lucide-react";
import { useClientes } from "@/shared/hooks/useClientes";
import { clienteNombre } from "@/lib/clientes/storage";
import type { Cliente, EstadoCliente, OrigenCliente } from "@/lib/clientes/types";

/**
 * Lista mobile de clientes. Diseño:
 *  - Header con título + count + botón "Nuevo".
 *  - Búsqueda: empresa, nombre, RUC, email.
 *  - Chips de filtro por estado: Todos / Activos / Inactivos.
 *  - Cards apiladas: avatar con inicial, empresa, nombre contacto, RUC/email,
 *    badges de estado + origen.
 *  - Tap en card → /clientes/{id} (fallback al detalle desktop, hasta tener detalle mobile).
 */

type EstadoFilter = "todos" | "activo" | "inactivo";

export default function ClientesMobile() {
  const { clientes, isLoading, error } = useClientes();
  const [query, setQuery] = useState("");
  const [estado, setEstado] = useState<EstadoFilter>("todos");

  const clientesFiltrados = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ordenados = [...clientes].sort((a, b) =>
      (b.created_at ?? "").localeCompare(a.created_at ?? "")
    );
    return ordenados.filter((c) => {
      if (estado !== "todos" && c.estado !== estado) return false;
      if (!q) return true;
      const nombre = clienteNombre(c).toLowerCase();
      return (
        nombre.includes(q) ||
        (c.empresa ?? "").toLowerCase().includes(q) ||
        (c.ruc ?? "").toLowerCase().includes(q) ||
        (c.email ?? "").toLowerCase().includes(q)
      );
    });
  }, [clientes, query, estado]);

  const counts = useMemo(() => {
    const activos = clientes.filter((c) => c.estado === "activo").length;
    return { total: clientes.length, activos, inactivos: clientes.length - activos };
  }, [clientes]);

  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      {/* Header */}
      <header className="mb-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">Clientes</h1>
            <p className="mt-0.5 text-xs text-slate-500">
              {counts.total === 0
                ? "Aún no hay clientes cargados."
                : `${counts.total} en total · ${counts.activos} activos`}
            </p>
          </div>
          <Link
            href="/clientes/nuevo"
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-[#0EA5E9] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors active:bg-[#0284C7]"
          >
            <Plus className="h-4 w-4" />
            Nuevo
          </Link>
        </div>
      </header>

      {/* Buscador */}
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Empresa, nombre, RUC o email"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#0EA5E9]/40 focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]/30"
        />
      </div>

      {/* Chips de filtro */}
      <div className="mb-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        <FilterChip active={estado === "todos"} onClick={() => setEstado("todos")} label={`Todos (${counts.total})`} />
        <FilterChip active={estado === "activo"} onClick={() => setEstado("activo")} label={`Activos (${counts.activos})`} />
        <FilterChip active={estado === "inactivo"} onClick={() => setEstado("inactivo")} label={`Inactivos (${counts.inactivos})`} />
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar los clientes. Refrescá para reintentar.
        </div>
      ) : null}

      {isLoading ? (
        <SkeletonList />
      ) : clientesFiltrados.length === 0 ? (
        <EmptyState hayBusqueda={!!query.trim() || estado !== "todos"} total={clientes.length} />
      ) : (
        <ul className="space-y-2">
          {clientesFiltrados.map((c) => (
            <ClienteCard key={c.id} cliente={c} />
          ))}
        </ul>
      )}
    </div>
  );
}

// ── Card ─────────────────────────────────────────────────────────────────────

function ClienteCard({ cliente }: { cliente: Cliente }) {
  const nombre = clienteNombre(cliente);
  const inicial = nombre.charAt(0).toUpperCase();
  const detalle =
    cliente.tipo_cliente === "empresa" && cliente.nombre_contacto && cliente.nombre_contacto !== cliente.empresa
      ? cliente.nombre_contacto
      : cliente.email || cliente.telefono || null;

  return (
    <li>
      <Link
        href={`/clientes/${cliente.id}`}
        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-transform active:scale-[0.99]"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-[#0EA5E9]/10 text-base font-bold text-[#0EA5E9]">
          {inicial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{nombre}</p>
          {detalle ? (
            <p className="truncate text-[11px] text-slate-500">{detalle}</p>
          ) : null}
          <div className="mt-1 flex flex-wrap items-center gap-1.5">
            <EstadoBadge estado={cliente.estado} />
            <OrigenBadge origen={cliente.origen} />
            {cliente.ruc ? (
              <span className="text-[10px] tabular-nums text-slate-400">RUC {cliente.ruc}</span>
            ) : null}
          </div>
        </div>
      </Link>
    </li>
  );
}

function EstadoBadge({ estado }: { estado: EstadoCliente }) {
  const activo = estado === "activo";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
        activo ? "bg-emerald-50 text-emerald-700" : "bg-slate-100 text-slate-500"
      }`}
    >
      <span className={`h-1 w-1 rounded-full ${activo ? "bg-emerald-500" : "bg-slate-400"}`} />
      {activo ? "Activo" : "Inactivo"}
    </span>
  );
}

function OrigenBadge({ origen }: { origen: OrigenCliente }) {
  const cfg: Record<OrigenCliente, string> = {
    CRM: "bg-violet-50 text-violet-700",
    VENTA: "bg-[#4FAEB2]/10 text-[#3F8E91]",
    MANUAL: "bg-slate-100 text-slate-600",
  };
  const label = origen === "CRM" ? "CRM" : origen === "VENTA" ? "Venta" : "Manual";
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${cfg[origen]}`}>
      {label}
    </span>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? "bg-[#0EA5E9] text-white"
          : "border border-slate-200 bg-white text-slate-600 hover:text-slate-900"
      }`}
    >
      {label}
    </button>
  );
}

// ── Empty / loading ──────────────────────────────────────────────────────────

function EmptyState({ hayBusqueda, total }: { hayBusqueda: boolean; total: number }) {
  if (hayBusqueda) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <Search className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 text-sm font-medium text-slate-700">Sin resultados</p>
        <p className="mt-1 text-xs text-slate-500">Probá con otro término o cambiá el filtro.</p>
      </div>
    );
  }
  if (total === 0) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <Users className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 text-sm font-medium text-slate-700">Aún no hay clientes</p>
        <p className="mt-1 text-xs text-slate-500">
          Tocá <span className="font-semibold text-slate-700">Nuevo</span> para agregar el primero.
        </p>
      </div>
    );
  }
  return null;
}

function SkeletonList() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3">
          <div className="h-11 w-11 shrink-0 animate-pulse rounded-full bg-slate-100" />
          <div className="min-w-0 flex-1 space-y-1.5">
            <div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-100" />
            <div className="h-3 w-1/2 animate-pulse rounded bg-slate-100" />
            <div className="h-2.5 w-1/3 animate-pulse rounded bg-slate-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}
