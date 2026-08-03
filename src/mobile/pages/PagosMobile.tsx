"use client";

import { useMemo, useState } from "react";
import { CheckCircle, Clock, Search, Wallet } from "lucide-react";
import { useFacturas } from "@/shared/hooks/useFacturas";
import { useClientes } from "@/shared/hooks/useClientes";
import { clienteNombre } from "@/lib/clientes/storage";
import { RegistrarPagoModal } from "@/components/pagos/RegistrarPagoModal";
import type { Factura, EstadoFactura } from "@/lib/gestion-clientes/types";
import type { Cliente } from "@/lib/clientes/types";

/**
 * Pagos mobile — flujo enfocado en cobrar.
 *
 * Diseño:
 *  - Header: KPI prominente con total a cobrar (₲) y count de facturas pendientes.
 *  - Búsqueda + filtro: pendientes / vencidas / cobradas.
 *  - Cards apiladas con cliente + número factura + vencimiento + monto.
 *  - Tap sobre una pendiente abre el RegistrarPagoModal (ya compartido con desktop, full-screen en mobile).
 *  - Vencidas (saldo > 0 y fecha_vencimiento < hoy) destacadas en rojo.
 */

type FilterMode = "pendientes" | "vencidas" | "cobradas";

export default function PagosMobile() {
  const { facturas, isLoading, error, mutate } = useFacturas();
  const { clientes } = useClientes();
  const [query, setQuery] = useState("");
  const [mode, setMode] = useState<FilterMode>("pendientes");
  const [facturaSel, setFacturaSel] = useState<Factura | null>(null);

  const clientesById = useMemo(() => {
    const map = new Map<string, Cliente>();
    for (const c of clientes) map.set(String(c.id), c);
    return map;
  }, [clientes]);

  const buckets = useMemo(() => bucketize(facturas), [facturas]);
  const totalPorCobrar = useMemo(
    () => buckets.pendientes.reduce((s, f) => s + Number(f.saldo ?? 0), 0) + buckets.vencidas.reduce((s, f) => s + Number(f.saldo ?? 0), 0),
    [buckets]
  );

  const listaActiva = mode === "pendientes" ? buckets.pendientes : mode === "vencidas" ? buckets.vencidas : buckets.cobradas;

  const listaFiltrada = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return listaActiva;
    return listaActiva.filter((f) => {
      const cli = clientesById.get(String(f.cliente_id));
      const nombre = cli ? clienteNombre(cli).toLowerCase() : "";
      return f.numero_factura.toLowerCase().includes(q) || nombre.includes(q);
    });
  }, [listaActiva, query, clientesById]);

  return (
    <div className="mx-auto max-w-md p-4 pb-24">
      {/* Header con KPI */}
      <header className="mb-4">
        <h1 className="text-xl font-bold tracking-tight text-slate-900">Pagos</h1>
        <div className="mt-2 rounded-2xl border border-amber-200 bg-gradient-to-br from-white to-amber-50 p-4">
          <div className="flex items-center gap-2">
            <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
              <Wallet className="h-4 w-4" />
            </div>
            <p className="text-[11px] font-medium uppercase tracking-wider text-slate-500">
              Total por cobrar
            </p>
          </div>
          <p className="mt-2 text-2xl font-bold tabular-nums text-slate-900">{formatGs(totalPorCobrar)}</p>
          <p className="mt-0.5 text-xs text-slate-600">
            {buckets.pendientes.length} pendientes ·{" "}
            <span className={buckets.vencidas.length > 0 ? "font-semibold text-red-600" : ""}>
              {buckets.vencidas.length} vencidas
            </span>
          </p>
        </div>
      </header>

      {/* Filtro */}
      <div className="mb-3 flex gap-2">
        <FilterChip
          active={mode === "pendientes"}
          onClick={() => setMode("pendientes")}
          label={`Pendientes (${buckets.pendientes.length})`}
        />
        <FilterChip
          active={mode === "vencidas"}
          onClick={() => setMode("vencidas")}
          label={`Vencidas (${buckets.vencidas.length})`}
          tone={buckets.vencidas.length > 0 ? "warn" : "default"}
        />
        <FilterChip
          active={mode === "cobradas"}
          onClick={() => setMode("cobradas")}
          label={`Cobradas (${buckets.cobradas.length})`}
        />
      </div>

      {/* Búsqueda */}
      <div className="relative mb-3">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          placeholder="Número de factura o cliente"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#0EA5E9]/40 focus:outline-none focus:ring-2 focus:ring-[#0EA5E9]/30"
        />
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          No se pudieron cargar las facturas.
        </div>
      ) : null}

      {isLoading ? (
        <SkeletonList />
      ) : listaFiltrada.length === 0 ? (
        <EmptyState mode={mode} hayBusqueda={!!query.trim()} />
      ) : (
        <ul className="space-y-2">
          {listaFiltrada.map((f) => (
            <FacturaCard
              key={f.id}
              factura={f}
              cliente={clientesById.get(String(f.cliente_id))}
              onClick={() => mode !== "cobradas" && setFacturaSel(f)}
              clickable={mode !== "cobradas"}
            />
          ))}
        </ul>
      )}

      {/* Modal de registro de pago (compartido con desktop, full-screen en mobile). */}
      <RegistrarPagoModal
        open={facturaSel !== null}
        factura={
          facturaSel
            ? {
                id: facturaSel.id,
                numero_factura: facturaSel.numero_factura,
                saldo: Number(facturaSel.saldo ?? 0),
                moneda: facturaSel.moneda,
              }
            : null
        }
        onClose={() => setFacturaSel(null)}
        onExito={async () => {
          await mutate();
          setFacturaSel(null);
        }}
      />
    </div>
  );
}

// ── Sub-componentes ──────────────────────────────────────────────────────────

function FacturaCard({
  factura,
  cliente,
  onClick,
  clickable,
}: {
  factura: Factura;
  cliente: Cliente | undefined;
  onClick: () => void;
  clickable: boolean;
}) {
  const nombre = cliente ? clienteNombre(cliente) : "Cliente desconocido";
  const vencida = esVencida(factura);
  const cobrada = Number(factura.saldo ?? 0) <= 0;
  return (
    <li>
      <button
        type="button"
        onClick={clickable ? onClick : undefined}
        disabled={!clickable}
        className={`w-full text-left rounded-2xl border bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.03)] transition-transform ${
          clickable ? "active:scale-[0.99]" : "cursor-default"
        } ${vencida ? "border-red-200" : "border-slate-200"}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold text-slate-900">{nombre}</p>
            <p className="mt-0.5 text-[11px] tabular-nums text-slate-500">
              Factura {factura.numero_factura} · vence {formatFechaCorta(factura.fecha_vencimiento)}
            </p>
            <div className="mt-1.5">
              <EstadoBadge estado={factura.estado} vencida={vencida} />
            </div>
          </div>
          <div className="shrink-0 text-right">
            <p className={`text-base font-bold tabular-nums ${cobrada ? "text-emerald-600" : vencida ? "text-red-600" : "text-slate-900"}`}>
              {cobrada ? formatGs(factura.monto) : formatGs(Number(factura.saldo ?? 0))}
            </p>
            {!cobrada && Number(factura.saldo) !== Number(factura.monto) ? (
              <p className="text-[10px] tabular-nums text-slate-500">de {formatGs(factura.monto)}</p>
            ) : null}
          </div>
        </div>
      </button>
    </li>
  );
}

function EstadoBadge({ estado, vencida }: { estado: EstadoFactura; vencida: boolean }) {
  if (vencida) {
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-1.5 py-0.5 text-[10px] font-semibold text-red-700">
        <Clock className="h-2.5 w-2.5" />
        Vencida
      </span>
    );
  }
  const cfg: Record<EstadoFactura, { cls: string; label: string; icon: React.ReactNode }> = {
    Pagado: {
      cls: "bg-emerald-50 text-emerald-700",
      label: "Cobrada",
      icon: <CheckCircle className="h-2.5 w-2.5" />,
    },
    Pendiente: {
      cls: "bg-amber-50 text-amber-700",
      label: "Pendiente",
      icon: <Clock className="h-2.5 w-2.5" />,
    },
    Vencido: {
      cls: "bg-red-50 text-red-700",
      label: "Vencida",
      icon: <Clock className="h-2.5 w-2.5" />,
    },
    Anulado: { cls: "bg-slate-100 text-slate-500", label: "Anulada", icon: null },
    "Corregida NC": { cls: "bg-violet-50 text-violet-700", label: "Corregida", icon: null },
  };
  const c = cfg[estado];
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${c.cls}`}>
      {c.icon}
      {c.label}
    </span>
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
  const activeBg = tone === "warn" ? "bg-red-500" : "bg-[#0EA5E9]";
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
  const config = {
    pendientes: { icon: Wallet, msg: "No tenés facturas pendientes." },
    vencidas: { icon: CheckCircle, msg: "Ninguna factura está vencida." },
    cobradas: { icon: CheckCircle, msg: "Aún no se registraron cobros." },
  } as const;
  const c = config[mode];
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-6 text-center">
      <c.icon className="mx-auto h-8 w-8 text-slate-300" />
      <p className="mt-2 text-sm font-medium text-slate-700">{c.msg}</p>
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
              <div className="h-2.5 w-1/4 animate-pulse rounded bg-slate-100" />
            </div>
            <div className="shrink-0 space-y-1.5 text-right">
              <div className="ml-auto h-4 w-16 animate-pulse rounded bg-slate-100" />
            </div>
          </div>
        </li>
      ))}
    </ul>
  );
}

// ── Lógica ───────────────────────────────────────────────────────────────────

function bucketize(facturas: Factura[]): { pendientes: Factura[]; vencidas: Factura[]; cobradas: Factura[] } {
  const activas = facturas.filter((f) => f.estado !== "Anulado" && f.estado !== "Corregida NC");
  const ordenar = (a: Factura, b: Factura) => (a.fecha_vencimiento ?? "").localeCompare(b.fecha_vencimiento ?? "");
  const pendientes: Factura[] = [];
  const vencidas: Factura[] = [];
  const cobradas: Factura[] = [];
  for (const f of activas) {
    if (Number(f.saldo ?? 0) <= 0) cobradas.push(f);
    else if (esVencida(f)) vencidas.push(f);
    else pendientes.push(f);
  }
  return {
    pendientes: pendientes.sort(ordenar),
    vencidas: vencidas.sort(ordenar),
    cobradas: cobradas.slice().sort((a, b) => (b.fecha ?? "").localeCompare(a.fecha ?? "")),
  };
}

function esVencida(f: Factura): boolean {
  if (Number(f.saldo ?? 0) <= 0) return false;
  const venc = f.fecha_vencimiento;
  if (!venc) return false;
  const hoy = new Date().toISOString().slice(0, 10);
  return venc < hoy;
}

function formatGs(n: number): string {
  return `₲ ${Math.round(n).toLocaleString("es-PY")}`;
}

function formatFechaCorta(ymd: string): string {
  if (!ymd) return "—";
  const [y, m, d] = ymd.split("-");
  if (!y || !m || !d) return ymd;
  return `${d}/${m}`;
}
