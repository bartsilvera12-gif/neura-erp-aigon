"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Plus, Settings2 } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { AGENDA_ESTADOS, type AgendaCitaEnriquecida } from "@/lib/agenda/types";
import CitaFormModal, { type AgendaOptions } from "./components/CitaFormModal";
import CitaDetalleModal from "./components/CitaDetalleModal";
import RangoHorarioConfig from "./components/RangoHorarioConfig";
import HoyResumen from "./components/HoyResumen";
import TimeGridView from "./views/TimeGridView";
import MonthView from "./views/MonthView";
import ListView from "./views/ListView";
import {
  addDays,
  addMonths,
  estadoStyle,
  rangeForView,
  tituloPeriodo,
  type AgendaView,
} from "./calendar-utils";
import { DEFAULT_PREFS, getAgendaPrefs, setAgendaPrefs, type AgendaPrefs } from "./agenda-prefs";

type Resumen = {
  hoy: number;
  pendientes: number;
  confirmadas: number;
  completadas: number;
  canceladas_no_asistio: number;
};

const VIEWS: { key: AgendaView; label: string }[] = [
  { key: "dia", label: "Día" },
  { key: "semana", label: "Semana" },
  { key: "mes", label: "Mes" },
  { key: "lista", label: "Listado" },
];

export default function AgendaClient() {
  const [citas, setCitas] = useState<AgendaCitaEnriquecida[]>([]);
  const [resumen, setResumen] = useState<Resumen | null>(null);
  const [options, setOptions] = useState<AgendaOptions>({ responsables: [], clientes: [], tipos: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Vista de calendario
  const [view, setView] = useState<AgendaView>("semana"); // default: Semana
  const [anchor, setAnchor] = useState<Date>(new Date());

  // Preferencias (rango horario visible) — localStorage por navegador
  const [prefs, setPrefs] = useState<AgendaPrefs>(DEFAULT_PREFS);
  useEffect(() => {
    setPrefs(getAgendaPrefs());
  }, []);
  function updatePrefs(p: AgendaPrefs) {
    setPrefs(setAgendaPrefs(p));
  }

  // Popovers
  const [hoyOpen, setHoyOpen] = useState(false);
  const [configOpen, setConfigOpen] = useState(false);

  // Filtros
  const [estado, setEstado] = useState("");
  const [responsableId, setResponsableId] = useState("");
  const [q, setQ] = useState("");

  // Modales
  const [formOpen, setFormOpen] = useState(false);
  const [formMode, setFormMode] = useState<"crear" | "editar" | "reprogramar">("crear");
  const [formCita, setFormCita] = useState<AgendaCitaEnriquecida | null>(null);
  const [prefill, setPrefill] = useState<{ inicio: Date; fin: Date } | null>(null);
  const [detalle, setDetalle] = useState<AgendaCitaEnriquecida | null>(null);

  const loadResumen = useCallback(async () => {
    try {
      const res = await fetchWithSupabaseSession("/api/agenda/resumen");
      const json = await res.json();
      if (json?.success) setResumen(json.data as Resumen);
    } catch {
      /* noop */
    }
  }, []);

  const loadOptions = useCallback(async () => {
    try {
      const res = await fetchWithSupabaseSession("/api/agenda/options");
      const json = await res.json();
      if (json?.success) setOptions(json.data as AgendaOptions);
    } catch {
      /* noop */
    }
  }, []);

  const loadCitas = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { start, end } = rangeForView(view, anchor);
      const params = new URLSearchParams();
      params.set("desde", start.toISOString());
      params.set("hasta", end.toISOString());
      if (estado) params.set("estado", estado);
      if (responsableId) params.set("responsable_id", responsableId);
      if (q.trim()) params.set("q", q.trim());
      const res = await fetchWithSupabaseSession(`/api/agenda?${params.toString()}`);
      const json = await res.json();
      if (!res.ok || !json?.success) {
        setError(json?.error ?? "No se pudieron cargar las citas.");
        setCitas([]);
      } else {
        setCitas(json.data as AgendaCitaEnriquecida[]);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error.");
    } finally {
      setLoading(false);
    }
  }, [view, anchor, estado, responsableId, q]);

  useEffect(() => {
    loadOptions();
    loadResumen();
  }, [loadOptions, loadResumen]);

  useEffect(() => {
    loadCitas();
  }, [loadCitas]);

  function refreshAll() {
    setFormOpen(false);
    setDetalle(null);
    loadCitas();
    loadResumen();
  }

  function navegar(dir: -1 | 1) {
    if (view === "mes") setAnchor((a) => addMonths(a, dir));
    else if (view === "dia") setAnchor((a) => addDays(a, dir));
    else setAnchor((a) => addDays(a, dir * 7));
  }

  function irAHoy() {
    setAnchor(new Date());
    setView("dia");
    setHoyOpen(false);
  }

  function openCrear(pf?: { inicio: Date; fin: Date }) {
    setFormMode("crear");
    setFormCita(null);
    setPrefill(pf ?? null);
    setFormOpen(true);
  }
  function openCrearEn(d: Date) {
    const fin = new Date(d);
    fin.setMinutes(fin.getMinutes() + 30);
    openCrear({ inicio: d, fin });
  }
  function openEditar(c: AgendaCitaEnriquecida) {
    setDetalle(null);
    setFormMode("editar");
    setFormCita(c);
    setPrefill(null);
    setFormOpen(true);
  }
  function openReprogramar(c: AgendaCitaEnriquecida) {
    setDetalle(null);
    setFormMode("reprogramar");
    setFormCita(c);
    setPrefill(null);
    setFormOpen(true);
  }

  const stats: { label: string; value: number; dot: string }[] = [
    { label: "Hoy", value: resumen?.hoy ?? 0, dot: "bg-teal-500" },
    { label: "Pendientes", value: resumen?.pendientes ?? 0, dot: estadoStyle("pendiente").dot },
    { label: "Confirmadas", value: resumen?.confirmadas ?? 0, dot: estadoStyle("confirmada").dot },
    { label: "Completadas", value: resumen?.completadas ?? 0, dot: estadoStyle("completada").dot },
    { label: "Cancel./No asist.", value: resumen?.canceladas_no_asistio ?? 0, dot: estadoStyle("cancelada").dot },
  ];

  const selectCls =
    "rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs text-slate-700 outline-none transition-colors focus:border-teal-500 focus:ring-1 focus:ring-teal-400";
  const esTimeGrid = view === "dia" || view === "semana";

  return (
    <div className="mx-auto w-full max-w-[1800px] px-4 py-5">
      {/* Encabezado + métricas compactas */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-xl font-semibold text-slate-800">Agenda</h1>
        <div className="flex flex-wrap items-center gap-1.5">
          {stats.map((s) => (
            <div key={s.label} className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-3 py-1 shadow-sm">
              <span className={`h-2 w-2 rounded-full ${s.dot}`} />
              <span className="text-sm font-semibold text-slate-800">{s.value}</span>
              <span className="text-[11px] text-slate-500">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Toolbar */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          {/* Botón Hoy con popover de resumen */}
          <div className="relative">
            <button
              onClick={() => setHoyOpen((v) => !v)}
              className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
                hoyOpen ? "border-teal-500 bg-teal-50 text-teal-700" : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
            >
              Hoy
            </button>
            {hoyOpen && (
              <Popover onClose={() => setHoyOpen(false)} align="left">
                <HoyResumen
                  onSelect={(c) => {
                    setHoyOpen(false);
                    setDetalle(c);
                  }}
                  onVerDia={irAHoy}
                />
              </Popover>
            )}
          </div>

          <div className="flex items-center">
            <button onClick={() => navegar(-1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Anterior">
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button onClick={() => navegar(1)} className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100" aria-label="Siguiente">
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <span className="ml-1 text-sm font-medium capitalize text-slate-700">{tituloPeriodo(view, anchor)}</span>
        </div>

        <div className="flex items-center gap-2">
          {/* Selector de vista */}
          <div className="flex rounded-lg border border-slate-300 bg-white p-0.5 shadow-sm">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                onClick={() => setView(v.key)}
                className={`rounded-md px-3 py-1 text-xs font-medium transition-colors ${
                  view === v.key ? "bg-teal-500 text-white shadow-sm" : "text-slate-600 hover:bg-slate-100"
                }`}
              >
                {v.label}
              </button>
            ))}
          </div>

          {/* Configuración de rango horario (teal) */}
          <div className="relative">
            <button
              onClick={() => setConfigOpen((v) => !v)}
              disabled={!esTimeGrid}
              title={esTimeGrid ? "Rango horario visible" : "Disponible en Día/Semana"}
              className={`rounded-lg border p-1.5 transition-colors ${
                configOpen
                  ? "border-teal-500 bg-teal-50 text-teal-600"
                  : "border-slate-300 bg-white text-teal-600 hover:bg-teal-50"
              } disabled:cursor-not-allowed disabled:text-slate-300 disabled:hover:bg-white`}
              aria-label="Configurar rango horario"
            >
              <Settings2 className="h-4 w-4" />
            </button>
            {configOpen && esTimeGrid && (
              <Popover onClose={() => setConfigOpen(false)} align="right">
                <RangoHorarioConfig prefs={prefs} onChange={updatePrefs} />
              </Popover>
            )}
          </div>

          <button
            onClick={() => openCrear()}
            className="flex items-center gap-1 rounded-lg bg-teal-500 px-3 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-teal-600"
          >
            <Plus className="h-4 w-4" /> Nueva cita
          </button>
        </div>
      </div>

      {/* Filtros sutiles */}
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <select value={estado} onChange={(e) => setEstado(e.target.value)} className={selectCls}>
          <option value="">Todos los estados</option>
          {AGENDA_ESTADOS.map((s) => (
            <option key={s} value={s}>
              {estadoStyle(s).label}
            </option>
          ))}
        </select>
        <select value={responsableId} onChange={(e) => setResponsableId(e.target.value)} className={selectCls}>
          <option value="">Todos los responsables</option>
          {options.responsables.map((r) => (
            <option key={r.id} value={r.id}>
              {r.nombre ?? r.id}
            </option>
          ))}
        </select>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar título o contacto…"
          className="min-w-[180px] flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs text-slate-700 outline-none transition-colors focus:border-teal-500 focus:ring-1 focus:ring-teal-400 sm:max-w-xs"
        />
        {loading && <span className="text-xs text-slate-400">Cargando…</span>}
      </div>

      {error && (
        <div className="mb-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</div>
      )}

      {/* Vista activa */}
      {view === "lista" ? (
        <ListView citas={citas} onSelect={setDetalle} />
      ) : view === "mes" ? (
        <MonthView
          anchor={anchor}
          citas={citas}
          onSelect={setDetalle}
          onCreateAt={openCrearEn}
          onVerDia={(d) => {
            setAnchor(d);
            setView("dia");
          }}
        />
      ) : (
        <TimeGridView
          view={view}
          anchor={anchor}
          citas={citas}
          startHour={prefs.startHour}
          endHour={prefs.endHour}
          onSelect={setDetalle}
          onCreateAt={openCrearEn}
        />
      )}

      <CitaFormModal
        open={formOpen}
        mode={formMode}
        cita={formCita}
        prefill={prefill}
        options={options}
        onClose={() => setFormOpen(false)}
        onSaved={refreshAll}
      />
      <CitaDetalleModal
        open={!!detalle}
        cita={detalle}
        onClose={() => setDetalle(null)}
        onEditar={openEditar}
        onReprogramar={openReprogramar}
        onChanged={refreshAll}
      />
    </div>
  );
}

/** Popover liviano con cierre por click afuera. */
function Popover({
  children,
  onClose,
  align,
}: {
  children: React.ReactNode;
  onClose: () => void;
  align: "left" | "right";
}) {
  return (
    <>
      <button className="fixed inset-0 z-40 cursor-default" aria-label="Cerrar" onClick={onClose} />
      <div
        className={`absolute z-50 mt-2 rounded-xl border border-slate-200 bg-white p-3 shadow-lg ${
          align === "right" ? "right-0" : "left-0"
        }`}
      >
        {children}
      </div>
    </>
  );
}
