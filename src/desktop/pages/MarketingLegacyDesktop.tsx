"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { getMetricasCumplimiento, updateTaskStatus } from "@/lib/marketing/storage";
import type { MarketingOpsClienteResumen } from "@/lib/marketing/ops-queries";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { MarketingTask } from "@/lib/marketing/types";
import { FancySelect } from "@/app/dashboard/proyectos/components/FancySelect";
import {
  AlertCircle,
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  Megaphone,
  RefreshCw,
  Sparkles,
  Target,
  Users,
} from "lucide-react";

const MESES = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

function esCumplida(t: MarketingTask): boolean {
  return t.estado === "aprobado" || t.estado === "publicado";
}

function estiloTarea(t: MarketingTask, hoyYmd: string): string {
  if (esCumplida(t)) return "bg-green-100 border-green-200 text-green-800";
  if (t.fecha_entrega < hoyYmd) return "bg-red-100 border-red-200 text-red-800";
  return "bg-amber-50 border-amber-200 text-amber-700";
}

function nombreClienteOps(c: MarketingOpsClienteResumen): string {
  return (c.empresa ?? c.nombre_contacto ?? c.nombre ?? "Cliente").trim() || "Cliente";
}

export default function MarketingOpsPage() {
  const mesActual = new Date().toISOString().slice(0, 7);
  const [mes, setMes] = useState(mesActual);
  const [tareas, setTareas] = useState<MarketingTask[]>([]);
  const [clientesOps, setClientesOps] = useState<MarketingOpsClienteResumen[]>([]);
  const [metricas, setMetricas] = useState({ total: 0, completadas: 0, porcentaje: 0 });
  const [hoyYmd, setHoyYmd] = useState(() => new Date().toISOString().slice(0, 10));
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState<string | null>(null);
  const [expandidoId, setExpandidoId] = useState<string | null>(null);

  const [modalTarea, setModalTarea] = useState<MarketingTask | null>(null);
  const [marcandoCumplida, setMarcandoCumplida] = useState(false);

  const [regenerarCliente, setRegenerarCliente] = useState<MarketingOpsClienteResumen | null>(null);
  const [regenerando, setRegenerando] = useState(false);

  const [syncPreview, setSyncPreview] = useState<{
    clientes_a_marcar_count: number;
    tareas_a_generar_count: number;
    clientes_a_marcar: { id: string; nombre: string }[];
  } | null>(null);
  const [syncEjecutando, setSyncEjecutando] = useState(false);
  const [syncMostrarPreview, setSyncMostrarPreview] = useState(false);
  const [ultimoSyncMsg, setUltimoSyncMsg] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setErrorCarga(null);
    try {
      const res = await fetchWithSupabaseSession(`/api/marketing/ops?mes=${encodeURIComponent(mes)}`, {
        cache: "no-store",
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.success) {
        setErrorCarga(typeof json.error === "string" ? json.error : "No se pudo cargar Marketing Ops");
        setTareas([]);
        setClientesOps([]);
        setMetricas({ total: 0, completadas: 0, porcentaje: 0 });
        return;
      }
      const d = json.data as {
        mes: string;
        hoy: string;
        clientes: MarketingOpsClienteResumen[];
        tareas: MarketingTask[];
        metricas: { total: number; completadas: number; porcentaje: number };
      };
      setTareas(Array.isArray(d.tareas) ? d.tareas : []);
      setClientesOps(Array.isArray(d.clientes) ? d.clientes : []);
      setMetricas(d.metricas ?? { total: 0, completadas: 0, porcentaje: 0 });
      if (typeof d.hoy === "string" && d.hoy.length >= 10) setHoyYmd(d.hoy.slice(0, 10));
    } catch {
      setErrorCarga("Error de red al cargar Marketing Ops");
      setTareas([]);
      setClientesOps([]);
      setMetricas({ total: 0, completadas: 0, porcentaje: 0 });
    } finally {
      setCargando(false);
    }
  }, [mes]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const [ano, mesNum] = mes.split("-").map(Number);

  const tareasPorCliente = useMemo(() => {
    const map = new Map<string, MarketingTask[]>();
    for (const t of tareas) {
      const list = map.get(t.cliente_id) ?? [];
      list.push(t);
      map.set(t.cliente_id, list);
    }
    return map;
  }, [tareas]);

  const grupoPorDiaPorCliente = useMemo(() => {
    const map = new Map<string, Map<string, MarketingTask[]>>();
    for (const [cid, list] of tareasPorCliente) {
      const porDia = new Map<string, MarketingTask[]>();
      for (const t of list) {
        const l = porDia.get(t.fecha_entrega) ?? [];
        l.push(t);
        porDia.set(t.fecha_entrega, l);
      }
      map.set(cid, porDia);
    }
    return map;
  }, [tareasPorCliente]);

  const diasDelMes = useMemo(() => {
    const ultimo = new Date(ano, mesNum, 0).getDate();
    const dias: string[] = [];
    for (let d = 1; d <= ultimo; d++) {
      dias.push(`${mes}-${String(d).padStart(2, "0")}`);
    }
    return dias;
  }, [mes, ano, mesNum]);

  const atrasadas = useMemo(
    () => tareas.filter((t) => t.fecha_entrega < hoyYmd && !esCumplida(t)),
    [tareas, hoyYmd]
  );
  const tareasHoy = useMemo(() => tareas.filter((t) => t.fecha_entrega === hoyYmd), [tareas, hoyYmd]);
  const finSemana = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 6);
    return d.toISOString().slice(0, 10);
  }, []);
  const semana = useMemo(
    () => tareas.filter((t) => t.fecha_entrega > hoyYmd && t.fecha_entrega <= finSemana),
    [tareas, hoyYmd, finSemana]
  );

  async function handlePreviewSync() {
    setUltimoSyncMsg(null);
    try {
      const res = await fetchWithSupabaseSession(`/api/marketing/sync?preview=1&mes=${encodeURIComponent(mes)}`);
      const json = await res.json();
      if (res.status === 403) {
        setUltimoSyncMsg("Sincronizar requiere usuario administrador.");
        return;
      }
      if (res.ok && json.data) {
        setSyncPreview({
          clientes_a_marcar_count: json.data.resumen?.clientes_a_marcar_count ?? 0,
          tareas_a_generar_count: json.data.resumen?.tareas_a_generar_count ?? 0,
          clientes_a_marcar: json.data.clientes_a_marcar ?? [],
        });
        setSyncMostrarPreview(true);
      } else {
        setUltimoSyncMsg(typeof json.error === "string" ? json.error : "No se pudo obtener el preview");
      }
    } catch {
      setUltimoSyncMsg("Error de red en preview de sincronización");
    }
  }

  async function handleExecuteSync() {
    setSyncEjecutando(true);
    setUltimoSyncMsg(null);
    try {
      const res = await fetchWithSupabaseSession("/api/marketing/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mes, confirmar: true }),
      });
      const json = await res.json();
      if (res.status === 403) {
        setUltimoSyncMsg("Sincronizar requiere usuario administrador.");
        return;
      }
      if (res.ok && json.success) {
        setSyncMostrarPreview(false);
        setSyncPreview(null);
        await cargar();
        const d = json.data as {
          tareas_eliminadas?: number;
          tareas_generadas?: number;
          clientes_actualizados?: number;
          errores?: string[];
          clientes_sincronizar_errores?: string[];
        };
        if (d) {
          const partes = [
            typeof d.clientes_actualizados === "number" && `Clientes tipificados: ${d.clientes_actualizados}`,
            typeof d.tareas_eliminadas === "number" && d.tareas_eliminadas > 0 && `Eliminadas: ${d.tareas_eliminadas}`,
            typeof d.tareas_generadas === "number" && `Generadas: ${d.tareas_generadas}`,
          ].filter(Boolean) as string[];
          setUltimoSyncMsg(partes.length ? partes.join(" · ") : "Sincronización completada.");
          const err = [...(d.clientes_sincronizar_errores ?? []), ...(d.errores ?? [])].filter(Boolean);
          if (err.length) {
            setUltimoSyncMsg((prev) => `${prev ?? "Listo."}\n\nAdvertencias:\n${err.slice(0, 8).join("\n")}${err.length > 8 ? "\n…" : ""}`);
          }
        }
      } else {
        setUltimoSyncMsg(typeof json.error === "string" ? json.error : "Error al sincronizar");
      }
    } catch {
      setUltimoSyncMsg("Error de red al sincronizar");
    } finally {
      setSyncEjecutando(false);
    }
  }

  async function handleMarcarCumplida(tarea: MarketingTask) {
    setMarcandoCumplida(true);
    const actualizada = await updateTaskStatus(tarea.id, "aprobado");
    setMarcandoCumplida(false);
    setModalTarea(null);
    if (actualizada) {
      setTareas((prev) => prev.map((t) => (t.id === tarea.id ? actualizada : t)));
      const met = await getMetricasCumplimiento(mes);
      setMetricas(met);
      await cargar();
    }
  }

  async function handleRegenerarTareas(cli: MarketingOpsClienteResumen) {
    setRegenerando(true);
    try {
      const res = await fetchWithSupabaseSession("/api/marketing/regenerar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mes, cliente_id: cli.id, confirmar: true }),
      });
      const json = await res.json();
      if (res.ok && json.success) {
        setRegenerarCliente(null);
        await cargar();
        setUltimoSyncMsg(`Tareas regeneradas para ${nombreClienteOps(cli)}.`);
      } else {
        setUltimoSyncMsg(typeof json.error === "string" ? json.error : "Error al regenerar tareas");
      }
    } catch {
      setUltimoSyncMsg("Error de red al regenerar tareas");
    } finally {
      setRegenerando(false);
    }
  }

  const mesOptions = useMemo(
    () =>
      Array.from({ length: 24 }, (_, i) => {
        const d = new Date();
        d.setMonth(d.getMonth() - 6 + i);
        const y = d.getFullYear();
        const m = String(d.getMonth() + 1).padStart(2, "0");
        return {
          value: `${y}-${m}`,
          label: `${MESES[d.getMonth()]} ${y}`,
        };
      }),
    []
  );

  if (cargando && tareas.length === 0 && clientesOps.length === 0) {
    return (
      <div className="min-h-[50vh] space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="h-9 w-56 animate-pulse rounded-lg bg-slate-200/80" />
          <div className="h-10 w-48 animate-pulse rounded-lg bg-slate-200/80" />
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
          ))}
        </div>
        <div className="h-40 animate-pulse rounded-2xl border border-slate-200 bg-slate-100" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 border-b border-slate-200/80 pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-[#4FAEB2]/30 bg-[#4FAEB2]/10 text-[#3F8E91] shadow-[0_0_0_3px_rgba(79,174,178,0.10)]">
            <Megaphone className="h-5 w-5" aria-hidden />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
              />
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
                Marketing
              </p>
            </div>
            <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-slate-900 sm:text-xl">Marketing Ops</h1>
            <p className="text-xs text-slate-500">
              Calendario y cumplimiento por cliente · schema de datos de la empresa
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FancySelect
            size="sm"
            className="min-w-[150px]"
            ariaLabel="Mes operativo"
            value={mes}
            onChange={(v) => setMes(v)}
            options={mesOptions}
          />
          <button
            type="button"
            onClick={() => void cargar()}
            disabled={cargando}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#3F8E91] disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${cargando ? "animate-spin" : ""}`} />
            Actualizar
          </button>
          <button
            type="button"
            onClick={() => void handlePreviewSync()}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#4FAEB2] px-3.5 py-1.5 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91] active:scale-95"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Sincronizar y regenerar mes
          </button>
        </div>
      </div>

      {errorCarga && (
        <div className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          <AlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">No se pudo cargar el panel</p>
            <p className="text-red-700/90 mt-0.5">{errorCarga}</p>
          </div>
        </div>
      )}

      {ultimoSyncMsg && !syncMostrarPreview && (
        <div className="flex items-start gap-2 whitespace-pre-wrap rounded-2xl border border-[#4FAEB2]/30 bg-[#4FAEB2]/8 px-4 py-3 text-sm text-[#1E4F51]">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#3F8E91]" />
          <div className="min-w-0">
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#4FAEB2]">
              Última operación
            </p>
            <p className="mt-0.5 text-slate-700">{ultimoSyncMsg}</p>
            <button
              type="button"
              className="mt-2 text-xs font-semibold text-[#3F8E91] transition-colors hover:text-[#4FAEB2]"
              onClick={() => setUltimoSyncMsg(null)}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="rounded-2xl border border-red-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-red-600">Atrasadas</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-red-700">{atrasadas.length}</p>
          <p className="mt-0.5 text-[11px] text-red-600/80">Vencidas y sin aprobar</p>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-white p-4 shadow-sm">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-amber-700">Hoy</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-amber-800">{tareasHoy.length}</p>
          <p className="mt-0.5 text-[11px] text-amber-700/80">Entregas con fecha {hoyYmd}</p>
        </div>
        <div className="rounded-2xl border border-[#4FAEB2]/30 bg-white p-4 shadow-sm ring-1 ring-[#4FAEB2]/10">
          <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[#4FAEB2]">Esta semana</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-[#3F8E91]">{semana.length}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">Próximos 7 días</p>
        </div>
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-500">
            <Users className="h-3.5 w-3.5" /> Cartera marketing
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-slate-900">{clientesOps.length}</p>
          <p className="mt-0.5 text-[11px] text-slate-500">Plan marketing activo o servicio marketing</p>
        </div>
        <div className="col-span-2 rounded-2xl border border-emerald-200 bg-white p-4 shadow-sm lg:col-span-1">
          <p className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-emerald-600">
            <Target className="h-3.5 w-3.5" /> Cumplimiento {mes}
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-emerald-700">{metricas.porcentaje}%</p>
          <p className="mt-0.5 text-[11px] text-slate-500">
            {metricas.completadas}/{metricas.total} tareas cerradas
          </p>
        </div>
      </div>

      {syncMostrarPreview && syncPreview && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm"
          onClick={() => setSyncMostrarPreview(false)}
          role="presentation"
        >
          <div
            className="relative w-full max-w-lg overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-[#4FAEB2]/10 ring-1 ring-[#4FAEB2]/15"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="sync-dialog-title"
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#4FAEB2] via-[#4FAEB2]/80 to-[#4FAEB2]/40"
            />
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
              />
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
                Sincronizar y regenerar
              </p>
            </div>
            <h3 id="sync-dialog-title" className="mt-1 text-lg font-bold tracking-tight text-slate-900">
              {MESES[mesNum - 1]} {ano}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Se eliminan las tareas <strong>automáticas</strong> del mes y se vuelven a generar según la plantilla de
              cada plan de marketing. Las tareas manuales no se tocan.
            </p>
            <ul className="mt-3 space-y-2 text-sm text-slate-700">
              <li className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]"
                />
                <strong className="tabular-nums">{syncPreview.clientes_a_marcar_count}</strong>
                clientes a tipificar como marketing
              </li>
              <li className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50/70 px-3 py-2">
                <span
                  aria-hidden="true"
                  className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]"
                />
                ~<strong className="tabular-nums">{syncPreview.tareas_a_generar_count}</strong> tareas nuevas (estimado)
              </li>
            </ul>
            <div className="mt-5 flex flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setSyncMostrarPreview(false)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-[#4FAEB2]/60 hover:text-[#3F8E91]"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleExecuteSync()}
                disabled={syncEjecutando}
                className="inline-flex min-w-[140px] items-center justify-center gap-2 rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91] disabled:opacity-50"
              >
                {syncEjecutando ? (
                  <>
                    <RefreshCw className="h-4 w-4 animate-spin" /> Ejecutando…
                  </>
                ) : (
                  "Confirmar"
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {regenerarCliente && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm"
          onClick={() => setRegenerarCliente(null)}
        >
          <div
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-[#4FAEB2]/10 ring-1 ring-[#4FAEB2]/15"
            onClick={(e) => e.stopPropagation()}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#4FAEB2] via-[#4FAEB2]/80 to-[#4FAEB2]/40"
            />
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
              />
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
                Regenerar tareas del mes
              </p>
            </div>
            <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-900">
              {nombreClienteOps(regenerarCliente)}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Se eliminarán las <strong>tareas automáticas</strong> en{" "}
              <strong>
                {MESES[mesNum - 1]} {ano}
              </strong>{" "}
              y se generarán nuevas según la plantilla actual del plan.
            </p>
            <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              Las tareas manuales no se modifican.
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setRegenerarCliente(null)}
                disabled={regenerando}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-[#4FAEB2]/60 hover:text-[#3F8E91] disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void handleRegenerarTareas(regenerarCliente)}
                disabled={regenerando}
                className="rounded-lg bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91] disabled:opacity-50"
              >
                {regenerando ? "Regenerando…" : "Confirmar"}
              </button>
            </div>
          </div>
        </div>
      )}

      {modalTarea && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 p-4 backdrop-blur-sm"
          onClick={() => setModalTarea(null)}
        >
          <div
            className="relative w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white p-6 shadow-2xl shadow-[#4FAEB2]/10 ring-1 ring-[#4FAEB2]/15"
            onClick={(e) => e.stopPropagation()}
          >
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#4FAEB2] via-[#4FAEB2]/80 to-[#4FAEB2]/40"
            />
            <div className="flex items-center gap-2">
              <span
                aria-hidden="true"
                className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
              />
              <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
                Tarea
              </p>
            </div>
            <h3 className="mt-1 text-lg font-bold tracking-tight text-slate-900">¿Se cumplió esta tarea?</h3>
            <p className="mt-1 text-sm capitalize text-slate-600">
              {modalTarea.tipo_contenido} — {modalTarea.fecha_entrega}
            </p>
            <div className="mt-5 flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalTarea(null)}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600 transition-colors hover:border-[#4FAEB2]/60 hover:text-[#3F8E91]"
              >
                No
              </button>
              <button
                type="button"
                onClick={() => void handleMarcarCumplida(modalTarea)}
                disabled={marcandoCumplida}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700 disabled:opacity-50"
              >
                {marcandoCumplida ? "…" : "Sí, aprobada"}
              </button>
            </div>
          </div>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="flex items-center gap-2">
            <span aria-hidden="true" className="text-[#4FAEB2]">
              <CalendarDays className="h-4 w-4" />
            </span>
            <span className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Clientes — {MESES[mesNum - 1]} {ano}
            </span>
          </h2>
          {cargando && (clientesOps.length > 0 || tareas.length > 0) && (
            <span className="inline-flex items-center gap-1 text-xs text-slate-400">
              <RefreshCw className="h-3 w-3 animate-spin" /> Actualizando…
            </span>
          )}
        </div>

        {clientesOps.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[#4FAEB2]/30 bg-[#4FAEB2]/5 px-6 py-10 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-[#4FAEB2]/30 bg-white text-[#4FAEB2]">
              <Users className="h-6 w-6" />
            </div>
            <p className="font-semibold tracking-tight text-slate-800">No hay clientes en cartera marketing para este período</p>
            <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-slate-500">
              Debe existir al menos una <strong>suscripción activa</strong> a un plan con{" "}
              <strong>«Plan de marketing»</strong> y <strong>plantilla operativa</strong> con ítems, o un cliente con
              tipo de servicio <strong>marketing</strong>.
            </p>
            <p className="mt-4 text-xs text-slate-400">
              Si ya cumplís eso y no ves datos, ejecutá <strong>Sincronizar y regenerar mes</strong> (requiere admin) o
              revisá que el plan tenga <code className="rounded bg-slate-100 px-1 text-[11px]">es_plan_marketing</code>{" "}
              en la base.
            </p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm ring-1 ring-[#4FAEB2]/15">
            <div className="hidden grid-cols-[1.4fr_1fr_0.7fr_0.7fr_0.7fr_0.7fr_1fr_auto] gap-2 border-b border-slate-200 bg-slate-50/70 px-4 py-2 text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500 md:grid">
              <span>Cliente</span>
              <span>Plan</span>
              <span className="text-center">Cupo mes</span>
              <span className="text-center">Hechas</span>
              <span className="text-center">Pend.</span>
              <span className="text-center">Atras.</span>
              <span>Próxima</span>
              <span />
            </div>
            <div className="divide-y divide-slate-100">
              {clientesOps.map((c) => {
                const expandido = expandidoId === c.id;
                const grupoPorDia = grupoPorDiaPorCliente.get(c.id) ?? new Map<string, MarketingTask[]>();
                const cupoMes = c.tareas_total;
                const pct = cupoMes > 0 ? Math.round((c.tareas_completadas / cupoMes) * 100) : 0;

                return (
                  <div key={c.id} className="bg-white">
                    <button
                      type="button"
                      onClick={() => setExpandidoId(expandido ? null : c.id)}
                      className="w-full px-4 py-2.5 text-left transition-colors hover:bg-[#4FAEB2]/[0.04]"
                    >
                      <div className="flex flex-col gap-2 md:grid md:grid-cols-[1.4fr_1fr_0.7fr_0.7fr_0.7fr_0.7fr_1fr_auto] md:items-center md:gap-2">
                        <div className="flex min-w-0 items-center gap-2">
                          {expandido ? (
                            <ChevronDown className="h-4 w-4 shrink-0 text-[#4FAEB2]" />
                          ) : (
                            <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                          )}
                          <div className="min-w-0">
                            <p className="truncate font-semibold tracking-tight text-slate-900">
                              {nombreClienteOps(c)}
                            </p>
                            <p className="text-[11px] text-slate-500 md:hidden">
                              {c.plan_marketing_nombre ?? "—"} · {pct}% cumplido
                            </p>
                          </div>
                        </div>
                        <div className="hidden truncate pl-6 text-sm text-slate-600 md:block md:pl-0">
                          {c.plan_marketing_nombre ? (
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-[#4FAEB2]/30 bg-[#4FAEB2]/10 px-2 py-0.5 text-[11px] font-semibold text-[#3F8E91]">
                              <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[#4FAEB2]" />
                              {c.plan_marketing_nombre}
                            </span>
                          ) : (
                            <span className="italic text-slate-400">Sin plan vinculado</span>
                          )}
                          {c.por_suscripcion_marketing && c.tipo_servicio_cliente !== "marketing" && (
                            <span className="ml-1 text-[10px] font-semibold text-amber-700">(sync pendiente)</span>
                          )}
                        </div>
                        <div className="hidden text-center text-sm font-semibold tabular-nums text-slate-800 md:block">
                          {cupoMes}
                        </div>
                        <div className="hidden text-center text-sm font-semibold tabular-nums text-emerald-700 md:block">
                          {c.tareas_completadas}
                        </div>
                        <div className="hidden text-center text-sm font-semibold tabular-nums text-amber-700 md:block">
                          {c.tareas_pendientes}
                        </div>
                        <div className="hidden text-center text-sm font-semibold tabular-nums text-red-600 md:block">
                          {c.tareas_atrasadas}
                        </div>
                        <div className="hidden items-center gap-1 text-sm text-slate-600 md:flex">
                          <Clock className="h-3.5 w-3.5 shrink-0 text-slate-400" />
                          <span>{c.proxima_entrega ?? "—"}</span>
                        </div>
                        <div className="hidden justify-end md:flex">
                          <span
                            className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
                              pct >= 100
                                ? "border-emerald-200 bg-emerald-50 text-emerald-700"
                                : pct >= 50
                                ? "border-[#4FAEB2]/30 bg-[#4FAEB2]/10 text-[#3F8E91]"
                                : "border-slate-200 bg-slate-50 text-slate-600"
                            }`}
                          >
                            <span
                              aria-hidden="true"
                              className={`h-1.5 w-1.5 rounded-full ${
                                pct >= 100 ? "bg-emerald-500" : pct >= 50 ? "bg-[#4FAEB2]" : "bg-slate-400"
                              }`}
                            />
                            {pct}%
                          </span>
                        </div>
                      </div>
                    </button>

                    {expandido && (
                      <div className="border-t border-slate-100 bg-slate-50/40 p-4">
                        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                          <div className="space-y-1 text-xs text-slate-600">
                            <p>
                              <span className="font-semibold text-slate-800">Resumen:</span>{" "}
                              {c.tareas_completadas} completadas · {c.tareas_pendientes} pendientes ·{" "}
                              {c.tareas_atrasadas} atrasadas
                            </p>
                            {c.proxima_entrega && (
                              <p>
                                Próxima entrega: <strong>{c.proxima_entrega}</strong>
                              </p>
                            )}
                          </div>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRegenerarCliente(c);
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-[#4FAEB2]/45 bg-white px-3 py-1.5 text-xs font-semibold text-[#3F8E91] shadow-sm transition-colors hover:bg-[#4FAEB2]/10"
                          >
                            <RefreshCw className="h-3.5 w-3.5" />
                            Regenerar tareas de este cliente
                          </button>
                        </div>
                        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                          <div
                            className="grid min-w-[640px] grid-cols-7 gap-1 p-2"
                            style={{ gridTemplateColumns: "repeat(7, minmax(0, 1fr))" }}
                          >
                            {["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"].map((d) => (
                              <div
                                key={d}
                                className="py-1 text-center text-[10px] font-semibold uppercase tracking-[0.14em] text-slate-400"
                              >
                                {d}
                              </div>
                            ))}
                            {Array.from(
                              { length: diasDelMes.length ? new Date(ano, mesNum - 1, 1).getDay() : 0 },
                              (_, i) => <div key={`e-${i}`} className="min-h-[72px]" />
                            )}
                            {diasDelMes.map((fecha) => {
                              const tareasDia = grupoPorDia.get(fecha) ?? [];
                              const esHoy = fecha === hoyYmd;
                              return (
                                <div
                                  key={fecha}
                                  className={`min-h-[72px] rounded-lg border p-1.5 text-left ${
                                    esHoy
                                      ? "border-[#4FAEB2]/60 bg-[#4FAEB2]/8 shadow-[0_0_0_3px_rgba(79,174,178,0.10)]"
                                      : "border-slate-200 bg-white"
                                  }`}
                                >
                                  <span
                                    className={`text-[10px] font-bold ${
                                      esHoy ? "text-[#3F8E91]" : "text-slate-500"
                                    }`}
                                  >
                                    {fecha.slice(8)}
                                  </span>
                                  <div className="mt-1 space-y-0.5">
                                    {tareasDia.map((t) => (
                                      <button
                                        key={t.id}
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setModalTarea(t);
                                        }}
                                        className={`block w-full cursor-pointer truncate rounded border px-1 py-0.5 text-left text-[10px] leading-tight transition-opacity hover:opacity-90 ${estiloTarea(t, hoyYmd)}`}
                                      >
                                        {t.tipo_contenido}
                                      </button>
                                    ))}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
