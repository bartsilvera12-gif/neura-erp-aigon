"use client";

import {
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  useDraggable,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { createBrowserClientForSchema } from "@/lib/supabase";
import { readSaasBriefData } from "@/lib/proyectos/brief-data";
import ProyectoDetalleModal from "./components/ProyectoDetalleModal";
import ProyectoNuevoModal from "./components/ProyectoNuevoModal";
import { FancySelect } from "./components/FancySelect";

type EstadoRow = {
  id: string;
  nombre: string;
  codigo: string;
  color: string;
  sort_order: number;
  cuenta_sla?: boolean;
  sla_horas_objetivo?: number | null;
  es_estado_final?: boolean;
  inactiveFallback?: boolean;
};

type ProyectoCard = Record<string, unknown> & {
  id: string;
  titulo: string;
  prioridad: string;
  estado_id: string;
  last_activity_at?: string;
  fecha_ingreso?: string;
  fecha_prometida?: string | null;
  brief_data?: Record<string, unknown> | null;
  bloqueado?: boolean;
  archivado?: boolean;
  proyecto_tipo?: { nombre?: string; codigo?: string } | null;
  proyecto_estado?: {
    nombre?: string;
    codigo?: string;
    color?: string;
    cuenta_sla?: boolean;
    sla_horas_objetivo?: number | null;
    es_estado_final?: boolean;
  } | null;
  cliente?: { empresa?: string | null; nombre_contacto?: string | null } | null;
  responsable_comercial?: { nombre?: string | null } | null;
  responsable_tecnico?: { nombre?: string | null } | null;
  tiempo_en_estado_segundos?: number | null;
  estado_actual_desde?: string | null;
  sla_estado_actual?: {
    cuenta_sla: boolean;
    objetivo_horas: number | null;
    vencido: boolean;
    restante_segundos: number | null;
    excedido_segundos: number | null;
  };
};

const ESTADO_ENTREGADO_CODIGO = "publicado";
const POSTENTREGA_PERIODO_DIAS = 30;

function isEntregado(p: ProyectoCard): boolean {
  return (p.proyecto_estado?.codigo ?? "").toLowerCase() === ESTADO_ENTREGADO_CODIGO;
}

type PostentregaInfo = {
  dia: number;
  total: number;
  vencido: boolean;
  diasRestantes: number;
};

function getPostentregaInfo(p: ProyectoCard): PostentregaInfo | null {
  if (!isEntregado(p)) return null;
  const desde = p.estado_actual_desde;
  if (!desde) return null;
  const desdeMs = Date.parse(desde);
  if (!Number.isFinite(desdeMs)) return null;
  const diffMs = Date.now() - desdeMs;
  const diaActual = Math.max(1, Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1);
  const vencido = diaActual > POSTENTREGA_PERIODO_DIAS;
  return {
    dia: diaActual,
    total: POSTENTREGA_PERIODO_DIAS,
    vencido,
    diasRestantes: Math.max(0, POSTENTREGA_PERIODO_DIAS - diaActual + 1),
  };
}

type PrioridadConfig = {
  codigo: string;
  nombre: string;
  color: string | null;
  bg_color: string | null;
  text_color: string | null;
  border_color: string | null;
  sort_order: number;
  activo: boolean;
};

type ProjectCardViewProps = {
  p: ProyectoCard;
  estados: EstadoRow[];
  estadoActivoIds: Set<string>;
  prioridadConfig?: PrioridadConfig;
  onOpen: (id: string) => void;
  onMove: (proyectoId: string, estadoId: string) => void;
  moving?: boolean;
  dragOverlay?: boolean;
};

type KanbanColumnViewProps = {
  col: EstadoRow;
  children: ReactNode;
};

const PROJECT_DRAG_PREFIX = "project:";
const COLUMN_DROP_PREFIX = "estado:";

function projectDragId(projectId: string): string {
  return `${PROJECT_DRAG_PREFIX}${projectId}`;
}

function estadoDropId(estadoId: string): string {
  return `${COLUMN_DROP_PREFIX}${estadoId}`;
}

function readProjectIdFromDragId(id: unknown): string | null {
  const raw = String(id ?? "");
  return raw.startsWith(PROJECT_DRAG_PREFIX) ? raw.slice(PROJECT_DRAG_PREFIX.length) : null;
}

function readEstadoIdFromDropId(id: unknown): string | null {
  const raw = String(id ?? "");
  return raw.startsWith(COLUMN_DROP_PREFIX) ? raw.slice(COLUMN_DROP_PREFIX.length) : null;
}

type PriorityCardStyles = {
  cardAccentClass: string;
  badgeClass: string;
  iconDotClass: string;
};

function getPriorityCardStyles(prioridad: string | null | undefined): PriorityCardStyles {
  if (prioridad === "baja") {
    return {
      cardAccentClass: "border-l-emerald-500 hover:border-emerald-200",
      badgeClass: "border-emerald-200 bg-emerald-50 text-emerald-700",
      iconDotClass: "bg-emerald-500",
    };
  }
  if (prioridad === "alta") {
    return {
      cardAccentClass: "border-l-orange-500 hover:border-orange-200",
      badgeClass: "border-orange-200 bg-orange-50 text-orange-700",
      iconDotClass: "bg-orange-500",
    };
  }
  if (prioridad === "urgente") {
    return {
      cardAccentClass: "border-l-rose-600 hover:border-rose-200",
      badgeClass: "border-rose-200 bg-rose-50 text-rose-700",
      iconDotClass: "bg-rose-600",
    };
  }
  if (prioridad === "normal" || prioridad === "media") {
    return {
      cardAccentClass: "border-l-sky-500 hover:border-sky-200",
      badgeClass: "border-sky-200 bg-sky-50 text-sky-700",
      iconDotClass: "bg-sky-500",
    };
  }
  return {
    cardAccentClass: "border-l-slate-300 hover:border-slate-300",
    badgeClass: "border-slate-200 bg-slate-50 text-slate-600",
    iconDotClass: "bg-slate-400",
  };
}

function prioridadFallbackLabel(p: string): string {
  if (p === "normal") return "Media";
  if (p === "alta") return "Alta";
  if (p === "urgente") return "Urgente";
  if (p === "baja") return "Baja";
  return p;
}

function formatSlaDuration(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  const totalHours = Math.max(0, Math.floor(seconds / 3600));
  const days = Math.floor(totalHours / 24);
  const hours = totalHours % 24;
  if (days > 0 && hours > 0) return `${days}d ${hours}h`;
  if (days > 0) return `${days}d`;
  return `${hours}h`;
}

function formatSlaTarget(hours: number | null | undefined): string | null {
  if (hours == null || !Number.isFinite(hours)) return null;
  return formatSlaDuration(hours * 3600);
}

function slaEstadoLabel(p: ProyectoCard): string {
  const sla = p.sla_estado_actual;
  if (!sla?.cuenta_sla) return "SLA —";
  if (sla.vencido) return `SLA vencido: +${formatSlaDuration(sla.excedido_segundos)}`;
  const elapsed = formatSlaDuration(p.tiempo_en_estado_segundos);
  const target = formatSlaTarget(sla.objetivo_horas);
  return target ? `SLA: ${elapsed} / ${target}` : `SLA: ${elapsed}`;
}

function saasModuleCountLabel(p: ProyectoCard): string | null {
  if (p.proyecto_tipo?.codigo !== "saas") return null;
  const count = readSaasBriefData(p.brief_data).modulos_necesarios.length;
  if (count <= 0) return null;
  return count === 1 ? "1 módulo" : `${count} módulos`;
}

/**
 * Scroll del Kanban al pasar el cursor por los bordes (horizontal y vertical).
 * - Lado izquierdo / derecho → scrollLeft.
 * - Borde superior / inferior → scrollTop (cuando hay columnas más altas que el viewport).
 * Muestra una flecha guía en el costado activo. Si el cursor está cerca de una
 * esquina ambos ejes se desplazan simultáneamente.
 */
function KanbanScroller({ children, className = "" }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement | null>(null);
  const dirXRef = useRef<-1 | 0 | 1>(0);
  const dirYRef = useRef<-1 | 0 | 1>(0);
  const rafRef = useRef<number | null>(null);
  const [hintX, setHintX] = useState<-1 | 0 | 1>(0);
  const [hintY, setHintY] = useState<-1 | 0 | 1>(0);

  const loop = useCallback(() => {
    const el = ref.current;
    if (el && (dirXRef.current !== 0 || dirYRef.current !== 0)) {
      if (dirXRef.current !== 0) el.scrollLeft += dirXRef.current * 16;
      if (dirYRef.current !== 0) el.scrollTop += dirYRef.current * 14;
      rafRef.current = requestAnimationFrame(loop);
    } else {
      rafRef.current = null;
    }
  }, []);

  const ensureLoop = useCallback(() => {
    if ((dirXRef.current !== 0 || dirYRef.current !== 0) && rafRef.current == null) {
      rafRef.current = requestAnimationFrame(loop);
    }
  }, [loop]);

  const setDirX = useCallback(
    (d: -1 | 0 | 1) => {
      if (d === dirXRef.current) return;
      dirXRef.current = d;
      setHintX(d);
      ensureLoop();
    },
    [ensureLoop]
  );

  const setDirY = useCallback(
    (d: -1 | 0 | 1) => {
      if (d === dirYRef.current) return;
      dirYRef.current = d;
      setHintY(d);
      ensureLoop();
    },
    [ensureLoop]
  );

  const onMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const x = e.clientX - r.left;
    const y = e.clientY - r.top;
    const bandX = 72;
    const bandY = 56;
    const canL = el.scrollLeft > 2;
    const canR = el.scrollLeft < el.scrollWidth - el.clientWidth - 2;
    const canU = el.scrollTop > 2;
    const canD = el.scrollTop < el.scrollHeight - el.clientHeight - 2;
    if (x < bandX && canL) setDirX(-1);
    else if (x > r.width - bandX && canR) setDirX(1);
    else setDirX(0);
    if (y < bandY && canU) setDirY(-1);
    else if (y > r.height - bandY && canD) setDirY(1);
    else setDirY(0);
  };

  const stopAll = () => {
    setDirX(0);
    setDirY(0);
  };

  useEffect(
    () => () => {
      if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    },
    []
  );

  const arrowH = (dir: "left" | "right") => (
    <span className="flex h-14 w-14 items-center justify-center rounded-full bg-white/75 text-[#3F8E91] shadow-lg ring-1 ring-[#4FAEB2]/30 backdrop-blur">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-7 w-7"
        aria-hidden="true"
      >
        {dir === "left" ? <polyline points="15 18 9 12 15 6" /> : <polyline points="9 18 15 12 9 6" />}
      </svg>
    </span>
  );

  const arrowV = (dir: "up" | "down") => (
    <span className="flex h-12 w-12 items-center justify-center rounded-full bg-white/75 text-[#3F8E91] shadow-lg ring-1 ring-[#4FAEB2]/30 backdrop-blur">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="h-6 w-6"
        aria-hidden="true"
      >
        {dir === "up" ? <polyline points="18 15 12 9 6 15" /> : <polyline points="6 9 12 15 18 9" />}
      </svg>
    </span>
  );

  return (
    <div className={`relative ${className}`}>
      <div
        ref={ref}
        onMouseMove={onMove}
        onMouseLeave={stopAll}
        className="max-h-[calc(100vh-260px)] min-h-[520px] overflow-auto rounded-xl pb-4"
      >
        {children}
      </div>
      <div
        className={`pointer-events-none absolute inset-y-0 left-0 flex w-16 items-center justify-start pl-1 transition-opacity duration-150 ${
          hintX === -1 ? "opacity-100" : "opacity-0"
        }`}
      >
        {arrowH("left")}
      </div>
      <div
        className={`pointer-events-none absolute inset-y-0 right-0 flex w-16 items-center justify-end pr-1 transition-opacity duration-150 ${
          hintX === 1 ? "opacity-100" : "opacity-0"
        }`}
      >
        {arrowH("right")}
      </div>
      <div
        className={`pointer-events-none absolute inset-x-0 top-0 flex h-14 items-start justify-center pt-1 transition-opacity duration-150 ${
          hintY === -1 ? "opacity-100" : "opacity-0"
        }`}
      >
        {arrowV("up")}
      </div>
      <div
        className={`pointer-events-none absolute inset-x-0 bottom-0 flex h-14 items-end justify-center pb-1 transition-opacity duration-150 ${
          hintY === 1 ? "opacity-100" : "opacity-0"
        }`}
      >
        {arrowV("down")}
      </div>
    </div>
  );
}

const IconKanban = ({ className = "h-3.5 w-3.5" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <rect x="3" y="3" width="5" height="15" rx="1" />
    <rect x="9.5" y="3" width="5" height="10" rx="1" />
    <rect x="16" y="3" width="5" height="13" rx="1" />
  </svg>
);

const IconList = ({ className = "h-3.5 w-3.5" }: { className?: string }) => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    className={className}
    aria-hidden="true"
  >
    <line x1="8" y1="6" x2="21" y2="6" />
    <line x1="8" y1="12" x2="21" y2="12" />
    <line x1="8" y1="18" x2="21" y2="18" />
    <line x1="3" y1="6" x2="3.01" y2="6" />
    <line x1="3" y1="12" x2="3.01" y2="12" />
    <line x1="3" y1="18" x2="3.01" y2="18" />
  </svg>
);

type ListPageSize = 25 | 50 | 100 | "todos";

const LIST_AVATAR_COLORS = [
  "bg-[#4FAEB2] text-white",
  "bg-violet-500 text-white",
  "bg-amber-500 text-white",
  "bg-emerald-600 text-white",
  "bg-rose-500 text-white",
  "bg-sky-600 text-white",
  "bg-indigo-500 text-white",
  "bg-fuchsia-500 text-white",
];

function listAvatarColor(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h += name.charCodeAt(i);
  return LIST_AVATAR_COLORS[h % LIST_AVATAR_COLORS.length];
}

function listInitials(name: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

/** Avatar pequeño + nombre completo (con wrap a 2 líneas). Usado en columnas de responsables. */
function ResponsableCell({ nombre }: { nombre?: string | null }) {
  const value = (nombre ?? "").trim();
  if (!value) {
    return <span className="text-[11px] italic text-slate-300">Sin asignar</span>;
  }
  return (
    <div className="flex min-w-0 items-center gap-2">
      <span
        className={`inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ring-2 ring-white ${listAvatarColor(
          value
        )}`}
        aria-hidden="true"
      >
        {listInitials(value)}
      </span>
      <span
        className="min-w-0 break-words text-[12px] leading-tight text-slate-700"
        title={value}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * Vista Lista (tabla) para Proyectos. Equivalente al ProspectoLista del CRM
 * Funnel: respeta los filtros del header (vienen ya aplicados desde la API)
 * y permite mover de estado con el mismo FancySelect que las cards.
 *
 * Diseño:
 * - El cliente va como subtítulo del nombre del proyecto (libera una columna).
 * - Responsables con avatar + nombre, sin truncar agresivo (wrap a 2 líneas).
 * - El selector de estado se tiñe con el color de su estado: borde + halo suave.
 */
function ProyectosLista({
  proyectos,
  estados,
  estadoActivoIds,
  prioridadByCodigo,
  onOpen,
  onMove,
  movingProjectId,
}: {
  proyectos: ProyectoCard[];
  estados: EstadoRow[];
  estadoActivoIds: Set<string>;
  prioridadByCodigo: Map<string, PrioridadConfig>;
  onOpen: (id: string) => void;
  onMove: (proyectoId: string, estadoId: string) => void;
  movingProjectId: string | null;
}) {
  const [pageSize, setPageSize] = useState<ListPageSize>(25);

  const ordered = proyectos
    .slice()
    .sort((a, b) => {
      const ta = a.last_activity_at ? new Date(a.last_activity_at).getTime() : 0;
      const tb = b.last_activity_at ? new Date(b.last_activity_at).getTime() : 0;
      return tb - ta;
    });
  const rows = pageSize === "todos" ? ordered : ordered.slice(0, pageSize);

  const estadoOptions = estados.map((e) => ({ value: e.id, label: e.nombre }));
  const estadoById = new Map(estados.map((e) => [e.id, e]));

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
        <span>
          Mostrando <strong className="text-slate-700">{rows.length}</strong> de {ordered.length}
        </span>
        <label className="flex items-center gap-1.5">
          <span>Registros:</span>
          <select
            value={String(pageSize)}
            onChange={(e) =>
              setPageSize(e.target.value === "todos" ? "todos" : (Number(e.target.value) as ListPageSize))
            }
            className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-700 outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20"
            aria-label="Cantidad de registros a mostrar"
          >
            <option value="25">25</option>
            <option value="50">50</option>
            <option value="100">100</option>
            <option value="todos">Todos</option>
          </select>
        </label>
      </div>
      <div className="min-h-0 flex-1 overflow-auto rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <table className="w-full border-collapse text-sm">
          <colgroup>
            <col className="w-[26%]" />
            <col className="w-[8%]" />
            <col className="w-[8%]" />
            <col className="w-[18%]" />
            <col className="w-[14%]" />
            <col className="w-[14%]" />
            <col className="w-[12%]" />
          </colgroup>
          <thead className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur">
            <tr className="text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              <th className="px-4 py-3 font-semibold">Proyecto</th>
              <th className="px-3 py-3 font-semibold">Tipo</th>
              <th className="px-3 py-3 font-semibold">Prioridad</th>
              <th className="px-3 py-3 font-semibold">Estado</th>
              <th className="px-3 py-3 font-semibold">Comercial</th>
              <th className="px-3 py-3 font-semibold">Técnico</th>
              <th className="px-3 py-3 font-semibold">Actividad / SLA</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-slate-400">
                  Sin proyectos
                </td>
              </tr>
            ) : (
              rows.map((p) => {
                const prio = prioridadByCodigo.get(p.prioridad);
                const prioStyles = getPriorityCardStyles(p.prioridad);
                const cli =
                  (p.cliente?.empresa || "").trim() ||
                  (p.cliente?.nombre_contacto || "").trim() ||
                  "";
                const slaVencido = p.sla_estado_actual?.vencido === true;
                const estado = estadoById.get(p.estado_id);
                const estadoColor = estado?.color || p.proyecto_estado?.color || "#94a3b8";
                // Borde teñido + halo: el color del estado se nota pero sin saturar la fila.
                const estadoTriggerStyle = {
                  borderColor: estadoColor,
                  borderWidth: "1.5px",
                  boxShadow: `0 0 0 3px ${estadoColor}1f`,
                } as React.CSSProperties;
                return (
                  <tr
                    key={p.id}
                    onClick={() => onOpen(p.id)}
                    className={`group cursor-pointer border-t border-slate-100 align-top transition-colors hover:bg-slate-50/70 ${
                      movingProjectId === p.id ? "bg-sky-50/40" : ""
                    }`}
                  >
                    <td className="px-4 py-3.5">
                      <div className="flex items-start gap-2">
                        <span
                          aria-hidden="true"
                          className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${prioStyles.iconDotClass}`}
                        />
                        <div className="min-w-0">
                          <div
                            className="break-words text-[13.5px] font-semibold leading-snug text-slate-900 group-hover:text-[#3F8E91]"
                            title={p.titulo}
                          >
                            {p.titulo}
                          </div>
                          <div
                            className="mt-0.5 break-words text-[11.5px] leading-tight text-slate-500"
                            title={cli || undefined}
                          >
                            {cli || "Sin cliente"}
                          </div>
                          {p.bloqueado ? (
                            <span className="mt-1 inline-flex items-center rounded-full border border-rose-200 bg-rose-50 px-1.5 py-0.5 text-[10px] font-medium text-rose-700">
                              Bloqueado
                            </span>
                          ) : null}
                        </div>
                      </div>
                    </td>
                    <td className="px-3 py-3.5 text-[12px] text-slate-600">
                      {p.proyecto_tipo?.nombre ?? "—"}
                    </td>
                    <td className="px-3 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-semibold ${prioStyles.badgeClass}`}
                      >
                        {prio?.nombre ?? prioridadFallbackLabel(p.prioridad)}
                      </span>
                    </td>
                    <td className="px-3 py-3.5" onClick={(e) => e.stopPropagation()}>
                      <FancySelect
                        size="sm"
                        ariaLabel="Mover a otro estado"
                        value={p.estado_id}
                        onChange={(v) => onMove(p.id, v)}
                        triggerStyle={estadoTriggerStyle}
                        options={[
                          ...(!estadoActivoIds.has(p.estado_id)
                            ? [
                                {
                                  value: p.estado_id,
                                  label: "Estado actual oculto / no usado",
                                  disabled: true,
                                },
                              ]
                            : []),
                          ...estadoOptions,
                        ]}
                      />
                    </td>
                    <td className="px-3 py-3.5">
                      <ResponsableCell nombre={p.responsable_comercial?.nombre} />
                    </td>
                    <td className="px-3 py-3.5">
                      <ResponsableCell nombre={p.responsable_tecnico?.nombre} />
                    </td>
                    <td className="px-3 py-3.5">
                      <div className="text-[11px] tabular-nums text-slate-500">
                        {fmtDateTime(p.last_activity_at)}
                      </div>
                      <div className="mt-1">
                        <span
                          className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium ${
                            slaVencido
                              ? "border-rose-200 bg-rose-50 text-rose-700"
                              : "border-slate-200 bg-slate-50 text-slate-600"
                          }`}
                        >
                          {slaEstadoLabel(p)}
                        </span>
                      </div>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function ProyectosKanbanClient({ dataSchema }: { dataSchema: string }) {
  const [estados, setEstados] = useState<EstadoRow[]>([]);
  const [proyectos, setProyectos] = useState<ProyectoCard[]>([]);
  const [prioridadesConfig, setPrioridadesConfig] = useState<PrioridadConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [movingProjectId, setMovingProjectId] = useState<string | null>(null);
  const [activeDragProjectId, setActiveDragProjectId] = useState<string | null>(null);

  const [q, setQ] = useState("");
  const [filtroEstado, setFiltroEstado] = useState("");
  const [filtroTipo, setFiltroTipo] = useState("");
  const [filtroRc, setFiltroRc] = useState("");
  const [filtroRt, setFiltroRt] = useState("");
  const [tipoOpts, setTipoOpts] = useState<{ id: string; nombre: string }[]>([]);
  const [userOpts, setUserOpts] = useState<{ id: string; nombre?: string }[]>([]);
  const [modalProjectId, setModalProjectId] = useState<string | null>(null);
  const [nuevoModalOpen, setNuevoModalOpen] = useState(false);

  /** Vista del tablero: "kanban" (cards por estado) | "lista" (tabla). Persiste por navegador. */
  const [vista, setVista] = useState<"kanban" | "lista">(() => {
    if (typeof window === "undefined") return "kanban";
    return window.localStorage.getItem("proyectos:vista") === "lista" ? "lista" : "kanban";
  });
  useEffect(() => {
    try {
      window.localStorage.setItem("proyectos:vista", vista);
    } catch {
      /* ignore */
    }
  }, [vista]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor)
  );

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const sp = new URLSearchParams();
    if (q.trim()) sp.set("q", q.trim());
    if (filtroEstado) sp.set("estado_id", filtroEstado);
    if (filtroTipo) sp.set("tipo_id", filtroTipo);
    if (filtroRc) sp.set("responsable_comercial_id", filtroRc);
    if (filtroRt) sp.set("responsable_tecnico_id", filtroRt);

    const [rEst, rPr, rTipos, rUsers, rPrioridades] = await Promise.all([
      fetchWithSupabaseSession("/api/proyectos/estados", { cache: "no-store" }),
      fetchWithSupabaseSession(`/api/proyectos?${sp.toString()}`, { cache: "no-store" }),
      fetchWithSupabaseSession("/api/proyectos/tipos", { cache: "no-store" }),
      fetchWithSupabaseSession("/api/usuarios/empresa-activos", { cache: "no-store" }),
      fetchWithSupabaseSession("/api/configuracion/proyectos/prioridades", { cache: "no-store" }),
    ]);

    const jEst = (await rEst.json().catch(() => ({}))) as { success?: boolean; data?: EstadoRow[]; error?: string };
    const jPr = (await rPr.json().catch(() => ({}))) as { success?: boolean; data?: ProyectoCard[]; error?: string };
    const jTipos = (await rTipos.json().catch(() => ({}))) as {
      success?: boolean;
      data?: { id: string; nombre: string }[];
    };
    const jUsers = (await rUsers.json().catch(() => ({}))) as { usuarios?: { id: string; nombre?: string }[] };
    const jPrioridades = (await rPrioridades.json().catch(() => ({}))) as {
      success?: boolean;
      data?: { prioridades?: PrioridadConfig[] };
    };

    if (!rEst.ok || !jEst.success) {
      setErr(jEst.error ?? "No se pudieron cargar estados");
      setLoading(false);
      return;
    }
    if (!rPr.ok || !jPr.success) {
      setErr(jPr.error ?? "No se pudieron cargar proyectos");
      setLoading(false);
      return;
    }
    setEstados(jEst.data ?? []);
    setProyectos(jPr.data ?? []);

    if (jTipos.success && jTipos.data) setTipoOpts(jTipos.data);
    if (jUsers.usuarios) setUserOpts(jUsers.usuarios);
    if (rPrioridades.ok && jPrioridades.success && jPrioridades.data?.prioridades) {
      setPrioridadesConfig(jPrioridades.data.prioridades);
    } else {
      setPrioridadesConfig([]);
    }

    setLoading(false);
  }, [q, filtroEstado, filtroTipo, filtroRc, filtroRt]);

  useEffect(() => {
    void load();
  }, [load]);

  // Realtime: cualquier cambio en proyectos del tenant refresca el Kanban.
  // proyecto_tareas también dispara re-fetch porque afecta el avance %.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  useEffect(() => {
    if (!dataSchema) return;
    const sb = createBrowserClientForSchema(dataSchema);

    const channel = sb
      .channel("proyectos-kanban")
      .on(
        "postgres_changes",
        { event: "*", schema: dataSchema, table: "proyectos" },
        () => void loadRef.current?.()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: dataSchema, table: "proyecto_tareas" },
        () => void loadRef.current?.()
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [dataSchema]);

  const estadoActivoIds = useMemo(() => new Set(estados.map((e) => e.id)), [estados]);

  const kanbanColumns = useMemo(() => {
    const columns = [...estados];
    const missing = new Map<string, EstadoRow>();
    for (const p of proyectos) {
      if (estadoActivoIds.has(p.estado_id) || missing.has(p.estado_id)) continue;
      missing.set(p.estado_id, {
        id: p.estado_id,
        nombre: `Oculto / no usado: ${p.proyecto_estado?.nombre ?? "Estado sin configurar"}`,
        codigo: p.proyecto_estado?.codigo ?? "estado_inactivo",
        color: p.proyecto_estado?.color ?? "#94a3b8",
        sort_order: 9999,
        inactiveFallback: true,
      });
    }
    return [...columns, ...missing.values()];
  }, [estadoActivoIds, estados, proyectos]);

  const byColumn = useMemo(() => {
    const m = new Map<string, ProyectoCard[]>();
    for (const e of kanbanColumns) m.set(e.id, []);
    for (const p of proyectos) {
      const col = m.get(p.estado_id);
      if (col) col.push(p);
    }
    return m;
  }, [kanbanColumns, proyectos]);

  const prioridadByCodigo = useMemo(() => {
    const m = new Map<string, PrioridadConfig>();
    for (const prioridad of prioridadesConfig) {
      if (prioridad.activo) m.set(prioridad.codigo, prioridad);
    }
    return m;
  }, [prioridadesConfig]);

  const activeDragProject = useMemo(
    () => proyectos.find((p) => p.id === activeDragProjectId) ?? null,
    [activeDragProjectId, proyectos]
  );

  async function cambiarEstado(proyectoId: string, estadoId: string): Promise<boolean> {
    if (!estadoActivoIds.has(estadoId)) {
      setErr("No se puede mover a una columna inactiva.");
      return false;
    }

    const currentProject = proyectos.find((p) => p.id === proyectoId);
    if (!currentProject) {
      setErr("No se encontró el proyecto a mover.");
      return false;
    }
    if (currentProject.estado_id === estadoId) return true;

    const previousProjects = proyectos;
    const destino = estados.find((e) => e.id === estadoId);
    setErr(null);
    setMovingProjectId(proyectoId);
    setProyectos((prev) =>
      prev.map((p) =>
        p.id === proyectoId
          ? {
              ...p,
              estado_id: estadoId,
              proyecto_estado: destino
                ? {
                    ...(p.proyecto_estado ?? {}),
                    nombre: destino.nombre,
                    codigo: destino.codigo,
                    color: destino.color,
                    cuenta_sla: destino.cuenta_sla,
                    sla_horas_objetivo: destino.sla_horas_objetivo,
                    es_estado_final: destino.es_estado_final ?? p.proyecto_estado?.es_estado_final,
                  }
                : p.proyecto_estado,
            }
          : p
      )
    );

    try {
      const res = await fetchWithSupabaseSession(`/api/proyectos/${proyectoId}/cambiar-estado`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ estado_id: estadoId }),
      });
      const j = (await res.json().catch(() => ({}))) as { success?: boolean; error?: string };
      if (!res.ok || !j.success) {
        setProyectos(previousProjects);
        setErr(j.error ?? "No se pudo cambiar el estado. La tarjeta volvió a su columna anterior.");
        setMovingProjectId(null);
        return false;
      }
      setMovingProjectId(null);
      await load();
      return true;
    } catch (e) {
      setProyectos(previousProjects);
      setErr(
        e instanceof Error
          ? `${e.message}. La tarjeta volvió a su columna anterior.`
          : "No se pudo cambiar el estado. La tarjeta volvió a su columna anterior."
      );
      setMovingProjectId(null);
      return false;
    }
  }

  function handleDragStart(event: DragStartEvent) {
    setActiveDragProjectId(readProjectIdFromDragId(event.active.id));
  }

  function handleDragEnd(event: DragEndEvent) {
    const proyectoId = readProjectIdFromDragId(event.active.id);
    const estadoId = readEstadoIdFromDropId(event.over?.id);
    setActiveDragProjectId(null);

    if (!proyectoId || !estadoId) return;
    void cambiarEstado(proyectoId, estadoId);
  }

  if (loading && proyectos.length === 0 && estados.length === 0) {
    return <div className="p-6 text-sm text-slate-500">Cargando proyectos…</div>;
  }

  if (err && proyectos.length === 0) {
    return <div className="p-6 text-sm text-red-600">{err}</div>;
  }

  return (
    <div className="mx-auto max-w-[1800px] space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4FAEB2]">
              Tablero
            </p>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">Proyectos</h1>
          <p className="text-sm text-slate-500">Kanban configurable por empresa — producción, clientes y SLA.</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Link
            href="/dashboard/proyectos/reportes/entregados-por-tecnico"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#4FAEB2]"
            title="Reporte: proyectos entregados por técnico"
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
              <path d="M3 3v18h18" />
              <path d="M7 14l4-4 4 4 5-6" />
            </svg>
            Reportes
          </Link>
          {/* Toggle de vista: Kanban (cards) | Lista (tabla). Mismo patrón que CRM Funnel. */}
          <div className="flex items-center gap-0.5 rounded-xl border border-slate-200 bg-slate-100/80 p-0.5">
            <button
              type="button"
              onClick={() => setVista("kanban")}
              aria-pressed={vista === "kanban"}
              title="Vista Kanban (cards por estado)"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                vista === "kanban" ? "bg-white text-[#3F8E91] shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <IconKanban />
              Kanban
            </button>
            <button
              type="button"
              onClick={() => setVista("lista")}
              aria-pressed={vista === "lista"}
              title="Vista Lista (tabla de filas)"
              className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                vista === "lista" ? "bg-white text-[#3F8E91] shadow-sm" : "text-slate-500 hover:text-slate-700"
              }`}
            >
              <IconList />
              Lista
            </button>
          </div>
          <button
            type="button"
            onClick={() => setNuevoModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-xl bg-[#4FAEB2] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/20 transition-colors hover:bg-[#3F8E91]"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
              aria-hidden="true"
            >
              <path d="M12 5v14M5 12h14" />
            </svg>
            Nuevo proyecto
          </button>
        </div>
      </div>

      {err ? <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">{err}</div> : null}

      <div className="overflow-x-auto pb-1">
        <div className="flex min-w-full gap-3">
          {estados.map((estado) => (
            <EstadoMetric
              key={estado.id}
              label={estado.nombre}
              value={byColumn.get(estado.id)?.length ?? 0}
              color={estado.color}
            />
          ))}
        </div>
      </div>

      <div className="flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm xl:flex-row xl:flex-wrap xl:items-center">
        <div className="relative min-w-[220px] flex-1">
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
            placeholder="Buscar título o cliente…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && void load()}
          />
        </div>
        <button
          type="button"
          className="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#4FAEB2]"
          onClick={() => void load()}
        >
          Buscar
        </button>
        <FancySelect
          className="min-w-[180px] shrink-0"
          ariaLabel="Filtrar por estado"
          placeholder="Todos los estados"
          value={filtroEstado}
          onChange={setFiltroEstado}
          options={[
            { value: "", label: "Todos los estados" },
            ...estados.map((e) => ({ value: e.id, label: e.nombre })),
          ]}
        />
        <FancySelect
          className="min-w-[160px] shrink-0"
          ariaLabel="Filtrar por tipo"
          placeholder="Todos los tipos"
          value={filtroTipo}
          onChange={setFiltroTipo}
          options={[
            { value: "", label: "Todos los tipos" },
            ...tipoOpts.map((t) => ({ value: t.id, label: t.nombre })),
          ]}
        />
        <FancySelect
          className="min-w-[190px] shrink-0"
          ariaLabel="Filtrar por responsable comercial"
          placeholder="Resp. comercial"
          value={filtroRc}
          onChange={setFiltroRc}
          options={[
            { value: "", label: "Resp. comercial" },
            ...userOpts.map((u) => ({
              value: u.id,
              label: u.nombre ?? u.id.slice(0, 8),
            })),
          ]}
        />
        <FancySelect
          className="min-w-[190px] shrink-0"
          ariaLabel="Filtrar por responsable técnico"
          placeholder="Resp. técnico"
          value={filtroRt}
          onChange={setFiltroRt}
          options={[
            { value: "", label: "Resp. técnico" },
            ...userOpts.map((u) => ({
              value: u.id,
              label: u.nombre ?? u.id.slice(0, 8),
            })),
          ]}
        />
        {(q || filtroEstado || filtroTipo || filtroRc || filtroRt) ? (
          <button
            type="button"
            className="shrink-0 rounded-xl border border-transparent px-3 py-2.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
            onClick={() => {
              setQ("");
              setFiltroEstado("");
              setFiltroTipo("");
              setFiltroRc("");
              setFiltroRt("");
            }}
          >
            Limpiar filtros
          </button>
        ) : null}
      </div>

      {vista === "lista" ? (
        <ProyectosLista
          proyectos={proyectos}
          estados={estados}
          estadoActivoIds={estadoActivoIds}
          prioridadByCodigo={prioridadByCodigo}
          onOpen={setModalProjectId}
          onMove={(proyectoId, estadoId) => void cambiarEstado(proyectoId, estadoId)}
          movingProjectId={movingProjectId}
        />
      ) : (
      <DndContext sensors={sensors} onDragStart={handleDragStart} onDragEnd={handleDragEnd}>
        <KanbanScroller>
          <div className="flex min-h-full gap-4">
            {kanbanColumns.map((col) => {
              const items = byColumn.get(col.id) ?? [];
              return (
                <KanbanColumnView key={col.id} col={col}>
                  <div
                    className="sticky top-0 z-30 flex items-center justify-between border-b border-slate-200 bg-white px-3 py-2 shadow-sm"
                    style={{ borderTopColor: col.color, borderTopWidth: 3 }}
                  >
                    <span className="text-sm font-semibold text-slate-800">{col.nombre}</span>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs text-slate-600">{items.length}</span>
                  </div>
                  {col.inactiveFallback ? (
                    <div className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Esta columna está inactiva, pero contiene proyectos. Movelos a una columna activa.
                    </div>
                  ) : null}
                  <div className="flex flex-1 flex-col gap-2 p-2">
                    {items.map((p) => (
                      <ProjectCardView
                        key={p.id}
                        p={p}
                        estados={estados}
                        estadoActivoIds={estadoActivoIds}
                        prioridadConfig={prioridadByCodigo.get(p.prioridad)}
                        onOpen={setModalProjectId}
                        onMove={(proyectoId, estadoId) => void cambiarEstado(proyectoId, estadoId)}
                        moving={movingProjectId === p.id}
                      />
                    ))}
                    {items.length === 0 ? (
                      <div className="py-8 text-center text-xs text-slate-400">Soltá tarjetas acá</div>
                    ) : null}
                  </div>
                </KanbanColumnView>
              );
            })}
          </div>
        </KanbanScroller>
        <DragOverlay>
          {activeDragProject ? (
            <ProjectCardView
              p={activeDragProject}
              estados={estados}
              estadoActivoIds={estadoActivoIds}
              prioridadConfig={prioridadByCodigo.get(activeDragProject.prioridad)}
              onOpen={() => undefined}
              onMove={() => undefined}
              dragOverlay
            />
          ) : null}
        </DragOverlay>
      </DndContext>
      )}

      {vista === "kanban" ? (
        <p className="text-center text-xs text-slate-400">
          Arrastrá tarjetas entre columnas activas o usá el selector “Mover a” como alternativa.
        </p>
      ) : null}

      <ProyectoDetalleModal
        projectId={modalProjectId}
        open={modalProjectId != null}
        onClose={() => setModalProjectId(null)}
        onUpdated={() => void load()}
        dataSchema={dataSchema}
      />

      <ProyectoNuevoModal
        open={nuevoModalOpen}
        onClose={() => setNuevoModalOpen(false)}
        onCreated={(id) => {
          setNuevoModalOpen(false);
          void load();
          setModalProjectId(id);
        }}
      />
    </div>
  );
}

function KanbanColumnView({ col, children }: KanbanColumnViewProps) {
  const { isOver, setNodeRef } = useDroppable({
    id: estadoDropId(col.id),
    disabled: col.inactiveFallback === true,
    data: { estadoId: col.id, active: col.inactiveFallback !== true },
  });

  return (
    <div
      ref={setNodeRef}
      className={`flex w-[300px] shrink-0 flex-col rounded-xl border bg-slate-50/80 transition-colors ${
        isOver && !col.inactiveFallback
          ? "border-[#4FAEB2]/50 bg-[#4FAEB2]/8 ring-2 ring-[#4FAEB2]/20"
          : "border-slate-200"
      }`}
    >
      {children}
    </div>
  );
}

function ProjectCardView({
  p,
  estados,
  estadoActivoIds,
  prioridadConfig,
  onOpen,
  onMove,
  moving,
  dragOverlay,
}: ProjectCardViewProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: projectDragId(p.id),
    disabled: dragOverlay === true,
    data: { projectId: p.id, estadoId: p.estado_id },
  });

  const cli =
    (p.cliente?.empresa || "").trim() ||
    (p.cliente?.nombre_contacto || "").trim() ||
    "Sin cliente";
  const saasModulesLabel = saasModuleCountLabel(p);
  const priorityStyles = getPriorityCardStyles(p.prioridad);
  const postentrega = getPostentregaInfo(p);

  const style: CSSProperties | undefined = transform
    ? { transform: `translate3d(${transform.x}px, ${transform.y}px, 0)` }
    : undefined;
  const baseBadgeClass =
    "inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium leading-4";
  const neutralBadgeClass =
    "inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-medium leading-4 text-slate-600";

  return (
    <div
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      className={`touch-none rounded-2xl border border-l-4 bg-white p-4 shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${
        dragOverlay ? "rotate-1 cursor-grabbing shadow-2xl" : "cursor-grab active:cursor-grabbing"
      } ${priorityStyles.cardAccentClass} ${isDragging ? "opacity-40" : ""} ${moving ? "ring-2 ring-sky-100" : ""}`}
    >
      <button
        type="button"
        className="block w-full text-left"
        onClick={() => {
          if (!dragOverlay) onOpen(p.id);
        }}
      >
        <div className="flex items-start gap-2">
          <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${priorityStyles.iconDotClass}`} />
          <div className="min-w-0 flex-1">
            <div className="text-[15px] font-semibold leading-snug text-slate-950 hover:underline">
              {p.titulo}
            </div>
            <div className="mt-1 text-xs font-medium text-slate-600">
              {cli}
            </div>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <span className={neutralBadgeClass}>
            {p.proyecto_tipo?.nombre ?? "Tipo"}
          </span>
          {saasModulesLabel ? (
            <span className={neutralBadgeClass}>
              {saasModulesLabel}
            </span>
          ) : null}
          <span className={`${baseBadgeClass} font-semibold ${priorityStyles.badgeClass}`}>
            {prioridadConfig?.nombre ?? prioridadFallbackLabel(p.prioridad)}
          </span>
          <span className={p.sla_estado_actual?.vencido ? `${baseBadgeClass} border-rose-200 bg-rose-50 text-rose-700` : neutralBadgeClass}>
            {slaEstadoLabel(p)}
          </span>
          {postentrega ? (
            <span
              className={`${baseBadgeClass} font-semibold ${
                postentrega.vencido
                  ? "border-rose-200 bg-rose-50 text-rose-700"
                  : postentrega.dia >= 25
                    ? "border-amber-200 bg-amber-50 text-amber-700"
                    : "border-[#4FAEB2]/30 bg-[#4FAEB2]/10 text-[#3F8E91]"
              }`}
              title={
                postentrega.vencido
                  ? `Período de cambios cerrado (día ${postentrega.dia})`
                  : `Día ${postentrega.dia} de ${postentrega.total} para cambios gratis`
              }
            >
              {postentrega.vencido
                ? `Día ${postentrega.dia} / ${postentrega.total} · vencido`
                : `Día ${postentrega.dia} / ${postentrega.total}`}
            </span>
          ) : null}
          {p.bloqueado ? (
            <span className={`${baseBadgeClass} border-rose-200 bg-rose-50 text-rose-800`}>
              Bloqueado
            </span>
          ) : null}
          {moving ? (
            <span className={`${baseBadgeClass} border-sky-200 bg-sky-50 text-sky-800`}>
              Guardando...
            </span>
          ) : null}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-1.5 rounded-xl bg-slate-50/80 px-3 py-2 text-[11px] text-slate-700">
          <MetaItem label="Com." value={p.responsable_comercial?.nombre ?? "—"} />
          <MetaItem label="Téc." value={p.responsable_tecnico?.nombre ?? "—"} />
          <MetaItem label="Ingreso" value={fmtDate(p.fecha_ingreso)} />
          <MetaItem label="Prometido" value={fmtDate(p.fecha_prometida)} />
          <div className="col-span-2">
            <MetaItem label="Actividad" value={fmtDateTime(p.last_activity_at)} />
          </div>
        </div>
      </button>
      {!dragOverlay ? (
        <>
          <div className="mt-3 flex items-center justify-between gap-2 border-t border-slate-100 pt-3" onClick={(e) => e.stopPropagation()}>
            <Link
              href={`/dashboard/proyectos/${p.id}`}
              className="text-[11px] font-semibold text-[#4FAEB2] hover:text-[#3F8E91] hover:underline"
              onClick={(e) => e.stopPropagation()}
            >
              Abrir en página completa
            </Link>
          </div>
          <div
            className="mt-2 rounded-xl border border-slate-200 bg-slate-50 px-2.5 py-2"
            onClick={(e) => e.stopPropagation()}
            onPointerDown={(e) => e.stopPropagation()}
          >
            <label className="block text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Mover a
            </label>
            <div className="mt-1">
              <FancySelect
                size="sm"
                ariaLabel="Mover a otro estado"
                value={p.estado_id}
                onChange={(v) => onMove(p.id, v)}
                options={[
                  ...(!estadoActivoIds.has(p.estado_id)
                    ? [
                        {
                          value: p.estado_id,
                          label: "Estado actual oculto / no usado",
                          disabled: true,
                        },
                      ]
                    : []),
                  ...estados.map((e) => ({ value: e.id, label: e.nombre })),
                ]}
              />
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <span className="font-semibold text-slate-500">{label}</span>{" "}
      <span className="break-words text-slate-800">{value}</span>
    </div>
  );
}

function EstadoMetric({
  label,
  value,
  color,
}: {
  label: string;
  value: number;
  color: string;
}) {
  return (
    <div className="min-w-[190px] flex-1 rounded-xl border border-slate-200 bg-white px-3 py-3 shadow-sm">
      <div className="mb-2 h-1 rounded-full" style={{ backgroundColor: color || "#94a3b8" }} />
      <div className="truncate text-[11px] font-medium uppercase tracking-wide text-slate-500" title={label}>
        {label}
      </div>
      <div className="mt-1 text-2xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function fmtDate(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString() : "—";
}

function fmtDateTime(s?: string | null): string {
  if (!s) return "—";
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d.toLocaleString() : "—";
}
