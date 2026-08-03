"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { FancySelect, type FancySelectOption } from "@/app/dashboard/proyectos/components/FancySelect";
import UsuarioDetalleModal from "@/app/usuarios/components/UsuarioDetalleModal";
import UsuarioNuevoModal from "@/app/usuarios/components/UsuarioNuevoModal";

type UsuarioRow = {
  id: string;
  nombre: string | null;
  email: string;
  telefono: string | null;
  rol: string | null;
  estado: string | null;
  created_at: string;
};

function labelRol(rol: string | null): string {
  const k = (rol ?? "").trim().toLowerCase();
  const m: Record<string, string> = {
    super_admin: "Super admin",
    admin_empresa: "Admin",
    admin: "Admin",
    supervisor: "Supervisor",
    usuario: "Usuario",
  };
  return m[k] ?? (k ? k : "—");
}

function rolBadgeTone(rol: string | null): { bg: string; text: string; border: string; dot: string } {
  const k = (rol ?? "").trim().toLowerCase();
  if (k === "super_admin" || k === "admin_empresa" || k === "admin") {
    return {
      bg: "bg-[#4FAEB2]/10",
      text: "text-[#3F8E91]",
      border: "border-[#4FAEB2]/30",
      dot: "bg-[#4FAEB2]",
    };
  }
  if (k === "supervisor") {
    return {
      bg: "bg-amber-50",
      text: "text-amber-700",
      border: "border-amber-200",
      dot: "bg-amber-500",
    };
  }
  return {
    bg: "bg-slate-50",
    text: "text-slate-600",
    border: "border-slate-200",
    dot: "bg-slate-400",
  };
}

export default function UsuariosPage() {
  const [usuarios, setUsuarios] = useState<UsuarioRow[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busqueda, setBusqueda] = useState("");
  const [filtroRol, setFiltroRol] = useState("todos");
  const [filtroEstado, setFiltroEstado] = useState("todos");

  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [detalleEditing, setDetalleEditing] = useState(false);

  const recargar = () => {
    fetchWithSupabaseSession("/api/empresas/usuarios", { cache: "no-store" })
      .then((r) => r.json())
      .then((data) => {
        if (data.error) throw new Error(data.error);
        setUsuarios(data.usuarios ?? []);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "Error"))
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    recargar();
  }, []);

  const rolesDisponibles = useMemo(() => {
    const set = new Set<string>();
    for (const u of usuarios) {
      const r = (u.rol ?? "").trim().toLowerCase();
      if (r) set.add(r);
    }
    return Array.from(set).sort();
  }, [usuarios]);

  const rolOptions: FancySelectOption[] = useMemo(
    () => [
      { value: "todos", label: "Todos los niveles" },
      ...rolesDisponibles.map((r) => ({ value: r, label: labelRol(r) })),
    ],
    [rolesDisponibles]
  );

  const estadoOptions: FancySelectOption[] = useMemo(
    () => [
      { value: "todos", label: "Todos los estados" },
      { value: "activo", label: "Activos" },
      { value: "inactivo", label: "Inactivos" },
    ],
    []
  );

  const filtrados = useMemo(() => {
    const q = busqueda.toLowerCase().trim();
    return usuarios.filter((u) => {
      if (filtroRol !== "todos" && (u.rol ?? "").toLowerCase() !== filtroRol) return false;
      if (filtroEstado !== "todos" && (u.estado ?? "activo").toLowerCase() !== filtroEstado) return false;
      if (!q) return true;
      const texto = [u.nombre ?? "", u.email, u.telefono ?? "", u.rol ?? ""].join(" ").toLowerCase();
      return texto.includes(q);
    });
  }, [usuarios, busqueda, filtroRol, filtroEstado]);

  const activos = useMemo(
    () => usuarios.filter((u) => (u.estado ?? "activo").toLowerCase() === "activo").length,
    [usuarios]
  );
  const inactivos = usuarios.length - activos;

  const verUsuario = (id: string) => {
    setDetalleId(id);
    setDetalleEditing(false);
  };
  const editarUsuario = (id: string) => {
    setDetalleId(id);
    setDetalleEditing(true);
  };

  if (cargando) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
          />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Equipo</p>
        </div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Usuarios</h1>
        <div className="animate-pulse py-16 text-center text-sm text-slate-400">Cargando…</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Usuarios</h1>
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">Equipo</p>
          </div>
          <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">Usuarios</h1>
          <p className="mt-0.5 text-sm text-slate-500">Personas habilitadas para operar en tu empresa.</p>
        </div>
        <button
          type="button"
          onClick={() => setNuevoOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91] active:scale-95"
        >
          <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          Nuevo usuario
        </button>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-[#4FAEB2]/15">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Total</p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{usuarios.length}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-600">Activos</p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{activos}</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">Inactivos</p>
          <p className="mt-1 text-2xl font-bold text-slate-500">{inactivos}</p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-[#4FAEB2]/15">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_220px_220px]">
          <label className="relative block">
            <span className="sr-only">Buscar usuario</span>
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 1 0 3.473 9.79l3.119 3.119a.75.75 0 1 0 1.06-1.061l-3.118-3.118A5.5 5.5 0 0 0 9 3.5ZM5 9a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
                clipRule="evenodd"
              />
            </svg>
            <input
              type="text"
              placeholder="Buscar por nombre, email, teléfono o rol…"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              className="w-full rounded-xl border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-800 shadow-sm placeholder:text-slate-400 hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
            />
          </label>
          <FancySelect
            options={rolOptions}
            value={filtroRol}
            onChange={setFiltroRol}
            ariaLabel="Filtrar por nivel"
          />
          <FancySelect
            options={estadoOptions}
            value={filtroEstado}
            onChange={setFiltroEstado}
            ariaLabel="Filtrar por estado"
          />
        </div>
      </div>

      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          <span className="font-semibold text-slate-700">{filtrados.length}</span> de{" "}
          <span className="font-semibold text-slate-700">{usuarios.length}</span> usuarios
        </p>
        {(busqueda || filtroRol !== "todos" || filtroEstado !== "todos") && (
          <button
            type="button"
            onClick={() => {
              setBusqueda("");
              setFiltroRol("todos");
              setFiltroEstado("todos");
            }}
            className="text-xs font-semibold text-[#3F8E91] hover:text-[#4FAEB2]"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-[#4FAEB2]/15">
        {filtrados.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">No hay usuarios que coincidan con los filtros.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/70">
                <tr>
                  {["Usuario", "Email", "Teléfono", "Nivel", "Estado", "Acciones"].map((h) => (
                    <th
                      key={h}
                      className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtrados.map((usr) => {
                  const isInactive = (usr.estado ?? "activo").toLowerCase() === "inactivo";
                  const rolTone = rolBadgeTone(usr.rol);
                  return (
                    <tr
                      key={usr.id}
                      className={`group cursor-pointer transition-colors hover:bg-[#4FAEB2]/[0.04] ${isInactive ? "opacity-60" : ""}`}
                      onClick={() => verUsuario(usr.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="min-w-0">
                          <p className="truncate font-semibold text-slate-800">{usr.nombre ?? "—"}</p>
                          {usr.telefono && (
                            <p className="truncate text-xs text-slate-400">{usr.telefono}</p>
                          )}
                        </div>
                      </td>
                      <td className="max-w-[220px] truncate px-4 py-3 text-slate-600">{usr.email}</td>
                      <td className="px-4 py-3 text-slate-600">{usr.telefono ?? "—"}</td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${rolTone.bg} ${rolTone.text} ${rolTone.border}`}
                        >
                          <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${rolTone.dot}`} />
                          {labelRol(usr.rol)}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-xs font-semibold ${
                            isInactive
                              ? "border-slate-200 bg-slate-50 text-slate-500"
                              : "border-emerald-200 bg-emerald-50 text-emerald-700"
                          }`}
                        >
                          <span
                            aria-hidden="true"
                            className={`h-1.5 w-1.5 rounded-full ${isInactive ? "bg-slate-400" : "bg-emerald-500"}`}
                          />
                          {usr.estado ?? "activo"}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => verUsuario(usr.id)}
                            title="Ver usuario"
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 text-xs font-semibold text-slate-600 transition-colors hover:border-[#4FAEB2]/60 hover:text-[#4FAEB2]"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              className="h-3.5 w-3.5"
                            >
                              <path d="M10 12.5a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z" />
                              <path
                                fillRule="evenodd"
                                d="M.664 10.59a1.65 1.65 0 0 1 0-1.18l.149-.387a11.5 11.5 0 0 1 18.374 0l.149.387a1.65 1.65 0 0 1 0 1.18l-.149.387a11.5 11.5 0 0 1-18.374 0L.664 10.59Zm5.336-.59a4 4 0 1 1 8 0 4 4 0 0 1-8 0Z"
                                clipRule="evenodd"
                              />
                            </svg>
                            Ver
                          </button>
                          <button
                            type="button"
                            onClick={() => editarUsuario(usr.id)}
                            title="Editar usuario"
                            className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[#4FAEB2]/40 bg-white px-2.5 text-xs font-semibold text-[#3F8E91] transition-colors hover:bg-[#4FAEB2]/10"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 20 20"
                              fill="currentColor"
                              className="h-3.5 w-3.5"
                            >
                              <path d="M2.695 14.763l-1.262 3.154a.5.5 0 0 0 .65.65l3.155-1.262a4 4 0 0 0 1.343-.885L17.5 5.5a2.121 2.121 0 0 0-3-3L3.58 13.42a4 4 0 0 0-.885 1.343Z" />
                            </svg>
                            Editar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <UsuarioNuevoModal
        open={nuevoOpen}
        onClose={() => setNuevoOpen(false)}
        onCreated={() => {
          setNuevoOpen(false);
          recargar();
        }}
      />
      <UsuarioDetalleModal
        id={detalleId}
        open={detalleId !== null}
        initialEditing={detalleEditing}
        onClose={() => {
          setDetalleId(null);
          setDetalleEditing(false);
        }}
        onUpdated={recargar}
      />
    </div>
  );
}
