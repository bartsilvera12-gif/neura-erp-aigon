"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { ChatChannelRow } from "@/lib/chat/actions";
import type {
  ChatQueueAdminRow,
  QueueAgentRow,
  QueueClosureTaxonomyInput,
  UsuarioPickRow,
} from "@/lib/chat/queue-admin-repo";
import {
  DEFAULT_QUEUE_ROUTING_CONFIG,
  parseQueueRoutingConfig,
  serializeQueueRoutingConfig,
  type QueueRoutingConfig,
} from "@/lib/chat/queue-routing-config";
import {
  apiAddQueueAgent,
  apiDeleteQueue,
  apiQueueEditorBootstrap,
  apiRemoveQueueAgent,
  apiSaveClosureTaxonomy,
  apiSaveQueue,
  apiSetQueueChannelLinks,
  apiUpdateQueueAgent,
} from "../queue-admin-api";
import { getMisModulos } from "@/lib/empresas/actions";

function hasOmnichannel(slugs: string[]) {
  return slugs.includes("conversaciones") || slugs.includes("omnicanal");
}

const STRATS: { value: string; label: string; hint: string }[] = [
  {
    value: "round_robin",
    label: "Circular",
    hint: "Recorre agentes en orden y vuelve a empezar (1, 2, 3…).",
  },
  {
    value: "least_load",
    label: "Menor carga",
    hint: "Asigna al agente con menos chats activos en este momento.",
  },
  {
    value: "manual_pull",
    label: "Manual",
    hint: "No autoasigna conversaciones nuevas; queda para toma manual.",
  },
];

export type ColaEditorProps = {
  queueId: string;
  /** "page" muestra breadcrumb y Link de volver; "modal" omite breadcrumb y usa callbacks. */
  mode?: "page" | "modal";
  onSaved?: () => void;
  onDeleted?: () => void;
  onCancel?: () => void;
};

export default function ColaEditor({
  queueId,
  mode = "page",
  onSaved,
  onDeleted,
  onCancel,
}: ColaEditorProps) {
  const isModal = mode === "modal";

  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [queue, setQueue] = useState<ChatQueueAdminRow | null>(null);
  const [channels, setChannels] = useState<ChatChannelRow[]>([]);
  const [linked, setLinked] = useState<string[]>([]);
  const [agents, setAgents] = useState<QueueAgentRow[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioPickRow[]>([]);
  const [pickUser, setPickUser] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [bootstrapWarnings, setBootstrapWarnings] = useState<string[]>([]);

  const [nombre, setNombre] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [legacyChannelType, setLegacyChannelType] = useState<string>("");
  const [strategy, setStrategy] = useState("least_load");
  const [priority, setPriority] = useState(0);
  const [routing, setRouting] = useState<QueueRoutingConfig>(DEFAULT_QUEUE_ROUTING_CONFIG);
  const [closureDraft, setClosureDraft] = useState<{ label: string; substates: { label: string }[] }[]>([]);
  const [closureSaving, setClosureSaving] = useState(false);

  const load = useCallback(async () => {
    if (!queueId) return;
    setLoading(true);
    setError(null);
    setBootstrapWarnings([]);
    try {
      const boot = await apiQueueEditorBootstrap(queueId);
      const q = boot.queue;
      setQueue(q);
      setBootstrapWarnings(Array.isArray(boot.bootstrapWarnings) ? boot.bootstrapWarnings : []);
      setChannels(boot.channels as ChatChannelRow[]);
      setLinked(boot.linked.map((l) => l.channel_id));
      setAgents(boot.agents);
      setUsuarios(boot.usuarios);
      if (q) {
        setNombre(q.nombre);
        setDescripcion(q.descripcion ?? "");
        setIsActive(q.is_active);
        setLegacyChannelType(q.channel_type ?? "");
        setStrategy(q.distribution_strategy ?? "least_load");
        setPriority(q.priority ?? 0);
        setRouting(parseQueueRoutingConfig(q.routing_config));
      }
      setClosureDraft(
        (boot.closure_taxonomy ?? []).map((s) => ({
          label: s.label,
          substates: (s.substates ?? []).map((sub) => ({ label: sub.label })),
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al cargar");
    } finally {
      setLoading(false);
    }
  }, [queueId]);

  useEffect(() => {
    getMisModulos()
      .then((mods) => setAllowed(hasOmnichannel(mods.map((m) => m.slug))))
      .catch(() => setAllowed(false));
  }, []);

  useEffect(() => {
    if (allowed && queueId) void load();
  }, [allowed, queueId, load]);

  async function handleSaveQueue() {
    if (!queueId) return;
    setSaving(true);
    setError(null);
    try {
      await apiSaveQueue(queueId, {
        nombre,
        descripcion: descripcion || null,
        is_active: isActive,
        channel_type: linked.length > 0 ? null : legacyChannelType.trim() || null,
        distribution_strategy: strategy,
        priority,
        routing_config: serializeQueueRoutingConfig(routing),
      });
      await apiSetQueueChannelLinks(queueId, linked);
      onSaved?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar");
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveClosureTaxonomy() {
    if (!queueId) return;
    setClosureSaving(true);
    setError(null);
    try {
      const states: QueueClosureTaxonomyInput[] = closureDraft
        .map((s, i) => ({
          label: s.label.trim(),
          sort_order: i,
          substates: s.substates
            .map((sub, j) => ({ label: sub.label.trim(), sort_order: j }))
            .filter((sub) => sub.label.length > 0),
        }))
        .filter((s) => s.label.length > 0);
      await apiSaveClosureTaxonomy(queueId, states);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar estados de cierre");
    } finally {
      setClosureSaving(false);
    }
  }

  async function handleAddAgent() {
    if (!pickUser) return;
    setError(null);
    try {
      await apiAddQueueAgent(queueId, pickUser);
      setPickUser("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    }
  }

  async function handleDeleteQueue() {
    if (!confirm("¿Eliminar esta cola? Los agentes asociados se eliminarán.")) return;
    try {
      await apiDeleteQueue(queueId);
      onDeleted?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al eliminar");
    }
  }

  if (allowed === null || loading) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-sm text-slate-500">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#4FAEB2]" />
        Cargando…
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        Sin acceso.{" "}
        {isModal ? (
          <button type="button" onClick={onCancel} className="font-semibold underline">
            Cerrar
          </button>
        ) : (
          <Link href="/configuracion" className="font-semibold underline">
            Volver
          </Link>
        )}
      </div>
    );
  }

  if (error && !queue) {
    return (
      <div className="max-w-xl space-y-4">
        <p className="font-medium text-slate-800">No se pudo cargar la cola</p>
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => void load()}
            className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white hover:bg-[#3F8E91]"
          >
            Reintentar
          </button>
          {isModal ? (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center text-sm font-semibold text-[#4FAEB2] hover:underline"
            >
              Cancelar
            </button>
          ) : (
            <Link
              href="/configuracion/colas"
              className="inline-flex items-center text-sm font-semibold text-[#4FAEB2] hover:underline"
            >
              Volver al listado
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (!queue) {
    return (
      <div className="max-w-xl space-y-4">
        <p className="text-slate-700">Cola no encontrada.</p>
        {isModal ? (
          <button type="button" onClick={onCancel} className="text-sm font-semibold text-[#4FAEB2] hover:underline">
            Cerrar
          </button>
        ) : (
          <Link href="/configuracion/colas" className="text-sm font-semibold text-[#4FAEB2] hover:underline">
            Volver
          </Link>
        )}
      </div>
    );
  }

  return (
    <div className={isModal ? "space-y-6 pb-2" : "space-y-8 max-w-3xl pb-12"}>
      {!isModal ? (
        <nav className="flex items-center gap-2 text-xs text-slate-500">
          <Link href="/configuracion/colas" className="font-medium text-slate-500 transition-colors hover:text-[#4FAEB2]">
            Colas
          </Link>
          <span aria-hidden className="text-slate-300">/</span>
          <span className="truncate font-semibold text-slate-700">{nombre}</span>
        </nav>
      ) : null}

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}

      {bootstrapWarnings.length > 0 && (
        <div className="space-y-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
          {bootstrapWarnings.map((w, i) => (
            <p key={i} className={i === 0 ? "font-medium" : ""}>
              {w}
            </p>
          ))}
        </div>
      )}

      {!isModal ? (
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-2xl font-semibold tracking-tight text-slate-900">Editar cola</h1>
          <button
            type="button"
            onClick={() => void handleDeleteQueue()}
            className="text-sm font-semibold text-red-600 hover:underline"
          >
            Eliminar cola
          </button>
        </div>
      ) : null}

      <section className="space-y-4 rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Datos generales</h2>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Nombre</label>
          <input
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
            value={nombre}
            onChange={(e) => setNombre(e.target.value)}
          />
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Descripción</label>
          <textarea
            className="min-h-[72px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
            value={descripcion}
            onChange={(e) => setDescripcion(e.target.value)}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Prioridad numérica</label>
            <input
              type="number"
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
              value={priority}
              onChange={(e) => setPriority(Number(e.target.value) || 0)}
            />
            <p className="mt-1 text-xs text-slate-400">Mayor número = mayor prioridad al elegir cola.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 sm:mt-6">
            <input
              type="checkbox"
              checked={isActive}
              onChange={(e) => setIsActive(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 text-[#4FAEB2] accent-[#4FAEB2] focus:ring-[#4FAEB2]/30"
            />
            Cola activa
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Estrategia de distribución</h2>
          <p className="mt-1 text-sm text-slate-500">Define cómo se reparten los chats nuevos entre los agentes de esta cola.</p>
        </div>
        <div className="space-y-3">
          {STRATS.map((s) => (
            <label
              key={s.value}
              className={`flex cursor-pointer gap-3 rounded-xl border p-3 transition ${
                strategy === s.value
                  ? "border-[#4FAEB2]/60 bg-[#4FAEB2]/8"
                  : "border-slate-200 hover:border-[#4FAEB2]/40"
              }`}
            >
              <input
                type="radio"
                name="dist-strat"
                className="mt-1 accent-[#4FAEB2]"
                checked={strategy === s.value}
                onChange={() => setStrategy(s.value)}
              />
              <span>
                <span className="font-semibold text-slate-900">{s.label}</span>
                <span className="mt-0.5 block text-xs text-slate-600">{s.hint}</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Canales asociados a esta cola</h2>
          <p className="mt-1 text-sm text-slate-500">
            Elegí uno o varios canales de la empresa. Los chats de esos canales podrán enrutarse a esta cola.
          </p>
        </div>
        {channels.length === 0 ? (
          <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-600">
            Todavía no hay canales configurados en la empresa. Creá un canal en omnicanal y volvé a esta pantalla.
          </p>
        ) : (
          <>
            <p className="text-xs text-slate-500">
              {linked.length === 0
                ? "Ningún canal asociado aún. Marcá los que correspondan."
                : `${linked.length} canal${linked.length === 1 ? "" : "es"} asociado${linked.length === 1 ? "" : "s"}.`}
            </p>
            <ul className="max-h-64 space-y-2 divide-y divide-slate-100 overflow-y-auto pr-1">
              {channels.map((c) => (
                <li key={c.id} className="flex items-center gap-3 pt-2 text-sm first:pt-0">
                  <input
                    type="checkbox"
                    checked={linked.includes(c.id)}
                    onChange={(e) => {
                      setLinked((prev) =>
                        e.target.checked ? [...prev, c.id] : prev.filter((x) => x !== c.id),
                      );
                    }}
                    id={`ch-${c.id}`}
                    className="h-4 w-4 rounded border-slate-300 text-[#4FAEB2] accent-[#4FAEB2] focus:ring-[#4FAEB2]/30"
                  />
                  <label htmlFor={`ch-${c.id}`} className="min-w-0 flex-1 cursor-pointer">
                    <span className="font-medium text-slate-800">{c.nombre?.trim() || c.type}</span>
                    <span className="text-slate-400"> · {c.type}</span>
                    {linked.includes(c.id) && (
                      <span className="ml-2 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700">
                        Asociado
                      </span>
                    )}
                  </label>
                </li>
              ))}
            </ul>
          </>
        )}
        {linked.length > 0 && (
          <p className="text-xs text-slate-500">
            Con canales asociados, el filtro por tipo de canal (legado) no se usa al guardar.
          </p>
        )}
        {linked.length === 0 && (
          <details className="rounded-lg border border-slate-100 bg-slate-50/80 px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium text-slate-700">Compatibilidad avanzada (sin canales asociados)</summary>
            <p className="mt-2 mb-2 text-xs text-slate-500">
              Solo si aún no usás la asociación múltiple de canales: filtro histórico por tipo de canal.
            </p>
            <select
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
              value={legacyChannelType}
              onChange={(e) => setLegacyChannelType(e.target.value)}
            >
              <option value="">Todos los tipos (sin filtro por tipo)</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="facebook">Facebook</option>
              <option value="instagram">Instagram</option>
              <option value="linkedin">LinkedIn</option>
              <option value="email">Email</option>
            </select>
          </details>
        )}
      </section>

      <section className="space-y-4 rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Redistribución por falta de respuesta inicial</h2>
          <p className="mt-1 text-sm text-slate-500">
            Aplica solo al primer contacto humano tras asignar un chat nuevo: si el asesor no respondió ni interactuó en el plazo,
            podés definir qué hacer (la ejecución automática completa puede activarse en una etapa posterior).
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-[#4FAEB2] accent-[#4FAEB2] focus:ring-[#4FAEB2]/30"
            checked={routing.initial_no_response?.enabled ?? false}
            onChange={(e) =>
              setRouting((r) => ({
                ...r,
                initial_no_response: { ...DEFAULT_QUEUE_ROUTING_CONFIG.initial_no_response!, ...r.initial_no_response, enabled: e.target.checked },
              }))
            }
          />
          Activar esta regla
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Tiempo</label>
            <input
              type="number"
              min={1}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
              value={routing.initial_no_response?.value ?? 15}
              onChange={(e) =>
                setRouting((r) => ({
                  ...r,
                  initial_no_response: {
                    ...DEFAULT_QUEUE_ROUTING_CONFIG.initial_no_response!,
                    ...r.initial_no_response,
                    value: Math.max(1, Number(e.target.value) || 1),
                  },
                }))
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Unidad</label>
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
              value={routing.initial_no_response?.unit ?? "minutes"}
              onChange={(e) =>
                setRouting((r) => ({
                  ...r,
                  initial_no_response: {
                    ...DEFAULT_QUEUE_ROUTING_CONFIG.initial_no_response!,
                    ...r.initial_no_response,
                    unit: e.target.value === "hours" ? "hours" : "minutes",
                  },
                }))
              }
            >
              <option value="minutes">Minutos</option>
              <option value="hours">Horas</option>
            </select>
          </div>
        </div>
        <div>
          <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Acción al vencer el plazo</label>
          <select
            className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
            value={routing.initial_no_response?.action ?? "reassign_prepare"}
            onChange={(e) =>
              setRouting((r) => ({
                ...r,
                initial_no_response: {
                  ...DEFAULT_QUEUE_ROUTING_CONFIG.initial_no_response!,
                  ...r.initial_no_response,
                  action: e.target.value === "reassign_auto" ? "reassign_auto" : "reassign_prepare",
                },
              }))
            }
          >
            <option value="reassign_prepare">Preparar redistribución (modelo listo; automatización después)</option>
            <option value="reassign_auto">Redistribuir automáticamente a otro agente (cuando el motor lo aplique)</option>
          </select>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm">
        <div>
          <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Relación del cliente con el mismo asesor</h2>
          <p className="mt-1 text-sm text-slate-500">
            Si el cliente vuelve a escribir dentro de la ventana, el chat puede volver al mismo asesor. Si pasa el plazo, aplica la
            distribución normal de la cola.
          </p>
        </div>
        <label className="flex items-center gap-2 text-sm text-slate-700">
          <input
            type="checkbox"
            className="h-4 w-4 rounded border-slate-300 text-[#4FAEB2] accent-[#4FAEB2] focus:ring-[#4FAEB2]/30"
            checked={routing.same_advisor_window?.enabled ?? false}
            onChange={(e) =>
              setRouting((r) => ({
                ...r,
                same_advisor_window: {
                  ...DEFAULT_QUEUE_ROUTING_CONFIG.same_advisor_window!,
                  ...r.same_advisor_window,
                  enabled: e.target.checked,
                },
              }))
            }
          />
          Activar ventana de misma asesor
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Duración</label>
            <input
              type="number"
              min={1}
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
              value={routing.same_advisor_window?.value ?? 24}
              onChange={(e) =>
                setRouting((r) => ({
                  ...r,
                  same_advisor_window: {
                    ...DEFAULT_QUEUE_ROUTING_CONFIG.same_advisor_window!,
                    ...r.same_advisor_window,
                    value: Math.max(1, Number(e.target.value) || 1),
                  },
                }))
              }
            />
          </div>
          <div>
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Unidad</label>
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
              value={routing.same_advisor_window?.unit ?? "hours"}
              onChange={(e) =>
                setRouting((r) => ({
                  ...r,
                  same_advisor_window: {
                    ...DEFAULT_QUEUE_ROUTING_CONFIG.same_advisor_window!,
                    ...r.same_advisor_window,
                    unit: e.target.value === "days" ? "days" : "hours",
                  },
                }))
              }
            >
              <option value="hours">Horas</option>
              <option value="days">Días</option>
            </select>
          </div>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Cierre de conversaciones</h2>
            <p className="mt-1 max-w-2xl text-sm text-slate-600">
              Definí los motivos de cierre que verá el asesor al pulsar «Finalizar». Cada estado puede tener subestados
              opcionales. Si no configurás nada, el sistema ofrece una lista por defecto hasta que cargues estados acá.
            </p>
          </div>
          <button
            type="button"
            disabled={closureSaving || !queueId}
            onClick={() => void handleSaveClosureTaxonomy()}
            className="shrink-0 rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-50"
          >
            {closureSaving ? "Guardando…" : "Guardar cierre"}
          </button>
        </div>
        <div className="space-y-4">
          {closureDraft.map((row, si) => (
            <div key={si} className="space-y-3 rounded-xl border border-slate-100 bg-slate-50/80 p-4">
              <div className="flex flex-wrap items-start gap-2">
                <div className="min-w-[200px] flex-1">
                  <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Estado</label>
                  <input
                    type="text"
                    className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
                    value={row.label}
                    onChange={(e) =>
                      setClosureDraft((d) =>
                        d.map((x, i) => (i === si ? { ...x, label: e.target.value } : x)),
                      )
                    }
                    placeholder="Ej. Venta cerrada"
                  />
                </div>
                <button
                  type="button"
                  className="mt-5 text-xs font-medium text-red-700 hover:underline"
                  onClick={() => setClosureDraft((d) => d.filter((_, i) => i !== si))}
                >
                  Quitar estado
                </button>
              </div>
              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase text-slate-500">Subestados</p>
                {row.substates.map((sub, sj) => (
                  <div key={sj} className="flex items-center gap-2">
                    <input
                      type="text"
                      className="flex-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
                      value={sub.label}
                      onChange={(e) =>
                        setClosureDraft((d) =>
                          d.map((x, i) =>
                            i !== si
                              ? x
                              : {
                                  ...x,
                                  substates: x.substates.map((y, j) =>
                                    j === sj ? { ...y, label: e.target.value } : y,
                                  ),
                                },
                          ),
                        )
                      }
                      placeholder="Ej. Pago confirmado"
                    />
                    <button
                      type="button"
                      className="text-xs text-slate-500 hover:text-red-700"
                      onClick={() =>
                        setClosureDraft((d) =>
                          d.map((x, i) =>
                            i !== si
                              ? x
                              : { ...x, substates: x.substates.filter((_, j) => j !== sj) },
                          ),
                        )
                      }
                    >
                      Quitar
                    </button>
                  </div>
                ))}
                <button
                  type="button"
                  className="text-xs font-medium text-[#4FAEB2] hover:underline"
                  onClick={() =>
                    setClosureDraft((d) =>
                      d.map((x, i) =>
                        i !== si ? x : { ...x, substates: [...x.substates, { label: "" }] },
                      ),
                    )
                  }
                >
                  + Agregar subestado
                </button>
              </div>
            </div>
          ))}
          <button
            type="button"
            className="text-sm font-medium text-[#4FAEB2] hover:underline"
            onClick={() => setClosureDraft((d) => [...d, { label: "", substates: [] }])}
          >
            + Agregar estado
          </button>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm">
        <h2 className="text-xs font-bold uppercase tracking-wide text-slate-500">Agentes</h2>
        <div className="flex flex-wrap items-end gap-2">
          <div className="min-w-[200px] flex-1">
            <label className="mb-1 block text-xs font-semibold uppercase text-slate-500">Agregar usuario</label>
            <select
              className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
              value={pickUser}
              onChange={(e) => setPickUser(e.target.value)}
            >
              <option value="">Elegir…</option>
              {usuarios.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.nombre} ({u.email})
                </option>
              ))}
            </select>
          </div>
          <button
            type="button"
            onClick={() => void handleAddAgent()}
            className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 hover:bg-[#3F8E91]"
          >
            Añadir
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="pb-2 pr-2">Usuario</th>
                <th className="pb-2 pr-2">Máx.</th>
                <th className="pb-2 pr-2">Prior.</th>
                <th className="pb-2 pr-2">Nuevos</th>
                <th className="pb-2 pr-2">Activo</th>
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {agents.map((a) => (
                <AgentEditorRow key={a.id} queueId={queueId} agent={a} onChange={() => void load()} />
              ))}
            </tbody>
          </table>
          {agents.length === 0 && <p className="pt-2 text-sm text-slate-500">Sin agentes en esta cola.</p>}
        </div>
      </section>

      <div className="flex flex-wrap items-center justify-between gap-2 pt-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSaveQueue()}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          >
            {saving ? "Guardando…" : "Guardar cola y canales"}
          </button>
          {isModal ? (
            <button
              type="button"
              onClick={onCancel}
              className="inline-flex items-center rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/5 hover:text-[#3F8E91]"
            >
              Cancelar
            </button>
          ) : (
            <Link
              href="/configuracion/colas"
              className="inline-flex items-center rounded-xl border border-slate-200 px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/5 hover:text-[#3F8E91]"
            >
              Volver
            </Link>
          )}
        </div>
        {isModal ? (
          <button
            type="button"
            onClick={() => void handleDeleteQueue()}
            className="inline-flex items-center gap-1.5 rounded-xl border border-rose-200 bg-white px-4 py-2 text-sm font-semibold text-rose-600 shadow-sm transition-colors hover:bg-rose-50"
          >
            Eliminar cola
          </button>
        ) : null}
      </div>
    </div>
  );
}

function AgentEditorRow({
  queueId,
  agent,
  onChange,
}: {
  queueId: string;
  agent: QueueAgentRow;
  onChange: () => void;
}) {
  const [maxC, setMaxC] = useState(agent.max_conversations);
  const [prio, setPrio] = useState(agent.priority_in_queue);
  const [recv, setRecv] = useState(agent.receives_new_chats);
  const [active, setActive] = useState(agent.is_active);

  async function persist() {
    await apiUpdateQueueAgent(queueId, agent.id, {
      max_conversations: maxC,
      is_online: agent.is_online,
      is_active: active,
      receives_new_chats: recv,
      priority_in_queue: prio,
    });
    onChange();
  }

  async function remove() {
    if (!confirm("¿Quitar este agente de la cola?")) return;
    await apiRemoveQueueAgent(queueId, agent.id);
    onChange();
  }

  return (
    <tr className="border-b border-slate-50">
      <td className="py-2 pr-2">
        <span className="font-medium text-slate-800">{agent.nombre}</span>
        <span className="block max-w-[180px] truncate text-xs text-slate-400">{agent.email}</span>
      </td>
      <td className="py-2 pr-2">
        <input
          type="number"
          min={1}
          className="w-16 rounded border border-slate-200 px-1 py-0.5 text-xs focus:border-[#4FAEB2] focus:outline-none"
          value={maxC}
          onChange={(e) => setMaxC(Number(e.target.value) || 1)}
          onBlur={() => void persist()}
        />
      </td>
      <td className="py-2 pr-2">
        <input
          type="number"
          className="w-14 rounded border border-slate-200 px-1 py-0.5 text-xs focus:border-[#4FAEB2] focus:outline-none"
          value={prio}
          onChange={(e) => setPrio(Number(e.target.value) || 0)}
          onBlur={() => void persist()}
        />
      </td>
      <td className="py-2 pr-2">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 text-[#4FAEB2] accent-[#4FAEB2] focus:ring-[#4FAEB2]/30"
          checked={recv}
          onChange={(e) => {
            setRecv(e.target.checked);
            void apiUpdateQueueAgent(queueId, agent.id, {
              max_conversations: maxC,
              is_online: agent.is_online,
              is_active: active,
              receives_new_chats: e.target.checked,
              priority_in_queue: prio,
            }).then(onChange);
          }}
        />
      </td>
      <td className="py-2 pr-2">
        <input
          type="checkbox"
          className="h-4 w-4 rounded border-slate-300 text-[#4FAEB2] accent-[#4FAEB2] focus:ring-[#4FAEB2]/30"
          checked={active}
          onChange={(e) => {
            setActive(e.target.checked);
            void apiUpdateQueueAgent(queueId, agent.id, {
              max_conversations: maxC,
              is_online: agent.is_online,
              is_active: e.target.checked,
              receives_new_chats: recv,
              priority_in_queue: prio,
            }).then(onChange);
          }}
        />
      </td>
      <td className="py-2">
        <button type="button" onClick={() => void remove()} className="text-xs font-semibold text-red-600 hover:underline">
          Quitar
        </button>
      </td>
    </tr>
  );
}
