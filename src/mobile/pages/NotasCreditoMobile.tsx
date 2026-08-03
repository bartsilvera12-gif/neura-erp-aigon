"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FileMinus, Search } from "lucide-react";
import { useNotasCredito } from "@/shared/hooks/useNotasCredito";
import type {
  NotaCreditoEstadoErp,
  NotaCreditoEstadoSifen,
  NotaCreditoGlobalListItemDTO,
} from "@/lib/nota-credito/types";

/**
 * Lista mobile de Notas de Crédito. Diseño:
 *  - Header con título + total.
 *  - Búsqueda por factura/cliente.
 *  - Chips de filtro por estado ERP (aprobadas / pendientes / rechazadas).
 *  - Cards apiladas: cliente, factura origen, monto, badges de estado.
 *  - Tap en card → /notas-credito/{id}.
 */

type EstadoFilter = "todos" | "borrador" | "aprobada" | "rechazada" | "anulada_borrador";

const ESTADO_FILTROS: { value: EstadoFilter; label: string }[] = [
  { value: "todos", label: "Todas" },
  { value: "borrador", label: "Borrador" },
  { value: "aprobada", label: "Aprobadas" },
  { value: "rechazada", label: "Rechazadas" },
  { value: "anulada_borrador", label: "Anuladas" },
];

export default function NotasCreditoMobile() {
  const { notas, isLoading, error } = useNotasCredito();
  const [query, setQuery] = useState("");
  const [filtro, setFiltro] = useState<EstadoFilter>("todos");

  const filtradas = useMemo(() => {
    const q = query.trim().toLowerCase();
    const ordenadas = [...notas].sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    return ordenadas.filter((n) => {
      if (filtro !== "todos" && n.estado_erp !== filtro) return false;
      if (!q) return true;
      return (
        (n.factura_numero ?? "").toLowerCase().includes(q) ||
        n.cliente_display.toLowerCase().includes(q) ||
        n.motivo.toLowerCase().includes(q)
      );
    });
  }, [notas, query, filtro]);

  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      <header className="mb-3">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Notas de crédito</h1>
        <p className="mt-0.5 text-xs text-slate-500">
          {notas.length === 0 ? "Sin notas registradas." : `${notas.length} en total`}
        </p>
      </header>

      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Cliente, factura o motivo"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#0EA5E9]/40 focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]/30"
        />
      </div>

      <div className="mb-3 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {ESTADO_FILTROS.map((f) => (
          <FilterChip key={f.value} active={filtro === f.value} onClick={() => setFiltro(f.value)} label={f.label} />
        ))}
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar las notas de crédito.
        </div>
      ) : null}

      {isLoading ? (
        <SkeletonList />
      ) : filtradas.length === 0 ? (
        <EmptyState />
      ) : (
        <ul className="space-y-2">
          {filtradas.map((n) => (
            <NotaCard key={n.id} nota={n} />
          ))}
        </ul>
      )}
    </div>
  );
}

function NotaCard({ nota }: { nota: NotaCreditoGlobalListItemDTO }) {
  return (
    <li>
      <Link
        href={`/notas-credito/${nota.id}`}
        className="block rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-transform active:scale-[0.99]"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{nota.cliente_display}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">
              {nota.factura_numero ? `Factura ${nota.factura_numero}` : "Sin factura"} · {formatFecha(nota.created_at)}
            </p>
            <p className="mt-1 line-clamp-2 text-[11px] text-slate-600">{nota.motivo}</p>
            <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
              <BadgeErp estado={nota.estado_erp} />
              <BadgeSifen estado={nota.estado_sifen} />
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className="text-base font-bold tabular-nums text-slate-900">
              {nota.moneda_snapshot === "USD" ? "USD " : "₲ "}
              {Math.round(nota.monto).toLocaleString(nota.moneda_snapshot === "USD" ? "en-US" : "es-PY")}
            </p>
          </div>
        </div>
      </Link>
    </li>
  );
}

const ERP_TONES: Record<string, string> = {
  borrador: "bg-slate-100 text-slate-600",
  pendiente_envio_sifen: "bg-amber-50 text-amber-700",
  aprobada: "bg-emerald-50 text-emerald-700",
  rechazada: "bg-rose-50 text-rose-700",
  error: "bg-rose-50 text-rose-700",
  anulada_borrador: "bg-slate-100 text-slate-500 line-through",
};

function BadgeErp({ estado }: { estado: NotaCreditoEstadoErp }) {
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${ERP_TONES[estado] ?? "bg-slate-100 text-slate-600"}`}>
      {estado.replace(/_/g, " ")}
    </span>
  );
}

const SIFEN_TONES: Record<string, string> = {
  sin_envio: "bg-slate-100 text-slate-500",
  generado: "bg-[#4FAEB2]/10 text-[#3F8E91]",
  firmado: "bg-indigo-50 text-indigo-700",
  enviado: "bg-[#4FAEB2]/10 text-[#3F8E91]",
  en_proceso: "bg-violet-50 text-violet-700",
  aprobado: "bg-emerald-50 text-emerald-700",
  rechazado: "bg-rose-50 text-rose-700",
  error_envio: "bg-orange-50 text-orange-700",
  cancelado: "bg-slate-100 text-slate-500",
};

function BadgeSifen({ estado }: { estado: NotaCreditoEstadoSifen | null }) {
  if (!estado) return null;
  return (
    <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-medium ${SIFEN_TONES[estado] ?? "bg-slate-100 text-slate-600"}`}>
      SIFEN: {estado.replace(/_/g, " ")}
    </span>
  );
}

function FilterChip({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
        active ? "bg-[#0EA5E9] text-white" : "border border-slate-200 bg-white text-slate-600"
      }`}
    >
      {label}
    </button>
  );
}

function EmptyState() {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
      <FileMinus className="mx-auto h-8 w-8 text-slate-300" />
      <p className="mt-2 text-sm font-medium text-slate-700">Sin notas de crédito</p>
      <p className="mt-1 text-xs text-slate-500">Las notas se generan desde el detalle de factura.</p>
    </div>
  );
}

function SkeletonList() {
  return (
    <ul className="space-y-2">
      {Array.from({ length: 5 }).map((_, i) => (
        <li key={i} className="rounded-2xl border border-slate-200 bg-white p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1 space-y-1.5">
              <div className="h-3.5 w-2/3 animate-pulse rounded bg-slate-100" />
              <div className="h-2.5 w-1/2 animate-pulse rounded bg-slate-100" />
              <div className="h-2.5 w-3/4 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="ml-auto h-4 w-16 shrink-0 animate-pulse rounded bg-slate-100" />
          </div>
        </li>
      ))}
    </ul>
  );
}

function formatFecha(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("es-PY", { day: "2-digit", month: "short" });
}
