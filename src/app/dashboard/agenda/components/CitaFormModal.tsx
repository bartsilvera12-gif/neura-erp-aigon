"use client";

import { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { AGENDA_ESTADOS, type AgendaCitaEnriquecida } from "@/lib/agenda/types";
import { estadoStyle, pad, ymd } from "../calendar-utils";

export type AgendaOptions = {
  responsables: { id: string; nombre: string | null; rol: string | null }[];
  clientes: { id: string; nombre: string | null; telefono: string | null }[];
  tipos: string[];
};

type Mode = "crear" | "editar" | "reprogramar";
type ClienteMode = "existente" | "nuevo";

const DURACIONES = [15, 30, 45, 60, 90, 120];

const TEAL = "#4FAEB2";
const TEAL_DARK = "#3F8E91";

function hhmmLocal(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
function combinar(fecha: string, hora: string): string | null {
  if (!fecha || !hora) return null;
  const ms = Date.parse(`${fecha}T${hora}`);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
function addMinToHora(hora: string, min: number): string {
  const [h, m] = hora.split(":").map((x) => parseInt(x, 10));
  const d = new Date(2000, 0, 1, h || 0, m || 0);
  d.setMinutes(d.getMinutes() + min);
  return hhmmLocal(d);
}
function diffMin(hi: string, hf: string): number | null {
  const [h1, m1] = hi.split(":").map((x) => parseInt(x, 10));
  const [h2, m2] = hf.split(":").map((x) => parseInt(x, 10));
  if ([h1, m1, h2, m2].some((n) => Number.isNaN(n))) return null;
  return h2 * 60 + m2 - (h1 * 60 + m1);
}

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";
const labelCls = "block text-xs font-medium text-slate-600 mb-1";

function SectionHead({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-5 w-1 rounded-full" style={{ backgroundColor: TEAL }} />
      <span className="text-[11px] font-semibold uppercase tracking-[0.08em]" style={{ color: TEAL }}>
        {children}
      </span>
    </div>
  );
}

export default function CitaFormModal({
  open,
  mode,
  cita,
  prefill,
  options,
  onClose,
  onSaved,
}: {
  open: boolean;
  mode: Mode;
  cita: AgendaCitaEnriquecida | null;
  prefill: { inicio: Date; fin: Date } | null;
  options: AgendaOptions;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [titulo, setTitulo] = useState("");
  const [responsableId, setResponsableId] = useState("");
  const [tipo, setTipo] = useState("");
  const [estado, setEstado] = useState("pendiente");

  const [fecha, setFecha] = useState("");
  const [horaInicio, setHoraInicio] = useState("");
  const [horaFin, setHoraFin] = useState("");

  const [clienteMode, setClienteMode] = useState<ClienteMode>("existente");
  const [clienteId, setClienteId] = useState("");
  const [contactoNombre, setContactoNombre] = useState("");
  const [contactoTelefono, setContactoTelefono] = useState("");
  const [contactoEmail, setContactoEmail] = useState("");
  const [contactoEmpresa, setContactoEmpresa] = useState("");
  const [guardarComoCliente, setGuardarComoCliente] = useState(false);

  const [ubicacion, setUbicacion] = useState("");
  const [observaciones, setObservaciones] = useState("");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setAviso(null);
    setGuardarComoCliente(false);
    if (mode === "crear") {
      const ini = prefill?.inicio ?? (() => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d; })();
      const fin = prefill?.fin ?? (() => { const d = new Date(ini); d.setMinutes(d.getMinutes() + 30); return d; })();
      setTitulo("");
      setResponsableId(options.responsables[0]?.id ?? "");
      setTipo("");
      setEstado("pendiente");
      setFecha(ymd(ini));
      setHoraInicio(hhmmLocal(ini));
      setHoraFin(hhmmLocal(fin));
      setClienteMode("existente");
      setClienteId("");
      setContactoNombre("");
      setContactoTelefono("");
      setContactoEmail("");
      setContactoEmpresa("");
      setUbicacion("");
      setObservaciones("");
    } else if (cita) {
      const ini = new Date(cita.inicio_at);
      const fin = new Date(cita.fin_at);
      const meta = (cita.metadata ?? {}) as Record<string, unknown>;
      setTitulo(cita.titulo);
      setResponsableId(cita.responsable_id);
      setTipo(cita.tipo ?? "");
      setEstado(cita.estado);
      setFecha(ymd(ini));
      setHoraInicio(hhmmLocal(ini));
      setHoraFin(hhmmLocal(fin));
      setClienteMode(cita.cliente_id ? "existente" : cita.contacto_nombre ? "nuevo" : "existente");
      setClienteId(cita.cliente_id ?? "");
      setContactoNombre(cita.contacto_nombre ?? "");
      setContactoTelefono(cita.contacto_telefono ?? "");
      setContactoEmail(typeof meta.contacto_email === "string" ? meta.contacto_email : "");
      setContactoEmpresa(typeof meta.contacto_empresa === "string" ? meta.contacto_empresa : "");
      setUbicacion(cita.ubicacion ?? "");
      setObservaciones(cita.observaciones ?? "");
    }
  }, [open, mode, cita, prefill, options.responsables]);

  // Disponibilidad (advertencia no bloqueante).
  useEffect(() => {
    if (!open) return;
    const inicioIso = combinar(fecha, horaInicio);
    const finIso = combinar(fecha, horaFin);
    if (!responsableId || !inicioIso || !finIso || Date.parse(finIso) <= Date.parse(inicioIso)) {
      setAviso(null);
      return;
    }
    let cancelled = false;
    const params = new URLSearchParams({ responsable_id: responsableId, inicio: inicioIso, fin: finIso });
    if (mode === "editar" && cita) params.set("exclude_id", cita.id);
    const t = setTimeout(async () => {
      try {
        const res = await fetchWithSupabaseSession(`/api/agenda/disponibilidad?${params.toString()}`);
        const json = await res.json();
        if (cancelled) return;
        if (json?.success && json.data?.disponible === false) {
          setAviso(json.data.conflicto?.mensaje ?? "El responsable ya tiene una cita en ese horario.");
        } else setAviso(null);
      } catch {
        /* silencioso */
      }
    }, 350);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [open, responsableId, fecha, horaInicio, horaFin, mode, cita]);

  const duracionActual = useMemo(() => diffMin(horaInicio, horaFin), [horaInicio, horaFin]);
  const tituloModal = mode === "crear" ? "Nueva cita" : mode === "reprogramar" ? "Reprogramar cita" : "Editar cita";
  const subtitulo = mode === "crear" ? "Programá una nueva cita o reunión" : mode === "reprogramar" ? "Mové la cita a un nuevo horario" : "Actualizá los datos de la cita";

  if (!open) return null;

  function aplicarDuracion(min: number) {
    if (!horaInicio) return;
    setHoraFin(addMinToHora(horaInicio, min));
  }
  function onChangeInicio(v: string) {
    const prevDur = duracionActual && duracionActual > 0 ? duracionActual : 30;
    setHoraInicio(v);
    if (v) setHoraFin(addMinToHora(v, prevDur));
  }

  async function submit() {
    setError(null);
    const inicioIso = combinar(fecha, horaInicio);
    const finIso = combinar(fecha, horaFin);
    if (mode !== "reprogramar" && !titulo.trim()) return setError("El título es obligatorio.");
    if (!responsableId) return setError("Elegí un responsable.");
    if (!inicioIso || !finIso) return setError("Indicá fecha, hora de inicio y fin.");
    if (Date.parse(finIso) <= Date.parse(inicioIso)) return setError("El fin debe ser posterior al inicio.");

    const metadata: Record<string, unknown> = { ...((cita?.metadata as Record<string, unknown>) ?? {}) };
    if (clienteMode === "nuevo") {
      if (contactoEmail.trim()) metadata.contacto_email = contactoEmail.trim();
      else delete metadata.contacto_email;
      if (contactoEmpresa.trim()) metadata.contacto_empresa = contactoEmpresa.trim();
      else delete metadata.contacto_empresa;
    }

    const esNuevo = clienteMode === "nuevo";
    setSaving(true);
    try {
      let res: Response;
      if (mode === "reprogramar" && cita) {
        res = await fetchWithSupabaseSession(`/api/agenda/${cita.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ accion: "reprogramar", responsable_id: responsableId, inicio_at: inicioIso, fin_at: finIso, observaciones: observaciones || null }),
        });
      } else {
        const payload = {
          titulo: titulo.trim(),
          responsable_id: responsableId,
          tipo: tipo || null,
          estado,
          inicio_at: inicioIso,
          fin_at: finIso,
          cliente_id: esNuevo ? null : clienteId || null,
          contacto_nombre: esNuevo ? contactoNombre || null : null,
          contacto_telefono: esNuevo ? contactoTelefono || null : null,
          ubicacion: ubicacion || null,
          observaciones: observaciones || null,
          metadata,
        };
        res = await fetchWithSupabaseSession(mode === "crear" ? "/api/agenda" : `/api/agenda/${cita!.id}`, {
          method: mode === "crear" ? "POST" : "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }

      const json = await res.json();
      if (!res.ok || !json?.success) {
        setError(json?.error ?? "No se pudo guardar.");
        setSaving(false);
        return;
      }
      setSaving(false);
      onSaved();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error al guardar.");
      setSaving(false);
    }
  }

  const reprog = mode === "reprogramar";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-4">
      <button className="absolute inset-0 cursor-default bg-slate-900/55 backdrop-blur-sm" aria-label="Cerrar" onClick={onClose} />
      <div className="relative flex h-[100dvh] max-h-[100dvh] w-full max-w-lg flex-col overflow-hidden rounded-none border-0 border-slate-200 bg-white shadow-2xl shadow-[#4FAEB2]/10 ring-1 ring-[#4FAEB2]/15 sm:h-auto sm:max-h-[88dvh] sm:rounded-2xl sm:border">
        {/* barra superior degradé */}
        <div className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-[#4FAEB2] via-[#4FAEB2]/80 to-[#4FAEB2]/40" />

        {/* header con gradiente sutil */}
        <div className="flex items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-br from-white via-white to-[#4FAEB2]/5 px-5 pb-4 pt-5">
          <div className="min-w-0">
            <h2 className="text-lg font-semibold tracking-tight text-slate-900">{tituloModal}</h2>
            <p className="mt-0.5 text-sm text-slate-500">{subtitulo}</p>
          </div>
          <button
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white p-2 text-slate-400 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#4FAEB2]"
            aria-label="Cerrar"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
          {/* BÁSICO */}
          {!reprog && (
            <section className="space-y-3">
              <SectionHead>Básico</SectionHead>
              <div>
                <label className={labelCls}>Título *</label>
                <input className={inputCls} value={titulo} onChange={(e) => setTitulo(e.target.value)} placeholder="Ej: Demo con cliente" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                <div className="col-span-1">
                  <label className={labelCls}>Responsable *</label>
                  <select className={inputCls} value={responsableId} onChange={(e) => setResponsableId(e.target.value)}>
                    <option value="">—</option>
                    {options.responsables.map((r) => (
                      <option key={r.id} value={r.id}>{r.nombre ?? r.id}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Tipo</label>
                  <select className={inputCls} value={tipo} onChange={(e) => setTipo(e.target.value)}>
                    <option value="">Sin tipo</option>
                    {options.tipos.map((t) => (<option key={t} value={t}>{t}</option>))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Estado</label>
                  <select className={inputCls} value={estado} onChange={(e) => setEstado(e.target.value)}>
                    {AGENDA_ESTADOS.map((s) => (<option key={s} value={s}>{estadoStyle(s).label}</option>))}
                  </select>
                </div>
              </div>
            </section>
          )}

          {reprog && (
            <div className="rounded-xl border border-violet-200 bg-violet-50 px-3.5 py-2.5 text-xs text-violet-700">
              Vas a reprogramar “{cita?.titulo}”. La cita original quedará marcada como <b>reprogramada</b> y se creará una nueva.
            </div>
          )}

          {/* FECHA Y HORA */}
          <section className="space-y-3">
            <SectionHead>Fecha y hora</SectionHead>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              <div>
                <label className={labelCls}>Fecha *</label>
                <input type="date" className={inputCls} value={fecha} onChange={(e) => setFecha(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Inicio *</label>
                <input type="time" className={inputCls} value={horaInicio} onChange={(e) => onChangeInicio(e.target.value)} />
              </div>
              <div>
                <label className={labelCls}>Fin *</label>
                <input type="time" className={inputCls} value={horaFin} onChange={(e) => setHoraFin(e.target.value)} />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[11px] text-slate-400">Duración:</span>
              {DURACIONES.map((d) => {
                const active = duracionActual === d;
                return (
                  <button
                    key={d}
                    type="button"
                    onClick={() => aplicarDuracion(d)}
                    style={active ? { backgroundColor: TEAL, borderColor: TEAL } : undefined}
                    className={`rounded-full border px-2.5 py-0.5 text-[11px] font-medium transition-colors ${
                      active ? "text-white shadow-sm" : "border-slate-300 text-slate-600 hover:border-[#4FAEB2]/60 hover:text-[#3F8E91]"
                    }`}
                  >
                    {d < 60 ? `${d}m` : d === 60 ? "1h" : `${d / 60}h`}
                  </button>
                );
              })}
              {duracionActual != null && !DURACIONES.includes(duracionActual) && duracionActual > 0 && (
                <span className="text-[11px] text-slate-500">({duracionActual}m)</span>
              )}
            </div>
            {aviso && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-700">⚠ {aviso}</div>
            )}
          </section>

          {/* PERSONA */}
          {!reprog && (
            <section className="space-y-3">
              <SectionHead>Persona</SectionHead>
              <div className="flex rounded-xl border border-slate-200 bg-slate-50 p-1 text-xs">
                <button
                  type="button"
                  onClick={() => setClienteMode("existente")}
                  style={clienteMode === "existente" ? { backgroundColor: TEAL } : undefined}
                  className={`flex-1 rounded-lg px-3 py-2 font-medium transition-colors ${clienteMode === "existente" ? "text-white shadow-sm" : "text-slate-600 hover:text-slate-800"}`}
                >
                  Cliente existente
                </button>
                <button
                  type="button"
                  onClick={() => setClienteMode("nuevo")}
                  style={clienteMode === "nuevo" ? { backgroundColor: TEAL } : undefined}
                  className={`flex-1 rounded-lg px-3 py-2 font-medium transition-colors ${clienteMode === "nuevo" ? "text-white shadow-sm" : "text-slate-600 hover:text-slate-800"}`}
                >
                  Nuevo contacto
                </button>
              </div>

              {clienteMode === "existente" ? (
                <select className={inputCls} value={clienteId} onChange={(e) => setClienteId(e.target.value)}>
                  <option value="">— Sin cliente —</option>
                  {options.clientes.map((c) => (<option key={c.id} value={c.id}>{c.nombre ?? c.id}</option>))}
                </select>
              ) : (
                <div className="space-y-3 rounded-2xl border border-[#4FAEB2]/20 bg-[#4FAEB2]/5 p-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Nombre</label>
                      <input className={inputCls} value={contactoNombre} onChange={(e) => setContactoNombre(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Teléfono</label>
                      <input className={inputCls} value={contactoTelefono} onChange={(e) => setContactoTelefono(e.target.value)} />
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <label className={labelCls}>Email</label>
                      <input className={inputCls} value={contactoEmail} onChange={(e) => setContactoEmail(e.target.value)} />
                    </div>
                    <div>
                      <label className={labelCls}>Empresa / referencia</label>
                      <input className={inputCls} value={contactoEmpresa} onChange={(e) => setContactoEmpresa(e.target.value)} />
                    </div>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-slate-400" title="Disponible en una próxima fase">
                    <input type="checkbox" disabled checked={guardarComoCliente} onChange={(e) => setGuardarComoCliente(e.target.checked)} className="h-4 w-4 rounded border-slate-300 accent-[#4FAEB2]" />
                    Guardar también como cliente del ERP <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px]">próximamente</span>
                  </label>
                </div>
              )}
            </section>
          )}

          {/* EXTRA */}
          <section className="space-y-3">
            <SectionHead>Extra</SectionHead>
            {!reprog && (
              <div>
                <label className={labelCls}>Ubicación / enlace</label>
                <input className={inputCls} value={ubicacion} onChange={(e) => setUbicacion(e.target.value)} placeholder="Dirección, sala o link" />
              </div>
            )}
            <div>
              <label className={labelCls}>Observaciones internas</label>
              <textarea className={inputCls} rows={2} value={observaciones} onChange={(e) => setObservaciones(e.target.value)} />
            </div>
          </section>

          {error && <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-xs text-rose-700">{error}</div>}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 bg-slate-50/60 px-5 py-4">
          <button onClick={onClose} className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#4FAEB2]">
            Cancelar
          </button>
          <button
            onClick={submit}
            disabled={saving}
            style={!saving ? { backgroundColor: TEAL } : undefined}
            onMouseEnter={(e) => { if (!saving) e.currentTarget.style.backgroundColor = TEAL_DARK; }}
            onMouseLeave={(e) => { if (!saving) e.currentTarget.style.backgroundColor = TEAL; }}
            className="rounded-xl px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
          >
            {saving ? "Guardando…" : "Guardar"}
          </button>
        </div>
      </div>
    </div>
  );
}
