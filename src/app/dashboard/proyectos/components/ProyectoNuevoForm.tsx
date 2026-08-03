"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { ClienteSearchSelect } from "@/app/dashboard/proyectos/components/ClienteSearchSelect";
import {
  ProyectoModuloSelector,
  type ProyectoModuloCatalogo as ModuloCatalogo,
} from "@/app/dashboard/proyectos/components/ProyectoModuloSelector";
import { FancySelect } from "@/app/dashboard/proyectos/components/FancySelect";
import {
  PROYECTO_DATOS_BRIEF_FIELDS,
  applyBriefFormToExisting,
  applySaasFormToExisting,
  type ProyectoModuloSnapshot,
} from "@/lib/proyectos/brief-data";

type Tipo = { id: string; nombre: string; codigo: string };
type Estado = { id: string; nombre: string };
type Cliente = { id: string; empresa?: string | null; nombre_contacto?: string | null };
type Usuario = { id: string; nombre?: string | null };

export type ProyectoNuevoFormProps = {
  variant?: "page" | "modal";
  onCreated: (id: string) => void;
  onCancel?: () => void;
};

const INPUT_CLS =
  "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";
const LABEL_CLS = "text-xs font-medium uppercase tracking-wide text-slate-500";

export default function ProyectoNuevoForm({
  variant = "page",
  onCreated,
  onCancel,
}: ProyectoNuevoFormProps) {
  const [tipos, setTipos] = useState<Tipo[]>([]);
  const [estados, setEstados] = useState<Estado[]>([]);
  const [clientes, setClientes] = useState<Cliente[]>([]);
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [modulosCatalogo, setModulosCatalogo] = useState<ModuloCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [tipoId, setTipoId] = useState("");
  const [estadoId, setEstadoId] = useState("");
  const [clienteId, setClienteId] = useState("");
  const [titulo, setTitulo] = useState("");
  const [descripcion, setDescripcion] = useState("");
  const [prioridad, setPrioridad] = useState("normal");
  const [rc, setRc] = useState("");
  const [rt, setRt] = useState("");
  const [fechaIngreso, setFechaIngreso] = useState(() => new Date().toISOString().slice(0, 10));
  const [fechaProm, setFechaProm] = useState("");
  const [brief, setBrief] = useState<Record<string, string>>({});
  const [briefLists, setBriefLists] = useState<Record<string, string[]>>({});
  const [saasEmpresaNombre, setSaasEmpresaNombre] = useState("");
  const [saasWhatsapp, setSaasWhatsapp] = useState("");
  const [saasObservaciones, setSaasObservaciones] = useState("");
  const [saasModuloIds, setSaasModuloIds] = useState<string[]>([]);

  const tipoCodigo = useMemo(() => tipos.find((t) => t.id === tipoId)?.codigo ?? "", [tipos, tipoId]);
  const esWeb = tipoCodigo === "web";
  const esSaas = tipoCodigo === "saas";
  const saasModulosSeleccionados = useMemo<ProyectoModuloSnapshot[]>(
    () =>
      modulosCatalogo
        .filter((modulo) => saasModuloIds.includes(modulo.id))
        .map((modulo) => ({ id: modulo.id, slug: modulo.slug, nombre: modulo.nombre })),
    [modulosCatalogo, saasModuloIds]
  );

  useEffect(() => {
    let cancel = false;
    (async () => {
      const [rT, rE, rC, rU, rM] = await Promise.all([
        fetchWithSupabaseSession("/api/proyectos/tipos", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/proyectos/estados", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/clientes", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/usuarios/empresa-activos", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/proyectos/modulos-catalogo", { cache: "no-store" }),
      ]);
      const jT = (await rT.json()) as { success?: boolean; data?: Tipo[] };
      const jE = (await rE.json()) as { success?: boolean; data?: Estado[] };
      const jC = (await rC.json()) as { success?: boolean; data?: Cliente[] };
      const jUsers = (await rU.json()) as { usuarios?: Usuario[] };
      const jModulos = (await rM.json()) as { success?: boolean; data?: ModuloCatalogo[] };
      if (cancel) return;
      if (jT.success && jT.data) {
        setTipos(jT.data);
        const web = jT.data.find((t) => t.codigo === "web");
        if (web) setTipoId(web.id);
      }
      if (jE.success && jE.data) setEstados(jE.data);
      if (jC.success && jC.data) setClientes(jC.data);
      setUsuarios(jUsers.usuarios ?? []);
      if (jModulos.success && jModulos.data) setModulosCatalogo(jModulos.data);
      setLoading(false);
    })();
    return () => {
      cancel = true;
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!tipoId) {
      setErr("Seleccioná un tipo de proyecto.");
      return;
    }
    if (!titulo.trim()) {
      setErr("El título es requerido.");
      return;
    }
    setSaving(true);
    setErr(null);
    const brief_data = esWeb
      ? applyBriefFormToExisting({}, brief, briefLists)
      : esSaas
        ? applySaasFormToExisting(
            {},
            {
              empresa_nombre: saasEmpresaNombre,
              whatsapp_contacto: saasWhatsapp,
              observaciones: saasObservaciones,
              modulos_necesarios: saasModulosSeleccionados,
            }
          )
        : {};

    const body: Record<string, unknown> = {
      tipo_id: tipoId,
      titulo,
      descripcion: descripcion || null,
      prioridad,
      cliente_id: clienteId || null,
      responsable_comercial_id: rc || null,
      responsable_tecnico_id: rt || null,
      fecha_ingreso: new Date(fechaIngreso + "T12:00:00").toISOString(),
      fecha_prometida: fechaProm ? new Date(fechaProm + "T12:00:00").toISOString() : null,
      brief_data,
    };
    if (estadoId) body.estado_id = estadoId;

    const res = await fetchWithSupabaseSession("/api/proyectos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const j = (await res.json()) as { success?: boolean; data?: { id?: string }; error?: string };
    setSaving(false);
    if (!res.ok || !j.success || !j.data?.id) {
      setErr(j.error ?? "No se pudo crear");
      return;
    }
    onCreated(j.data.id);
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center px-6 py-12 text-sm text-slate-500">
        Cargando…
      </div>
    );
  }

  const isModal = variant === "modal";

  return (
    <form
      onSubmit={onSubmit}
      className={
        isModal
          ? "flex h-full min-h-0 flex-col"
          : "space-y-6 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
      }
    >
      {err ? (
        <div
          className={
            isModal
              ? "mx-6 mt-4 rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-sm text-rose-700"
              : "rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2 text-sm text-rose-700"
          }
        >
          {err}
        </div>
      ) : null}

      <div
        className={
          isModal
            ? "min-h-0 flex-1 space-y-6 overflow-y-auto bg-slate-50/50 px-6 py-5"
            : "space-y-6"
        }
      >
        <div className={isModal ? "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm" : ""}>
          {isModal ? (
            <div className="mb-4 flex items-center gap-2">
              <span className="h-5 w-1 rounded-full bg-[#4FAEB2]" />
              <h2 className="text-sm font-semibold text-slate-900">Datos generales</h2>
            </div>
          ) : null}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block text-sm sm:col-span-2">
              <span className={LABEL_CLS}>Título</span>
              <input
                required
                className={INPUT_CLS}
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
                placeholder="Nombre del proyecto"
              />
            </label>
            <div className="block text-sm">
              <span className={LABEL_CLS}>
                Tipo <span className="text-rose-500">*</span>
              </span>
              <div className="mt-1.5">
                <FancySelect
                  ariaLabel="Tipo de proyecto"
                  placeholder="Seleccionar…"
                  value={tipoId}
                  onChange={setTipoId}
                  options={tipos.map((t) => ({ value: t.id, label: t.nombre }))}
                />
              </div>
            </div>
            <div className="block text-sm">
              <span className={LABEL_CLS}>Estado inicial (opcional)</span>
              <div className="mt-1.5">
                <FancySelect
                  ariaLabel="Estado inicial"
                  placeholder="Predeterminado de empresa"
                  value={estadoId}
                  onChange={setEstadoId}
                  options={[
                    { value: "", label: "Predeterminado de empresa" },
                    ...estados.map((s) => ({ value: s.id, label: s.nombre })),
                  ]}
                />
              </div>
            </div>
            <ClienteSearchSelect clientes={clientes} value={clienteId} onChange={setClienteId} />
            <div className="block text-sm">
              <span className={LABEL_CLS}>Prioridad</span>
              <div className="mt-1.5">
                <FancySelect
                  ariaLabel="Prioridad"
                  value={prioridad}
                  onChange={setPrioridad}
                  options={[
                    { value: "baja", label: "Baja" },
                    { value: "normal", label: "Media" },
                    { value: "alta", label: "Alta" },
                    { value: "urgente", label: "Urgente" },
                  ]}
                />
              </div>
            </div>
            <div className="block text-sm">
              <span className={LABEL_CLS}>Resp. comercial</span>
              <div className="mt-1.5">
                <FancySelect
                  ariaLabel="Responsable comercial"
                  placeholder="—"
                  value={rc}
                  onChange={setRc}
                  options={[
                    { value: "", label: "—" },
                    ...usuarios.map((u) => ({
                      value: u.id,
                      label: u.nombre ?? u.id.slice(0, 8),
                    })),
                  ]}
                />
              </div>
            </div>
            <div className="block text-sm">
              <span className={LABEL_CLS}>Resp. técnico</span>
              <div className="mt-1.5">
                <FancySelect
                  ariaLabel="Responsable técnico"
                  placeholder="—"
                  value={rt}
                  onChange={setRt}
                  options={[
                    { value: "", label: "—" },
                    ...usuarios.map((u) => ({
                      value: u.id,
                      label: u.nombre ?? u.id.slice(0, 8),
                    })),
                  ]}
                />
              </div>
            </div>
            <label className="block text-sm">
              <span className={LABEL_CLS}>Fecha ingreso</span>
              <input
                type="date"
                required
                className={INPUT_CLS}
                value={fechaIngreso}
                onChange={(e) => setFechaIngreso(e.target.value)}
              />
            </label>
            <label className="block text-sm">
              <span className={LABEL_CLS}>Fecha prometida</span>
              <input
                type="date"
                className={INPUT_CLS}
                value={fechaProm}
                onChange={(e) => setFechaProm(e.target.value)}
              />
            </label>
            <label className="block text-sm sm:col-span-2">
              <span className={LABEL_CLS}>Descripción breve</span>
              <textarea
                className={`${INPUT_CLS} min-h-[88px]`}
                rows={3}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
            </label>
          </div>
        </div>

        {esWeb ? (
          <div
            className={
              isModal
                ? "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                : "rounded-2xl border border-[#4FAEB2]/20 bg-[#4FAEB2]/5 p-5"
            }
          >
            <div className="mb-4 flex items-center gap-2">
              <span className="h-5 w-1 rounded-full bg-[#4FAEB2]" />
              <h2 className="text-sm font-semibold text-slate-900">Datos del proyecto (web)</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {PROYECTO_DATOS_BRIEF_FIELDS.map((f) => {
                if (f.kind === "checkbox") {
                  return (
                    <label
                      key={f.key}
                      className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 transition-colors hover:border-[#4FAEB2]/60"
                    >
                      <input
                        type="checkbox"
                        className="h-4 w-4 rounded border-slate-300 text-[#4FAEB2] accent-[#4FAEB2] focus:ring-[#4FAEB2]/30"
                        checked={brief[f.key] === "1"}
                        onChange={(e) =>
                          setBrief((b) => ({ ...b, [f.key]: e.target.checked ? "1" : "" }))
                        }
                      />
                      {f.label}
                    </label>
                  );
                }
                if (f.kind === "url_list") {
                  const urls = briefLists[f.key] ?? [];
                  const items = urls.length > 0 ? urls : [""];
                  return (
                    <div key={f.key} className="block text-sm sm:col-span-2">
                      <span className={LABEL_CLS}>{f.label}</span>
                      <div className="mt-1.5 space-y-2">
                        {items.map((url, idx) => (
                          <div key={idx} className="flex items-stretch gap-2">
                            <input
                              type="url"
                              className={`${INPUT_CLS} mt-0 flex-1`}
                              placeholder={f.placeholder ?? "https://..."}
                              value={url}
                              onChange={(e) => {
                                const next = [...items];
                                next[idx] = e.target.value;
                                setBriefLists((b) => ({ ...b, [f.key]: next }));
                              }}
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const next = items.filter((_, i) => i !== idx);
                                setBriefLists((b) => ({ ...b, [f.key]: next }));
                              }}
                              disabled={items.length === 1 && !items[0]}
                              aria-label={`Eliminar ${idx + 1}`}
                              title="Eliminar"
                              className="shrink-0 rounded-xl border border-slate-200 bg-white px-3 text-slate-400 transition-colors hover:border-rose-200 hover:bg-rose-50 hover:text-rose-500 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-slate-200 disabled:hover:bg-white disabled:hover:text-slate-400"
                            >
                              <svg
                                xmlns="http://www.w3.org/2000/svg"
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                aria-hidden="true"
                              >
                                <line x1="18" y1="6" x2="6" y2="18" />
                                <line x1="6" y1="6" x2="18" y2="18" />
                              </svg>
                            </button>
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() =>
                            setBriefLists((b) => ({
                              ...b,
                              [f.key]: [...(b[f.key] ?? []), ""],
                            }))
                          }
                          className="inline-flex items-center gap-1.5 rounded-xl border border-dashed border-[#4FAEB2]/40 bg-[#4FAEB2]/5 px-3 py-2 text-xs font-semibold text-[#3F8E91] transition-colors hover:border-[#4FAEB2] hover:bg-[#4FAEB2]/10"
                        >
                          <svg
                            xmlns="http://www.w3.org/2000/svg"
                            width="12"
                            height="12"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <line x1="12" y1="5" x2="12" y2="19" />
                            <line x1="5" y1="12" x2="19" y2="12" />
                          </svg>
                          {f.addLabel ?? "Agregar otro link"}
                        </button>
                      </div>
                    </div>
                  );
                }
                return (
                  <label key={f.key} className="block text-sm sm:col-span-2">
                    <span className={LABEL_CLS}>{f.label}</span>
                    <input
                      className={INPUT_CLS}
                      placeholder={f.placeholder}
                      value={brief[f.key] ?? ""}
                      onChange={(e) => setBrief((b) => ({ ...b, [f.key]: e.target.value }))}
                    />
                  </label>
                );
              })}
            </div>
          </div>
        ) : null}

        {esSaas ? (
          <div
            className={
              isModal
                ? "rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
                : "rounded-2xl border border-[#4FAEB2]/20 bg-[#4FAEB2]/5 p-5"
            }
          >
            <div className="mb-4 flex items-center gap-2">
              <span className="h-5 w-1 rounded-full bg-[#4FAEB2]" />
              <h2 className="text-sm font-semibold text-slate-900">Datos del ERP / SaaS</h2>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block text-sm">
                <span className={LABEL_CLS}>Nombre de la empresa</span>
                <input
                  className={INPUT_CLS}
                  value={saasEmpresaNombre}
                  onChange={(e) => setSaasEmpresaNombre(e.target.value)}
                />
              </label>
              <label className="block text-sm">
                <span className={LABEL_CLS}>WhatsApp contacto</span>
                <input
                  className={INPUT_CLS}
                  placeholder="+595..."
                  value={saasWhatsapp}
                  onChange={(e) => setSaasWhatsapp(e.target.value)}
                />
              </label>
              <div className="block text-sm sm:col-span-2">
                <span className={LABEL_CLS}>Módulos necesarios</span>
                <div className="mt-1.5">
                  <ProyectoModuloSelector
                    modulos={modulosCatalogo}
                    selectedIds={saasModuloIds}
                    onChange={setSaasModuloIds}
                  />
                </div>
              </div>
              <label className="block text-sm sm:col-span-2">
                <span className={LABEL_CLS}>Observaciones</span>
                <textarea
                  className={`${INPUT_CLS} min-h-[88px]`}
                  rows={3}
                  value={saasObservaciones}
                  onChange={(e) => setSaasObservaciones(e.target.value)}
                />
              </label>
            </div>
          </div>
        ) : null}
      </div>

      <div
        className={
          isModal
            ? "flex flex-wrap items-center justify-end gap-2 border-t border-slate-100 bg-white px-6 py-4"
            : "flex flex-wrap items-center justify-end gap-2 pt-2"
        }
      >
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#4FAEB2]"
          >
            Cancelar
          </button>
        ) : null}
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-[#4FAEB2] px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
        >
          {saving ? "Guardando…" : "Crear proyecto"}
        </button>
      </div>
    </form>
  );
}
