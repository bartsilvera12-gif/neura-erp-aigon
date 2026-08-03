"use client";

import { useEffect, useMemo, useRef, useState } from "react";

export type ClienteOpt = { id: string; empresa?: string | null; nombre_contacto?: string | null };

export function clienteLabel(c: ClienteOpt): string {
  return (c.empresa || "").trim() || (c.nombre_contacto || "").trim() || c.id.slice(0, 8);
}

type Props = {
  clientes: ClienteOpt[];
  value: string;
  onChange: (id: string) => void;
};

export function ClienteSearchSelect({ clientes, value, onChange }: Props) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);

  const selected = useMemo(() => clientes.find((c) => c.id === value), [clientes, value]);

  const filtered = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return clientes;
    return clientes.filter((c) => clienteLabel(c).toLowerCase().includes(t));
  }, [clientes, q]);

  useEffect(() => {
    function close(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);

  return (
    <div ref={wrapRef} className="relative sm:col-span-2">
      <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Cliente</span>
      <div className="mt-1.5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
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
            type="text"
            className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-9 pr-3 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
            placeholder="Buscar por nombre o empresa…"
            value={open ? q : selected ? clienteLabel(selected) : q}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
              if (value) onChange("");
            }}
            onFocus={() => setOpen(true)}
            aria-label="Buscar cliente"
          />
        </div>
        <button
          type="button"
          className="whitespace-nowrap rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#4FAEB2]"
          onClick={() => {
            onChange("");
            setQ("");
            setOpen(false);
          }}
        >
          Sin cliente / definir luego
        </button>
      </div>

      {open && q.trim() && filtered.length === 0 ? (
        <div className="absolute left-0 right-0 z-20 mt-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-500 shadow-lg ring-1 ring-[#4FAEB2]/10">
          Sin coincidencias
        </div>
      ) : null}
      {open && filtered.length > 0 ? (
        <ul
          className="absolute left-0 right-0 z-20 mt-1.5 max-h-52 overflow-auto rounded-xl border border-slate-200 bg-white py-1 shadow-lg ring-1 ring-[#4FAEB2]/10"
          role="listbox"
        >
          {filtered.slice(0, 100).map((c) => {
            const isSelected = c.id === value;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  className={`flex w-full items-center justify-between gap-2 px-3.5 py-2 text-left text-sm transition-colors ${
                    isSelected
                      ? "bg-[#4FAEB2]/10 text-[#3F8E91]"
                      : "text-slate-800 hover:bg-[#4FAEB2]/8 hover:text-[#3F8E91]"
                  }`}
                  onClick={() => {
                    onChange(c.id);
                    setQ("");
                    setOpen(false);
                  }}
                >
                  <span className="truncate">{clienteLabel(c)}</span>
                  {isSelected ? (
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-4 w-4 text-[#4FAEB2]"
                    >
                      <path d="M5 12l5 5L20 7" />
                    </svg>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {value && selected ? (
        <p className="mt-2 text-xs text-slate-500">
          Seleccionado:{" "}
          <span className="inline-flex items-center rounded-full bg-[#4FAEB2]/10 px-2 py-0.5 text-xs font-medium text-[#3F8E91]">
            {clienteLabel(selected)}
          </span>
        </p>
      ) : null}
    </div>
  );
}
