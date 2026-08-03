"use client";

import { useMemo, useState } from "react";

export type ProyectoModuloCatalogo = { id: string; nombre: string; slug: string };

type ProyectoModuloSelectorProps = {
  modulos: ProyectoModuloCatalogo[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  variant?: "light" | "dark";
};

export function ProyectoModuloSelector({
  modulos,
  selectedIds,
  onChange,
}: ProyectoModuloSelectorProps) {
  const [query, setQuery] = useState("");
  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const selectedModules = useMemo(
    () => modulos.filter((modulo) => selectedSet.has(modulo.id)),
    [modulos, selectedSet]
  );
  const filteredModules = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return modulos;
    return modulos.filter((modulo) =>
      [modulo.nombre, modulo.slug].some((value) => value.toLowerCase().includes(q))
    );
  }, [modulos, query]);

  function toggle(id: string) {
    if (selectedSet.has(id)) onChange(selectedIds.filter((current) => current !== id));
    else onChange([...selectedIds, id]);
  }

  function remove(id: string) {
    onChange(selectedIds.filter((current) => current !== id));
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-medium text-slate-500">
          {selectedIds.length === 1
            ? "1 módulo seleccionado"
            : `${selectedIds.length} módulos seleccionados`}
        </p>
      </div>

      {selectedModules.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {selectedModules.map((modulo) => (
            <span
              key={modulo.id}
              className="inline-flex items-center gap-1 rounded-full border border-[#4FAEB2]/30 bg-[#4FAEB2]/10 px-2.5 py-1 text-xs font-medium text-[#3F8E91]"
            >
              {modulo.nombre}
              <button
                type="button"
                className="rounded-full px-1 leading-none text-[#3F8E91]/70 transition-colors hover:bg-[#4FAEB2]/20 hover:text-[#3F8E91]"
                onClick={() => remove(modulo.id)}
                aria-label={`Quitar ${modulo.nombre}`}
              >
                ×
              </button>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-xs text-slate-500">Todavía no seleccionaste módulos.</p>
      )}

      <div className="relative">
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-[#4FAEB2]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
        </span>
        <input
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar módulo..."
        />
      </div>

      <div className="max-h-56 overflow-y-auto rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm">
        {modulos.length === 0 ? (
          <p className="px-3 py-4 text-sm text-slate-500">No hay módulos disponibles en el catálogo.</p>
        ) : filteredModules.length === 0 ? (
          <p className="px-3 py-4 text-sm text-slate-500">No hay módulos que coincidan con la búsqueda.</p>
        ) : (
          filteredModules.map((modulo) => {
            const checked = selectedSet.has(modulo.id);
            return (
              <label
                key={modulo.id}
                className={`flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                  checked
                    ? "bg-[#4FAEB2]/8 text-[#3F8E91]"
                    : "text-slate-700 hover:bg-slate-50"
                }`}
              >
                <input
                  type="checkbox"
                  className="h-4 w-4 rounded border-slate-300 text-[#4FAEB2] accent-[#4FAEB2] focus:ring-[#4FAEB2]/30"
                  checked={checked}
                  onChange={() => toggle(modulo.id)}
                />
                <span className="flex-1 font-medium">{modulo.nombre}</span>
              </label>
            );
          })
        )}
      </div>
    </div>
  );
}
