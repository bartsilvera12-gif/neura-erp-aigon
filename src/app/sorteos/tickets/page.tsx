"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type TicketRow = {
  id: string;
  sorteo_id: string;
  entrada_id: string;
  status: string;
  cliente_nombre: string | null;
  cliente_documento: string | null;
  telefono: string | null;
  numero_orden: string | null;
  created_at: string;
};

const INPUT_CLS =
  "w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";
const SELECT_CLS =
  "w-full appearance-none rounded-xl border border-slate-200 bg-white bg-[length:14px_14px] bg-[right_0.7rem_center] bg-no-repeat px-3 py-2 pr-8 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";
const CHEVRON_STYLE = {
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%234FAEB2' stroke-width='2.5'><path stroke-linecap='round' stroke-linejoin='round' d='M6 9l6 6 6-6'/></svg>\")",
} as const;
const LABEL_CLS =
  "block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 mb-1.5";

type StatusMeta = { label: string; chip: string; dot: string };
const STATUS_META: Record<string, StatusMeta> = {
  pending: {
    label: "Pendiente",
    chip: "border-amber-200 bg-amber-50 text-amber-700",
    dot: "bg-amber-500",
  },
  generated: {
    label: "Generado",
    chip: "border-[#4FAEB2]/30 bg-[#4FAEB2]/10 text-[#3F8E91]",
    dot: "bg-[#4FAEB2]",
  },
  sent: {
    label: "Enviado",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
    dot: "bg-emerald-500",
  },
  error: {
    label: "Error",
    chip: "border-rose-200 bg-rose-50 text-rose-700",
    dot: "bg-rose-500",
  },
};
function statusMeta(value: string): StatusMeta {
  return (
    STATUS_META[value] ?? {
      label: value,
      chip: "border-slate-200 bg-slate-50 text-slate-600",
      dot: "bg-slate-400",
    }
  );
}

export default function SorteosTicketsPage() {
  const [rows, setRows] = useState<TicketRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [sorteoId, setSorteoId] = useState("");
  const [status, setStatus] = useState("");
  const [q, setQ] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setErr(null);
    try {
      const sp = new URLSearchParams();
      if (sorteoId.trim()) sp.set("sorteo_id", sorteoId.trim());
      if (status.trim()) sp.set("status", status.trim());
      if (q.trim()) sp.set("q", q.trim());
      const res = await fetchWithSupabaseSession(`/api/sorteos/tickets?${sp.toString()}`, {
        cache: "no-store",
      });
      const json = (await res.json()) as { success?: boolean; data?: TicketRow[]; error?: string };
      if (!res.ok || !json.success) {
        throw new Error(json.error?.trim() || `No se pudo cargar (${res.status})`);
      }
      setRows(Array.isArray(json.data) ? json.data : []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- carga inicial; filtros con botón Filtrar
  }, []);

  async function openSignedUrl(ticketId: string) {
    setBusyId(ticketId);
    setErr(null);
    try {
      const res = await fetchWithSupabaseSession(
        `/api/sorteos/tickets/${encodeURIComponent(ticketId)}/signed-url?ttl=600`,
        { cache: "no-store" },
      );
      const json = (await res.json()) as { success?: boolean; data?: { url?: string }; error?: string };
      if (!res.ok || !json.success || !json.data?.url) {
        throw new Error(json.error || "Sin URL");
      }
      window.open(json.data.url, "_blank", "noopener,noreferrer");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error al obtener URL firmada");
    } finally {
      setBusyId(null);
    }
  }

  async function resendTicket(ticketId: string) {
    if (!confirm("¿Reenviar la imagen por WhatsApp al cliente?")) return;
    setBusyId(ticketId);
    setErr(null);
    try {
      const res = await fetchWithSupabaseSession(`/api/sorteos/tickets/${encodeURIComponent(ticketId)}/resend`, {
        method: "POST",
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error || "Falló reenvío");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusyId(null);
    }
  }

  async function regenerateTicket(ticketId: string) {
    if (!confirm("¿Regenerar el PNG (nueva revisión)? No se reenvía solo.")) return;
    setBusyId(ticketId);
    setErr(null);
    try {
      const res = await fetchWithSupabaseSession(`/api/sorteos/tickets/${encodeURIComponent(ticketId)}/regenerate`, {
        method: "POST",
      });
      const json = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !json.success) throw new Error(json.error || "Falló regeneración");
      await load();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-6 max-w-6xl">
      {/* Breadcrumb */}
      <nav className="flex items-center gap-2 text-xs text-slate-500">
        <Link href="/sorteos" className="font-medium text-slate-500 transition-colors hover:text-[#4FAEB2]">
          Sorteos
        </Link>
        <span aria-hidden className="text-slate-300">
          /
        </span>
        <span className="font-semibold text-slate-700">Tickets</span>
      </nav>

      {/* Header */}
      <div>
        <div className="flex items-center gap-2">
          <span
            aria-hidden="true"
            className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
          />
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
            Sorteos · Tickets
          </p>
        </div>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
          Tickets / Comprobantes
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Registro de generación y envío de comprobantes en imagen tras confirmar compras en WhatsApp.
        </p>
      </div>

      {/* Filtros */}
      <div className="rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
          <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]" />
            Filtros
          </h3>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-3">
          <div className="w-[14rem]">
            <label className={LABEL_CLS}>Sorteo ID</label>
            <input
              className={`${INPUT_CLS} font-mono text-xs`}
              value={sorteoId}
              onChange={(e) => setSorteoId(e.target.value)}
              placeholder="uuid"
            />
          </div>
          <div className="w-[12rem]">
            <label className={LABEL_CLS}>Estado</label>
            <select
              className={SELECT_CLS}
              style={CHEVRON_STYLE}
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              <option value="">Todos</option>
              <option value="pending">Pendiente</option>
              <option value="generated">Generado</option>
              <option value="sent">Enviado</option>
              <option value="error">Error</option>
            </select>
          </div>
          <div className="min-w-[14rem] flex-1">
            <label className={LABEL_CLS}>Buscar</label>
            <input
              className={INPUT_CLS}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Nombre, doc o teléfono…"
            />
          </div>
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91]"
          >
            Filtrar
          </button>
          {sorteoId || status || q ? (
            <button
              type="button"
              onClick={() => {
                setSorteoId("");
                setStatus("");
                setQ("");
                void load();
              }}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/5 hover:text-[#3F8E91]"
            >
              Limpiar
            </button>
          ) : null}
        </div>
      </div>

      {err ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
          {err}
        </div>
      ) : null}

      {/* Tabla */}
      <div className="overflow-hidden rounded-2xl border border-[#4FAEB2]/45 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]" />
              Tickets
            </h2>
          </div>
          <span className="inline-flex items-center gap-1 rounded-full border border-[#4FAEB2]/30 bg-[#4FAEB2]/10 px-2.5 py-0.5 text-[11px] font-semibold text-[#3F8E91]">
            {rows.length}
          </span>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-3 py-12 text-sm text-slate-500">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#4FAEB2]" />
            Cargando tickets…
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50/80 text-left text-[10px] font-semibold uppercase tracking-[0.1em] text-slate-500">
                <tr>
                  <th className="px-4 py-3">Estado</th>
                  <th className="px-4 py-3">Orden</th>
                  <th className="px-4 py-3">Cliente</th>
                  <th className="px-4 py-3">Doc / Tel</th>
                  <th className="px-4 py-3 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {rows.map((r) => {
                  const meta = statusMeta(r.status);
                  return (
                    <tr key={r.id} className="transition-colors hover:bg-[#4FAEB2]/5">
                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${meta.chip}`}
                        >
                          <span aria-hidden="true" className={`h-1 w-1 rounded-full ${meta.dot}`} />
                          {meta.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm font-mono font-semibold text-slate-800">
                        {r.numero_orden ?? "—"}
                      </td>
                      <td className="px-4 py-3 text-sm text-slate-700">{r.cliente_nombre ?? "—"}</td>
                      <td className="px-4 py-3 text-xs text-slate-600">
                        {(r.cliente_documento ?? "").trim() || "—"}
                        <span className="text-slate-300"> / </span>
                        {(r.telefono ?? "").trim() || "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap justify-end gap-1.5">
                          <button
                            type="button"
                            disabled={busyId === r.id || r.status === "pending"}
                            onClick={() => void openSignedUrl(r.id)}
                            className="inline-flex items-center rounded-lg border border-[#4FAEB2]/30 bg-[#4FAEB2]/8 px-2.5 py-1 text-[11px] font-semibold text-[#3F8E91] transition-colors hover:bg-[#4FAEB2]/12 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {busyId === r.id ? "…" : "Ver / descargar"}
                          </button>
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => void resendTicket(r.id)}
                            className="inline-flex items-center rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-[11px] font-semibold text-emerald-700 transition-colors hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Reenviar WA
                          </button>
                          <button
                            type="button"
                            disabled={busyId === r.id}
                            onClick={() => void regenerateTicket(r.id)}
                            className="inline-flex items-center rounded-lg border border-violet-200 bg-violet-50 px-2.5 py-1 text-[11px] font-semibold text-violet-700 transition-colors hover:bg-violet-100 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Regenerar
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
                {rows.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-12 text-center text-sm text-slate-400">
                      Sin registros
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
