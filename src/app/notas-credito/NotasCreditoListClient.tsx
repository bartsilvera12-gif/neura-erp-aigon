"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { getClientes } from "@/lib/clientes/storage";
import type { NotaCreditoGlobalListItemDTO } from "@/lib/nota-credito/types";
import { FancySelect } from "@/app/dashboard/proyectos/components/FancySelect";
import NotaCreditoDetalleModal from "./components/NotaCreditoDetalleModal";

const INPUT_CLS =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";
const LABEL_CLS = "block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 mb-1.5";

const ERP_TONES: Record<string, { cls: string; dot: string }> = {
  borrador: { cls: "border-slate-200 bg-slate-50 text-slate-700", dot: "bg-slate-400" },
  pendiente_envio_sifen: { cls: "border-amber-200 bg-amber-50 text-amber-800", dot: "bg-amber-500" },
  aprobada: { cls: "border-emerald-200 bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  rechazada: { cls: "border-rose-200 bg-rose-50 text-rose-700", dot: "bg-rose-500" },
  error: { cls: "border-rose-200 bg-rose-50 text-rose-700", dot: "bg-rose-500" },
  anulada_borrador: { cls: "border-slate-200 bg-slate-100 text-slate-500 line-through", dot: "bg-slate-400" },
};

function BadgeErp({ estado }: { estado: string }) {
  const t = ERP_TONES[estado] ?? { cls: "border-slate-200 bg-slate-50 text-slate-700", dot: "bg-slate-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${t.cls}`}>
      <span aria-hidden="true" className={`h-1 w-1 rounded-full ${t.dot}`} />
      {estado}
    </span>
  );
}

const SIFEN_TONES: Record<string, { cls: string; dot: string }> = {
  sin_envio: { cls: "border-slate-200 bg-slate-50 text-slate-700", dot: "bg-slate-400" },
  generado: { cls: "border-[#4FAEB2]/30 bg-[#4FAEB2]/10 text-[#3F8E91]", dot: "bg-[#4FAEB2]" },
  firmado: { cls: "border-indigo-200 bg-indigo-50 text-indigo-700", dot: "bg-indigo-500" },
  enviado: { cls: "border-[#4FAEB2]/30 bg-[#4FAEB2]/10 text-[#3F8E91]", dot: "bg-[#4FAEB2]" },
  en_proceso: { cls: "border-violet-200 bg-violet-50 text-violet-700", dot: "bg-violet-500" },
  aprobado: { cls: "border-emerald-200 bg-emerald-50 text-emerald-700", dot: "bg-emerald-500" },
  rechazado: { cls: "border-rose-200 bg-rose-50 text-rose-700", dot: "bg-rose-500" },
  error_envio: { cls: "border-orange-200 bg-orange-50 text-orange-700", dot: "bg-orange-500" },
  cancelado: { cls: "border-slate-200 bg-slate-100 text-slate-500", dot: "bg-slate-400" },
};

function BadgeSifen({ estado }: { estado: string | null }) {
  if (estado == null || estado === "") return <span className="text-xs text-slate-400">—</span>;
  const t = SIFEN_TONES[estado] ?? { cls: "border-slate-200 bg-slate-50 text-slate-700", dot: "bg-slate-400" };
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${t.cls}`}>
      <span aria-hidden="true" className={`h-1 w-1 rounded-full ${t.dot}`} />
      {estado}
    </span>
  );
}

function formatGs(n: number, moneda: string) {
  return moneda === "USD" ? n.toLocaleString("en-US") : n.toLocaleString("es-PY");
}

const ERP_OPTS = [
  "borrador",
  "pendiente_envio_sifen",
  "aprobada",
  "rechazada",
  "error",
  "anulada_borrador",
] as const;

const SIFEN_OPTS = [
  "sin_envio",
  "generado",
  "firmado",
  "enviado",
  "en_proceso",
  "aprobado",
  "rechazado",
  "error_envio",
  "cancelado",
] as const;

export default function NotasCreditoListClient() {
  const [items, setItems] = useState<NotaCreditoGlobalListItemDTO[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [clientes, setClientes] = useState<{ id: string; nombre: string }[]>([]);
  const [detalleId, setDetalleId] = useState<string | null>(null);

  const [desde, setDesde] = useState("");
  const [hasta, setHasta] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [estadoErp, setEstadoErp] = useState("");
  const [estadoSifen, setEstadoSifen] = useState("");
  const [usuarioId, setUsuarioId] = useState("");
  const [facturaId, setFacturaId] = useState("");
  const [buscar, setBuscar] = useState("");
  const [cdc, setCdc] = useState("");
  const [conError, setConError] = useState("");

  const limit = 50;

  useEffect(() => {
    getClientes().then((c) =>
      setClientes(
        c.map((x) => ({
          id: x.id,
          nombre: (x.empresa ?? x.nombre_contacto) || "—",
        })),
      ),
    );
  }, []);

  const queryString = useMemo(() => {
    const p = new URLSearchParams();
    p.set("page", String(page));
    p.set("limit", String(limit));
    if (desde) p.set("desde", desde);
    if (hasta) p.set("hasta", hasta);
    if (clienteId) p.set("cliente_id", clienteId);
    if (estadoErp) p.set("estado_erp", estadoErp);
    if (estadoSifen) p.set("estado_sifen", estadoSifen);
    if (usuarioId.trim()) p.set("usuario_id", usuarioId.trim());
    if (facturaId.trim()) p.set("factura_id", facturaId.trim());
    if (buscar.trim()) p.set("buscar", buscar.trim());
    if (cdc.trim().length >= 8) p.set("cdc", cdc.trim());
    if (conError) p.set("con_error", conError);
    return p.toString();
  }, [page, desde, hasta, clienteId, estadoErp, estadoSifen, usuarioId, facturaId, buscar, cdc, conError]);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetchWithSupabaseSession(`/api/notas-credito?${queryString}`, { cache: "no-store" });
      const j = (await res.json()) as {
        success?: boolean;
        data?: { items: NotaCreditoGlobalListItemDTO[]; total: number };
        error?: string;
      };
      if (!res.ok || !j.success || !j.data) {
        setItems([]);
        setTotal(0);
        setErr(j.error ?? "No se pudo cargar");
        return;
      }
      setItems(j.data.items);
      setTotal(j.data.total);
    } catch {
      setItems([]);
      setTotal(0);
      setErr("Error de red");
    } finally {
      setLoading(false);
    }
  }, [queryString]);

  useEffect(() => {
    void load();
  }, [load]);

  const hayFiltros =
    desde || hasta || clienteId || estadoErp || estadoSifen || usuarioId || facturaId || buscar || cdc || conError;

  const clienteOptions = useMemo(
    () => [
      { value: "", label: "Todos los clientes" },
      ...clientes.map((c) => ({ value: c.id, label: c.nombre })),
    ],
    [clientes],
  );

  const erpOptions = useMemo(
    () => [
      { value: "", label: "Todos los estados" },
      ...ERP_OPTS.map((e) => ({ value: e, label: e })),
    ],
    [],
  );
  const sifenOptions = useMemo(
    () => [
      { value: "", label: "Todos los estados" },
      ...SIFEN_OPTS.map((e) => ({ value: e, label: e })),
    ],
    [],
  );
  const errorOptions = [
    { value: "", label: "Indistinto" },
    { value: "1", label: "Con error" },
    { value: "0", label: "Sin error" },
  ];

  function limpiar() {
    setDesde("");
    setHasta("");
    setClienteId("");
    setEstadoErp("");
    setEstadoSifen("");
    setUsuarioId("");
    setFacturaId("");
    setBuscar("");
    setCdc("");
    setConError("");
    setPage(1);
  }

  return (
    <div className="space-y-6 pb-10">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
          />
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
            Auditoría
          </p>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Notas de crédito</h1>
        <p className="mt-1 text-sm text-slate-500">
          Listado global, estados ERP/SIFEN y vínculo a factura y cliente.
        </p>
      </div>

      {/* Filtros */}
      <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="mb-4 flex items-center gap-2">
          <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">Filtros</h2>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6">
          <label className="block">
            <span className={LABEL_CLS}>Desde</span>
            <input
              type="date"
              className={INPUT_CLS}
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
            />
          </label>
          <label className="block">
            <span className={LABEL_CLS}>Hasta</span>
            <input
              type="date"
              className={INPUT_CLS}
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
            />
          </label>
          <div className="block">
            <span className={LABEL_CLS}>Cliente</span>
            <FancySelect
              ariaLabel="Filtrar por cliente"
              placeholder="Todos los clientes"
              value={clienteId}
              onChange={setClienteId}
              options={clienteOptions}
            />
          </div>
          <div className="block">
            <span className={LABEL_CLS}>Estado ERP</span>
            <FancySelect
              ariaLabel="Filtrar por estado ERP"
              placeholder="Todos los estados"
              value={estadoErp}
              onChange={setEstadoErp}
              options={erpOptions}
            />
          </div>
          <div className="block">
            <span className={LABEL_CLS}>Estado SIFEN</span>
            <FancySelect
              ariaLabel="Filtrar por estado SIFEN"
              placeholder="Todos los estados"
              value={estadoSifen}
              onChange={setEstadoSifen}
              options={sifenOptions}
            />
          </div>
          <div className="block">
            <span className={LABEL_CLS}>Con error</span>
            <FancySelect
              ariaLabel="Filtrar por error"
              placeholder="Indistinto"
              value={conError}
              onChange={setConError}
              options={errorOptions}
            />
          </div>
          <label className="block sm:col-span-2">
            <span className={LABEL_CLS}>Usuario creador (UUID)</span>
            <input
              className={INPUT_CLS}
              placeholder="auth user id"
              value={usuarioId}
              onChange={(e) => setUsuarioId(e.target.value)}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={LABEL_CLS}>Factura (UUID)</span>
            <input
              className={INPUT_CLS}
              placeholder="factura_id"
              value={facturaId}
              onChange={(e) => setFacturaId(e.target.value)}
            />
          </label>
          <label className="block sm:col-span-2">
            <span className={LABEL_CLS}>Buscar en motivo</span>
            <input
              className={INPUT_CLS}
              placeholder="texto…"
              value={buscar}
              onChange={(e) => setBuscar(e.target.value)}
            />
          </label>
          <label className="block sm:col-span-2 lg:col-span-3 xl:col-span-3">
            <span className={LABEL_CLS}>CDC (≥ 8 caracteres)</span>
            <input
              className={INPUT_CLS}
              placeholder="44 dígitos o fragmento"
              value={cdc}
              onChange={(e) => setCdc(e.target.value)}
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setPage(1)}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/20 transition-colors hover:bg-[#3F8E91]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
            </svg>
            Aplicar filtros
          </button>
          {hayFiltros ? (
            <button
              type="button"
              onClick={limpiar}
              className="rounded-xl border border-transparent px-3 py-2 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              Limpiar filtros
            </button>
          ) : null}
          <span className="ml-auto text-xs text-slate-500">
            <span className="font-semibold tabular-nums text-slate-800">{total}</span>{" "}
            {total === 1 ? "registro" : "registros"} en total
          </span>
        </div>
      </section>

      {err && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">{err}</div>
      )}

      {/* Tabla */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1200px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50/80 backdrop-blur-sm">
              <tr>
                {[
                  "Fecha",
                  "Cliente",
                  "Factura",
                  "Monto",
                  "ERP",
                  "SIFEN",
                  "CDC",
                  "Usuario",
                  "Motivo",
                  "Error",
                  "Detalle",
                ].map((h, i) => (
                  <th
                    key={h}
                    className={`px-3 py-2.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 whitespace-nowrap ${
                      i === 3 ? "text-right" : "text-left"
                    }`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading ? (
                <tr>
                  <td colSpan={11} className="px-3 py-12 text-center">
                    <div className="inline-flex items-center gap-3 text-sm text-slate-500">
                      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#4FAEB2]" />
                      Cargando…
                    </div>
                  </td>
                </tr>
              ) : items.length === 0 ? (
                <tr>
                  <td colSpan={11} className="px-3 py-12 text-center">
                    <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400">
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
                      </svg>
                    </div>
                    <p className="text-sm font-semibold text-slate-700">Sin resultados</p>
                    <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
                      Ajustá los filtros o limpialos para ver más registros.
                    </p>
                  </td>
                </tr>
              ) : (
                items.map((nc) => (
                  <tr key={nc.id} className="transition-colors hover:bg-[#4FAEB2]/[0.04]">
                    <td className="px-3 py-3 whitespace-nowrap text-xs tabular-nums text-slate-600">
                      {new Date(nc.created_at).toLocaleString("es-PY", {
                        dateStyle: "short",
                        timeStyle: "short",
                      })}
                    </td>
                    <td className="px-3 py-3 max-w-[180px]">
                      <Link
                        href={`/clientes/${nc.cliente_id}`}
                        className="block truncate text-sm font-semibold text-[#3F8E91] hover:underline"
                      >
                        {nc.cliente_display}
                      </Link>
                    </td>
                    <td className="px-3 py-3 font-mono text-xs">
                      <Link href={`/facturas/${nc.factura_id}`} className="text-[#3F8E91] hover:underline">
                        {nc.factura_numero ?? nc.factura_id.slice(0, 8) + "…"}
                      </Link>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap text-right">
                      <span className="text-[11px] font-medium text-slate-400">
                        {nc.moneda_snapshot === "USD" ? "USD" : "Gs."}
                      </span>{" "}
                      <span className="text-sm font-semibold tabular-nums text-slate-900">
                        {formatGs(nc.monto, nc.moneda_snapshot)}
                      </span>
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <BadgeErp estado={nc.estado_erp} />
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <BadgeSifen estado={nc.estado_sifen} />
                    </td>
                    <td
                      className="max-w-[140px] truncate px-3 py-3 font-mono text-[10px] text-slate-600"
                      title={nc.cdc ?? ""}
                    >
                      {nc.cdc ?? "—"}
                    </td>
                    <td
                      className="max-w-[160px] truncate px-3 py-3 text-xs text-slate-700"
                      title={nc.created_by_email_snapshot ?? ""}
                    >
                      {nc.created_by_nombre_snapshot ?? nc.created_by_email_snapshot ?? "—"}
                    </td>
                    <td
                      className="max-w-[220px] truncate px-3 py-3 text-sm text-slate-700"
                      title={nc.motivo}
                    >
                      {nc.motivo}
                    </td>
                    <td
                      className="max-w-[180px] truncate px-3 py-3 text-xs text-rose-700"
                      title={nc.last_error_resumido ?? ""}
                    >
                      {nc.last_error_resumido ?? <span className="text-slate-400">—</span>}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setDetalleId(nc.id)}
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
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                          <circle cx="12" cy="12" r="3" />
                        </svg>
                        Ver detalle
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        {total > limit && (
          <div className="flex items-center justify-between gap-3 border-t border-slate-100 bg-slate-50/50 px-4 py-3 text-xs">
            <span className="text-slate-500">
              Página{" "}
              <span className="font-semibold tabular-nums text-slate-800">{page}</span> ·{" "}
              <span className="font-semibold tabular-nums text-slate-800">{total}</span> registros
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                disabled={page <= 1}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#3F8E91] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-700"
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3 w-3"
                  aria-hidden="true"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
                Anterior
              </button>
              <button
                type="button"
                disabled={page * limit >= total}
                className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#3F8E91] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:text-slate-700"
                onClick={() => setPage((p) => p + 1)}
              >
                Siguiente
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="h-3 w-3"
                  aria-hidden="true"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      <NotaCreditoDetalleModal
        id={detalleId}
        open={detalleId != null}
        onClose={() => setDetalleId(null)}
      />
    </div>
  );
}
