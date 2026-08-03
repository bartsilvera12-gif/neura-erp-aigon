"use client";

import { useEffect, useMemo, useState } from "react";
import { getGastos, deleteGasto } from "@/lib/gastos/actions";
import type { Gasto } from "@/lib/gastos/actions";
import GastoModal from "@/app/gastos/components/GastoModal";

function formatGs(valor: number) {
  return `${Math.round(valor).toLocaleString("es-PY")} ₲`;
}

function formatFecha(fecha: string) {
  try {
    const d = new Date(fecha);
    return d.toLocaleDateString("es-PY", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    });
  } catch {
    return fecha;
  }
}

function formatMontoNumero(n: number): string {
  return Math.round(n).toLocaleString("es-PY");
}

// ── Color del avatar de categoría según hash estable ─────────────────────────

const CAT_TONES = [
  "bg-[#4FAEB2]/12 text-[#3F8E91] border-[#4FAEB2]/30",
  "bg-violet-50 text-violet-700 border-violet-200",
  "bg-amber-50 text-amber-700 border-amber-200",
  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "bg-rose-50 text-rose-700 border-rose-200",
  "bg-sky-50 text-sky-700 border-sky-200",
  "bg-indigo-50 text-indigo-700 border-indigo-200",
  "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200",
];

function categoriaTone(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) | 0;
  return CAT_TONES[Math.abs(hash) % CAT_TONES.length];
}

function categoriaInitial(label: string): string {
  const cleaned = label.replace(/^[^A-Za-z0-9]+/, "");
  const m = cleaned.match(/[A-Za-z0-9]/);
  return (m?.[0] ?? "?").toUpperCase();
}

type ModalState =
  | { mode: "closed" }
  | { mode: "nuevo" }
  | { mode: "editar"; gasto: Gasto };

export default function GastosPage() {
  const [gastos, setGastos] = useState<Gasto[]>([]);
  const [cargando, setCargando] = useState(true);
  const [eliminando, setEliminando] = useState<string | null>(null);
  const [modal, setModal] = useState<ModalState>({ mode: "closed" });

  const cargar = () => {
    setCargando(true);
    getGastos()
      .then(setGastos)
      .catch(() => setGastos([]))
      .finally(() => setCargando(false));
  };

  useEffect(() => {
    cargar();
  }, []);

  async function handleEliminar(g: Gasto) {
    if (!confirm(`¿Eliminar el gasto "${g.descripcion || g.categoria || "sin descripción"}"?`)) return;
    setEliminando(g.id);
    try {
      await deleteGasto(g.id);
      setGastos((prev) => prev.filter((x) => x.id !== g.id));
    } finally {
      setEliminando(null);
    }
  }

  const total = useMemo(() => gastos.reduce((s, g) => s + (Number(g.monto) || 0), 0), [gastos]);
  const cuentaFijos = useMemo(() => gastos.filter((g) => g.tipo === "fijo").length, [gastos]);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Operativo
            </p>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Gastos operativos</h1>
          <p className="mt-1 text-sm text-slate-500">Registro de gastos de la empresa</p>
        </div>
        <button
          type="button"
          onClick={() => setModal({ mode: "nuevo" })}
          className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-[#4FAEB2] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/20 transition-colors hover:bg-[#3F8E91]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nuevo gasto
        </button>
      </div>

      {/* Resumen KPIs */}
      {!cargando && gastos.length > 0 && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border border-[#4FAEB2]/45 bg-white px-5 py-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Registros</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">{gastos.length}</p>
            <p className="mt-1 text-[11px] text-slate-500">
              <span className="font-medium text-slate-700 tabular-nums">{cuentaFijos}</span> fijos ·{" "}
              <span className="font-medium text-slate-700 tabular-nums">{gastos.length - cuentaFijos}</span>{" "}
              variables
            </p>
          </div>
          <div className="rounded-2xl border border-[#4FAEB2]/55 bg-gradient-to-br from-white via-white to-[#4FAEB2]/8 px-5 py-4 shadow-[0_4px_18px_rgba(79,174,178,0.08)]">
            <span
              aria-hidden="true"
              className="pointer-events-none absolute mt-[-16px] inset-x-0 h-[3px]"
              style={{ display: "none" }}
            />
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-[#3F8E91]">Total acumulado</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-[#3F8E91]">{formatGs(total)}</p>
            <p className="mt-1 text-[11px] text-slate-500">Suma de todos los gastos listados</p>
          </div>
          <div className="rounded-2xl border border-[#4FAEB2]/45 bg-white px-5 py-4 shadow-sm">
            <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">Promedio</p>
            <p className="mt-1 text-2xl font-semibold tabular-nums text-slate-900">
              {formatGs(gastos.length > 0 ? Math.round(total / gastos.length) : 0)}
            </p>
            <p className="mt-1 text-[11px] text-slate-500">Por registro</p>
          </div>
        </div>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {cargando ? (
          <div className="flex items-center justify-center gap-3 py-20 text-sm text-slate-500">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#4FAEB2]" />
            Cargando gastos…
          </div>
        ) : gastos.length === 0 ? (
          <div className="py-20 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-[#4FAEB2]/25 bg-[#4FAEB2]/10 text-[#4FAEB2]">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <path d="M14 2v6h6" />
                <path d="M8 13h8M8 17h6" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-slate-700">No hay gastos registrados</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
              Empezá registrando el primer gasto operativo para llevar el control.
            </p>
            <button
              type="button"
              onClick={() => setModal({ mode: "nuevo" })}
              className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/20 transition-colors hover:bg-[#3F8E91]"
            >
              Registrar primer gasto
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-slate-200 bg-slate-50/80 backdrop-blur-sm">
                <tr>
                  {["Fecha", "Categoría", "Descripción", "Monto", "Tipo", "Acciones"].map((h) => (
                    <th
                      key={h}
                      className="px-5 py-3 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 whitespace-nowrap"
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {gastos.map((g) => {
                  const cat = g.categoria || "Sin categoría";
                  const tone = categoriaTone(cat);
                  return (
                    <tr key={g.id} className="group transition-colors hover:bg-[#4FAEB2]/[0.04]">
                      {/* Fecha con icono calendar */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2 text-slate-600">
                          <span
                            aria-hidden="true"
                            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-slate-50 text-slate-400"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-3 w-3"
                            >
                              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                              <line x1="16" y1="2" x2="16" y2="6" />
                              <line x1="8" y1="2" x2="8" y2="6" />
                              <line x1="3" y1="10" x2="21" y2="10" />
                            </svg>
                          </span>
                          <span className="text-xs font-medium tabular-nums text-slate-700">
                            {formatFecha(g.fecha)}
                          </span>
                        </div>
                      </td>

                      {/* Categoría con avatar */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-center gap-2.5">
                          <span
                            aria-hidden="true"
                            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border text-xs font-semibold ${tone}`}
                          >
                            {categoriaInitial(cat)}
                          </span>
                          <span className="text-sm font-semibold uppercase tracking-tight text-slate-900">
                            {g.categoria || "—"}
                          </span>
                        </div>
                      </td>

                      {/* Descripción */}
                      <td className="max-w-[280px] truncate px-5 py-3.5 text-sm text-slate-700">
                        {g.descripcion?.trim() ? (
                          <span>{g.descripcion}</span>
                        ) : (
                          <span className="italic text-slate-400">Sin descripción</span>
                        )}
                      </td>

                      {/* Monto */}
                      <td className="px-5 py-3.5 whitespace-nowrap">
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-sm font-semibold tabular-nums text-slate-900">
                            {formatMontoNumero(g.monto)}
                          </span>
                          <span className="text-[11px] font-medium text-slate-400">₲</span>
                        </div>
                      </td>

                      {/* Tipo */}
                      <td className="px-5 py-3.5">
                        {g.tipo === "fijo" ? (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#4FAEB2]/30 bg-[#4FAEB2]/10 px-2 py-0.5 text-[11px] font-semibold text-[#3F8E91]">
                            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#4FAEB2]" />
                            Fijo
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                            <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                            Variable
                          </span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setModal({ mode: "editar", gasto: g })}
                            title="Editar gasto"
                            aria-label="Editar gasto"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/8 hover:text-[#3F8E91]"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-3 w-3"
                              aria-hidden="true"
                            >
                              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                            </svg>
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEliminar(g)}
                            disabled={eliminando === g.id}
                            title="Eliminar gasto"
                            aria-label="Eliminar gasto"
                            className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1 text-[11px] font-semibold text-rose-600 shadow-sm transition-colors hover:bg-rose-50 disabled:opacity-50"
                          >
                            <svg
                              xmlns="http://www.w3.org/2000/svg"
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="h-3 w-3"
                              aria-hidden="true"
                            >
                              <polyline points="3 6 5 6 21 6" />
                              <path d="M19 6l-2 14a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2L5 6" />
                              <path d="M10 11v6M14 11v6" />
                              <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
                            </svg>
                            {eliminando === g.id ? "…" : "Eliminar"}
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

      {gastos.length > 0 && (
        <p className="text-sm text-slate-500">
          <span className="font-semibold tabular-nums text-slate-800">{gastos.length}</span> gastos
        </p>
      )}

      <GastoModal
        open={modal.mode !== "closed"}
        gasto={modal.mode === "editar" ? modal.gasto : null}
        onClose={() => setModal({ mode: "closed" })}
        onSaved={() => {
          setModal({ mode: "closed" });
          cargar();
        }}
      />
    </div>
  );
}
