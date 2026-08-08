"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Download, ExternalLink, History, RefreshCw, UserCog } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import {
  PIPELINE_ESTADOS_ORDER,
  pipelineEstadoInfo,
  type PipelineEstado,
} from "@/lib/chat/pipeline-estado";

type PipelineRow = {
  conversation_id: string;
  status: string;
  estado_pipeline: string | null;
  estado_pipeline_updated_at: string | null;
  seguimiento_fecha: string | null;
  venta_monto: number | null;
  contact_nombre: string | null;
  contact_telefono: string | null;
  channel_name: string | null;
  assigned_agent_id: string | null;
  vendedor_usuario_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
};

type Resumen = {
  por_estado: Record<string, { count: number }>;
  ventas_por_vendedor: Array<{
    agent_id: string;
    vendedor_usuario_id: string | null;
    cantidad: number;
    monto_total: number;
  }>;
  seguimientos_hoy: number;
};

type HistoryEvent = {
  id: string;
  estado_anterior: string | null;
  estado_nuevo: string;
  cambiado_por: string | null;
  cambiado_por_nombre: string | null;
  seguimiento_fecha: string | null;
  venta_monto: number | null;
  notas: string | null;
  created_at: string;
};

function formatGs(n: number | null | undefined): string {
  if (n == null) return "—";
  return "Gs " + Math.round(n).toLocaleString("es-PY");
}

function formatDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("es-PY", {
    day: "2-digit",
    month: "2-digit",
    year: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PipelineVentasDesktop() {
  const [rows, setRows] = useState<PipelineRow[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filtros
  const [estadoFiltro, setEstadoFiltro] = useState<string>("");
  const [vendedorFiltro, setVendedorFiltro] = useState<string>("");
  const [desde, setDesde] = useState<string>("");
  const [hasta, setHasta] = useState<string>("");

  // Modal historial
  const [historyFor, setHistoryFor] = useState<PipelineRow | null>(null);

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sp = new URLSearchParams();
      if (estadoFiltro) sp.set("estado", estadoFiltro);
      if (vendedorFiltro) sp.set("vendedor_id", vendedorFiltro);
      if (desde) sp.set("desde", desde);
      if (hasta) sp.set("hasta", hasta);

      const [listRes, resumenRes] = await Promise.all([
        fetchWithSupabaseSession(`/api/pipeline-ventas/list?${sp.toString()}`, { cache: "no-store" }),
        fetchWithSupabaseSession(
          `/api/pipeline-ventas/resumen?${new URLSearchParams({
            ...(desde ? { desde } : {}),
            ...(hasta ? { hasta } : {}),
          }).toString()}`,
          { cache: "no-store" }
        ),
      ]);
      const listJson = (await listRes.json()) as { ok?: boolean; rows?: PipelineRow[]; error?: string };
      const resumenJson = (await resumenRes.json()) as {
        ok?: boolean;
        por_estado?: Resumen["por_estado"];
        ventas_por_vendedor?: Resumen["ventas_por_vendedor"];
        seguimientos_hoy?: number;
        error?: string;
      };
      if (!listRes.ok || !listJson.ok) throw new Error(listJson.error ?? `Error lista ${listRes.status}`);
      if (!resumenRes.ok || !resumenJson.ok) throw new Error(resumenJson.error ?? `Error resumen ${resumenRes.status}`);
      setRows(listJson.rows ?? []);
      setResumen({
        por_estado: resumenJson.por_estado ?? {},
        ventas_por_vendedor: resumenJson.ventas_por_vendedor ?? [],
        seguimientos_hoy: resumenJson.seguimientos_hoy ?? 0,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, [estadoFiltro, vendedorFiltro, desde, hasta]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const exportarCSV = () => {
    // BOM UTF-8 para que Excel abra bien los acentos.
    const header = [
      "conversation_id",
      "contacto",
      "telefono",
      "canal",
      "estado",
      "estado_actualizado_en",
      "seguimiento_fecha",
      "monto",
      "vendedor_usuario_id",
      "ultimo_mensaje_en",
      "ultimo_mensaje_preview",
    ];
    const escape = (v: unknown) => {
      const s = v == null ? "" : String(v);
      if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
      return s;
    };
    const lines = [header.join(",")];
    for (const r of rows) {
      const info = pipelineEstadoInfo(r.estado_pipeline);
      lines.push(
        [
          r.conversation_id,
          r.contact_nombre,
          r.contact_telefono,
          r.channel_name,
          info?.label ?? "Sin estado",
          r.estado_pipeline_updated_at,
          r.seguimiento_fecha,
          r.venta_monto ?? "",
          r.vendedor_usuario_id,
          r.last_message_at,
          r.last_message_preview,
        ]
          .map(escape)
          .join(",")
      );
    }
    const blob = new Blob(["﻿" + lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `pipeline-ventas-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const cardsEstado = useMemo(() => {
    if (!resumen) return [];
    return [
      { key: "sin_estado" as const, label: "Sin estado", info: null },
      ...PIPELINE_ESTADOS_ORDER.map((k) => ({ key: k, label: pipelineEstadoInfo(k)!.label, info: pipelineEstadoInfo(k)! })),
    ].map((it) => ({
      ...it,
      count: resumen.por_estado[it.key]?.count ?? 0,
    }));
  }, [resumen]);

  return (
    <div className="mx-auto max-w-7xl px-4 py-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900">Pipeline de ventas</h1>
          <p className="text-sm text-slate-500">
            Todos los clientes con su estado, de todos los vendedores.
          </p>
        </div>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadAll()}
            className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Refrescar
          </button>
          <button
            type="button"
            onClick={exportarCSV}
            className="inline-flex items-center gap-1 rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-sm font-semibold text-white hover:bg-[#3F8E91]"
          >
            <Download className="h-3.5 w-3.5" /> Exportar CSV
          </button>
        </div>
      </div>

      {/* Resumen cards */}
      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-6">
        {cardsEstado.map((c) => (
          <div
            key={c.key}
            className="rounded-xl border border-slate-200 bg-white p-3"
            style={c.info ? { borderLeft: `4px solid ${c.info.dot}` } : undefined}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {c.info ? `${c.info.emoji} ${c.info.shortLabel}` : "Sin estado"}
            </p>
            <p className="mt-0.5 text-xl font-bold tabular-nums text-slate-900">{c.count}</p>
          </div>
        ))}
      </div>

      {/* Ventas por vendedor + seguimientos hoy */}
      <div className="mb-4 grid gap-3 md:grid-cols-2">
        <div className="rounded-xl border border-slate-200 bg-white p-3">
          <h2 className="mb-2 text-sm font-semibold text-slate-800">Ventas por vendedor</h2>
          {resumen && resumen.ventas_por_vendedor.length > 0 ? (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="py-1">Vendedor</th>
                  <th className="py-1 text-right">Cantidad</th>
                  <th className="py-1 text-right">Monto total</th>
                </tr>
              </thead>
              <tbody>
                {resumen.ventas_por_vendedor.map((v) => (
                  <tr key={v.agent_id} className="border-t border-slate-100">
                    <td className="py-1.5 text-slate-700">
                      <code className="text-[11px] text-slate-500">
                        {v.vendedor_usuario_id?.slice(0, 8) ?? v.agent_id.slice(0, 8)}
                      </code>
                    </td>
                    <td className="py-1.5 text-right tabular-nums">{v.cantidad}</td>
                    <td className="py-1.5 text-right font-semibold tabular-nums">
                      {formatGs(v.monto_total)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <p className="text-sm text-slate-400">Sin ventas confirmadas todavía.</p>
          )}
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3">
          <h2 className="text-sm font-semibold text-amber-900">Seguimientos programados para hoy</h2>
          <p className="mt-1 text-3xl font-bold tabular-nums text-amber-900">
            {resumen?.seguimientos_hoy ?? 0}
          </p>
          <p className="mt-1 text-xs text-amber-800">
            El cron envía push a los vendedores. Se dispara 1× por día.
          </p>
        </div>
      </div>

      {/* Filtros */}
      <div className="mb-3 flex flex-wrap items-end gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <div>
          <label className="block text-[11px] font-medium text-slate-600">Estado</label>
          <select
            value={estadoFiltro}
            onChange={(e) => setEstadoFiltro(e.target.value)}
            className="mt-1 rounded-lg border border-slate-300 px-2 py-1 text-sm"
          >
            <option value="">Todos</option>
            <option value="sin_estado">Sin estado</option>
            {PIPELINE_ESTADOS_ORDER.map((k) => (
              <option key={k} value={k}>
                {pipelineEstadoInfo(k)!.emoji} {pipelineEstadoInfo(k)!.label}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-600">Vendedor (usuario_id)</label>
          <input
            type="text"
            value={vendedorFiltro}
            onChange={(e) => setVendedorFiltro(e.target.value)}
            placeholder="UUID"
            className="mt-1 rounded-lg border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-600">Desde</label>
          <input
            type="date"
            value={desde}
            onChange={(e) => setDesde(e.target.value)}
            className="mt-1 rounded-lg border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
        <div>
          <label className="block text-[11px] font-medium text-slate-600">Hasta</label>
          <input
            type="date"
            value={hasta}
            onChange={(e) => setHasta(e.target.value)}
            className="mt-1 rounded-lg border border-slate-300 px-2 py-1 text-sm"
          />
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[900px] text-sm">
          <thead className="bg-slate-50 text-left text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="px-3 py-2">Estado</th>
              <th className="px-3 py-2">Cliente</th>
              <th className="px-3 py-2">Canal</th>
              <th className="px-3 py-2">Vendedor</th>
              <th className="px-3 py-2">Actualizado</th>
              <th className="px-3 py-2 text-right">Monto</th>
              <th className="px-3 py-2">Seguim.</th>
              <th className="px-3 py-2">Acciones</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                  Cargando…
                </td>
              </tr>
            ) : error ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-red-600">
                  {error}
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={8} className="px-3 py-8 text-center text-slate-400">
                  Sin resultados.
                </td>
              </tr>
            ) : (
              rows.map((r) => {
                const info = pipelineEstadoInfo(r.estado_pipeline);
                return (
                  <tr key={r.conversation_id} className="border-t border-slate-100 hover:bg-slate-50/60">
                    <td className="px-3 py-2">
                      {info ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                          style={{ backgroundColor: info.bg, color: info.fg }}
                        >
                          <span aria-hidden>{info.emoji}</span>
                          {info.shortLabel}
                        </span>
                      ) : (
                        <span className="text-[11px] italic text-slate-400">Sin estado</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-slate-800">
                      <div className="font-medium">{r.contact_nombre ?? r.contact_telefono ?? "—"}</div>
                      {r.contact_telefono ? (
                        <div className="text-[11px] text-slate-500">{r.contact_telefono}</div>
                      ) : null}
                    </td>
                    <td className="px-3 py-2 text-slate-600">{r.channel_name ?? "—"}</td>
                    <td className="px-3 py-2">
                      <code className="text-[11px] text-slate-500">
                        {r.vendedor_usuario_id?.slice(0, 8) ?? r.assigned_agent_id?.slice(0, 8) ?? "—"}
                      </code>
                    </td>
                    <td className="px-3 py-2 text-[12px] tabular-nums text-slate-600">
                      {formatDate(r.estado_pipeline_updated_at)}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatGs(r.venta_monto)}</td>
                    <td className="px-3 py-2 text-[12px] tabular-nums text-slate-600">
                      {r.seguimiento_fecha ?? "—"}
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex gap-1">
                        <Link
                          href={`/dashboard/conversaciones?id=${encodeURIComponent(r.conversation_id)}`}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                          title="Abrir chat"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </Link>
                        <button
                          type="button"
                          onClick={() => setHistoryFor(r)}
                          className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50"
                          title="Historial"
                        >
                          <History className="h-3.5 w-3.5" />
                        </button>
                        <ReassignButton row={r} onDone={loadAll} />
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {historyFor ? (
        <HistoryModal row={historyFor} onClose={() => setHistoryFor(null)} />
      ) : null}
    </div>
  );
}

/**
 * Botón compacto que abre un prompt para pegar el nuevo agent_id (UUID de chat_agents).
 * Deliberadamente MVP — un selector con lista de agentes activos vendría en una segunda pasada.
 */
function ReassignButton({ row, onDone }: { row: PipelineRow; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const onClick = async () => {
    const val = window.prompt(
      "UUID del nuevo agente (chat_agents.id). Dejá vacío para desasignar.",
      row.assigned_agent_id ?? ""
    );
    if (val === null) return; // cancel
    setBusy(true);
    const res = await fetchWithSupabaseSession("/api/pipeline-ventas/reassign", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        conversation_id: row.conversation_id,
        agent_id: val.trim() || null,
      }),
    });
    setBusy(false);
    const j = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
    if (!res.ok || !j.ok) {
      window.alert(j.error ?? `Error ${res.status}`);
      return;
    }
    onDone();
  };
  return (
    <button
      type="button"
      onClick={() => void onClick()}
      disabled={busy}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-slate-600 hover:bg-slate-50 disabled:opacity-50"
      title="Reasignar vendedor"
    >
      <UserCog className="h-3.5 w-3.5" />
    </button>
  );
}

function HistoryModal({ row, onClose }: { row: PipelineRow; onClose: () => void }) {
  const [events, setEvents] = useState<HistoryEvent[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancel = false;
    (async () => {
      try {
        const res = await fetchWithSupabaseSession(
          `/api/pipeline-ventas/history/${encodeURIComponent(row.conversation_id)}`,
          { cache: "no-store" }
        );
        const j = (await res.json()) as { ok?: boolean; events?: HistoryEvent[]; error?: string };
        if (cancel) return;
        if (!res.ok || !j.ok) throw new Error(j.error ?? `Error ${res.status}`);
        setEvents(j.events ?? []);
      } catch (e) {
        if (!cancel) setError(e instanceof Error ? e.message : "Error");
      }
    })();
    return () => {
      cancel = true;
    };
  }, [row.conversation_id]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white p-4 shadow-lg"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-900">
            Historial de {row.contact_nombre ?? row.contact_telefono ?? "cliente"}
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="text-sm text-slate-500 hover:text-slate-700"
          >
            Cerrar
          </button>
        </div>
        {error ? (
          <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>
        ) : events == null ? (
          <p className="text-sm text-slate-500">Cargando…</p>
        ) : events.length === 0 ? (
          <p className="text-sm text-slate-500">Sin cambios registrados.</p>
        ) : (
          <ol className="space-y-2">
            {events.map((ev) => {
              const info = pipelineEstadoInfo(ev.estado_nuevo);
              const infoPrev = pipelineEstadoInfo(ev.estado_anterior);
              return (
                <li key={ev.id} className="rounded-lg border border-slate-200 p-2">
                  <div className="flex items-center gap-2 text-sm">
                    {infoPrev ? (
                      <span className="text-[11px] text-slate-500">
                        {infoPrev.emoji} {infoPrev.shortLabel}
                      </span>
                    ) : (
                      <span className="text-[11px] italic text-slate-400">Sin estado</span>
                    )}
                    <span className="text-slate-400">→</span>
                    {info ? (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold"
                        style={{ backgroundColor: info.bg, color: info.fg }}
                      >
                        {info.emoji} {info.shortLabel}
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    {ev.cambiado_por_nombre ?? "—"} · {formatDate(ev.created_at)}
                    {ev.seguimiento_fecha ? ` · seguim. ${ev.seguimiento_fecha}` : ""}
                    {ev.venta_monto != null ? ` · ${formatGs(ev.venta_monto)}` : ""}
                  </div>
                  {ev.notas ? (
                    <p className="mt-1 text-xs text-slate-700">{ev.notas}</p>
                  ) : null}
                </li>
              );
            })}
          </ol>
        )}
      </div>
    </div>
  );
}
