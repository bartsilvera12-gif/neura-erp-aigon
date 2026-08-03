"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { createBrowserClientForSchema } from "@/lib/supabase";

type Grupo = {
  id: string;
  nombre: string;
  descripcion: string | null;
  sort_order: number;
  created_at: string;
};
type Etapa = {
  id: string;
  grupo_id: string;
  nombre: string;
  descripcion: string | null;
  sort_order: number;
};
type Item = {
  id: string;
  etapa_id: string;
  texto: string;
  comentario: string | null;
  sort_order: number;
  completado: boolean;
  completado_por: string | null;
  completado_at: string | null;
  created_at: string;
};
type Archivo = {
  id: string;
  item_id: string;
  nombre: string;
  mime_type: string | null;
  size_bytes: number | null;
  uploaded_by: string | null;
  created_at: string;
};

type QAResp = {
  grupos: Grupo[];
  etapas: Etapa[];
  items: Item[];
  archivos: Archivo[];
};

type UsuarioMap = Record<string, string>;

type Props = {
  projectId: string;
  dataSchema: string;
  usuarios: Array<{ id: string; nombre?: string | null; email?: string | null }>;
};

const ACCENT = "#4FAEB2";

const IconCheck = ({ size = 12 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

const IconChevron = ({ open }: { open: boolean }) => (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className={`transition-transform duration-200 ${open ? "rotate-90" : ""}`}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

const IconPlus = ({ size = 13 }: { size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <line x1="12" y1="5" x2="12" y2="19" />
    <line x1="5" y1="12" x2="19" y2="12" />
  </svg>
);

const IconMore = () => (
  <svg width="15" height="15" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <circle cx="5" cy="12" r="1.6" />
    <circle cx="12" cy="12" r="1.6" />
    <circle cx="19" cy="12" r="1.6" />
  </svg>
);

const IconTrash = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
  </svg>
);

const IconPaperclip = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66L9.41 17.42a2 2 0 0 1-2.83-2.83l8.49-8.49" />
  </svg>
);

const IconMessage = () => (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
  </svg>
);

const IconDownload = () => (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

function fechaCorta(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "ahora";
  if (mins < 60) return `hace ${mins} min`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `hace ${hrs} h`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `hace ${days} d`;
  return d.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "2-digit" });
}

function formatBytes(n: number | null): string {
  if (n == null || n <= 0) return "";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB"];
  let val = n / 1024;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i += 1;
  }
  return `${val >= 10 || Number.isInteger(val) ? Math.round(val) : val.toFixed(1)} ${units[i]}`;
}

export default function ProyectoQATab({ projectId, dataSchema, usuarios }: Props) {
  const [data, setData] = useState<QAResp>({ grupos: [], etapas: [], items: [], archivos: [] });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [grupoActivoId, setGrupoActivoId] = useState<string | null>(null);
  const [etapasAbiertas, setEtapasAbiertas] = useState<Set<string>>(new Set());
  const [itemExpandidoId, setItemExpandidoId] = useState<string | null>(null);
  const [menuAbiertoId, setMenuAbiertoId] = useState<string | null>(null);

  const [nuevoGrupoOpen, setNuevoGrupoOpen] = useState(false);
  const [nuevoGrupoNombre, setNuevoGrupoNombre] = useState("");
  const [clonarOpen, setClonarOpen] = useState(false);
  const enviandoRef = useRef(false);

  const usuariosMap: UsuarioMap = useMemo(() => {
    const m: UsuarioMap = {};
    for (const u of usuarios) {
      const n = (u.nombre ?? "").trim() || (u.email ?? "").trim() || "Usuario";
      m[u.id] = n;
    }
    return m;
  }, [usuarios]);

  const cargar = useCallback(async () => {
    const res = await fetchWithSupabaseSession(`/api/proyectos/${projectId}/qa`, { cache: "no-store" });
    const j = (await res.json()) as { success?: boolean; data?: QAResp; error?: string };
    if (!res.ok || !j.success || !j.data) {
      setErr(j.error ?? "Error al cargar QA");
      setLoading(false);
      return;
    }
    setData(j.data);
    setErr(null);
    setLoading(false);
    setGrupoActivoId((prev) => {
      if (prev && j.data!.grupos.some((g) => g.id === prev)) return prev;
      return j.data!.grupos[0]?.id ?? null;
    });
  }, [projectId]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const cargarRef = useRef(cargar);
  useEffect(() => {
    cargarRef.current = cargar;
  }, [cargar]);

  // Realtime: cambios en las 5 tablas re-cargan.
  useEffect(() => {
    if (!projectId || !dataSchema) return;
    const sb = createBrowserClientForSchema(dataSchema);
    const filtro = `proyecto_id=eq.${projectId}`;
    const channel = sb
      .channel(`proyecto-qa:${projectId}`)
      .on("postgres_changes", { event: "*", schema: dataSchema, table: "proyecto_qa_grupos", filter: filtro }, () => void cargarRef.current?.())
      .on("postgres_changes", { event: "*", schema: dataSchema, table: "proyecto_qa_etapas", filter: filtro }, () => void cargarRef.current?.())
      .on("postgres_changes", { event: "*", schema: dataSchema, table: "proyecto_qa_items", filter: filtro }, () => void cargarRef.current?.())
      .on("postgres_changes", { event: "*", schema: dataSchema, table: "proyecto_qa_item_archivos", filter: filtro }, () => void cargarRef.current?.())
      .subscribe();
    return () => {
      void sb.removeChannel(channel);
    };
  }, [projectId, dataSchema]);

  useEffect(() => {
    function onClick() {
      setMenuAbiertoId(null);
    }
    window.addEventListener("click", onClick);
    return () => window.removeEventListener("click", onClick);
  }, []);

  const grupoActivo = data.grupos.find((g) => g.id === grupoActivoId) ?? null;
  const etapasDelGrupo = useMemo(
    () => data.etapas.filter((e) => e.grupo_id === grupoActivoId).sort((a, b) => a.sort_order - b.sort_order),
    [data.etapas, grupoActivoId]
  );
  const itemsPorEtapa = useMemo(() => {
    const m: Record<string, Item[]> = {};
    for (const it of data.items) {
      (m[it.etapa_id] ??= []).push(it);
    }
    for (const k of Object.keys(m)) m[k].sort((a, b) => a.sort_order - b.sort_order);
    return m;
  }, [data.items]);
  const archivosPorItem = useMemo(() => {
    const m: Record<string, Archivo[]> = {};
    for (const a of data.archivos) {
      (m[a.item_id] ??= []).push(a);
    }
    return m;
  }, [data.archivos]);

  function progresoGrupo(grupoId: string) {
    const etapaIds = new Set(data.etapas.filter((e) => e.grupo_id === grupoId).map((e) => e.id));
    const its = data.items.filter((it) => etapaIds.has(it.etapa_id));
    const done = its.filter((it) => it.completado).length;
    return { done, total: its.length };
  }

  function progresoEtapa(etapaId: string) {
    const its = itemsPorEtapa[etapaId] ?? [];
    return { done: its.filter((it) => it.completado).length, total: its.length };
  }

  const ultimoEvento = useMemo(() => {
    // El "último cambio" se aproxima por updated_at más reciente entre items completados.
    const conMarca = data.items.filter((it) => it.completado_at);
    if (conMarca.length === 0) return null;
    const last = conMarca.reduce((acc, it) =>
      new Date(it.completado_at!).getTime() > new Date(acc.completado_at!).getTime() ? it : acc
    );
    return last;
  }, [data.items]);

  // --- Acciones API ---
  // Llama al endpoint sin re-fetch — la UI ya se actualizó optimísticamente.
  // Si falla, ejecuta el rollback y muestra el error.
  async function mutate(url: string, opts: RequestInit, rollback: () => void) {
    const res = await fetchWithSupabaseSession(url, opts);
    const j = (await res.json().catch(() => null)) as { success?: boolean; error?: string; data?: unknown } | null;
    if (!res.ok || !j?.success) {
      rollback();
      setErr(j?.error ?? "Error");
      return null;
    }
    setErr(null);
    return j.data;
  }

  async function crearGrupo() {
    const n = nuevoGrupoNombre.trim();
    if (!n || enviandoRef.current) return;
    enviandoRef.current = true;
    setNuevoGrupoNombre("");
    setNuevoGrupoOpen(false);
    const tempId = `tmp_${crypto.randomUUID()}`;
    const optimista: Grupo = {
      id: tempId,
      nombre: n,
      descripcion: null,
      sort_order: (data.grupos[data.grupos.length - 1]?.sort_order ?? 0) + 10,
      created_at: new Date().toISOString(),
    };
    setData((prev) => ({ ...prev, grupos: [...prev.grupos, optimista] }));
    setGrupoActivoId(tempId);
    try {
      const res = await mutate(
        `/api/proyectos/${projectId}/qa/grupos`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: n }) },
        () => setData((prev) => ({ ...prev, grupos: prev.grupos.filter((g) => g.id !== tempId) }))
      );
      const nuevoId = (res as { id?: string } | null)?.id;
      if (nuevoId) {
        setData((prev) => ({
          ...prev,
          grupos: prev.grupos.map((g) => (g.id === tempId ? { ...g, id: nuevoId } : g)),
        }));
        setGrupoActivoId(nuevoId);
      }
    } finally {
      enviandoRef.current = false;
    }
  }

  async function renombrarGrupo(g: Grupo) {
    const n = window.prompt("Nuevo nombre del grupo:", g.nombre);
    if (!n || n.trim() === g.nombre) return;
    const nuevo = n.trim();
    const prev = g.nombre;
    setData((d) => ({ ...d, grupos: d.grupos.map((x) => (x.id === g.id ? { ...x, nombre: nuevo } : x)) }));
    await mutate(
      `/api/proyectos/${projectId}/qa/grupos/${g.id}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: nuevo }) },
      () => setData((d) => ({ ...d, grupos: d.grupos.map((x) => (x.id === g.id ? { ...x, nombre: prev } : x)) }))
    );
  }

  async function eliminarGrupo(g: Grupo) {
    if (!window.confirm(`¿Eliminar el grupo "${g.nombre}" con todas sus etapas e ítems?`)) return;
    const snapshot = data;
    setData((d) => ({
      ...d,
      grupos: d.grupos.filter((x) => x.id !== g.id),
      etapas: d.etapas.filter((e) => e.grupo_id !== g.id),
      items: d.items.filter((it) => !d.etapas.some((e) => e.grupo_id === g.id && e.id === it.etapa_id)),
    }));
    if (grupoActivoId === g.id) {
      setGrupoActivoId(data.grupos.find((x) => x.id !== g.id)?.id ?? null);
    }
    await mutate(
      `/api/proyectos/${projectId}/qa/grupos/${g.id}`,
      { method: "DELETE" },
      () => setData(snapshot)
    );
  }

  async function crearEtapa(grupoId: string, nombre: string) {
    if (!nombre.trim() || enviandoRef.current) return;
    enviandoRef.current = true;
    const tempId = `tmp_${crypto.randomUUID()}`;
    const lastSort =
      data.etapas.filter((e) => e.grupo_id === grupoId).slice(-1)[0]?.sort_order ?? 0;
    const optimista: Etapa = {
      id: tempId,
      grupo_id: grupoId,
      nombre: nombre.trim(),
      descripcion: null,
      sort_order: lastSort + 10,
    };
    setData((prev) => ({ ...prev, etapas: [...prev.etapas, optimista] }));
    setEtapasAbiertas((prev) => new Set(prev).add(tempId));
    try {
      const res = await mutate(
        `/api/proyectos/${projectId}/qa/etapas`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ grupo_id: grupoId, nombre: nombre.trim() }) },
        () => setData((prev) => ({ ...prev, etapas: prev.etapas.filter((e) => e.id !== tempId) }))
      );
      const nuevoId = (res as { id?: string } | null)?.id;
      if (nuevoId) {
        setData((prev) => ({
          ...prev,
          etapas: prev.etapas.map((e) => (e.id === tempId ? { ...e, id: nuevoId } : e)),
        }));
        setEtapasAbiertas((prev) => {
          const next = new Set(prev);
          next.delete(tempId);
          next.add(nuevoId);
          return next;
        });
      }
    } finally {
      enviandoRef.current = false;
    }
  }

  async function renombrarEtapa(e: Etapa) {
    const n = window.prompt("Nuevo nombre de la etapa:", e.nombre);
    if (!n || n.trim() === e.nombre) return;
    const nuevo = n.trim();
    const prev = e.nombre;
    setData((d) => ({ ...d, etapas: d.etapas.map((x) => (x.id === e.id ? { ...x, nombre: nuevo } : x)) }));
    await mutate(
      `/api/proyectos/${projectId}/qa/etapas/${e.id}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ nombre: nuevo }) },
      () => setData((d) => ({ ...d, etapas: d.etapas.map((x) => (x.id === e.id ? { ...x, nombre: prev } : x)) }))
    );
  }

  async function eliminarEtapa(e: Etapa) {
    if (!window.confirm(`¿Eliminar la etapa "${e.nombre}" con todos sus ítems?`)) return;
    const snapshot = data;
    setData((d) => ({
      ...d,
      etapas: d.etapas.filter((x) => x.id !== e.id),
      items: d.items.filter((it) => it.etapa_id !== e.id),
    }));
    await mutate(
      `/api/proyectos/${projectId}/qa/etapas/${e.id}`,
      { method: "DELETE" },
      () => setData(snapshot)
    );
  }

  async function crearItem(etapaId: string, texto: string) {
    if (!texto.trim() || enviandoRef.current) return;
    enviandoRef.current = true;
    const tempId = `tmp_${crypto.randomUUID()}`;
    const lastSort =
      data.items.filter((i) => i.etapa_id === etapaId).slice(-1)[0]?.sort_order ?? 0;
    const optimista: Item = {
      id: tempId,
      etapa_id: etapaId,
      texto: texto.trim(),
      comentario: null,
      sort_order: lastSort + 10,
      completado: false,
      completado_por: null,
      completado_at: null,
      created_at: new Date().toISOString(),
    };
    setData((prev) => ({ ...prev, items: [...prev.items, optimista] }));
    try {
      const res = await mutate(
        `/api/proyectos/${projectId}/qa/items`,
        { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ etapa_id: etapaId, texto: texto.trim() }) },
        () => setData((prev) => ({ ...prev, items: prev.items.filter((i) => i.id !== tempId) }))
      );
      const nuevoId = (res as { id?: string } | null)?.id;
      if (nuevoId) {
        setData((prev) => ({
          ...prev,
          items: prev.items.map((i) => (i.id === tempId ? { ...i, id: nuevoId } : i)),
        }));
      }
    } finally {
      enviandoRef.current = false;
    }
  }

  async function togglItem(it: Item) {
    if (it.id.startsWith("tmp_")) return; // Esperar al ID real
    const nuevo = !it.completado;
    const nowIso = new Date().toISOString();
    setData((d) => ({
      ...d,
      items: d.items.map((x) =>
        x.id === it.id
          ? {
              ...x,
              completado: nuevo,
              completado_at: nuevo ? nowIso : null,
              completado_por: nuevo ? x.completado_por : null,
            }
          : x
      ),
    }));
    await mutate(
      `/api/proyectos/${projectId}/qa/items/${it.id}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ completado: nuevo }) },
      () =>
        setData((d) => ({
          ...d,
          items: d.items.map((x) => (x.id === it.id ? it : x)),
        }))
    );
  }

  async function renombrarItem(it: Item) {
    const n = window.prompt("Editar texto del ítem:", it.texto);
    if (!n || n.trim() === it.texto) return;
    const nuevo = n.trim();
    const prev = it.texto;
    setData((d) => ({ ...d, items: d.items.map((x) => (x.id === it.id ? { ...x, texto: nuevo } : x)) }));
    await mutate(
      `/api/proyectos/${projectId}/qa/items/${it.id}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ texto: nuevo }) },
      () => setData((d) => ({ ...d, items: d.items.map((x) => (x.id === it.id ? { ...x, texto: prev } : x)) }))
    );
  }

  async function guardarComentario(it: Item, comentario: string) {
    if (it.id.startsWith("tmp_")) return;
    const prev = it.comentario;
    const nuevo = comentario.trim() === "" ? null : comentario;
    if (prev === nuevo) return;
    setData((d) => ({ ...d, items: d.items.map((x) => (x.id === it.id ? { ...x, comentario: nuevo } : x)) }));
    await mutate(
      `/api/proyectos/${projectId}/qa/items/${it.id}`,
      { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ comentario: nuevo ?? "" }) },
      () => setData((d) => ({ ...d, items: d.items.map((x) => (x.id === it.id ? { ...x, comentario: prev } : x)) }))
    );
  }

  async function eliminarItem(it: Item) {
    if (!window.confirm("¿Eliminar este ítem?")) return;
    const snapshot = data;
    setData((d) => ({
      ...d,
      items: d.items.filter((x) => x.id !== it.id),
      archivos: d.archivos.filter((a) => a.item_id !== it.id),
    }));
    await mutate(
      `/api/proyectos/${projectId}/qa/items/${it.id}`,
      { method: "DELETE" },
      () => setData(snapshot)
    );
  }

  async function subirArchivoItem(it: Item, file: File) {
    if (it.id.startsWith("tmp_")) return;
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetchWithSupabaseSession(
      `/api/proyectos/${projectId}/qa/items/${it.id}/archivos`,
      { method: "POST", body: fd }
    );
    const j = (await res.json().catch(() => null)) as { success?: boolean; data?: Archivo; error?: string } | null;
    if (!res.ok || !j?.success || !j.data) {
      setErr(j?.error ?? "No se pudo subir el archivo");
      return;
    }
    setErr(null);
    const nuevo = j.data;
    setData((d) => ({ ...d, archivos: [nuevo, ...d.archivos] }));
  }

  async function descargarArchivo(it: Item, a: Archivo) {
    const url = `/api/proyectos/${projectId}/qa/items/${it.id}/archivos/${a.id}?download=1`;
    const res = await fetchWithSupabaseSession(url, { cache: "no-store" });
    const j = (await res.json()) as { success?: boolean; data?: { url?: string }; error?: string };
    if (!res.ok || !j.success || !j.data?.url) {
      setErr(j.error ?? "No se pudo abrir el archivo");
      return;
    }
    const link = document.createElement("a");
    link.href = j.data.url;
    link.rel = "noopener";
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  async function eliminarArchivo(it: Item, a: Archivo) {
    if (!window.confirm(`¿Eliminar "${a.nombre}"?`)) return;
    const snapshot = data.archivos;
    setData((d) => ({ ...d, archivos: d.archivos.filter((x) => x.id !== a.id) }));
    await mutate(
      `/api/proyectos/${projectId}/qa/items/${it.id}/archivos/${a.id}`,
      { method: "DELETE" },
      () => setData((d) => ({ ...d, archivos: snapshot }))
    );
  }

  if (loading) {
    return <div className="p-6 text-sm text-slate-500">Cargando QA…</div>;
  }

  // Estado vacío: ningún grupo aún.
  if (data.grupos.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-[#4FAEB2]/10 text-[#3F8E91]">
          <IconCheck size={24} />
        </div>
        <div>
          <h3 className="text-base font-semibold text-slate-900">Checklists de QA</h3>
          <p className="mt-1 max-w-md text-sm text-slate-500">
            Organizá la verificación del proyecto en <strong>grupos</strong> (ej: Producción),
            con sus <strong>etapas</strong> e <strong>ítems</strong> tildables. Todo queda auditado.
          </p>
        </div>
        {err ? <p className="text-xs text-rose-600">{err}</p> : null}
        <div className="flex flex-wrap items-center justify-center gap-2">
          <NuevoGrupoInline
            open={nuevoGrupoOpen}
            value={nuevoGrupoNombre}
            onChange={setNuevoGrupoNombre}
            onOpen={() => setNuevoGrupoOpen(true)}
            onCancel={() => {
              setNuevoGrupoOpen(false);
              setNuevoGrupoNombre("");
            }}
            onConfirm={crearGrupo}
            cta="Crear primer grupo"
          />
          <button
            type="button"
            onClick={() => setClonarOpen(true)}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/50 hover:text-[#3F8E91]"
          >
            Clonar desde otro proyecto
          </button>
        </div>
        {clonarOpen ? (
          <ClonarModal
            projectId={projectId}
            onClose={() => setClonarOpen(false)}
            onDone={async () => {
              setClonarOpen(false);
              await cargar();
            }}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
      {/* Sidebar de grupos */}
      <aside className="rounded-2xl border border-slate-200 bg-white p-3 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
        <div className="flex items-center justify-between px-2 pb-2 pt-1">
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-500">
            Grupos
          </span>
          <button
            type="button"
            onClick={() => setClonarOpen(true)}
            className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-[#3F8E91]"
            title="Clonar desde otro proyecto"
            aria-label="Clonar QA"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <rect x="9" y="9" width="13" height="13" rx="2" />
              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
            </svg>
          </button>
        </div>
        <ul className="space-y-1">
          {data.grupos.map((g) => {
            const p = progresoGrupo(g.id);
            const active = g.id === grupoActivoId;
            const full = p.total > 0 && p.done === p.total;
            return (
              <li key={g.id} className="relative">
                <button
                  type="button"
                  onClick={() => setGrupoActivoId(g.id)}
                  className={`group flex w-full items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-left transition-colors ${
                    active ? "bg-[#4FAEB2]/10 text-[#3F8E91]" : "text-slate-700 hover:bg-slate-50"
                  }`}
                >
                  <span className="min-w-0 flex-1 truncate text-sm font-medium">{g.nombre}</span>
                  <span
                    className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${
                      full
                        ? "bg-emerald-100 text-emerald-700"
                        : active
                          ? "bg-white text-[#3F8E91]"
                          : "bg-slate-100 text-slate-600"
                    }`}
                  >
                    {p.total === 0 ? "0" : `${p.done}/${p.total}`}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuAbiertoId(menuAbiertoId === `g:${g.id}` ? null : `g:${g.id}`);
                  }}
                  className="absolute right-1 top-1.5 hidden rounded-md p-1 text-slate-400 hover:bg-white hover:text-slate-600 group-hover:block"
                  aria-label="Menú del grupo"
                >
                  <IconMore />
                </button>
                {menuAbiertoId === `g:${g.id}` ? (
                  <div className="absolute right-1 top-9 z-10 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuAbiertoId(null);
                        void renombrarGrupo(g);
                      }}
                      className="block w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50"
                    >
                      Renombrar
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuAbiertoId(null);
                        void eliminarGrupo(g);
                      }}
                      className="block w-full px-3 py-1.5 text-left text-rose-600 hover:bg-rose-50"
                    >
                      Eliminar
                    </button>
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        <div className="mt-2 border-t border-slate-100 pt-2">
          <NuevoGrupoInline
            open={nuevoGrupoOpen}
            value={nuevoGrupoNombre}
            onChange={setNuevoGrupoNombre}
            onOpen={() => setNuevoGrupoOpen(true)}
            onCancel={() => {
              setNuevoGrupoOpen(false);
              setNuevoGrupoNombre("");
            }}
            onConfirm={crearGrupo}
            cta="Nuevo grupo"
            compact
          />
        </div>
      </aside>

      {/* Panel principal */}
      <section className="space-y-4">
        {err ? (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
            {err}
          </div>
        ) : null}

        {grupoActivo ? (
          <>
            <header className="rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4FAEB2]">
                    QA · {grupoActivo.nombre}
                  </p>
                  <h2 className="mt-1 truncate text-lg font-semibold text-slate-900">
                    {etapasDelGrupo.length} {etapasDelGrupo.length === 1 ? "etapa" : "etapas"}
                  </h2>
                  {ultimoEvento && ultimoEvento.completado_at ? (
                    <p className="mt-1 text-xs text-slate-500">
                      Último cambio:{" "}
                      <span className="text-slate-700">
                        {usuariosMap[ultimoEvento.completado_por ?? ""] ?? "—"}
                      </span>{" "}
                      · {fechaCorta(ultimoEvento.completado_at)}
                    </p>
                  ) : null}
                </div>
                <ProgresoGrande {...progresoGrupo(grupoActivo.id)} />
              </div>
            </header>

            <div className="space-y-2.5">
              {etapasDelGrupo.map((e) => {
                const abierta = etapasAbiertas.has(e.id);
                const items = itemsPorEtapa[e.id] ?? [];
                const p = progresoEtapa(e.id);
                return (
                  <EtapaCard
                    key={e.id}
                    etapa={e}
                    abierta={abierta}
                    onToggle={() =>
                      setEtapasAbiertas((prev) => {
                        const next = new Set(prev);
                        if (next.has(e.id)) next.delete(e.id);
                        else next.add(e.id);
                        return next;
                      })
                    }
                    items={items}
                    archivosPorItem={archivosPorItem}
                    progreso={p}
                    usuariosMap={usuariosMap}
                    itemExpandidoId={itemExpandidoId}
                    setItemExpandidoId={setItemExpandidoId}
                    onRenombrar={() => void renombrarEtapa(e)}
                    onEliminar={() => void eliminarEtapa(e)}
                    onCrearItem={(t) => void crearItem(e.id, t)}
                    onToggleItem={(it) => void togglItem(it)}
                    onRenombrarItem={(it) => void renombrarItem(it)}
                    onEliminarItem={(it) => void eliminarItem(it)}
                    onGuardarComentario={(it, c) => void guardarComentario(it, c)}
                    onSubirArchivo={(it, f) => void subirArchivoItem(it, f)}
                    onDescargarArchivo={(it, a) => void descargarArchivo(it, a)}
                    onEliminarArchivo={(it, a) => void eliminarArchivo(it, a)}
                    menuAbiertoId={menuAbiertoId}
                    setMenuAbiertoId={setMenuAbiertoId}
                  />
                );
              })}
              <NuevaEtapaInline onCrear={(n) => void crearEtapa(grupoActivo.id, n)} />
            </div>
          </>
        ) : null}

        {clonarOpen ? (
          <ClonarModal
            projectId={projectId}
            onClose={() => setClonarOpen(false)}
            onDone={async () => {
              setClonarOpen(false);
              await cargar();
            }}
          />
        ) : null}
      </section>
    </div>
  );
}

function ProgresoGrande({ done, total }: { done: number; total: number }) {
  const pct = total === 0 ? 0 : Math.round((done / total) * 100);
  const full = total > 0 && done === total;
  return (
    <div className="flex shrink-0 items-center gap-3">
      <div className="text-right">
        <div className="text-xs font-medium uppercase tracking-wide text-slate-500">Progreso</div>
        <div className="mt-0.5 text-base font-semibold tabular-nums text-slate-900">
          {done}/{total} <span className="text-xs font-medium text-slate-500">· {pct}%</span>
        </div>
      </div>
      <div
        className={`relative h-12 w-12 shrink-0 rounded-full ${full ? "bg-emerald-100" : "bg-slate-100"}`}
        style={{
          background: full
            ? "#d1fae5"
            : `conic-gradient(${ACCENT} ${pct}%, #e2e8f0 ${pct}%)`,
        }}
      >
        <div className="absolute inset-1 flex items-center justify-center rounded-full bg-white text-[10px] font-semibold tabular-nums text-slate-700">
          {full ? <span className="text-emerald-600"><IconCheck size={14} /></span> : `${pct}%`}
        </div>
      </div>
    </div>
  );
}

function NuevoGrupoInline({
  open,
  value,
  onChange,
  onOpen,
  onCancel,
  onConfirm,
  cta,
  compact,
}: {
  open: boolean;
  value: string;
  onChange: (v: string) => void;
  onOpen: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  cta: string;
  compact?: boolean;
}) {
  if (!open) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={`inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-3 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-[#3F8E91] ${compact ? "w-full justify-center" : ""}`}
      >
        <IconPlus />
        {cta}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1">
      <input
        autoFocus
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") onConfirm();
          if (e.key === "Escape") onCancel();
        }}
        placeholder="Nombre del grupo…"
        className="flex-1 rounded-lg border border-[#4FAEB2]/40 bg-white px-3 py-2 text-sm text-slate-900 shadow-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
      />
      <button
        type="button"
        onClick={onConfirm}
        className="rounded-lg bg-[#4FAEB2] px-3 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#3F8E91]"
      >
        OK
      </button>
      <button
        type="button"
        onClick={onCancel}
        className="rounded-lg px-2 py-2 text-sm text-slate-500 hover:bg-slate-100"
      >
        ✕
      </button>
    </div>
  );
}

function NuevaEtapaInline({ onCrear }: { onCrear: (n: string) => void }) {
  const [open, setOpen] = useState(false);
  const [n, setN] = useState("");
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-slate-300 bg-white px-3 py-2.5 text-sm font-medium text-slate-500 transition-colors hover:border-[#4FAEB2]/50 hover:text-[#3F8E91]"
      >
        <IconPlus />
        Nueva etapa
      </button>
    );
  }
  return (
    <div className="flex items-center gap-1 rounded-2xl border border-[#4FAEB2]/40 bg-white p-1.5">
      <input
        autoFocus
        value={n}
        onChange={(e) => setN(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            onCrear(n);
            setN("");
            setOpen(false);
          }
          if (e.key === "Escape") {
            setOpen(false);
            setN("");
          }
        }}
        placeholder="Nombre de la etapa (ej: Diseño, Desarrollo, Testing)…"
        className="flex-1 rounded-lg bg-white px-3 py-1.5 text-sm text-slate-900 focus:outline-none"
      />
      <button
        type="button"
        onClick={() => {
          onCrear(n);
          setN("");
          setOpen(false);
        }}
        className="rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-sm font-medium text-white hover:bg-[#3F8E91]"
      >
        Agregar
      </button>
      <button
        type="button"
        onClick={() => {
          setOpen(false);
          setN("");
        }}
        className="rounded-lg px-2 py-1.5 text-sm text-slate-500 hover:bg-slate-100"
      >
        ✕
      </button>
    </div>
  );
}

type EtapaCardProps = {
  etapa: Etapa;
  abierta: boolean;
  onToggle: () => void;
  items: Item[];
  archivosPorItem: Record<string, Archivo[]>;
  progreso: { done: number; total: number };
  usuariosMap: UsuarioMap;
  itemExpandidoId: string | null;
  setItemExpandidoId: (id: string | null) => void;
  onRenombrar: () => void;
  onEliminar: () => void;
  onCrearItem: (texto: string) => void;
  onToggleItem: (it: Item) => void;
  onRenombrarItem: (it: Item) => void;
  onEliminarItem: (it: Item) => void;
  onGuardarComentario: (it: Item, c: string) => void;
  onSubirArchivo: (it: Item, f: File) => void;
  onDescargarArchivo: (it: Item, a: Archivo) => void;
  onEliminarArchivo: (it: Item, a: Archivo) => void;
  menuAbiertoId: string | null;
  setMenuAbiertoId: (id: string | null) => void;
};

function EtapaCard(props: EtapaCardProps) {
  const {
    etapa,
    abierta,
    onToggle,
    items,
    archivosPorItem,
    progreso,
    usuariosMap,
    itemExpandidoId,
    setItemExpandidoId,
    onRenombrar,
    onEliminar,
    onCrearItem,
    onToggleItem,
    onRenombrarItem,
    onEliminarItem,
    onGuardarComentario,
    onSubirArchivo,
    onDescargarArchivo,
    onEliminarArchivo,
    menuAbiertoId,
    setMenuAbiertoId,
  } = props;

  const [nuevoItem, setNuevoItem] = useState("");
  const pct = progreso.total === 0 ? 0 : Math.round((progreso.done / progreso.total) * 100);
  const full = progreso.total > 0 && progreso.done === progreso.total;

  return (
    <div className="rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-md">
      <div className="group flex items-center gap-2 px-4 py-3">
        <button
          type="button"
          onClick={onToggle}
          className="flex min-w-0 flex-1 items-center gap-2.5 text-left"
        >
          <span className="text-slate-400"><IconChevron open={abierta} /></span>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm font-semibold text-slate-900">{etapa.nombre}</span>
            <span className="mt-1 flex items-center gap-2">
              <span className="h-1 flex-1 overflow-hidden rounded-full bg-slate-100">
                <span
                  className={`block h-full rounded-full transition-all duration-300 ${full ? "bg-emerald-500" : ""}`}
                  style={{ width: `${pct}%`, background: full ? undefined : ACCENT }}
                />
              </span>
              <span
                className={`shrink-0 text-[11px] font-semibold tabular-nums ${full ? "text-emerald-600" : "text-slate-500"}`}
              >
                {progreso.done}/{progreso.total}
              </span>
            </span>
          </span>
        </button>
        <div className="relative">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setMenuAbiertoId(menuAbiertoId === `e:${etapa.id}` ? null : `e:${etapa.id}`);
            }}
            className="rounded-md p-1.5 text-slate-400 opacity-0 transition-opacity hover:bg-slate-100 hover:text-slate-600 group-hover:opacity-100"
            aria-label="Menú de la etapa"
          >
            <IconMore />
          </button>
          {menuAbiertoId === `e:${etapa.id}` ? (
            <div className="absolute right-0 top-9 z-10 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">
              <button type="button" onClick={(e) => { e.stopPropagation(); setMenuAbiertoId(null); onRenombrar(); }} className="block w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50">
                Renombrar
              </button>
              <button type="button" onClick={(e) => { e.stopPropagation(); setMenuAbiertoId(null); onEliminar(); }} className="block w-full px-3 py-1.5 text-left text-rose-600 hover:bg-rose-50">
                Eliminar etapa
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {abierta ? (
        <div className="rounded-b-2xl border-t border-slate-100 bg-slate-50/50 px-2 py-2">
          {items.length === 0 ? (
            <p className="px-3 py-2 text-xs text-slate-400">Sin ítems todavía. Agregá uno abajo ↓</p>
          ) : (
            <ul className="space-y-0.5">
              {items.map((it) => (
                <ItemRow
                  key={it.id}
                  it={it}
                  archivos={archivosPorItem[it.id] ?? []}
                  expandido={itemExpandidoId === it.id}
                  onExpand={() => setItemExpandidoId(itemExpandidoId === it.id ? null : it.id)}
                  usuariosMap={usuariosMap}
                  menuAbiertoId={menuAbiertoId}
                  setMenuAbiertoId={setMenuAbiertoId}
                  onToggle={() => onToggleItem(it)}
                  onRenombrar={() => onRenombrarItem(it)}
                  onEliminar={() => onEliminarItem(it)}
                  onGuardarComentario={(c) => onGuardarComentario(it, c)}
                  onSubirArchivo={(f) => onSubirArchivo(it, f)}
                  onDescargarArchivo={(a) => onDescargarArchivo(it, a)}
                  onEliminarArchivo={(a) => onEliminarArchivo(it, a)}
                />
              ))}
            </ul>
          )}
          <div className="mt-1 flex items-center gap-1.5 px-2 py-1.5">
            <span className="text-slate-300"><IconPlus size={12} /></span>
            <input
              value={nuevoItem}
              onChange={(e) => setNuevoItem(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && nuevoItem.trim()) {
                  onCrearItem(nuevoItem);
                  setNuevoItem("");
                }
              }}
              placeholder="Agregar ítem y Enter…"
              className="flex-1 bg-transparent px-1 py-1 text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none"
            />
            {nuevoItem.trim() ? (
              <button
                type="button"
                onClick={() => {
                  onCrearItem(nuevoItem);
                  setNuevoItem("");
                }}
                className="rounded-md bg-[#4FAEB2] px-2.5 py-1 text-xs font-medium text-white hover:bg-[#3F8E91]"
              >
                Agregar
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}

type ItemRowProps = {
  it: Item;
  archivos: Archivo[];
  expandido: boolean;
  onExpand: () => void;
  usuariosMap: UsuarioMap;
  menuAbiertoId: string | null;
  setMenuAbiertoId: (id: string | null) => void;
  onToggle: () => void;
  onRenombrar: () => void;
  onEliminar: () => void;
  onGuardarComentario: (c: string) => void;
  onSubirArchivo: (f: File) => void;
  onDescargarArchivo: (a: Archivo) => void;
  onEliminarArchivo: (a: Archivo) => void;
};

function ItemRow(props: ItemRowProps) {
  const {
    it, archivos, expandido, onExpand, usuariosMap,
    menuAbiertoId, setMenuAbiertoId,
    onToggle, onRenombrar, onEliminar, onGuardarComentario,
    onSubirArchivo, onDescargarArchivo, onEliminarArchivo,
  } = props;

  const [comentarioDraft, setComentarioDraft] = useState(it.comentario ?? "");
  const fileRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setComentarioDraft(it.comentario ?? "");
  }, [it.comentario]);

  const responsable = usuariosMap[it.completado_por ?? ""] ?? null;
  const tieneExtras = (it.comentario && it.comentario.trim().length > 0) || archivos.length > 0;

  return (
    <li className="group rounded-lg transition-colors hover:bg-white">
      <div className="flex items-start gap-2.5 px-2 py-1.5">
        <button
          type="button"
          onClick={onToggle}
          aria-label={it.completado ? "Desmarcar" : "Marcar como verificado"}
          className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-all duration-150 ${
            it.completado
              ? "border-[#4FAEB2] bg-[#4FAEB2] text-white scale-100"
              : "border-slate-300 bg-white text-transparent hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/5"
          }`}
        >
          <IconCheck />
        </button>
        <button
          type="button"
          onClick={onExpand}
          className="min-w-0 flex-1 text-left"
        >
          <p
            className={`text-sm transition-colors ${
              it.completado ? "text-slate-400 line-through" : "text-slate-800"
            }`}
          >
            {it.texto}
          </p>
          <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
            {it.completado && responsable ? (
              <span title={it.completado_at ? new Date(it.completado_at).toLocaleString("es-PY") : ""}>
                ✓ {responsable} · {fechaCorta(it.completado_at)}
              </span>
            ) : null}
            {tieneExtras ? (
              <span className="flex items-center gap-2">
                {it.comentario && it.comentario.trim() ? (
                  <span className="inline-flex items-center gap-0.5 text-slate-400">
                    <IconMessage /> 1
                  </span>
                ) : null}
                {archivos.length > 0 ? (
                  <span className="inline-flex items-center gap-0.5 text-slate-400">
                    <IconPaperclip /> {archivos.length}
                  </span>
                ) : null}
              </span>
            ) : null}
          </div>
        </button>
        <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-[#3F8E91]"
            title="Adjuntar archivo"
            aria-label="Adjuntar archivo"
          >
            <IconPaperclip />
          </button>
          <input
            ref={fileRef}
            type="file"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              e.target.value = "";
              if (f) onSubirArchivo(f);
            }}
          />
          <div className="relative">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuAbiertoId(menuAbiertoId === `i:${it.id}` ? null : `i:${it.id}`);
              }}
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Menú del ítem"
            >
              <IconMore />
            </button>
            {menuAbiertoId === `i:${it.id}` ? (
              <div className="absolute right-0 top-full z-30 mt-1 w-40 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 text-sm shadow-lg">
                <button type="button" onClick={(e) => { e.stopPropagation(); setMenuAbiertoId(null); onRenombrar(); }} className="block w-full px-3 py-1.5 text-left text-slate-700 hover:bg-slate-50">
                  Editar texto
                </button>
                <button type="button" onClick={(e) => { e.stopPropagation(); setMenuAbiertoId(null); onEliminar(); }} className="block w-full px-3 py-1.5 text-left text-rose-600 hover:bg-rose-50">
                  Eliminar
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {expandido ? (
        <div className="ml-8 mr-2 mb-2 space-y-2 rounded-xl border border-slate-100 bg-white p-3">
          <div>
            <label className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
              Comentario
            </label>
            <textarea
              value={comentarioDraft}
              onChange={(e) => setComentarioDraft(e.target.value)}
              onBlur={() => {
                if ((it.comentario ?? "") !== comentarioDraft) onGuardarComentario(comentarioDraft);
              }}
              rows={2}
              placeholder="Nota opcional (ej: verificado en staging)…"
              className="mt-1 w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm text-slate-800 placeholder:text-slate-400 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/15"
            />
          </div>
          {archivos.length > 0 ? (
            <div>
              <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-500">
                Adjuntos ({archivos.length})
              </p>
              <ul className="mt-1 space-y-1">
                {archivos.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-center gap-2 rounded-lg border border-slate-100 bg-slate-50 px-2.5 py-1.5 text-xs"
                  >
                    <span className="text-slate-400"><IconPaperclip /></span>
                    <span className="min-w-0 flex-1 truncate text-slate-700">{a.nombre}</span>
                    {a.size_bytes ? (
                      <span className="shrink-0 text-[10px] tabular-nums text-slate-400">
                        {formatBytes(a.size_bytes)}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      onClick={() => onDescargarArchivo(a)}
                      className="rounded p-1 text-slate-400 hover:bg-white hover:text-[#3F8E91]"
                      aria-label="Descargar"
                      title="Descargar"
                    >
                      <IconDownload />
                    </button>
                    <button
                      type="button"
                      onClick={() => onEliminarArchivo(a)}
                      className="rounded p-1 text-slate-400 hover:bg-white hover:text-rose-600"
                      aria-label="Eliminar adjunto"
                      title="Eliminar"
                    >
                      <IconTrash />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function ClonarModal({
  projectId,
  onClose,
  onDone,
}: {
  projectId: string;
  onClose: () => void;
  onDone: () => void;
}) {
  const [proyectos, setProyectos] = useState<Array<{ id: string; titulo: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [eligiendo, setEligiendo] = useState<string>("");
  const [working, setWorking] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const res = await fetchWithSupabaseSession(
        `/api/proyectos/${projectId}/qa/proyectos-disponibles`,
        { cache: "no-store" }
      );
      const j = (await res.json()) as { success?: boolean; data?: Array<{ id: string; titulo: string }>; error?: string };
      if (!res.ok || !j.success) setErr(j.error ?? "Error");
      else setProyectos(j.data ?? []);
      setLoading(false);
    })();
  }, [projectId]);

  async function confirmar() {
    if (!eligiendo) return;
    setWorking(true);
    const res = await fetchWithSupabaseSession(`/api/proyectos/${projectId}/qa/clonar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ from_proyecto_id: eligiendo }),
    });
    const j = (await res.json()) as { success?: boolean; error?: string };
    setWorking(false);
    if (!res.ok || !j.success) {
      setErr(j.error ?? "Error al clonar");
      return;
    }
    onDone();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4" onClick={onClose}>
      <div
        className="w-full max-w-md rounded-2xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-semibold text-slate-900">Clonar QA desde otro proyecto</h3>
        <p className="mt-1 text-sm text-slate-500">
          Se copiarán los grupos, etapas e ítems (sin marcar). Los adjuntos y comentarios no se copian.
        </p>
        {loading ? (
          <p className="mt-4 text-sm text-slate-500">Cargando proyectos disponibles…</p>
        ) : proyectos.length === 0 ? (
          <p className="mt-4 text-sm text-slate-500">
            No hay otros proyectos con QA configurado todavía.
          </p>
        ) : (
          <select
            value={eligiendo}
            onChange={(e) => setEligiendo(e.target.value)}
            className="mt-4 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/15"
          >
            <option value="">Elegí un proyecto…</option>
            {proyectos.map((p) => (
              <option key={p.id} value={p.id}>
                {p.titulo}
              </option>
            ))}
          </select>
        )}
        {err ? <p className="mt-2 text-xs text-rose-600">{err}</p> : null}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-sm text-slate-700 hover:bg-slate-50"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!eligiendo || working}
            onClick={confirmar}
            className="rounded-xl bg-[#4FAEB2] px-3.5 py-2 text-sm font-medium text-white shadow-sm hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {working ? "Clonando…" : "Clonar"}
          </button>
        </div>
      </div>
    </div>
  );
}
