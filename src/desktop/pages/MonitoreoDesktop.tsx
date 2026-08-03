"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  fetchMonitoreoPageData,
  type MonitoringDashboard,
  type MonitoringPendingReplyAgentGroup,
  type MonitoringUnassignedRow,
  type SupervisorAgentLoadRow,
} from "@/lib/chat/chat-ops-actions";
import { formatWaitHuman } from "@/lib/chat/format-wait-human";
import { assignmentWaitBadge, assignmentWaitBadgeClass } from "@/lib/chat/inbox-assignment-labels";
import { ArrowLeftRight, Eye, Flame } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import {
  attachmentCaptionForDisplay,
  getErpAttachmentPublicUrl,
  getWhatsAppMediaUrlFromRawPayload,
} from "@/lib/chat/message-erp-display";

type MonitorChatMsg = {
  id: string;
  from_me: boolean;
  message_type: string;
  content: string | null;
  created_at: string;
  raw_payload?: Record<string, unknown> | null;
};

/** `formatWaitHuman` depende de `Date.now()`; sin re-render el monitoreo mostraba tiempos “congelados”. */
function buildMonitoreoInboxHref(row: MonitoringUnassignedRow, opts: { transferir?: boolean }) {
  const p = new URLSearchParams();
  p.set("asignacion", "sin_asignar");
  p.set("conversationId", row.id);
  const qid = row.queue_id?.trim();
  if (qid) p.set("cola", qid);
  if (opts.transferir) p.set("transferir", "1");
  return `/dashboard/conversaciones?${p.toString()}`;
}

function TickingSinceLabel({ iso }: { iso: string | null | undefined }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = window.setInterval(() => setTick((x) => x + 1), 15_000);
    return () => window.clearInterval(id);
  }, []);
  if (!iso) return <>—</>;
  return <span className="tabular-nums">{formatWaitHuman(iso)}</span>;
}

// ── Iconografía SVG inline ───────────────────────────────────────────────────

type IconProps = { className?: string };

const IconQueue = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M7 10h10M7 14h6" />
  </svg>
);
const IconUsers = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
    <path d="M16 3.13a4 4 0 0 1 0 7.75" />
  </svg>
);
const IconUserX = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
    <circle cx="8.5" cy="7" r="4" />
    <line x1="18" y1="8" x2="23" y2="13" />
    <line x1="23" y1="8" x2="18" y2="13" />
  </svg>
);
const IconClock = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="10" />
    <polyline points="12 6 12 12 16 14" />
  </svg>
);
const IconMessage = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);
const IconBroadcast = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <circle cx="12" cy="12" r="2" />
    <path d="M16.24 7.76a6 6 0 0 1 0 8.49M7.76 16.24a6 6 0 0 1 0-8.49M20.07 4.93a10 10 0 0 1 0 14.14M3.93 19.07a10 10 0 0 1 0-14.14" />
  </svg>
);
const IconRefresh = ({ className = "h-4 w-4" }: IconProps) => (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
  </svg>
);

// ── Avatar de iniciales (estable por hash) ───────────────────────────────────

const AVATAR_TONES = [
  "bg-[#4FAEB2]/12 text-[#3F8E91] border-[#4FAEB2]/30",
  "bg-violet-50 text-violet-700 border-violet-200",
  "bg-amber-50 text-amber-700 border-amber-200",
  "bg-emerald-50 text-emerald-700 border-emerald-200",
  "bg-rose-50 text-rose-700 border-rose-200",
  "bg-sky-50 text-sky-700 border-sky-200",
];

function avatarToneFor(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) | 0;
  return AVATAR_TONES[Math.abs(hash) % AVATAR_TONES.length];
}
function avatarInitial(label: string): string {
  const cleaned = label.replace(/^[^A-Za-z0-9]+/, "");
  const m = cleaned.match(/[A-Za-z0-9]/);
  return (m?.[0] ?? "?").toUpperCase();
}

export default function MonitoreoPage() {
  const [dash, setDash] = useState<MonitoringDashboard | null>(null);
  const [agents, setAgents] = useState<SupervisorAgentLoadRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedPendingAgentId, setExpandedPendingAgentId] = useState<string | null>(null);
  const [unassignedCollapsed, setUnassignedCollapsed] = useState(false);
  const [pendingCollapsed, setPendingCollapsed] = useState(false);
  const [agentsCollapsed, setAgentsCollapsed] = useState(false);
  const [uxRole, setUxRole] = useState<string | null>(null);
  const [uxTeamCount, setUxTeamCount] = useState<number | null>(null);

  // Fecha (America/Asuncion) para la métrica "Leads del día". Default = hoy.
  const todayPY = useMemo(
    () =>
      new Intl.DateTimeFormat("en-CA", {
        timeZone: "America/Asuncion",
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).format(new Date()),
    []
  );
  const [leadDate, setLeadDate] = useState<string>(todayPY);
  const esLeadHoy = leadDate === todayPY;
  const leadsColLabel = esLeadHoy ? "Leads hoy" : `Leads ${leadDate.slice(8, 10)}/${leadDate.slice(5, 7)}`;
  const leadsTotal = agents.reduce((s, a) => s + (a.leads_hoy ?? 0), 0);

  const load = useCallback(async (dateYmd: string) => {
    setLoading(true);
    setError(null);
    try {
      const { dash, agents, ux } = await fetchMonitoreoPageData(dateYmd);
      setDash(dash);
      setAgents(agents);
      setUxRole(ux.omnicanal_role);
      setUxTeamCount(ux.team_agent_usuario_count);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(leadDate);
  }, [load, leadDate]);

  // Popup de lectura de una conversación (sin salir del monitoreo, sin abrir pestañas).
  const [chatModal, setChatModal] = useState<{ id: string; name: string; phone: string | null } | null>(null);
  const [chatMsgs, setChatMsgs] = useState<MonitorChatMsg[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const [chatErr, setChatErr] = useState<string | null>(null);

  const openChat = useCallback((it: { conversation_id: string; contact_name?: string | null; contact_phone?: string | null }) => {
    const name = it.contact_name?.trim() || it.contact_phone || "Contacto sin datos";
    setChatModal({ id: it.conversation_id, name, phone: it.contact_phone ?? null });
    setChatMsgs([]);
    setChatErr(null);
    setChatLoading(true);
    void (async () => {
      try {
        const res = await fetchWithSupabaseSession(
          `/api/chat/messages?conversation_id=${encodeURIComponent(it.conversation_id)}`,
          { cache: "no-store" }
        );
        const json = (await res.json().catch(() => ({}))) as { success?: boolean; data?: MonitorChatMsg[] };
        if (!res.ok || !json.success || !Array.isArray(json.data)) {
          throw new Error("No se pudieron cargar los mensajes");
        }
        setChatMsgs(json.data);
      } catch (e) {
        setChatErr(e instanceof Error ? e.message : "Error al cargar la conversación");
      } finally {
        setChatLoading(false);
      }
    })();
  }, []);

  return (
    <div className="flex flex-col gap-6 pb-10">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Centro de control
            </p>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Monitoreo</h1>
          <p className="mt-1 max-w-2xl text-sm text-slate-500">
            Colas, canales, carga de agentes y conversaciones que requieren atención.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/configuracion/colas"
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#3F8E91]"
          >
            Colas y enrutamiento
          </Link>
          <Link
            href="/dashboard/conversaciones"
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91]"
          >
            Ir al inbox
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-3.5 w-3.5"
              aria-hidden="true"
            >
              <line x1="5" y1="12" x2="19" y2="12" />
              <polyline points="12 5 19 12 12 19" />
            </svg>
          </Link>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {error}
        </div>
      )}

      {uxRole === "supervisor" && !loading ? (
        <div className="rounded-2xl border border-[#4FAEB2]/30 bg-[#4FAEB2]/5 px-4 py-3 text-sm text-[#3F8E91]">
          <span className="font-semibold">Vista de supervisor.</span> Métricas y tablas muestran solo el equipo a tu
          cargo
          {uxTeamCount !== null ? (
            <span className="tabular-nums">
              {" "}
              ({uxTeamCount} agente{uxTeamCount === 1 ? "" : "s"} en el equipo)
            </span>
          ) : null}
          . Las colas en pantalla son las de esos agentes, no la empresa completa.
        </div>
      ) : null}

      {/* Resumen general */}
      <section className="rounded-2xl border border-[#4FAEB2]/45 bg-white p-6 shadow-sm">
        <div className="mb-5 flex items-center gap-2">
          <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            Resumen general
          </p>
        </div>
        {loading || !dash ? (
          <div className="flex items-center gap-3 text-sm text-slate-500">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#4FAEB2]" />
            Cargando métricas…
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-7">
            <MetricTile
              label={leadsColLabel}
              value={leadsTotal}
              tone="success"
              icon={<Flame className="h-4 w-4" />}
            />
            <MetricTile
              label="Colas activas"
              value={dash.active_queues}
              tone="neutral"
              icon={<IconQueue />}
            />
            <MetricTile
              label="Agentes asignados"
              value={dash.agents_assigned}
              tone="neutral"
              icon={<IconUsers />}
            />
            <MetricTile
              label="Chats sin asignar"
              value={dash.unassigned_chats}
              tone="warning"
              icon={<IconUserX />}
            />
            <MetricTile
              label="Pend. 1ª respuesta"
              value={dash.awaiting_first_response}
              tone="warning"
              icon={<IconClock />}
            />
            <MetricTile
              label="Chats pendientes"
              value={dash.pending_chats}
              tone="featured"
              icon={<IconMessage />}
            />
            <MetricTile
              label="Canales activos"
              value={dash.active_channels}
              tone="success"
              icon={<IconBroadcast />}
            />
          </div>
        )}
      </section>

      {/* Chats sin asignar */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className={`flex flex-wrap items-start justify-between gap-3 ${unassignedCollapsed ? "" : "mb-4"}`}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                Chats sin asignar (recientes)
              </h2>
              {dash && dash.unassigned_recent.length > 0 ? (
                <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-amber-700">
                  {dash.unassigned_recent.length}
                </span>
              ) : null}
            </div>
            {!unassignedCollapsed ? (
              <p className="mt-1.5 max-w-3xl pl-3 text-[11px] text-slate-500">
                Motivo: cola manual, sin agentes en estado{" "}
                <span className="font-medium text-slate-700">Disponible</span> para autoasignar, u otra espera en cola.
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void load(leadDate)}
              disabled={unassignedCollapsed}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#3F8E91] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:text-slate-700"
            >
              <IconRefresh className="h-3.5 w-3.5" />
              Actualizar
            </button>
            <button
              type="button"
              onClick={() => setUnassignedCollapsed((v) => !v)}
              aria-expanded={!unassignedCollapsed}
              title={unassignedCollapsed ? "Mostrar listado" : "Ocultar listado"}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#3F8E91]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`h-3.5 w-3.5 text-[#4FAEB2] transition-transform ${unassignedCollapsed ? "" : "rotate-180"}`}
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
              {unassignedCollapsed ? "Mostrar" : "Ocultar"}
            </button>
          </div>
        </div>
        {unassignedCollapsed ? null : loading || !dash ? (
          <div className="flex items-center gap-3 py-8 text-sm text-slate-500">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#4FAEB2]" />
            Cargando…
          </div>
        ) : dash.unassigned_recent.length === 0 ? (
          <div className="flex items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-emerald-100">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-3.5 w-3.5"
                aria-hidden="true"
              >
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </span>
            <span className="font-medium">No hay conversaciones abiertas sin agente en este momento.</span>
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80">
                  <tr>
                    {["Espera", "Contacto", "Canal", "Cola", "Motivo", ""].map((h, i) => (
                      <th
                        key={i}
                        className={`px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 ${
                          i === 5 ? "text-right" : ""
                        }`}
                      >
                        {h || "Acciones"}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {dash.unassigned_recent.map((r: MonitoringUnassignedRow) => {
                    const w = assignmentWaitBadge(r.assignment_wait_code, Boolean(r.queue_id));
                    const name = r.contact_name?.trim() || "Sin nombre";
                    const tone = avatarToneFor(name);
                    return (
                      <tr key={r.id} className="transition-colors hover:bg-[#4FAEB2]/[0.04]">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700 tabular-nums">
                            <IconClock className="h-3 w-3" />
                            <TickingSinceLabel iso={r.waiting_since} />
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span
                              aria-hidden="true"
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${tone}`}
                            >
                              {avatarInitial(name)}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{name}</p>
                              <p className="truncate font-mono text-[11px] tabular-nums text-slate-500">
                                {r.contact_phone ?? "—"}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">
                          {r.channel_nombre ?? r.channel_type ?? "—"}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-700">{r.queue_name ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${assignmentWaitBadgeClass(w.tone)}`}
                          >
                            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-current opacity-70" />
                            {w.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="inline-flex items-center gap-1.5">
                            <Link
                              href={buildMonitoreoInboxHref(r, {})}
                              title="Abrir en inbox"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/8 hover:text-[#3F8E91]"
                            >
                              <Eye className="h-3.5 w-3.5" aria-hidden />
                              <span className="sr-only">Ver en inbox</span>
                            </Link>
                            <Link
                              href={buildMonitoreoInboxHref(r, { transferir: true })}
                              title="Transferir…"
                              className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/8 hover:text-[#3F8E91]"
                            >
                              <ArrowLeftRight className="h-3.5 w-3.5" aria-hidden />
                              <span className="sr-only">Transferir conversación</span>
                            </Link>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {/* Pendientes 1ª respuesta */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className={`flex flex-wrap items-start justify-between gap-3 ${pendingCollapsed ? "" : "mb-4"}`}>
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
                Chats sin primera respuesta humana
              </h2>
              {dash && dash.pending_human_reply_groups.length > 0 ? (
                <span className="inline-flex items-center rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-orange-700">
                  {dash.pending_human_reply_groups.length}
                </span>
              ) : null}
            </div>
            {!pendingCollapsed ? (
              <p className="mt-1.5 max-w-3xl pl-3 text-[11px] text-slate-500">
                Por agente: fila compacta con cantidad; desplegá para ver contacto, canal y tiempo de espera.
              </p>
            ) : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={() => void load(leadDate)}
              disabled={pendingCollapsed}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#3F8E91] disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:border-slate-200 disabled:hover:text-slate-700"
            >
              <IconRefresh className="h-3.5 w-3.5" />
              Actualizar
            </button>
            <button
              type="button"
              onClick={() => setPendingCollapsed((v) => !v)}
              aria-expanded={!pendingCollapsed}
              title={pendingCollapsed ? "Mostrar listado" : "Ocultar listado"}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#3F8E91]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`h-3.5 w-3.5 text-[#4FAEB2] transition-transform ${pendingCollapsed ? "" : "rotate-180"}`}
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
              {pendingCollapsed ? "Mostrar" : "Ocultar"}
            </button>
          </div>
        </div>
        {pendingCollapsed ? null : loading || !dash ? (
          <div className="flex items-center gap-3 py-8 text-sm text-slate-500">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#4FAEB2]" />
            Cargando…
          </div>
        ) : dash.pending_human_reply_groups.length === 0 ? (
          <p className="text-sm text-slate-500">No hay conversaciones esperando la primera respuesta humana.</p>
        ) : (
          <div className="flex flex-col gap-2">
            {dash.pending_human_reply_groups.map((g: MonitoringPendingReplyAgentGroup) => {
              const open = expandedPendingAgentId === g.assigned_agent_id;
              const tone = avatarToneFor(g.agent_name || g.agent_email || "");
              return (
                <div
                  key={g.assigned_agent_id}
                  className={`overflow-hidden rounded-xl border bg-white transition-colors ${
                    open ? "border-[#4FAEB2]/40 shadow-sm" : "border-slate-200"
                  }`}
                >
                  <button
                    type="button"
                    onClick={() =>
                      setExpandedPendingAgentId((cur) =>
                        cur === g.assigned_agent_id ? null : g.assigned_agent_id,
                      )
                    }
                    className="flex w-full flex-wrap items-center justify-between gap-3 px-4 py-3 text-left transition-colors hover:bg-[#4FAEB2]/[0.04]"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span
                        aria-hidden="true"
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${tone}`}
                      >
                        {avatarInitial(g.agent_name || g.agent_email || "")}
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">{g.agent_name}</p>
                        <p className="truncate text-[11px] text-slate-500">{g.agent_email}</p>
                      </div>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      <span className="inline-flex items-center gap-1.5 rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-[11px] font-bold text-orange-700">
                        <Flame className="h-3 w-3" aria-hidden />
                        <span className="tabular-nums">{g.pending_count}</span>
                      </span>
                      <span className="text-[11px] font-medium text-slate-500">{open ? "Ocultar" : "Ver"}</span>
                      <svg
                        xmlns="http://www.w3.org/2000/svg"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className={`h-3.5 w-3.5 text-[#4FAEB2] transition-transform ${open ? "rotate-180" : ""}`}
                        aria-hidden="true"
                      >
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </div>
                  </button>
                  {open ? (
                    <div className="space-y-2 border-t border-slate-100 bg-slate-50/40 px-4 py-3">
                      {g.items.map((it) => {
                        const displayName = it.contact_name?.trim() || it.contact_phone || "Contacto sin datos";
                        const showPhoneLine = Boolean(it.contact_phone && it.contact_name?.trim());
                        return (
                        <div
                          key={it.conversation_id}
                          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs"
                        >
                          <div className="min-w-0 flex-1">
                            <button
                              type="button"
                              onClick={() => openChat(it)}
                              className="block truncate text-left text-sm font-semibold text-[#3F8E91] hover:underline"
                            >
                              {displayName}
                            </button>
                            {showPhoneLine ? (
                              <p className="truncate font-mono text-[11px] tabular-nums text-slate-500">
                                {it.contact_phone}
                              </p>
                            ) : null}
                            {it.channel_label ? (
                              <p className="mt-0.5 text-[11px] text-slate-500">{it.channel_label}</p>
                            ) : null}
                          </div>
                          <div className="flex shrink-0 items-center gap-2 self-start text-right">
                            <div>
                              <span className="inline-flex items-center gap-1 rounded-full border border-orange-200 bg-orange-50 px-2 py-0.5 text-[11px] font-semibold tabular-nums text-orange-700">
                                <IconClock className="h-3 w-3" />
                                <TickingSinceLabel iso={it.waiting_since} />
                              </span>
                              {it.last_preview ? (
                                <p className="mt-1 line-clamp-1 max-w-[18rem] text-[11px] text-slate-400">
                                  {it.last_preview}
                                </p>
                              ) : null}
                            </div>
                            <button
                              type="button"
                              onClick={() => openChat(it)}
                              className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/5 hover:text-[#3F8E91]"
                              title="Leer el chat"
                              aria-label="Leer el chat"
                            >
                              <Eye className="h-4 w-4" aria-hidden />
                            </button>
                          </div>
                        </div>
                        );
                      })}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Agentes y carga */}
      <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className={`flex flex-wrap items-center justify-between gap-3 ${agentsCollapsed ? "" : "mb-4"}`}>
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              Agentes y carga
            </h2>
            {agents.length > 0 ? (
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-700">
                {agents.length}
              </span>
            ) : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium text-slate-500 hidden sm:inline">Leads del día</span>
              <input
                type="date"
                value={leadDate}
                max={todayPY}
                onChange={(e) => setLeadDate(e.target.value || todayPY)}
                aria-label="Fecha para la métrica de leads por agente"
                title="La columna Leads es por esta fecha; el resto de columnas es estado en vivo."
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs tabular-nums text-slate-700 outline-none transition-colors focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20"
              />
              {!esLeadHoy ? (
                <button
                  type="button"
                  onClick={() => setLeadDate(todayPY)}
                  className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-[#3F8E91] transition-colors hover:border-[#4FAEB2]/60"
                >
                  Hoy
                </button>
              ) : null}
            </div>
            <button
              type="button"
              onClick={() => setAgentsCollapsed((v) => !v)}
              aria-expanded={!agentsCollapsed}
              title={agentsCollapsed ? "Mostrar listado" : "Ocultar listado"}
              className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#3F8E91]"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                className={`h-3.5 w-3.5 text-[#4FAEB2] transition-transform ${agentsCollapsed ? "" : "rotate-180"}`}
                aria-hidden="true"
              >
                <polyline points="6 9 12 15 18 9" />
              </svg>
              {agentsCollapsed ? "Mostrar" : "Ocultar"}
            </button>
          </div>
        </div>
        {agentsCollapsed ? null : loading ? (
          <div className="flex items-center gap-3 py-8 text-sm text-slate-500">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#4FAEB2]" />
            Cargando…
          </div>
        ) : agents.length === 0 ? (
          <p className="text-sm text-slate-500">
            {uxRole === "supervisor" ? (
              <>
                No tenés agentes asignados en{" "}
                <Link
                  href="/configuracion/omnicanal-equipos"
                  className="font-semibold text-[#4FAEB2] hover:underline"
                >
                  Equipos y supervisión
                </Link>
                , o aún no tienen perfil en{" "}
                <Link href="/configuracion/colas" className="font-semibold text-[#4FAEB2] hover:underline">
                  Colas
                </Link>
                .
              </>
            ) : (
              <>
                No hay filas en <code className="rounded bg-slate-100 px-1 text-xs">chat_agents</code>. Asigná
                usuarios desde{" "}
                <Link href="/configuracion/colas" className="font-semibold text-[#4FAEB2] hover:underline">
                  Colas
                </Link>
                .
              </>
            )}
          </p>
        ) : (
          <div className="overflow-hidden rounded-xl border border-slate-200">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80">
                  <tr>
                    {[
                      "Cola",
                      "Agente",
                      "En línea",
                      "Turno",
                      leadsColLabel,
                      "En este modo",
                      "Último ping",
                      "Máx.",
                      "Chats activos",
                      "Sin 1ª resp.",
                    ].map((h) => (
                      <th
                        key={h}
                        className="px-4 py-2.5 text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 whitespace-nowrap"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {agents.map((a) => {
                    const tone = avatarToneFor(a.nombre || a.email || "");
                    return (
                      <tr key={a.id} className="transition-colors hover:bg-[#4FAEB2]/[0.04]">
                        <td className="px-4 py-3 text-sm text-slate-700">{a.queue_nombre}</td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <span
                              aria-hidden="true"
                              className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full border text-[11px] font-semibold ${tone}`}
                            >
                              {avatarInitial(a.nombre || a.email || "")}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-semibold text-slate-900">{a.nombre}</p>
                              <p className="truncate text-[11px] text-slate-500 max-w-[200px]">{a.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {a.is_online ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Sí
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-500">
                              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                              No
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          {a.operational_status === "ready" ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">
                              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                              Disponible
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-600">
                              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-slate-400" />
                              En pausa
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <span className="text-sm font-semibold tabular-nums text-[#3F8E91]" title="Leads auto-asignados hoy (reparto del día, America/Asuncion)">
                            {a.leads_hoy ?? 0}
                          </span>
                          {a.transfers_hoy ? (
                            <span
                              className="ml-1.5 text-[10px] font-medium text-slate-400"
                              title="Transferencias manuales recibidas hoy (aparte de los leads automáticos)"
                            >
                              +{a.transfers_hoy} transf.
                            </span>
                          ) : null}
                        </td>
                        <td className="px-4 py-3 text-xs tabular-nums text-slate-600">
                          <TickingSinceLabel iso={a.operational_status_changed_at} />
                        </td>
                        <td className="px-4 py-3 text-xs tabular-nums text-slate-600">
                          <TickingSinceLabel iso={a.last_heartbeat_at} />
                        </td>
                        <td className="px-4 py-3 text-sm font-semibold tabular-nums text-slate-900">
                          {a.max_conversations}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-sm font-semibold tabular-nums ${
                              a.active_conversations >= a.max_conversations
                                ? "text-amber-700"
                                : "text-slate-900"
                            }`}
                          >
                            {a.active_conversations}
                          </span>
                          <span className="ml-1 text-[11px] text-slate-400">/ {a.max_conversations}</span>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`text-sm font-semibold tabular-nums ${
                              a.pending_first_reply > 0 ? "text-amber-700" : "text-slate-500"
                            }`}
                          >
                            {a.pending_first_reply}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      {chatModal ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          onClick={() => setChatModal(null)}
        >
          <div
            className="flex max-h-[85vh] w-full max-w-lg flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-slate-900">{chatModal.name}</p>
                {chatModal.phone ? (
                  <p className="truncate font-mono text-[11px] text-slate-500">{chatModal.phone}</p>
                ) : null}
              </div>
              <button
                type="button"
                onClick={() => setChatModal(null)}
                className="text-lg text-slate-400 hover:text-slate-600"
                aria-label="Cerrar"
              >
                ✕
              </button>
            </div>
            <div className="flex-1 space-y-2 overflow-y-auto bg-slate-50 px-3 py-3">
              {chatLoading ? (
                <p className="py-8 text-center text-sm text-slate-400">Cargando…</p>
              ) : chatErr ? (
                <p className="py-8 text-center text-sm text-red-600">{chatErr}</p>
              ) : chatMsgs.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">Sin mensajes.</p>
              ) : (
                chatMsgs.map((m) => {
                  const url =
                    getErpAttachmentPublicUrl(m.raw_payload) ?? getWhatsAppMediaUrlFromRawPayload(m.raw_payload);
                  const cap = attachmentCaptionForDisplay(m.content);
                  return (
                    <div key={m.id} className={`flex ${m.from_me ? "justify-end" : "justify-start"}`}>
                      <div
                        className={`max-w-[80%] rounded-2xl px-3 py-2 text-[13px] leading-snug ${
                          m.from_me
                            ? "rounded-br-md bg-[#4FAEB2] text-white"
                            : "rounded-bl-md border border-slate-200 bg-white text-slate-800"
                        }`}
                      >
                        {m.message_type === "image" && url ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={url} alt="imagen" className="max-h-48 rounded-lg" />
                        ) : m.message_type === "audio" && url ? (
                          <audio controls src={url} preload="metadata" className="h-8 max-w-[240px]" />
                        ) : m.message_type === "video" && url ? (
                          <video src={url} controls preload="metadata" className="max-h-48 rounded-lg" />
                        ) : cap ? (
                          <p className="whitespace-pre-wrap break-words">{cap}</p>
                        ) : (
                          <p className="italic opacity-70">[{m.message_type}]</p>
                        )}
                        <p className={`mt-1 text-[10px] ${m.from_me ? "text-sky-100" : "text-slate-400"}`}>
                          {new Date(m.created_at).toLocaleString("es-PY", {
                            day: "2-digit",
                            month: "short",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </p>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// ── MetricTile ───────────────────────────────────────────────────────────────

function MetricTile({
  label,
  value,
  tone,
  icon,
}: {
  label: string;
  value: number;
  tone: "neutral" | "warning" | "featured" | "success";
  icon: React.ReactNode;
}) {
  const cardCls =
    tone === "featured"
      ? "relative overflow-hidden rounded-2xl border border-[#4FAEB2]/55 bg-gradient-to-br from-white via-white to-[#4FAEB2]/8 p-4 shadow-[0_4px_18px_rgba(79,174,178,0.08)]"
      : "rounded-2xl border border-slate-200 bg-white p-4 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";

  const chipCls =
    tone === "featured"
      ? "border-[#4FAEB2]/30 bg-[#4FAEB2]/12 text-[#4FAEB2]"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50 text-amber-600"
        : tone === "success"
          ? "border-emerald-200 bg-emerald-50 text-emerald-600"
          : "border-slate-200 bg-slate-50 text-slate-500";

  const valueCls =
    tone === "featured"
      ? "text-[#3F8E91]"
      : tone === "warning"
        ? "text-amber-700"
        : tone === "success"
          ? "text-emerald-700"
          : "text-slate-900";

  return (
    <div className={cardCls}>
      {tone === "featured" ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r from-[#4FAEB2] via-[#4FAEB2]/70 to-[#4FAEB2]/30"
        />
      ) : null}
      <div className="flex items-start justify-between gap-2">
        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border ${chipCls}`}>
          {icon}
        </span>
      </div>
      <p className="mt-3 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className={`mt-1 text-2xl font-semibold tabular-nums tracking-tight ${valueCls}`}>{value}</p>
    </div>
  );
}
