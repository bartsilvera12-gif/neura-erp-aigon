"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowUpRight, Search, Users } from "lucide-react";
import { useClientes } from "@/shared/hooks/useClientes";
import { useFacturas } from "@/shared/hooks/useFacturas";
import { clienteNombre } from "@/lib/clientes/storage";
import type { Cliente } from "@/lib/clientes/types";
import type { Factura } from "@/lib/gestion-clientes/types";

/**
 * Gestión de Clientes mobile — vista por cliente con su balance.
 *
 *  - Lista clientes activos con: nombre, saldo pendiente, count de facturas pendientes,
 *    última actividad.
 *  - Orden por saldo pendiente desc (los que más deben primero).
 *  - Filtro: con saldo / sin saldo / todos.
 *  - Tap → /clientes/{id} (vista de detalle).
 *  - Link a /pagos para flujos de cobro directo.
 */

type FilterMode = "con_saldo" | "sin_saldo" | "todos";

export default function GestionClientesMobile() {
  const { clientes, isLoading: loadingC } = useClientes();
  const { facturas, isLoading: loadingF } = useFacturas();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<FilterMode>("con_saldo");

  const isLoading = loadingC || loadingF;

  const filasPorCliente = useMemo(() => buildFilas(clientes, facturas), [clientes, facturas]);

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    return filasPorCliente
      .filter((f) => {
        if (mode === "con_saldo" && f.saldoTotal <= 0) return false;
        if (mode === "sin_saldo" && f.saldoTotal > 0) return false;
        if (!q) return true;
        const nombre = clienteNombre(f.cliente).toLowerCase();
        return nombre.includes(q) || (f.cliente.ruc ?? "").toLowerCase().includes(q);
      })
      .slice()
      .sort((a, b) => b.saldoTotal - a.saldoTotal);
  }, [filasPorCliente, query, mode]);

  const totalSaldo = useMemo(
    () => filasPorCliente.reduce((s, f) => s + f.saldoTotal, 0),
    [filasPorCliente]
  );
  const conSaldo = useMemo(
    () => filasPorCliente.filter((f) => f.saldoTotal > 0).length,
    [filasPorCliente]
  );

  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      <header className="mb-3">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Gestión clientes</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          {clientes.length === 0
            ? "Sin clientes cargados."
            : `${conSaldo} con saldo · ${formatGs(totalSaldo)} total`}
        </p>
      </header>

      <Link
        href="/pagos"
        className="mb-4 flex items-center justify-between rounded-2xl border border-amber-200 bg-amber-50 p-3 transition-colors active:bg-amber-100"
      >
        <div>
          <p className="text-xs font-semibold text-amber-900">Ir al flujo de cobro</p>
          <p className="text-[11px] text-amber-700">Ver y registrar pagos por factura</p>
        </div>
        <ArrowUpRight className="h-4 w-4 text-amber-700" />
      </Link>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Cliente, empresa o RUC"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#0EA5E9]/40 focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]/30"
        />
      </div>

      <div className="mb-3 flex gap-2">
        <FilterChip
          active={mode === "con_saldo"}
          onClick={() => setMode("con_saldo")}
          label={`Con saldo (${conSaldo})`}
          tone="warn"
        />
        <FilterChip
          active={mode === "sin_saldo"}
          onClick={() => setMode("sin_saldo")}
          label={`Al día (${filasPorCliente.length - conSaldo})`}
        />
        <FilterChip
          active={mode === "todos"}
          onClick={() => setMode("todos")}
          label={`Todos (${filasPorCliente.length})`}
        />
      </div>

      {isLoading ? (
        <SkeletonList />
      ) : filtradas.length === 0 ? (
        <EmptyState mode={mode} hayBusqueda={!!query.trim()} />
      ) : (
        <ul className="space-y-2">
          {filtradas.map((f) => (
            <ClienteFilaCard key={f.cliente.id} fila={f} />
          ))}
        </ul>
      )}
    </div>
  );
}

type FilaCliente = {
  cliente: Cliente;
  saldoTotal: number;
  facturasPendientes: number;
  ultimaFactura: string | null;
};

function buildFilas(clientes: Cliente[], facturas: Factura[]): FilaCliente[] {
  const porCliente = new Map<string, { saldo: number; pend: number; ultima: string | null }>();
  for (const f of facturas) {
    if (f.estado === "Anulado" || f.estado === "Corregida NC") continue;
    const cid = String(f.cliente_id);
    const acc = porCliente.get(cid) ?? { saldo: 0, pend: 0, ultima: null };
    const saldo = Number(f.saldo ?? 0);
    acc.saldo += saldo;
    if (saldo > 0) acc.pend += 1;
    if (!acc.ultima || (f.fecha ?? "").localeCompare(acc.ultima) > 0) acc.ultima = f.fecha;
    porCliente.set(cid, acc);
  }
  return clientes
    .filter((c) => c.estado === "activo")
    .map((c) => {
      const acc = porCliente.get(String(c.id));
      return {
        cliente: c,
        saldoTotal: acc?.saldo ?? 0,
        facturasPendientes: acc?.pend ?? 0,
        ultimaFactura: acc?.ultima ?? null,
      };
    });
}

function ClienteFilaCard({ fila }: { fila: FilaCliente }) {
  const nombre = clienteNombre(fila.cliente);
  const inicial = nombre.charAt(0).toUpperCase();
  const tieneSaldo = fila.saldoTotal > 0;
  return (
    <li>
      <Link
        href={`/clientes/${fila.cliente.id}`}
        className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-transform active:scale-[0.99]"
      >
        <div
          className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-base font-bold ${
            tieneSaldo ? "bg-amber-100 text-amber-700" : "bg-emerald-100 text-emerald-700"
          }`}
        >
          {inicial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-900">{nombre}</p>
          <p className="truncate text-[11px] text-slate-500">
            {fila.facturasPendientes > 0
              ? `${fila.facturasPendientes} factura${fila.facturasPendientes === 1 ? "" : "s"} pendientes`
              : "Sin pendientes"}
            {fila.ultimaFactura ? ` · última ${formatFecha(fila.ultimaFactura)}` : ""}
          </p>
        </div>
        <div className="shrink-0 text-right">
          <p
            className={`text-base font-bold tabular-nums ${
              tieneSaldo ? "text-amber-700" : "text-emerald-700"
            }`}
          >
            {tieneSaldo ? formatGs(fila.saldoTotal) : "Al día"}
          </p>
        </div>
      </Link>
    </li>
  );
}

function FilterChip({
  active,
  onClick,
  label,
  tone = "default",
}: {
  active: boolean;
  onClick: () => void;
  label: string;
  tone?: "default" | "warn";
}) {
  const activeBg = tone === "warn" ? "bg-amber-500" : "bg-[#0EA5E9]";
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? `${activeBg} text-white` : "border border-slate-200 bg-white text-slate-600"
      }`}
    >
      {label}
    </button>
  );
}

function EmptyState({ mode, hayBusqueda }: { mode: FilterMode; hayBusqueda: boolean }) {
  if (hayBusqueda) {
    return (
      <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
        <Search className="mx-auto h-8 w-8 text-slate-300" />
        <p className="mt-2 text-sm font-medium text-slate-700">Sin resultados</p>
      </div>
    );
  }
  const msgs = {
    con_saldo: "No hay clientes con saldo pendiente. 🎉",
    sin_saldo: "Todos los clientes activos tienen alguna deuda pendiente.",
    todos: "Sin clientes registrados.",
  } as const;
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
      <Users className="mx-auto h-8 w-8 text-slate-300" />
      <p className="mt-2 text-sm font-medium text-slate-700">{msgs[mode]}</p>
    </div>
  );
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
          <div className="ml-auto h-4 w-20 shrink-0 animate-pulse rounded bg-slate-100" />
        </li>
      ))}
    </ul>
  );
}

function formatGs(n: number): string {
  return `₲ ${Math.round(n).toLocaleString("es-PY")}`;
}

function formatFecha(ymd: string): string {
  if (!ymd) return "";
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}`;
}
