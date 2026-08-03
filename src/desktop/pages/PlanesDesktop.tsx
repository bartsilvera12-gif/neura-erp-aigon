"use client";

import { useEffect, useMemo, useState } from "react";
import { getPlanes, toggleEstadoPlan } from "@/lib/planes/storage";
import type { Plan } from "@/lib/planes/types";
import { FancySelect } from "@/app/dashboard/proyectos/components/FancySelect";
import EdgeScrollArea from "@/components/ui/EdgeScrollArea";
import PlanDetalleModal from "@/app/planes/components/PlanDetalleModal";
import PlanNuevoModal from "@/app/planes/components/PlanNuevoModal";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatGs(n: number) {
  return n.toLocaleString("es-PY");
}

function formatPrecio(p: Plan) {
  if (p.moneda === "USD") return `USD ${p.precio.toLocaleString("en-US")}`;
  return `Gs. ${formatGs(p.precio)}`;
}

function limiteLabel(v: number | null) {
  return v === null ? "Ilimitado" : v.toLocaleString("es-PY");
}

// ── Badges ────────────────────────────────────────────────────────────────────

function BadgeEstado({ estado }: { estado: Plan["estado"] }) {
  const activo = estado === "activo";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        activo
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-500"
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-1.5 w-1.5 rounded-full ${activo ? "bg-emerald-500" : "bg-slate-400"}`}
      />
      {activo ? "Activo" : "Inactivo"}
    </span>
  );
}

function BadgePeriodicidad({ p }: { p: Plan["periodicidad"] }) {
  const cfg = {
    mensual: {
      cls: "border-[#4FAEB2]/30 bg-[#4FAEB2]/10 text-[#3F8E91]",
      dot: "bg-[#4FAEB2]",
    },
    anual: {
      cls: "border-violet-200 bg-violet-50 text-violet-700",
      dot: "bg-violet-500",
    },
    unico: {
      cls: "border-amber-200 bg-amber-50 text-amber-700",
      dot: "bg-amber-500",
    },
  } as const;
  const label = { mensual: "Mensual", anual: "Anual", unico: "Único" };
  const it = cfg[p];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${it.cls}`}
    >
      <span aria-hidden="true" className={`h-1.5 w-1.5 rounded-full ${it.dot}`} />
      {label[p]}
    </span>
  );
}

// ── Página ────────────────────────────────────────────────────────────────────

export default function PlanesPage() {
  const [planes, setPlanes] = useState<Plan[]>([]);
  const [cargando, setCargando] = useState(true);
  const [busqueda, setBusqueda] = useState("");
  const [filtroEst, setFiltroEst] = useState<"" | "activo" | "inactivo">("");
  const [filtroPer, setFiltroPer] = useState<"" | "mensual" | "anual" | "unico">("");

  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [detalleEditing, setDetalleEditing] = useState(false);

  const recargar = () => {
    setCargando(true);
    getPlanes()
      .then(setPlanes)
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    let cancelled = false;
    getPlanes()
      .then((data) => {
        if (!cancelled) setPlanes(data);
      })
      .finally(() => {
        if (!cancelled) setCargando(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const filtrados = useMemo(
    () =>
      planes.filter((p) => {
        const q = busqueda.toLowerCase();
        if (q) {
          const campos = [
            p.codigo_plan,
            p.nombre,
            p.descripcion ?? "",
            p.periodicidad,
            p.moneda,
            formatPrecio(p),
          ]
            .join(" ")
            .toLowerCase();
          if (!campos.includes(q)) return false;
        }
        if (filtroEst && p.estado !== filtroEst) return false;
        if (filtroPer && p.periodicidad !== filtroPer) return false;
        return true;
      }),
    [planes, busqueda, filtroEst, filtroPer]
  );

  const activos = useMemo(
    () => planes.filter((p) => p.estado === "activo").length,
    [planes]
  );
  const inactivos = planes.length - activos;
  const ingresoMensualEstimado = useMemo(
    () =>
      planes
        .filter((p) => p.estado === "activo" && p.periodicidad === "mensual" && p.moneda === "GS")
        .reduce((sum, p) => sum + Number(p.precio || 0), 0),
    [planes]
  );

  async function handleToggleEstado(plan: Plan) {
    const nuevo = plan.estado === "activo" ? "inactivo" : "activo";
    await toggleEstadoPlan(plan.id, nuevo);
    recargar();
  }

  const hayFiltros = busqueda || filtroEst || filtroPer;

  if (cargando) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
          />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
            Catálogo
          </p>
        </div>
        <h1 className="text-lg font-semibold tracking-tight text-slate-900">Planes</h1>
        <div className="animate-pulse py-16 text-center text-sm text-slate-400">Cargando…</div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Encabezado */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Catálogo
            </p>
          </div>
          <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-slate-900">Planes</h1>
          <p className="text-xs text-slate-500">Gestión de planes disponibles del sistema.</p>
        </div>
        <button
          type="button"
          onClick={() => setNuevoOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/20 transition-colors hover:bg-[#3F8E91] active:scale-95"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="h-3.5 w-3.5"
            aria-hidden="true"
          >
            <path d="M10.75 4.75a.75.75 0 0 0-1.5 0v4.5h-4.5a.75.75 0 0 0 0 1.5h4.5v4.5a.75.75 0 0 0 1.5 0v-4.5h4.5a.75.75 0 0 0 0-1.5h-4.5v-4.5Z" />
          </svg>
          Nuevo plan
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-[#4FAEB2]/15">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-400">
            Total planes
          </p>
          <p className="mt-1 text-2xl font-bold text-slate-900">{planes.length}</p>
        </div>
        <div className="rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-emerald-600">
            Activos
          </p>
          <p className="mt-1 text-2xl font-bold text-emerald-700">{activos}</p>
          <p className="text-[11px] text-slate-400">{inactivos} inactivos</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm ring-1 ring-[#4FAEB2]/15">
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4FAEB2]">
            Mensual estimado (Gs.)
          </p>
          <p className="mt-1 text-2xl font-bold tracking-tight text-[#3F8E91] tabular-nums">
            {formatGs(ingresoMensualEstimado)}
          </p>
          <p className="text-[11px] text-slate-400">Solo planes mensuales activos en GS</p>
        </div>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
        <div className="relative min-w-[200px] flex-1">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[#4FAEB2]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 20 20"
              fill="currentColor"
              className="h-4 w-4"
            >
              <path
                fillRule="evenodd"
                d="M9 3.5a5.5 5.5 0 1 0 0 11 5.5 5.5 0 0 0 0-11ZM2 9a7 7 0 1 1 12.452 4.391l3.328 3.329a.75.75 0 1 1-1.06 1.06l-3.329-3.328A7 7 0 0 1 2 9Z"
                clipRule="evenodd"
              />
            </svg>
          </span>
          <input
            type="text"
            placeholder="Buscar por nombre, código, descripción…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
          />
        </div>

        <FancySelect
          size="sm"
          className="min-w-[150px] shrink-0"
          ariaLabel="Filtrar por estado"
          placeholder="Todos los estados"
          value={filtroEst}
          onChange={(v) => setFiltroEst(v as "" | "activo" | "inactivo")}
          options={[
            { value: "", label: "Todos los estados" },
            { value: "activo", label: "Activo" },
            { value: "inactivo", label: "Inactivo" },
          ]}
        />

        <FancySelect
          size="sm"
          className="min-w-[170px] shrink-0"
          ariaLabel="Filtrar por periodicidad"
          placeholder="Todas las periodicidades"
          value={filtroPer}
          onChange={(v) => setFiltroPer(v as "" | "mensual" | "anual" | "unico")}
          options={[
            { value: "", label: "Todas las periodicidades" },
            { value: "mensual", label: "Mensual" },
            { value: "anual", label: "Anual" },
            { value: "unico", label: "Único" },
          ]}
        />

        {hayFiltros && (
          <button
            onClick={() => {
              setBusqueda("");
              setFiltroEst("");
              setFiltroPer("");
            }}
            className="shrink-0 rounded-lg border border-transparent px-2.5 py-1.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Contador */}
      <p className="text-xs text-slate-500">
        <span className="font-semibold text-slate-700 tabular-nums">{filtrados.length}</span> de{" "}
        <span className="font-semibold text-slate-700 tabular-nums">{planes.length}</span> planes
      </p>

      {/* Tabla */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-[#4FAEB2]/15">
        {filtrados.length === 0 ? (
          <div className="py-16 text-center text-sm text-slate-400">
            {planes.length === 0
              ? "Todavía no hay planes en el sistema."
              : "No se encontraron planes con los filtros aplicados."}
          </div>
        ) : (
          <EdgeScrollArea>
            <table className="w-full min-w-[900px] text-sm">
              <thead className="border-b border-slate-200 bg-slate-50/70">
                <tr>
                  {[
                    "Código",
                    "Nombre",
                    "Precio",
                    "Periodicidad",
                    "Usuarios",
                    "Clientes",
                    "Facturas",
                    "Estado",
                    "Acciones",
                  ].map((h) => (
                    <th
                      key={h}
                      className="whitespace-nowrap px-3 py-2 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtrados.map((plan) => {
                  const inactive = plan.estado === "inactivo";
                  return (
                    <tr
                      key={plan.id}
                      className={`group cursor-pointer transition-colors hover:bg-[#4FAEB2]/[0.04] ${
                        inactive ? "opacity-60" : ""
                      }`}
                      onClick={() => {
                        setDetalleId(plan.id);
                        setDetalleEditing(false);
                      }}
                    >
                      {/* Código */}
                      <td className="whitespace-nowrap px-3 py-2.5">
                        <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-600">
                          {plan.codigo_plan}
                        </span>
                      </td>
                      {/* Nombre */}
                      <td className="px-3 py-2.5">
                        <p className="truncate font-semibold text-slate-800">{plan.nombre}</p>
                        {plan.descripcion && (
                          <p
                            className="mt-0.5 max-w-[220px] truncate text-[11px] text-slate-400"
                            title={plan.descripcion}
                          >
                            {plan.descripcion}
                          </p>
                        )}
                      </td>
                      {/* Precio */}
                      <td className="whitespace-nowrap px-3 py-2.5 tabular-nums font-semibold text-[#3F8E91]">
                        {formatPrecio(plan)}
                      </td>
                      {/* Periodicidad */}
                      <td className="px-3 py-2.5">
                        <BadgePeriodicidad p={plan.periodicidad} />
                      </td>
                      {/* Límites */}
                      <td className="px-3 py-2.5 text-xs tabular-nums text-slate-600">
                        {limiteLabel(plan.limite_usuarios)}
                      </td>
                      <td className="px-3 py-2.5 text-xs tabular-nums text-slate-600">
                        {limiteLabel(plan.limite_clientes)}
                      </td>
                      <td className="px-3 py-2.5 text-xs tabular-nums text-slate-600">
                        {limiteLabel(plan.limite_facturas)}
                      </td>
                      {/* Estado */}
                      <td className="px-3 py-2.5">
                        <BadgeEstado estado={plan.estado} />
                      </td>
                      {/* Acciones */}
                      <td className="px-3 py-2.5">
                        <div
                          className="flex items-center gap-1.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            title="Ver plan"
                            onClick={() => {
                              setDetalleId(plan.id);
                              setDetalleEditing(false);
                            }}
                            className="inline-flex h-7 items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 text-[11px] font-semibold text-slate-600 transition-colors hover:border-[#4FAEB2]/60 hover:text-[#4FAEB2]"
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
                                d="M.664 10.59a1.651 1.651 0 0 1 0-1.186A10.004 10.004 0 0 1 10 3c4.257 0 7.893 2.66 9.336 6.41.147.381.146.804 0 1.186A10.004 10.004 0 0 1 10 17c-4.257 0-7.893-2.66-9.336-6.41ZM14 10a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
                                clipRule="evenodd"
                              />
                            </svg>
                            Ver
                          </button>
                          <button
                            type="button"
                            title="Editar plan"
                            onClick={() => {
                              setDetalleId(plan.id);
                              setDetalleEditing(true);
                            }}
                            className="inline-flex h-7 items-center gap-1 rounded-lg border border-[#4FAEB2]/40 bg-white px-2 text-[11px] font-semibold text-[#3F8E91] transition-colors hover:bg-[#4FAEB2]/10"
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
                          <button
                            type="button"
                            title={
                              plan.estado === "activo" ? "Desactivar plan" : "Activar plan"
                            }
                            onClick={() => void handleToggleEstado(plan)}
                            className={`inline-flex h-7 w-7 items-center justify-center rounded-lg border transition-colors ${
                              plan.estado === "activo"
                                ? "border-slate-200 bg-white text-slate-500 hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                                : "border-slate-200 bg-white text-slate-500 hover:border-emerald-200 hover:bg-emerald-50 hover:text-emerald-600"
                            }`}
                          >
                            {plan.estado === "activo" ? (
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                className="h-3.5 w-3.5"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16ZM8.28 7.22a.75.75 0 0 0-1.06 1.06L8.94 10l-1.72 1.72a.75.75 0 1 0 1.06 1.06L10 11.06l1.72 1.72a.75.75 0 1 0 1.06-1.06L11.06 10l1.72-1.72a.75.75 0 0 0-1.06-1.06L10 8.94 8.28 7.22Z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            ) : (
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                viewBox="0 0 20 20"
                                fill="currentColor"
                                className="h-3.5 w-3.5"
                              >
                                <path
                                  fillRule="evenodd"
                                  d="M10 18a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm3.857-9.809a.75.75 0 0 0-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 1 0-1.06 1.061l2.5 2.5a.75.75 0 0 0 1.137-.089l4-5.5Z"
                                  clipRule="evenodd"
                                />
                              </svg>
                            )}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </EdgeScrollArea>
        )}
      </div>

      <PlanNuevoModal
        open={nuevoOpen}
        onClose={() => setNuevoOpen(false)}
        onCreated={(id) => {
          setNuevoOpen(false);
          recargar();
          if (id) {
            setDetalleId(id);
            setDetalleEditing(false);
          }
        }}
      />
      <PlanDetalleModal
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
