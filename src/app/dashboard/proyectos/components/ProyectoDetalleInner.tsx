"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, X } from "lucide-react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import { createBrowserClientForSchema } from "@/lib/supabase";
import {
  ProyectoModuloSelector,
  type ProyectoModuloCatalogo as ModuloCatalogo,
} from "@/app/dashboard/proyectos/components/ProyectoModuloSelector";
import { FancySelect } from "@/app/dashboard/proyectos/components/FancySelect";
import ProyectoQATab from "@/app/dashboard/proyectos/components/ProyectoQATab";
import {
  PROYECTO_DATOS_BRIEF_FIELDS,
  applyBriefFormToExisting,
  applySaasFormToExisting,
  coalesceBriefData,
  formatFechaPyFull,
  formatFechaPySolo,
  readBriefUrlList,
  readSaasBriefData,
  type ProyectoModuloSnapshot,
  type ProyectoSaasBriefForm,
} from "@/lib/proyectos/brief-data";

export type ProyectoCambioCliente = {
  id: string;
  nro: 1 | 2 | 3;
  realizado: boolean;
  comentario: string | null;
  realizado_at: string | null;
  realizado_por: string | null;
  realizado_por_nombre: string | null;
};

export type DetalleResp = {
  proyecto: Record<string, unknown> & {
    id: string;
    titulo?: string;
    brief_data?: Record<string, unknown>;
    tipo_id?: string;
    estado_id?: string;
    proyecto_tipo?: { codigo?: string };
    proyecto_estado?: { codigo?: string };
    estado_actual_desde?: string | null;
  };
  historial: Record<string, unknown>[];
  sla: Record<string, unknown>;
  tareas: Record<string, unknown>[];
  comentarios: Record<string, unknown>[];
  archivos: Record<string, unknown>[];
  cambios?: ProyectoCambioCliente[];
  avance_pct: number | null;
  current_user_id?: string | null;
  current_user_rol?: string | null;
};

const ESTADO_ENTREGADO_CODIGO = "publicado";
const POSTENTREGA_PERIODO_DIAS = 30;
const CAMBIOS_SLOTS = [1, 2, 3] as const;

type UsuarioActivo = { id: string; nombre?: string | null; email?: string | null };

const TAB_IDS = [
  "resumen",
  "datos",
  "tareas",
  "qa",
  "comentarios",
  "archivos",
  "cambios",
  "historial",
] as const;
export type TabId = (typeof TAB_IDS)[number];

const TAB_LABELS: Record<TabId, string> = {
  resumen: "Resumen",
  datos: "Datos",
  tareas: "Tareas",
  qa: "QA",
  comentarios: "Comentarios",
  archivos: "Archivos",
  cambios: "Cambios",
  historial: "Historial",
};

function normalizeTab(raw: string | null | undefined): TabId {
  if (!raw) return "resumen";
  if (raw === "brief") return "datos";
  return (TAB_IDS as readonly string[]).includes(raw) ? (raw as TabId) : "resumen";
}

function clienteNombre(p: Record<string, unknown>): string {
  const c = p.cliente as { empresa?: string | null; nombre_contacto?: string | null } | undefined;
  if (!c) return "—";
  const a = (c.empresa ?? "").trim();
  const b = (c.nombre_contacto ?? "").trim();
  if (a && b) return `${a} · ${b}`;
  return a || b || "—";
}

function prioridadLabel(value: unknown): string {
  if (value === "normal") return "Media";
  if (value === "baja") return "Baja";
  if (value === "alta") return "Alta";
  if (value === "urgente") return "Urgente";
  return value == null ? "—" : String(value);
}

const TAREA_ESTADO_OPTIONS = [
  { value: "pendiente", label: "Pendiente" },
  { value: "en_proceso", label: "En proceso" },
  { value: "completada", label: "Completada" },
  { value: "bloqueada", label: "Bloqueada" },
] as const;

const TAREA_ESTADO_TONE: Record<
  string,
  { dot: string; chip: string; ring: string }
> = {
  pendiente: {
    dot: "bg-slate-400",
    chip: "border-slate-200 bg-slate-50 text-slate-600",
    ring: "ring-slate-200/60",
  },
  en_proceso: {
    dot: "bg-amber-500",
    chip: "border-amber-200 bg-amber-50 text-amber-700",
    ring: "ring-amber-200/60",
  },
  completada: {
    dot: "bg-emerald-500",
    chip: "border-emerald-200 bg-emerald-50 text-emerald-700",
    ring: "ring-emerald-200/60",
  },
  bloqueada: {
    dot: "bg-rose-500",
    chip: "border-rose-200 bg-rose-50 text-rose-700",
    ring: "ring-rose-200/60",
  },
};

function tareaEstadoLabel(value: unknown): string {
  const match = TAREA_ESTADO_OPTIONS.find((opt) => opt.value === value);
  return match ? match.label : "—";
}

function formatFechaRelativa(iso?: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const t = d.getTime();
  if (!Number.isFinite(t)) return "—";
  const diffMs = Date.now() - t;
  const sec = Math.round(diffMs / 1000);
  if (sec < 45) return "hace instantes";
  const min = Math.round(sec / 60);
  if (min < 60) return `hace ${min} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const days = Math.round(h / 24);
  if (days < 7) return `hace ${days} d`;
  if (days < 30) return `hace ${Math.round(days / 7)} sem`;
  if (days < 365) return `hace ${Math.round(days / 30)} m`;
  return `hace ${Math.round(days / 365)} a`;
}

// Debe coincidir con PROYECTOS_ARCHIVO_MAX_BYTES del helper server-only (no importable acá).
const ARCHIVO_MAX_BYTES = 50 * 1024 * 1024;

function formatBytes(bytes: unknown): string {
  const n = typeof bytes === "number" ? bytes : Number(bytes);
  if (!Number.isFinite(n) || n <= 0) return "—";
  if (n < 1024) return `${n} B`;
  const units = ["KB", "MB", "GB", "TB"];
  let val = n / 1024;
  let i = 0;
  while (val >= 1024 && i < units.length - 1) {
    val /= 1024;
    i += 1;
  }
  return `${val >= 10 || Number.isInteger(val) ? Math.round(val) : val.toFixed(1)} ${units[i]}`;
}

function isPreviewableMime(mime: unknown): boolean {
  if (typeof mime !== "string" || !mime) return false;
  const m = mime.toLowerCase();
  if (m === "application/pdf") return true;
  return ["image/", "text/", "audio/", "video/"].some((p) => m.startsWith(p));
}

type ArchivoCategoria =
  | "pdf"
  | "imagen"
  | "video"
  | "audio"
  | "excel"
  | "documento"
  | "comprimido"
  | "otro";

const ARCHIVO_CATEGORIAS_ORDEN: { key: ArchivoCategoria; label: string }[] = [
  { key: "pdf", label: "PDF" },
  { key: "imagen", label: "Imágenes" },
  { key: "video", label: "Videos" },
  { key: "audio", label: "Audio" },
  { key: "excel", label: "Hojas de cálculo" },
  { key: "documento", label: "Documentos" },
  { key: "comprimido", label: "Comprimidos" },
  { key: "otro", label: "Otros" },
];

const ARCHIVO_CATEGORIA_COLOR: Record<ArchivoCategoria, { bg: string; text: string }> = {
  pdf: { bg: "bg-rose-50", text: "text-rose-500" },
  imagen: { bg: "bg-violet-50", text: "text-violet-500" },
  video: { bg: "bg-amber-50", text: "text-amber-600" },
  audio: { bg: "bg-fuchsia-50", text: "text-fuchsia-500" },
  excel: { bg: "bg-emerald-50", text: "text-emerald-600" },
  documento: { bg: "bg-sky-50", text: "text-sky-600" },
  comprimido: { bg: "bg-orange-50", text: "text-orange-600" },
  otro: { bg: "bg-slate-100", text: "text-slate-500" },
};

function extensionArchivo(nombre: unknown): string {
  if (typeof nombre !== "string") return "";
  const m = nombre.toLowerCase().match(/\.([a-z0-9]+)$/);
  return m ? m[1] : "";
}

function categoriaArchivo(nombre: unknown, mime: unknown): ArchivoCategoria {
  const m = typeof mime === "string" ? mime.toLowerCase() : "";
  const ext = extensionArchivo(nombre);
  if (
    m.startsWith("image/") ||
    ["jpg", "jpeg", "png", "gif", "webp", "svg", "bmp", "heic", "heif", "tif", "tiff", "avif", "ico"].includes(ext)
  )
    return "imagen";
  if (
    m.startsWith("video/") ||
    ["mp4", "mov", "avi", "mkv", "webm", "wmv", "flv", "m4v", "mpeg", "mpg"].includes(ext)
  )
    return "video";
  if (
    m.startsWith("audio/") ||
    ["mp3", "wav", "ogg", "m4a", "flac", "aac", "opus", "wma"].includes(ext)
  )
    return "audio";
  if (m === "application/pdf" || ext === "pdf") return "pdf";
  if (
    m.includes("spreadsheet") ||
    m.includes("excel") ||
    m === "text/csv" ||
    ["xls", "xlsx", "xlsm", "xlsb", "csv", "ods"].includes(ext)
  )
    return "excel";
  if (
    m.includes("zip") ||
    m.includes("compressed") ||
    m.includes("x-tar") ||
    m.includes("x-7z") ||
    m.includes("x-rar") ||
    ["zip", "rar", "7z", "tar", "gz", "tgz", "bz2", "xz"].includes(ext)
  )
    return "comprimido";
  if (
    m.includes("word") ||
    m.includes("opendocument.text") ||
    m.startsWith("text/") ||
    ["doc", "docx", "txt", "rtf", "odt", "md", "pages"].includes(ext)
  )
    return "documento";
  return "otro";
}

const IconTareaUser = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
    <circle cx="12" cy="7" r="4" />
  </svg>
);

const IconTareaRefresh = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="23 4 23 10 17 10" />
    <polyline points="1 20 1 14 7 14" />
    <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10" />
    <path d="M20.49 15a9 9 0 0 1-14.85 3.36L1 14" />
  </svg>
);

const IconTareaCalendar = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="11"
    height="11"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
    <line x1="16" y1="2" x2="16" y2="6" />
    <line x1="8" y1="2" x2="8" y2="6" />
    <line x1="3" y1="10" x2="21" y2="10" />
  </svg>
);

const IconPencil = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4 12.5-12.5z" />
  </svg>
);

const IconTrash = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M9 6V4a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2" />
  </svg>
);

const IconSpinner = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    className="animate-spin"
  >
    <path d="M21 12a9 9 0 1 1-6.219-8.56" />
  </svg>
);

const IconUpload = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="15"
    height="15"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="17 8 12 3 7 8" />
    <line x1="12" y1="3" x2="12" y2="15" />
  </svg>
);

const IconDownload = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
    <polyline points="7 10 12 15 17 10" />
    <line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

const IconEye = () => (
  <svg
    xmlns="http://www.w3.org/2000/svg"
    width="13"
    height="13"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <path d="M1 12s4-7 11-7 11 7 11 7-4 7-11 7-11-7-11-7z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

const IconCheckSquare = () => (
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
    <polyline points="9 11 12 14 22 4" />
    <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
  </svg>
);

// Ícono por tipo de archivo (categoría). Líneas finas, estilo coherente con el resto del set.
function ArchivoTipoIcon({ cat }: { cat: ArchivoCategoria }) {
  const common = {
    xmlns: "http://www.w3.org/2000/svg",
    width: 18,
    height: 18,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true,
  };
  switch (cat) {
    case "imagen":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <circle cx="8.5" cy="8.5" r="1.6" />
          <path d="m21 15-4.2-4.2a2 2 0 0 0-2.8 0L4 21" />
        </svg>
      );
    case "video":
      return (
        <svg {...common}>
          <rect x="2" y="4" width="20" height="16" rx="2.5" />
          <path d="m10 9 5 3-5 3z" fill="currentColor" stroke="none" />
        </svg>
      );
    case "audio":
      return (
        <svg {...common}>
          <path d="M9 18V6l11-2v12" />
          <circle cx="6" cy="18" r="2.6" />
          <circle cx="17" cy="16" r="2.6" />
        </svg>
      );
    case "pdf":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
          <line x1="8.5" y1="13" x2="15.5" y2="13" />
          <line x1="8.5" y1="16.5" x2="13" y2="16.5" />
        </svg>
      );
    case "excel":
      return (
        <svg {...common}>
          <rect x="3" y="3" width="18" height="18" rx="2" />
          <line x1="3" y1="9" x2="21" y2="9" />
          <line x1="3" y1="15" x2="21" y2="15" />
          <line x1="9" y1="3" x2="9" y2="21" />
          <line x1="15" y1="3" x2="15" y2="21" />
        </svg>
      );
    case "documento":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
    case "comprimido":
      return (
        <svg {...common}>
          <rect x="2.5" y="4" width="19" height="5" rx="1.2" />
          <path d="M4.5 9v9a1.5 1.5 0 0 0 1.5 1.5h12a1.5 1.5 0 0 0 1.5-1.5V9" />
          <line x1="10" y1="13" x2="14" y2="13" />
          <line x1="10.5" y1="16" x2="13.5" y2="16" />
        </svg>
      );
    default:
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <polyline points="14 2 14 8 20 8" />
        </svg>
      );
  }
}

export type ProyectoDetalleInnerProps = {
  projectId: string;
  variant: "page" | "modal";
  onClose?: () => void;
  onProjectUpdated?: () => void;
  onDirtyChange?: (dirty: boolean) => void;
  dataSchema: string;
};

export default function ProyectoDetalleInner({
  projectId,
  variant,
  onClose,
  onProjectUpdated,
  onDirtyChange,
  dataSchema,
}: ProyectoDetalleInnerProps) {
  const router = useRouter();
  const sp = useSearchParams();
  const tabUrl = variant === "page" ? normalizeTab(sp?.get("tab")) : null;
  const [modalTab, setModalTab] = useState<TabId>("resumen");

  const tab = variant === "page" ? (tabUrl ?? "resumen") : modalTab;

  const setTab = useCallback(
    (t: TabId) => {
      if (variant === "modal") setModalTab(t);
      else router.replace(`/dashboard/proyectos/${projectId}?tab=${t}`);
    },
    [variant, router, projectId]
  );

  const [data, setData] = useState<DetalleResp | null>(null);
  const [estados, setEstados] = useState<{ id: string; nombre: string }[]>([]);
  const [usuarios, setUsuarios] = useState<UsuarioActivo[]>([]);
  const [modulosCatalogo, setModulosCatalogo] = useState<ModuloCatalogo[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [comTexto, setComTexto] = useState("");
  const [comEditandoId, setComEditandoId] = useState<string | null>(null);
  const [comEditTexto, setComEditTexto] = useState("");
  const [comActionId, setComActionId] = useState<string | null>(null);
  const [tareaTitulo, setTareaTitulo] = useState("");
  const [tareaDescripcion, setTareaDescripcion] = useState("");
  const [tareaResponsableId, setTareaResponsableId] = useState("");
  const [tareaFechaLimite, setTareaFechaLimite] = useState("");
  const [tareaSaving, setTareaSaving] = useState(false);
  const [tareaEditandoId, setTareaEditandoId] = useState<string | null>(null);
  const [tareaEditTitulo, setTareaEditTitulo] = useState("");
  const [tareaEditDescripcion, setTareaEditDescripcion] = useState("");
  const [tareaEditResponsableId, setTareaEditResponsableId] = useState("");
  const [tareaEditFechaLimite, setTareaEditFechaLimite] = useState("");
  const [tareaActionId, setTareaActionId] = useState<string | null>(null);

  const [cambiosDraft, setCambiosDraft] = useState<Record<number, { realizado: boolean; comentario: string }>>({});
  const [cambioSavingNro, setCambioSavingNro] = useState<number | null>(null);

  const [archivoUploading, setArchivoUploading] = useState(false);
  const [archivoActionId, setArchivoActionId] = useState<string | null>(null);
  const [archivoDragActive, setArchivoDragActive] = useState(false);
  const archivoInputRef = useRef<HTMLInputElement | null>(null);
  const [archivoFiltro, setArchivoFiltro] = useState<ArchivoCategoria | "todos">("todos");
  const [archivosSel, setArchivosSel] = useState<Set<string>>(() => new Set());
  const [archivoBulkBusy, setArchivoBulkBusy] = useState(false);
  // Miniaturas (signed URL inline) para archivos de imagen. id → url.
  const [thumbUrls, setThumbUrls] = useState<Record<string, string>>({});
  const thumbFetchingRef = useRef<Set<string>>(new Set());
  const thumbFailedRef = useRef<Set<string>>(new Set());

  const [briefForm, setBriefForm] = useState<Record<string, string>>({});
  const [briefLists, setBriefLists] = useState<Record<string, string[]>>({});
  const [saasForm, setSaasForm] = useState<ProyectoSaasBriefForm>({
    empresa_nombre: "",
    whatsapp_contacto: "",
    observaciones: "",
    modulos_necesarios: [],
  });
  const [responsableTecnicoId, setResponsableTecnicoId] = useState("");
  const [observaciones, setObservaciones] = useState("");
  const [datosSnapshot, setDatosSnapshot] = useState("");

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setErr(null);
    const res = await fetchWithSupabaseSession(`/api/proyectos/${projectId}`, { cache: "no-store" });
    const j = (await res.json()) as { success?: boolean; data?: DetalleResp; error?: string };
    if (!res.ok || !j.success || !j.data) {
      setErr(j.error ?? "Error al cargar");
      setLoading(false);
      return;
    }
    setData(j.data);
    const p = j.data.proyecto;
    const merged = coalesceBriefData(p.brief_data);
    const saas = readSaasBriefData(p.brief_data);
    const lists: Record<string, string[]> = {};
    for (const f of PROYECTO_DATOS_BRIEF_FIELDS) {
      if (f.kind === "url_list") {
        lists[f.key] = readBriefUrlList(p.brief_data, f.key);
      }
    }
    setBriefForm(merged);
    setBriefLists(lists);
    setSaasForm(saas);
    setResponsableTecnicoId(typeof p.responsable_tecnico_id === "string" ? p.responsable_tecnico_id : "");
    setObservaciones(typeof p.observaciones_comerciales === "string" ? p.observaciones_comerciales : "");
    setDatosSnapshot(JSON.stringify({
      bf: merged,
      bl: lists,
      saas,
      responsable_tecnico_id: typeof p.responsable_tecnico_id === "string" ? p.responsable_tecnico_id : "",
      obs: typeof p.observaciones_comerciales === "string" ? p.observaciones_comerciales : "",
    }));
    const draft: Record<number, { realizado: boolean; comentario: string }> = {};
    for (const c of j.data.cambios ?? []) {
      draft[c.nro] = { realizado: c.realizado, comentario: c.comentario ?? "" };
    }
    for (const nro of CAMBIOS_SLOTS) {
      if (!draft[nro]) draft[nro] = { realizado: false, comentario: "" };
    }
    setCambiosDraft(draft);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Saco de la selección los archivos que ya no existen (tras borrar o recarga realtime).
  const archivoIdsActuales = useMemo(
    () => new Set((data?.archivos ?? []).map((a) => String(a.id ?? ""))),
    [data?.archivos]
  );
  useEffect(() => {
    setArchivosSel((prev) => {
      let cambio = false;
      const next = new Set<string>();
      for (const id of prev) {
        if (archivoIdsActuales.has(id)) next.add(id);
        else cambio = true;
      }
      return cambio ? next : prev;
    });
  }, [archivoIdsActuales]);

  // Carga perezosa de miniaturas para archivos de imagen (signed URL inline).
  useEffect(() => {
    if (tab !== "archivos") return;
    const imagenes = (data?.archivos ?? []).filter(
      (a) => categoriaArchivo(a.nombre, a.mime_type) === "imagen"
    );
    for (const a of imagenes) {
      const aid = String(a.id ?? "");
      if (
        !aid ||
        thumbUrls[aid] ||
        thumbFetchingRef.current.has(aid) ||
        thumbFailedRef.current.has(aid)
      )
        continue;
      thumbFetchingRef.current.add(aid);
      void (async () => {
        try {
          const res = await fetchWithSupabaseSession(
            `/api/proyectos/${projectId}/archivos/${aid}`,
            { cache: "no-store" }
          );
          const j = (await res.json()) as { success?: boolean; data?: { url?: string } };
          if (res.ok && j.success && j.data?.url) {
            setThumbUrls((prev) => ({ ...prev, [aid]: j.data!.url! }));
          }
        } catch {
          // Silencioso: si falla, la fila muestra el ícono de tipo.
        } finally {
          thumbFetchingRef.current.delete(aid);
        }
      })();
    }
  }, [tab, data?.archivos, thumbUrls, projectId]);

  // Mantengo una ref a `load` para que las suscripciones de Realtime no se re-creen
  // en cada render. El callback estable adentro del channel siempre llama al último.
  const loadRef = useRef(load);
  useEffect(() => {
    loadRef.current = load;
  }, [load]);

  // Realtime: cualquier cambio en las 5 tablas del proyecto dispara re-fetch.
  // Filtramos por proyecto_id para no recibir eventos de otros proyectos.
  useEffect(() => {
    if (!projectId || !dataSchema) return;
    const sb = createBrowserClientForSchema(dataSchema);
    const filtro = `proyecto_id=eq.${projectId}`;

    const channel = sb
      .channel(`proyecto-detalle:${projectId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: dataSchema, table: "proyectos", filter: `id=eq.${projectId}` },
        () => void loadRef.current?.()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: dataSchema, table: "proyecto_tareas", filter: filtro },
        () => void loadRef.current?.()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: dataSchema, table: "proyecto_comentarios", filter: filtro },
        () => void loadRef.current?.()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: dataSchema, table: "proyecto_archivos", filter: filtro },
        () => void loadRef.current?.()
      )
      .on(
        "postgres_changes",
        { event: "*", schema: dataSchema, table: "proyecto_estado_historial", filter: filtro },
        () => void loadRef.current?.()
      )
      .subscribe();

    return () => {
      void sb.removeChannel(channel);
    };
  }, [projectId, dataSchema]);

  useEffect(() => {
    if (variant !== "page" || !projectId) return;
    const raw = sp?.get("tab");
    if (raw === "brief") {
      router.replace(`/dashboard/proyectos/${projectId}?tab=datos`);
    }
  }, [variant, projectId, sp, router]);

  useEffect(() => {
    let c = false;
    (async () => {
      const [r, rUsers, rModulos] = await Promise.all([
        fetchWithSupabaseSession("/api/proyectos/estados", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/usuarios/empresa-activos", { cache: "no-store" }),
        fetchWithSupabaseSession("/api/proyectos/modulos-catalogo", { cache: "no-store" }),
      ]);
      const j = (await r.json()) as { success?: boolean; data?: { id: string; nombre: string }[] };
      const jUsers = (await rUsers.json()) as { usuarios?: UsuarioActivo[] };
      const jModulos = (await rModulos.json()) as { success?: boolean; data?: ModuloCatalogo[] };
      if (!c && j.success && j.data) setEstados(j.data);
      if (!c) setUsuarios(jUsers.usuarios ?? []);
      if (!c && jModulos.success && jModulos.data) setModulosCatalogo(jModulos.data);
    })();
    return () => {
      c = true;
    };
  }, []);

  const datosDirty = useMemo(() => {
    const cur = JSON.stringify({
      bf: briefForm,
      bl: briefLists,
      saas: saasForm,
      responsable_tecnico_id: responsableTecnicoId,
      obs: observaciones,
    });
    return datosSnapshot !== "" && cur !== datosSnapshot;
  }, [briefForm, briefLists, saasForm, responsableTecnicoId, observaciones, datosSnapshot]);

  useEffect(() => {
    onDirtyChange?.(datosDirty);
  }, [datosDirty, onDirtyChange]);

  async function guardarDatos() {
    const proyecto = data?.proyecto;
    if (!proyecto) return;
    const tipoCodigo = proyecto.proyecto_tipo?.codigo ?? "";
    const briefMerged =
      tipoCodigo === "saas"
        ? applySaasFormToExisting(proyecto.brief_data, saasForm)
        : applyBriefFormToExisting(proyecto.brief_data, briefForm, briefLists);
    const res = await fetchWithSupabaseSession(`/api/proyectos/${projectId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        brief_data: briefMerged,
        responsable_tecnico_id: responsableTecnicoId || null,
        observaciones_comerciales: observaciones.trim() === "" ? null : observaciones.trim(),
      }),
    });
    const j = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !j.success) {
      setErr(j.error ?? "No se pudo guardar");
      return;
    }
    await load();
    onProjectUpdated?.();
  }

  const [deleting, setDeleting] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);

  function abrirModalEliminar() {
    setDeleteConfirmText("");
    setDeleteError(null);
    setDeleteModalOpen(true);
  }

  async function confirmarEliminacion() {
    if (deleting) return;
    const proyectoActual = data?.proyecto;
    if (!proyectoActual) return;
    const titulo = String(proyectoActual.titulo ?? "").trim();
    if (deleteConfirmText.trim() !== titulo) {
      setDeleteError("El título no coincide. Verificá la escritura exacta.");
      return;
    }
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetchWithSupabaseSession(`/api/proyectos/${projectId}`, { method: "DELETE" });
      const j = (await res.json().catch(() => null)) as { success?: boolean; error?: string } | null;
      if (!res.ok || !j?.success) {
        setDeleteError(j?.error ?? "No se pudo eliminar el proyecto.");
        return;
      }
      setDeleteModalOpen(false);
      onProjectUpdated?.();
      if (variant === "modal") {
        onClose?.();
      } else {
        router.push("/dashboard/proyectos");
      }
    } finally {
      setDeleting(false);
    }
  }

  useEffect(() => {
    if (!deleteModalOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !deleting) setDeleteModalOpen(false);
    }
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [deleteModalOpen, deleting]);

  async function agregarComentario(e: React.FormEvent) {
    e.preventDefault();
    if (!comTexto.trim()) return;
    const res = await fetchWithSupabaseSession(`/api/proyectos/${projectId}/comentarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comentario: comTexto.trim() }),
    });
    const j = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !j.success) {
      setErr(j.error ?? "Error");
      return;
    }
    setComTexto("");
    await load();
    onProjectUpdated?.();
  }

  async function guardarCambio(nro: number) {
    if (cambioSavingNro != null) return;
    const draft = cambiosDraft[nro];
    if (!draft) return;
    const comentarioTrim = draft.comentario.trim();
    if (draft.realizado && comentarioTrim.length === 0) {
      setErr("Agregá un comentario para el cambio realizado.");
      return;
    }
    setCambioSavingNro(nro);
    try {
      const res = await fetchWithSupabaseSession(
        `/api/proyectos/${projectId}/cambios/${nro}`,
        {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            realizado: draft.realizado,
            comentario: comentarioTrim.length > 0 ? comentarioTrim : null,
          }),
        }
      );
      const j = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !j.success) {
        setErr(j.error ?? "No se pudo guardar el cambio");
        return;
      }
      setErr(null);
      await load();
      onProjectUpdated?.();
    } finally {
      setCambioSavingNro(null);
    }
  }

  function iniciarEdicionComentario(cid: string, texto: string) {
    setComEditandoId(cid);
    setComEditTexto(texto);
  }

  function cancelarEdicionComentario() {
    setComEditandoId(null);
    setComEditTexto("");
  }

  async function guardarEdicionComentario(cid: string) {
    const texto = comEditTexto.trim();
    if (!texto || comActionId) return;
    setComActionId(cid);
    try {
      const res = await fetchWithSupabaseSession(
        `/api/proyectos/${projectId}/comentarios/${cid}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ comentario: texto }),
        }
      );
      const j = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !j.success) {
        setErr(j.error ?? "Error");
        return;
      }
      cancelarEdicionComentario();
      await load();
      onProjectUpdated?.();
    } finally {
      setComActionId(null);
    }
  }

  async function eliminarComentario(cid: string) {
    if (comActionId) return;
    const ok = window.confirm("¿Eliminar este comentario? Esta acción no se puede deshacer.");
    if (!ok) return;
    setComActionId(cid);
    try {
      const res = await fetchWithSupabaseSession(
        `/api/proyectos/${projectId}/comentarios/${cid}`,
        { method: "DELETE" }
      );
      const j = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !j.success) {
        setErr(j.error ?? "Error");
        return;
      }
      if (comEditandoId === cid) cancelarEdicionComentario();
      await load();
      onProjectUpdated?.();
    } finally {
      setComActionId(null);
    }
  }

  async function agregarTarea(e: React.FormEvent) {
    e.preventDefault();
    const titulo = tareaTitulo.trim();
    if (!titulo || tareaSaving) return;
    setTareaSaving(true);
    const payload: Record<string, unknown> = { titulo };
    const descripcion = tareaDescripcion.trim();
    if (descripcion) payload.descripcion = descripcion;
    if (tareaResponsableId) payload.responsable_id = tareaResponsableId;
    if (tareaFechaLimite) payload.fecha_limite = tareaFechaLimite;
    try {
      const res = await fetchWithSupabaseSession(`/api/proyectos/${projectId}/tareas`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const j = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !j.success) {
        setErr(j.error ?? "Error");
        return;
      }
      setTareaTitulo("");
      setTareaDescripcion("");
      setTareaResponsableId("");
      setTareaFechaLimite("");
      await load();
      onProjectUpdated?.();
    } finally {
      setTareaSaving(false);
    }
  }

  function limpiarFormularioTarea() {
    setTareaTitulo("");
    setTareaDescripcion("");
    setTareaResponsableId("");
    setTareaFechaLimite("");
  }

  async function patchTarea(tareaId: string, patch: Record<string, unknown>) {
    const res = await fetchWithSupabaseSession(`/api/proyectos/${projectId}/tareas/${tareaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    const j = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !j.success) setErr(j.error ?? "Error");
    else {
      await load();
      onProjectUpdated?.();
    }
  }

  function iniciarEdicionTarea(t: Record<string, unknown>) {
    setTareaEditandoId(String(t.id ?? ""));
    setTareaEditTitulo(typeof t.titulo === "string" ? t.titulo : "");
    setTareaEditDescripcion(typeof t.descripcion === "string" ? t.descripcion : "");
    setTareaEditResponsableId(typeof t.responsable_id === "string" ? t.responsable_id : "");
    setTareaEditFechaLimite(
      typeof t.fecha_limite === "string" && t.fecha_limite ? t.fecha_limite.slice(0, 10) : ""
    );
  }

  function cancelarEdicionTarea() {
    setTareaEditandoId(null);
    setTareaEditTitulo("");
    setTareaEditDescripcion("");
    setTareaEditResponsableId("");
    setTareaEditFechaLimite("");
  }

  async function guardarEdicionTarea(tareaId: string) {
    const titulo = tareaEditTitulo.trim();
    if (!titulo || tareaActionId) return;
    setTareaActionId(tareaId);
    try {
      const res = await fetchWithSupabaseSession(
        `/api/proyectos/${projectId}/tareas/${tareaId}`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            titulo,
            descripcion: tareaEditDescripcion.trim(),
            responsable_id: tareaEditResponsableId || null,
            fecha_limite: tareaEditFechaLimite || null,
          }),
        }
      );
      const j = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !j.success) {
        setErr(j.error ?? "Error");
        return;
      }
      cancelarEdicionTarea();
      await load();
      onProjectUpdated?.();
    } finally {
      setTareaActionId(null);
    }
  }

  async function eliminarTarea(tareaId: string) {
    if (tareaActionId) return;
    const ok = window.confirm("¿Eliminar esta tarea? Esta acción no se puede deshacer.");
    if (!ok) return;
    setTareaActionId(tareaId);
    try {
      const res = await fetchWithSupabaseSession(
        `/api/proyectos/${projectId}/tareas/${tareaId}`,
        { method: "DELETE" }
      );
      const j = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !j.success) {
        setErr(j.error ?? "Error");
        return;
      }
      if (tareaEditandoId === tareaId) cancelarEdicionTarea();
      await load();
      onProjectUpdated?.();
    } finally {
      setTareaActionId(null);
    }
  }

  async function subirArchivos(files: File[]) {
    if (archivoUploading) return;
    const validos: File[] = [];
    for (const f of files) {
      if (f.size === 0) {
        setErr(`"${f.name}" está vacío y no se subió.`);
        continue;
      }
      if (f.size > ARCHIVO_MAX_BYTES) {
        setErr(`"${f.name}" supera el máximo de ${Math.round(ARCHIVO_MAX_BYTES / (1024 * 1024))} MB.`);
        continue;
      }
      validos.push(f);
    }
    if (validos.length === 0) return;
    setArchivoUploading(true);
    try {
      for (const file of validos) {
        const fd = new FormData();
        fd.append("file", file);
        const res = await fetchWithSupabaseSession(`/api/proyectos/${projectId}/archivos`, {
          method: "POST",
          body: fd,
        });
        const j = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || !j.success) {
          setErr(j.error ?? `No se pudo subir "${file.name}"`);
          break;
        }
      }
      await load();
      onProjectUpdated?.();
    } finally {
      setArchivoUploading(false);
    }
  }

  function onArchivoInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = "";
    if (files.length > 0) void subirArchivos(files);
  }

  function onArchivoDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setArchivoDragActive(false);
    const files = e.dataTransfer?.files ? Array.from(e.dataTransfer.files) : [];
    if (files.length > 0) void subirArchivos(files);
  }

  async function fetchArchivoUrl(aid: string, download: boolean): Promise<string | null> {
    const res = await fetchWithSupabaseSession(
      `/api/proyectos/${projectId}/archivos/${aid}${download ? "?download=1" : ""}`,
      { cache: "no-store" }
    );
    const j = (await res.json()) as { success?: boolean; data?: { url?: string }; error?: string };
    if (!res.ok || !j.success || !j.data?.url) {
      setErr(j.error ?? "No se pudo abrir el archivo");
      return null;
    }
    return j.data.url;
  }

  async function descargarArchivo(aid: string) {
    if (archivoActionId) return;
    setArchivoActionId(aid);
    try {
      const url = await fetchArchivoUrl(aid, true);
      if (!url) return;
      const a = document.createElement("a");
      a.href = url;
      a.rel = "noopener";
      document.body.appendChild(a);
      a.click();
      a.remove();
    } finally {
      setArchivoActionId(null);
    }
  }

  async function previsualizarArchivo(aid: string) {
    if (archivoActionId) return;
    // Abrimos la pestaña en el click (sincrónico) para evitar el bloqueo de pop-ups.
    const win = window.open("about:blank", "_blank");
    setArchivoActionId(aid);
    try {
      const url = await fetchArchivoUrl(aid, false);
      if (!url) {
        win?.close();
        return;
      }
      if (win) win.location.href = url;
      else window.open(url, "_blank", "noopener,noreferrer");
    } finally {
      setArchivoActionId(null);
    }
  }

  async function eliminarArchivo(aid: string, nombre: string) {
    if (archivoActionId) return;
    const ok = window.confirm(`¿Eliminar "${nombre}"? Esta acción no se puede deshacer.`);
    if (!ok) return;
    setArchivoActionId(aid);
    try {
      const res = await fetchWithSupabaseSession(`/api/proyectos/${projectId}/archivos/${aid}`, {
        method: "DELETE",
      });
      const j = (await res.json()) as { success?: boolean; error?: string };
      if (!res.ok || !j.success) {
        setErr(j.error ?? "No se pudo eliminar");
        return;
      }
      await load();
      onProjectUpdated?.();
    } finally {
      setArchivoActionId(null);
    }
  }

  function toggleArchivoSel(aid: string) {
    setArchivosSel((prev) => {
      const next = new Set(prev);
      if (next.has(aid)) next.delete(aid);
      else next.add(aid);
      return next;
    });
  }

  function setArchivoSelLote(ids: string[], marcar: boolean) {
    setArchivosSel((prev) => {
      const next = new Set(prev);
      for (const id of ids) {
        if (marcar) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  async function descargarSeleccionados(ids: string[]) {
    if (archivoBulkBusy || ids.length === 0) return;
    setArchivoBulkBusy(true);
    try {
      for (const aid of ids) {
        const url = await fetchArchivoUrl(aid, true);
        if (!url) continue;
        const a = document.createElement("a");
        a.href = url;
        a.rel = "noopener";
        document.body.appendChild(a);
        a.click();
        a.remove();
        // Pequeña pausa para que el navegador no descarte descargas encadenadas.
        await new Promise((r) => setTimeout(r, 350));
      }
    } finally {
      setArchivoBulkBusy(false);
    }
  }

  async function eliminarSeleccionados(ids: string[]) {
    if (archivoBulkBusy || ids.length === 0) return;
    const ok = window.confirm(
      `¿Eliminar ${ids.length} archivo${ids.length === 1 ? "" : "s"}? Esta acción no se puede deshacer.`
    );
    if (!ok) return;
    setArchivoBulkBusy(true);
    try {
      let huboError = false;
      for (const aid of ids) {
        const res = await fetchWithSupabaseSession(`/api/proyectos/${projectId}/archivos/${aid}`, {
          method: "DELETE",
        });
        const j = (await res.json()) as { success?: boolean; error?: string };
        if (!res.ok || !j.success) {
          huboError = true;
          setErr(j.error ?? "No se pudieron eliminar todos los archivos");
          break;
        }
      }
      setArchivoSelLote(ids, false);
      await load();
      onProjectUpdated?.();
      if (!huboError) setErr(null);
    } finally {
      setArchivoBulkBusy(false);
    }
  }

  async function cambiarEstado(estadoId: string) {
    const res = await fetchWithSupabaseSession(`/api/proyectos/${projectId}/cambiar-estado`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ estado_id: estadoId }),
    });
    const j = (await res.json()) as { success?: boolean; error?: string };
    if (!res.ok || !j.success) setErr(j.error ?? "Error");
    else {
      await load();
      onProjectUpdated?.();
    }
  }

  const slaFmt = useMemo(() => {
    const s = data?.sla as { segundos_interno?: number; segundos_cliente?: number; segundos_pausado?: number } | undefined;
    if (!s) return null;
    const fmt = (sec?: number) =>
      sec == null ? "—" : `${Math.round((sec / 3600) * 10) / 10} h`;
    return {
      interno: fmt(s.segundos_interno),
      cliente: fmt(s.segundos_cliente),
      pausado: fmt(s.segundos_pausado),
    };
  }, [data?.sla]);

  const proyecto = data?.proyecto;
  const codigoTipo = proyecto?.proyecto_tipo?.codigo ?? "";
  const esWeb = codigoTipo === "web";
  const esSaas = codigoTipo === "saas";
  const briefCoerced = coalesceBriefData(proyecto?.brief_data);
  const saasModuloIds = saasForm.modulos_necesarios
    .map((modulo) => modulo.id)
    .filter((id): id is string => typeof id === "string" && id.length > 0);
  const updateSaasField = <K extends keyof ProyectoSaasBriefForm>(key: K, value: ProyectoSaasBriefForm[K]) => {
    setSaasForm((prev) => ({ ...prev, [key]: value }));
  };
  const updateSaasModulos = (ids: string[]) => {
    const snapshots: ProyectoModuloSnapshot[] = modulosCatalogo
      .filter((modulo) => ids.includes(modulo.id))
      .map((modulo) => ({ id: modulo.id, slug: modulo.slug, nombre: modulo.nombre }));
    updateSaasField("modulos_necesarios", snapshots);
  };

  if (!projectId) return null;
  if (loading && !data) {
    return <div className="p-8 text-sm text-slate-500">Cargando…</div>;
  }
  if (err && !data) return <div className="p-8 text-sm text-rose-600">{err}</div>;
  if (!data || !proyecto) return null;

  const panelCls =
    "rounded-2xl border border-slate-200 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
  const labelCls = "text-xs font-medium uppercase tracking-wide text-slate-500";
  const inputCls =
    "mt-1.5 w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";

  const rootClass =
    variant === "modal"
      ? "flex h-full min-h-0 flex-col bg-white"
      : "mx-auto max-w-5xl space-y-6 p-6";

  return (
    <div className={rootClass}>
      {variant === "page" ? (
        <div className="flex flex-wrap items-center gap-3">
          <Link
            href="/dashboard/proyectos"
            className="text-sm font-medium text-[#4FAEB2] hover:text-[#3F8E91] hover:underline"
          >
            ← Kanban
          </Link>
        </div>
      ) : null}

      <div
        className={
          variant === "modal"
            ? "flex flex-wrap items-start justify-between gap-4 border-b border-slate-100 bg-gradient-to-br from-white via-white to-[#4FAEB2]/5 px-6 pb-5 pt-6"
            : "flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-4"
        }
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4FAEB2]">
              Proyecto
            </p>
          </div>
          <h1
            id={variant === "modal" ? "proyecto-detalle-titulo" : undefined}
            className="mt-1 truncate text-2xl font-semibold tracking-tight text-slate-900"
          >
            {String(proyecto.titulo ?? "")}
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            {(proyecto as { proyecto_tipo?: { nombre?: string } }).proyecto_tipo?.nombre ?? "—"} ·{" "}
            <span className="text-slate-600">Avance {data.avance_pct ?? "—"}%</span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FancySelect
            className="min-w-[180px]"
            ariaLabel="Cambiar estado del proyecto"
            value={String(proyecto.estado_id ?? "")}
            onChange={(v) => void cambiarEstado(v)}
            options={estados.map((e) => ({ value: e.id, label: e.nombre }))}
          />
          {(() => {
            const rol = (data.current_user_rol ?? "").trim().toLowerCase();
            const puedeEliminar = rol === "super_admin" || rol === "admin" || rol === "administrador";
            if (!puedeEliminar) return null;
            return (
              <button
                type="button"
                onClick={abrirModalEliminar}
                className="rounded-xl border border-red-200 bg-white px-3.5 py-2.5 text-sm font-medium text-red-600 shadow-sm transition-colors hover:border-red-400 hover:bg-red-50"
                title="Eliminar definitivamente el proyecto (irreversible)"
              >
                Eliminar
              </button>
            );
          })()}
          {variant === "modal" ? (
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#4FAEB2]"
              onClick={() => onClose?.()}
            >
              Cerrar
            </button>
          ) : (
            <button
              type="button"
              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#4FAEB2]"
              onClick={() => router.push("/dashboard/proyectos")}
            >
              Cerrar
            </button>
          )}
        </div>
      </div>

      {err ? (
        <div
          className={
            variant === "modal"
              ? "mx-6 mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm text-amber-900"
              : "rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-sm text-amber-900"
          }
        >
          {err}
        </div>
      ) : null}

      <div
        className={
          variant === "modal"
            ? "flex flex-wrap gap-1.5 border-b border-slate-100 bg-white px-6 pb-3 pt-4"
            : "flex flex-wrap gap-1.5 border-b border-slate-200 pb-2"
        }
      >
        {TAB_IDS.map((t) => {
          const active = tab === t;
          return (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`relative rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? "border border-[#4FAEB2]/30 bg-[#4FAEB2]/10 text-[#3F8E91] shadow-sm"
                  : "border border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700"
              }`}
            >
              {TAB_LABELS[t]}
            </button>
          );
        })}
      </div>

      <div
        className={
          variant === "modal"
            ? "min-h-0 flex-1 overflow-y-auto bg-slate-50/50 px-6 py-5"
            : ""
        }
      >
        {tab === "resumen" ? (
          <div className="grid gap-4 md:grid-cols-2">
            <div className={panelCls}>
              <div className="flex items-center gap-2">
                <span className="h-5 w-1 rounded-full bg-[#4FAEB2]" />
                <h2 className="text-sm font-semibold text-slate-900">Resumen del proyecto</h2>
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                  <dt className={labelCls}>Cliente</dt>
                  <dd className="text-right font-medium text-slate-900">{clienteNombre(proyecto)}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                  <dt className={labelCls}>Vendedor / comercial</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {(proyecto as { responsable_comercial?: { nombre?: string } }).responsable_comercial?.nombre ?? "—"}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                  <dt className={labelCls}>Técnico responsable</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {(proyecto as { responsable_tecnico?: { nombre?: string } }).responsable_tecnico?.nombre ?? "—"}
                  </dd>
                </div>
                <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                  <dt className={labelCls}>Fecha prometida</dt>
                  <dd className="text-right font-medium text-slate-900">
                    {proyecto.fecha_prometida != null && String(proyecto.fecha_prometida).trim() !== ""
                      ? formatFechaPyFull(String(proyecto.fecha_prometida))
                      : "—"}
                  </dd>
                </div>
                {esSaas ? (
                  <>
                    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                      <dt className={labelCls}>Empresa SaaS / ERP</dt>
                      <dd className="max-w-[55%] text-right font-medium text-slate-900">
                        {saasForm.empresa_nombre.trim() || "—"}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                      <dt className={labelCls}>Módulos necesarios</dt>
                      <dd className="max-w-[55%] text-right font-medium text-slate-900">
                        {saasForm.modulos_necesarios.length > 0
                          ? saasForm.modulos_necesarios.map((m) => m.nombre).join(", ")
                          : "—"}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                      <dt className={labelCls}>WhatsApp contacto</dt>
                      <dd className="max-w-[55%] text-right font-medium text-slate-900">
                        {saasForm.whatsapp_contacto.trim() || "—"}
                      </dd>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                      <dt className={labelCls}>Nombre de la marca</dt>
                      <dd className="max-w-[55%] text-right font-medium text-slate-900">
                        {(briefCoerced.marca || "").trim() || "—"}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                      <dt className={labelCls}>Dominio a usar</dt>
                      <dd className="max-w-[55%] break-all text-right font-medium text-slate-900">
                        {(briefCoerced.dominio_usar || "").trim() || "—"}
                      </dd>
                    </div>
                    <div className="flex items-baseline justify-between gap-3 border-b border-slate-100 pb-2.5">
                      <dt className={labelCls}>Tipo de web</dt>
                      <dd className="max-w-[55%] text-right font-medium text-slate-900">
                        {(briefCoerced.tipo_web || "").trim() || "—"}
                      </dd>
                    </div>
                  </>
                )}
                <div className="flex items-baseline justify-between gap-3">
                  <dt className={labelCls}>Prioridad</dt>
                  <dd className="text-right font-medium text-slate-900">{prioridadLabel(proyecto.prioridad)}</dd>
                </div>
              </dl>
            </div>
            <div className={panelCls}>
              <div className="flex items-center gap-2">
                <span className="h-5 w-1 rounded-full bg-[#4FAEB2]" />
                <h2 className="text-sm font-semibold text-slate-900">SLA acumulado</h2>
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div className="flex items-baseline justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                  <dt className={labelCls}>Tiempo interno</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">{slaFmt?.interno}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                  <dt className={labelCls}>Espera cliente</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">{slaFmt?.cliente}</dd>
                </div>
                <div className="flex items-baseline justify-between gap-2 rounded-xl bg-slate-50 px-3 py-2.5">
                  <dt className={labelCls}>Pausado</dt>
                  <dd className="font-semibold tabular-nums text-slate-900">{slaFmt?.pausado}</dd>
                </div>
              </dl>
            </div>
          </div>
        ) : null}

        {tab === "datos" ? (
          <div className={`space-y-5 ${panelCls}`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="h-5 w-1 rounded-full bg-[#4FAEB2]" />
                  <h2 className="text-sm font-semibold text-slate-900">Datos del proyecto</h2>
                </div>
                <p className="mt-1.5 text-xs text-slate-500">
                  Editá los campos guardados en el proyecto. Los datos previos se conservan al guardar.
                </p>
              </div>
              <button
                type="button"
                className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                disabled={!datosDirty}
                onClick={() => void guardarDatos()}
              >
                Guardar datos
              </button>
            </div>

            {esWeb ? (
              <p className="rounded-lg bg-[#4FAEB2]/8 px-3 py-2 text-xs text-[#3F8E91]">
                Tipo &quot;Proyecto Web&quot;: campos adicionales del brief comercial.
              </p>
            ) : null}
            {esSaas ? (
              <p className="rounded-lg bg-[#4FAEB2]/8 px-3 py-2 text-xs text-[#3F8E91]">
                Tipo &quot;SaaS / ERP&quot;: snapshot de módulos requeridos, sin activar permisos ni módulos reales.
              </p>
            ) : null}

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="block text-sm">
                <span className={labelCls}>Técnico responsable</span>
                <div className="mt-1.5">
                  <FancySelect
                    ariaLabel="Técnico responsable"
                    placeholder="—"
                    value={responsableTecnicoId}
                    onChange={setResponsableTecnicoId}
                    options={[
                      { value: "", label: "—" },
                      ...usuarios.map((u) => ({
                        value: u.id,
                        label: u.nombre || u.email || u.id.slice(0, 8),
                      })),
                    ]}
                  />
                </div>
              </div>
              {esWeb ? (
                <label className="block text-sm sm:col-span-2">
                  <span className={labelCls}>Observaciones comerciales</span>
                  <textarea
                    className={`${inputCls} min-h-[88px]`}
                    rows={3}
                    value={observaciones}
                    onChange={(e) => setObservaciones(e.target.value)}
                    placeholder="Detalle adicional negociado con el cliente…"
                  />
                </label>
              ) : null}
            </div>

            {esWeb ? (
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
                          checked={briefForm[f.key] === "1"}
                          onChange={(e) =>
                            setBriefForm((b) => ({ ...b, [f.key]: e.target.checked ? "1" : "" }))
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
                        <span className={labelCls}>{f.label}</span>
                        <div className="mt-1.5 space-y-2">
                          {items.map((url, idx) => (
                            <div key={idx} className="flex items-stretch gap-2">
                              <input
                                type="url"
                                className={`${inputCls} mt-0 flex-1`}
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
                    <label key={f.key} className={`block text-sm ${f.key === "secciones" ? "sm:col-span-2" : ""}`}>
                      <span className={labelCls}>{f.label}</span>
                      <input
                        className={inputCls}
                        placeholder={f.placeholder}
                        value={briefForm[f.key] ?? ""}
                        onChange={(e) => setBriefForm((b) => ({ ...b, [f.key]: e.target.value }))}
                      />
                    </label>
                  );
                })}
              </div>
            ) : null}

            {esSaas ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block text-sm">
                  <span className={labelCls}>Nombre de la empresa</span>
                  <input
                    className={inputCls}
                    value={saasForm.empresa_nombre}
                    onChange={(e) => updateSaasField("empresa_nombre", e.target.value)}
                  />
                </label>
                <label className="block text-sm">
                  <span className={labelCls}>WhatsApp contacto</span>
                  <input
                    className={inputCls}
                    placeholder="+595..."
                    value={saasForm.whatsapp_contacto}
                    onChange={(e) => updateSaasField("whatsapp_contacto", e.target.value)}
                  />
                </label>
                <div className="block text-sm sm:col-span-2">
                  <span className={labelCls}>Módulos necesarios</span>
                  <div className="mt-1.5">
                    <ProyectoModuloSelector
                      modulos={modulosCatalogo}
                      selectedIds={saasModuloIds}
                      onChange={updateSaasModulos}
                    />
                  </div>
                </div>
                <label className="block text-sm sm:col-span-2">
                  <span className={labelCls}>Observaciones</span>
                  <textarea
                    className={`${inputCls} min-h-[88px]`}
                    rows={3}
                    value={saasForm.observaciones}
                    onChange={(e) => updateSaasField("observaciones", e.target.value)}
                  />
                </label>
              </div>
            ) : null}

            {Object.keys(briefCoerced).length === 0 &&
            !observaciones.trim() ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                Todavía no hay datos cargados. Completá el formulario y guardá.
              </p>
            ) : null}
          </div>
        ) : null}

        {tab === "tareas" ? (
          <div className="space-y-4">
            <div className={`space-y-4 ${panelCls}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className="h-5 w-1 rounded-full bg-[#4FAEB2]" />
                  <div>
                    <h2 className="text-sm font-semibold text-slate-900">Nueva tarea</h2>
                    <p className="text-xs text-slate-500">
                      Sumá una tarea con todo el contexto: descripción, responsable y fecha límite.
                    </p>
                  </div>
                </div>
                <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500">
                  {(data.tareas ?? []).length} tarea{(data.tareas ?? []).length === 1 ? "" : "s"}
                </span>
              </div>
              <form onSubmit={agregarTarea} className="space-y-3">
                <label className="block">
                  <span className={labelCls}>Título de la tarea *</span>
                  <input
                    className={inputCls}
                    placeholder="Ej.: Diseñar wireframes para la landing"
                    value={tareaTitulo}
                    onChange={(e) => setTareaTitulo(e.target.value)}
                    maxLength={200}
                    required
                  />
                </label>
                <label className="block">
                  <span className={labelCls}>Descripción / Contexto (opcional)</span>
                  <textarea
                    className={`${inputCls} min-h-[80px] resize-y`}
                    placeholder="Aclaraciones, criterios de aceptación, links útiles…"
                    rows={3}
                    value={tareaDescripcion}
                    onChange={(e) => setTareaDescripcion(e.target.value)}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="block">
                    <span className={labelCls}>Responsable (opcional)</span>
                    <div className="mt-1.5">
                      <FancySelect
                        ariaLabel="Responsable de la tarea"
                        placeholder="Sin asignar"
                        value={tareaResponsableId}
                        onChange={setTareaResponsableId}
                        options={[
                          { value: "", label: "Sin asignar" },
                          ...usuarios.map((u) => ({
                            value: u.id,
                            label: u.nombre || u.email || u.id.slice(0, 8),
                          })),
                        ]}
                      />
                    </div>
                  </div>
                  <label className="block">
                    <span className={labelCls}>Fecha límite (opcional)</span>
                    <input
                      type="date"
                      className={inputCls}
                      value={tareaFechaLimite}
                      onChange={(e) => setTareaFechaLimite(e.target.value)}
                    />
                  </label>
                </div>
                <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                  <button
                    type="button"
                    onClick={limpiarFormularioTarea}
                    disabled={
                      tareaSaving ||
                      (!tareaTitulo &&
                        !tareaDescripcion &&
                        !tareaResponsableId &&
                        !tareaFechaLimite)
                    }
                    className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Limpiar
                  </button>
                  <button
                    type="submit"
                    disabled={tareaSaving || !tareaTitulo.trim()}
                    className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                  >
                    {tareaSaving ? "Agregando…" : "Agregar tarea"}
                  </button>
                </div>
              </form>
            </div>

            <div className={`space-y-3 ${panelCls}`}>
              <div className="flex items-center gap-2">
                <span className="h-5 w-1 rounded-full bg-[#4FAEB2]" />
                <h2 className="text-sm font-semibold text-slate-900">Listado de tareas</h2>
              </div>
              <ul className="space-y-2.5">
                {(data.tareas ?? []).map((raw) => {
                  const t = raw as Record<string, unknown>;
                  const tid = String(t.id ?? "");
                  const estado = String(t.estado ?? "pendiente");
                  const tone = TAREA_ESTADO_TONE[estado] ?? TAREA_ESTADO_TONE.pendiente;
                  const descripcion =
                    typeof t.descripcion === "string" ? t.descripcion.trim() : "";
                  const fechaLimite =
                    typeof t.fecha_limite === "string" && t.fecha_limite.trim()
                      ? t.fecha_limite
                      : "";
                  const creadoPor =
                    (t.created_by_nombre as string | null | undefined) ?? "Usuario";
                  const creadoAt = t.created_at ? String(t.created_at) : "";
                  const cambioPor =
                    (t.status_changed_by_nombre as string | null | undefined) ?? null;
                  const cambioAt = t.status_changed_at
                    ? String(t.status_changed_at)
                    : "";
                  const huboCambioEstado =
                    Boolean(cambioAt) &&
                    Boolean(creadoAt) &&
                    new Date(cambioAt).getTime() - new Date(creadoAt).getTime() > 2000;
                  const creadorId = String(t.created_by ?? "");
                  const esCreadorTarea =
                    !!data.current_user_id && creadorId === data.current_user_id;
                  const responsable =
                    (t.responsable_nombre as string | null | undefined) ?? null;
                  const enEdicionTarea = tareaEditandoId === tid;
                  const enAccionTarea = tareaActionId === tid;
                  return (
                    <li
                      key={tid}
                      className={`rounded-2xl border border-slate-200 bg-white p-3.5 shadow-[0_1px_2px_rgba(15,23,42,0.04)] transition-shadow hover:shadow-md`}
                    >
                      {enEdicionTarea ? (
                        <div className="space-y-3">
                          <label className="block">
                            <span className={labelCls}>Título de la tarea *</span>
                            <input
                              className={inputCls}
                              value={tareaEditTitulo}
                              onChange={(e) => setTareaEditTitulo(e.target.value)}
                              maxLength={200}
                              autoFocus
                            />
                          </label>
                          <label className="block">
                            <span className={labelCls}>Descripción / Contexto</span>
                            <textarea
                              className={`${inputCls} min-h-[72px] resize-y`}
                              rows={3}
                              value={tareaEditDescripcion}
                              onChange={(e) => setTareaEditDescripcion(e.target.value)}
                            />
                          </label>
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="block">
                              <span className={labelCls}>Técnico asignado</span>
                              <div className="mt-1.5">
                                <FancySelect
                                  ariaLabel="Técnico asignado a la tarea"
                                  placeholder="Sin asignar"
                                  value={tareaEditResponsableId}
                                  onChange={setTareaEditResponsableId}
                                  options={[
                                    { value: "", label: "Sin asignar" },
                                    ...usuarios.map((u) => ({
                                      value: u.id,
                                      label: u.nombre || u.email || u.id.slice(0, 8),
                                    })),
                                  ]}
                                />
                              </div>
                            </div>
                            <label className="block">
                              <span className={labelCls}>Fecha límite</span>
                              <input
                                type="date"
                                className={inputCls}
                                value={tareaEditFechaLimite}
                                onChange={(e) => setTareaEditFechaLimite(e.target.value)}
                              />
                            </label>
                          </div>
                          <div className="flex items-center justify-end gap-2 border-t border-slate-100 pt-3">
                            <button
                              type="button"
                              onClick={cancelarEdicionTarea}
                              disabled={enAccionTarea}
                              className="rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                            >
                              Cancelar
                            </button>
                            <button
                              type="button"
                              onClick={() => void guardarEdicionTarea(tid)}
                              disabled={enAccionTarea || !tareaEditTitulo.trim()}
                              className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                            >
                              {enAccionTarea ? "Guardando…" : "Guardar cambios"}
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="flex flex-wrap items-start gap-2">
                            <span
                              className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ring-2 ${tone.dot} ${tone.ring}`}
                              aria-hidden="true"
                            />
                            <div className="min-w-0 flex-1">
                              <p
                                className={`text-sm font-semibold ${
                                  estado === "completada"
                                    ? "text-slate-500 line-through"
                                    : "text-slate-900"
                                }`}
                              >
                                {String(t.titulo ?? "")}
                              </p>
                              {descripcion ? (
                                <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-slate-600">
                                  {descripcion}
                                </p>
                              ) : null}
                              {fechaLimite ? (
                                <p className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                                  <IconTareaCalendar />
                                  Vence {formatFechaPySolo(fechaLimite)}
                                </p>
                              ) : null}
                            </div>
                            <div className="flex items-center gap-1.5">
                              <FancySelect
                                size="sm"
                                className="min-w-[150px]"
                                ariaLabel="Estado de la tarea"
                                value={estado}
                                onChange={(v) => void patchTarea(tid, { estado: v })}
                                options={TAREA_ESTADO_OPTIONS.map((opt) => ({ ...opt }))}
                              />
                              {esCreadorTarea ? (
                                <>
                                  <button
                                    type="button"
                                    onClick={() => iniciarEdicionTarea(t)}
                                    disabled={enAccionTarea}
                                    aria-label="Editar tarea"
                                    title="Editar"
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-[#4FAEB2]/10 hover:text-[#3F8E91] disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <IconPencil />
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void eliminarTarea(tid)}
                                    disabled={enAccionTarea}
                                    aria-label="Eliminar tarea"
                                    title="Eliminar"
                                    className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    {enAccionTarea ? <IconSpinner /> : <IconTrash />}
                                  </button>
                                </>
                              ) : null}
                            </div>
                          </div>
                          <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-slate-100 pt-2.5 text-[11px] text-slate-500">
                            <span
                              className="inline-flex items-center gap-1.5"
                              title={creadoAt ? formatFechaPyFull(creadoAt) : undefined}
                            >
                              <span className="text-slate-400">
                                <IconTareaUser />
                              </span>
                              <span>
                                Creada por{" "}
                                <span className="font-medium text-slate-700">{creadoPor}</span>
                                {creadoAt ? ` · ${formatFechaRelativa(creadoAt)}` : ""}
                              </span>
                            </span>
                            <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                              <span className="text-slate-400">
                                <IconTareaUser />
                              </span>
                              <span>
                                {responsable ? (
                                  <>
                                    Asignada a{" "}
                                    <span className="font-medium text-slate-700">
                                      {responsable}
                                    </span>
                                  </>
                                ) : (
                                  "Sin asignar"
                                )}
                              </span>
                            </span>
                            {huboCambioEstado ? (
                              <span
                                className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 ${tone.chip}`}
                                title={cambioAt ? formatFechaPyFull(cambioAt) : undefined}
                              >
                                <IconTareaRefresh />
                                <span>
                                  {tareaEstadoLabel(estado)}
                                  {cambioPor ? (
                                    <>
                                      {" "}por{" "}
                                      <span className="font-medium">{cambioPor}</span>
                                    </>
                                  ) : null}
                                  {cambioAt ? ` · ${formatFechaRelativa(cambioAt)}` : ""}
                                </span>
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5">
                                <IconTareaRefresh />
                                <span>Estado: {tareaEstadoLabel(estado)} (inicial)</span>
                              </span>
                            )}
                          </div>
                        </>
                      )}
                    </li>
                  );
                })}
                {(data.tareas ?? []).length === 0 ? (
                  <li className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
                    Sin tareas registradas. Agregá la primera arriba.
                  </li>
                ) : null}
              </ul>
            </div>
          </div>
        ) : null}

        {tab === "qa" ? (
          <ProyectoQATab projectId={projectId} dataSchema={dataSchema} usuarios={usuarios} />
        ) : null}

        {tab === "comentarios" ? (
          <div className={`space-y-4 ${panelCls}`}>
            <div className="flex items-center gap-2">
              <span className="h-5 w-1 rounded-full bg-[#4FAEB2]" />
              <h2 className="text-sm font-semibold text-slate-900">Comentarios internos</h2>
            </div>
            <form onSubmit={agregarComentario} className="space-y-2">
              <textarea
                className={`${inputCls} min-h-[88px]`}
                rows={3}
                placeholder="Comentario interno"
                value={comTexto}
                onChange={(e) => setComTexto(e.target.value)}
              />
              <button
                type="submit"
                className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[#3F8E91]"
              >
                Publicar
              </button>
            </form>
            <ul className="space-y-3">
              {(data.comentarios ?? []).map((c) => {
                const cid = String(c.id ?? "");
                const autorId = String((c as { usuario_id?: string }).usuario_id ?? "");
                const esAutor =
                  !!data.current_user_id && autorId === data.current_user_id;
                const enEdicion = comEditandoId === cid;
                const enAccion = comActionId === cid;
                const textoOriginal = String(c.comentario ?? "");
                return (
                  <li
                    key={cid}
                    className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-sm"
                  >
                    <div className="flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                      <span className="font-medium text-[#4FAEB2]">
                        {String((c as { usuario_nombre?: string }).usuario_nombre ?? "")}
                      </span>
                      <span className="text-slate-300">·</span>
                      <span>{formatFechaPyFull(String(c.created_at ?? ""))}</span>
                      {esAutor && !enEdicion ? (
                        <span className="ml-auto flex items-center gap-0.5">
                          <button
                            type="button"
                            onClick={() => iniciarEdicionComentario(cid, textoOriginal)}
                            disabled={enAccion}
                            aria-label="Editar comentario"
                            title="Editar"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-[#4FAEB2]/10 hover:text-[#3F8E91] disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            <IconPencil />
                          </button>
                          <button
                            type="button"
                            onClick={() => void eliminarComentario(cid)}
                            disabled={enAccion}
                            aria-label="Eliminar comentario"
                            title="Eliminar"
                            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-rose-50 hover:text-rose-600 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            {enAccion ? <IconSpinner /> : <IconTrash />}
                          </button>
                        </span>
                      ) : null}
                    </div>
                    {enEdicion ? (
                      <div className="mt-2 space-y-2">
                        <textarea
                          className={`${inputCls} min-h-[72px]`}
                          rows={3}
                          value={comEditTexto}
                          onChange={(e) => setComEditTexto(e.target.value)}
                          autoFocus
                        />
                        <div className="flex items-center justify-end gap-2">
                          <button
                            type="button"
                            onClick={cancelarEdicionComentario}
                            disabled={enAccion}
                            className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 transition-colors hover:border-slate-300 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                          >
                            Cancelar
                          </button>
                          <button
                            type="button"
                            onClick={() => void guardarEdicionComentario(cid)}
                            disabled={enAccion || !comEditTexto.trim()}
                            className="rounded-xl bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                          >
                            {enAccion ? "Guardando…" : "Guardar"}
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-1.5 whitespace-pre-line break-words text-sm leading-relaxed text-slate-700">
                        {textoOriginal}
                      </div>
                    )}
                  </li>
                );
              })}
              {(data.comentarios ?? []).length === 0 ? (
                <li className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                  Aún no hay comentarios.
                </li>
              ) : null}
            </ul>
          </div>
        ) : null}

        {tab === "archivos" ? (() => {
          const archivosAll = data.archivos ?? [];
          // Conteo por categoría sobre el total.
          const conteo = new Map<ArchivoCategoria, number>();
          for (const a of archivosAll) {
            const cat = categoriaArchivo(a.nombre, a.mime_type);
            conteo.set(cat, (conteo.get(cat) ?? 0) + 1);
          }
          const categoriasPresentes = ARCHIVO_CATEGORIAS_ORDEN.filter((c) => (conteo.get(c.key) ?? 0) > 0);
          const filtrados =
            archivoFiltro === "todos"
              ? archivosAll
              : archivosAll.filter((a) => categoriaArchivo(a.nombre, a.mime_type) === archivoFiltro);
          const filtradosIds = filtrados.map((a) => String(a.id ?? ""));
          const selEnFiltro = filtradosIds.filter((id) => archivosSel.has(id));
          const todosFiltradosSel = filtradosIds.length > 0 && selEnFiltro.length === filtradosIds.length;
          const selIds = [...archivosSel];
          const ownedSelIds = selIds.filter((id) => {
            const a = archivosAll.find((x) => String(x.id ?? "") === id);
            return (
              !!a &&
              !!data.current_user_id &&
              typeof a.uploaded_by === "string" &&
              a.uploaded_by === data.current_user_id
            );
          });
          // Agrupación en secciones por tipo (respeta el filtro activo).
          const grupos = ARCHIVO_CATEGORIAS_ORDEN.map((c) => ({
            ...c,
            items: filtrados.filter((a) => categoriaArchivo(a.nombre, a.mime_type) === c.key),
          })).filter((g) => g.items.length > 0);
          const selectionMode = selIds.length > 0;

          const renderArchivoLi = (a: Record<string, unknown>) => {
            const aid = String(a.id ?? "");
            const nombre = String(a.nombre ?? "");
            const mime = typeof a.mime_type === "string" ? a.mime_type : "";
            const cat = categoriaArchivo(nombre, mime);
            const catColor = ARCHIVO_CATEGORIA_COLOR[cat];
            const subidoPor = (a.uploaded_by_nombre as string | null | undefined) ?? null;
            const esPropietario =
              !!data.current_user_id &&
              typeof a.uploaded_by === "string" &&
              a.uploaded_by === data.current_user_id;
            const enAccionArchivo = archivoActionId === aid;
            const seleccionado = archivosSel.has(aid);
            const fijarCheck = seleccionado || selectionMode;
            const thumb = cat === "imagen" ? thumbUrls[aid] : undefined;
            return (
              <li
                key={aid}
                className={`group flex items-center gap-3 rounded-xl border px-2.5 py-2 transition-all duration-150 ${
                  seleccionado
                    ? "border-[#4FAEB2]/50 bg-[#4FAEB2]/[0.06]"
                    : "border-transparent hover:border-slate-200 hover:bg-slate-50"
                }`}
              >
                {/* Ícono de tipo que se transforma en checkbox al hover / selección */}
                <label
                  className="relative h-10 w-10 shrink-0 cursor-pointer"
                  title="Seleccionar"
                >
                  <span
                    className={`absolute inset-0 flex items-center justify-center overflow-hidden rounded-xl transition-opacity duration-150 ${
                      thumb ? "ring-1 ring-slate-200" : `${catColor.bg} ${catColor.text}`
                    } ${fijarCheck ? "opacity-0" : "opacity-100 group-hover:opacity-0"}`}
                  >
                    {thumb ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={thumb}
                        alt={nombre}
                        loading="lazy"
                        className="h-full w-full object-cover"
                        onError={() => {
                          thumbFailedRef.current.add(aid);
                          setThumbUrls((prev) => {
                            const next = { ...prev };
                            delete next[aid];
                            return next;
                          });
                        }}
                      />
                    ) : (
                      <ArchivoTipoIcon cat={cat} />
                    )}
                  </span>
                  <span
                    className={`absolute inset-0 flex items-center justify-center transition-opacity duration-150 ${
                      fijarCheck ? "opacity-100" : "opacity-0 group-hover:opacity-100"
                    }`}
                  >
                    <input
                      type="checkbox"
                      className="h-[18px] w-[18px] cursor-pointer rounded-md border-slate-300 accent-[#4FAEB2]"
                      checked={seleccionado}
                      onChange={() => toggleArchivoSel(aid)}
                      disabled={archivoBulkBusy}
                      aria-label={`Seleccionar ${nombre}`}
                    />
                  </span>
                </label>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-800" title={nombre}>
                    {nombre}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-[11px] text-slate-400">
                    <span className="font-medium text-slate-500">{formatBytes(a.size_bytes)}</span>
                    <span className="text-slate-300">·</span>
                    {formatFechaPyFull(String(a.created_at ?? ""))}
                    {subidoPor ? (
                      <>
                        <span className="text-slate-300">·</span>
                        <span className="truncate">{subidoPor}</span>
                      </>
                    ) : null}
                  </p>
                </div>

                <div
                  className={`flex shrink-0 items-center gap-0.5 transition-opacity duration-150 ${
                    selectionMode ? "opacity-40" : "opacity-100"
                  }`}
                >
                  {isPreviewableMime(mime) ? (
                    <button
                      type="button"
                      onClick={() => void previsualizarArchivo(aid)}
                      disabled={enAccionArchivo || archivoBulkBusy}
                      title="Vista previa"
                      aria-label={`Vista previa de ${nombre}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white hover:text-[#3F8E91] hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {enAccionArchivo ? <IconSpinner /> : <IconEye />}
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => void descargarArchivo(aid)}
                    disabled={enAccionArchivo || archivoBulkBusy}
                    title="Descargar"
                    aria-label={`Descargar ${nombre}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white hover:text-[#3F8E91] hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {enAccionArchivo ? <IconSpinner /> : <IconDownload />}
                  </button>
                  {esPropietario ? (
                    <button
                      type="button"
                      onClick={() => void eliminarArchivo(aid, nombre)}
                      disabled={enAccionArchivo || archivoBulkBusy}
                      title="Eliminar"
                      aria-label={`Eliminar ${nombre}`}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-white hover:text-rose-500 hover:shadow-sm disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <IconTrash />
                    </button>
                  ) : null}
                </div>
              </li>
            );
          };
          return (
          <div className={`${panelCls}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span className="h-5 w-1 rounded-full bg-[#4FAEB2]" />
                <h2 className="text-sm font-semibold text-slate-900">Archivos del proyecto</h2>
              </div>
              <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[11px] font-medium text-slate-500">
                {archivosAll.length} archivo{archivosAll.length === 1 ? "" : "s"}
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Subí documentos, imágenes o PDFs (hasta {Math.round(ARCHIVO_MAX_BYTES / (1024 * 1024))} MB cada uno).
              Podés previsualizarlos y descargarlos cuando quieras.
            </p>

            <input
              ref={archivoInputRef}
              type="file"
              multiple
              className="hidden"
              onChange={onArchivoInputChange}
            />
            <div
              role="button"
              tabIndex={0}
              onClick={() => !archivoUploading && archivoInputRef.current?.click()}
              onKeyDown={(e) => {
                if ((e.key === "Enter" || e.key === " ") && !archivoUploading) {
                  e.preventDefault();
                  archivoInputRef.current?.click();
                }
              }}
              onDragOver={(e) => {
                e.preventDefault();
                if (!archivoUploading) setArchivoDragActive(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setArchivoDragActive(false);
              }}
              onDrop={onArchivoDrop}
              className={`mt-4 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition-colors ${
                archivoDragActive
                  ? "border-[#4FAEB2] bg-[#4FAEB2]/10"
                  : "border-slate-300 bg-slate-50 hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/5"
              } ${archivoUploading ? "pointer-events-none opacity-70" : ""}`}
            >
              <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#4FAEB2]/10 text-[#3F8E91]">
                {archivoUploading ? <IconSpinner /> : <IconUpload />}
              </span>
              <span className="text-sm font-medium text-slate-700">
                {archivoUploading ? "Subiendo…" : "Arrastrá archivos o hacé clic para seleccionar"}
              </span>
              <span className="text-xs text-slate-400">Se aceptan varios archivos a la vez</span>
            </div>

            {/* Filtros por tipo + entrada a modo selección */}
            {archivosAll.length > 0 ? (
              <div className="mt-5 flex flex-wrap items-center gap-1.5">
                {[{ key: "todos" as const, label: "Todos", count: archivosAll.length }, ...categoriasPresentes.map((c) => ({ key: c.key, label: c.label, count: conteo.get(c.key) ?? 0 }))].map((c) => {
                  const activo = archivoFiltro === c.key;
                  return (
                    <button
                      key={c.key}
                      type="button"
                      onClick={() => setArchivoFiltro(c.key)}
                      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                        activo
                          ? "bg-[#4FAEB2] text-white shadow-sm shadow-[#4FAEB2]/20"
                          : "bg-slate-100 text-slate-500 hover:bg-slate-200/70"
                      }`}
                    >
                      {c.label}
                      <span
                        className={`rounded-full px-1.5 text-[10px] font-semibold ${
                          activo ? "bg-white/25 text-white" : "bg-white text-slate-400"
                        }`}
                      >
                        {c.count}
                      </span>
                    </button>
                  );
                })}
                {!selectionMode && filtrados.length > 0 ? (
                  <button
                    type="button"
                    onClick={() => setArchivoSelLote(filtradosIds, true)}
                    className="ml-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium text-slate-400 transition-colors hover:text-[#3F8E91]"
                  >
                    <IconCheckSquare />
                    Seleccionar
                  </button>
                ) : null}
              </div>
            ) : null}

            {/* Barra flotante de acciones masivas */}
            {selectionMode ? (
              <div className="mt-3 flex flex-wrap items-center gap-3 rounded-xl border border-[#4FAEB2]/25 bg-[#4FAEB2]/[0.07] px-3 py-2">
                <label className="inline-flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    className="h-[18px] w-[18px] cursor-pointer rounded-md border-slate-300 accent-[#4FAEB2]"
                    checked={todosFiltradosSel}
                    ref={(el) => {
                      if (el) el.indeterminate = selEnFiltro.length > 0 && !todosFiltradosSel;
                    }}
                    onChange={(e) => setArchivoSelLote(filtradosIds, e.target.checked)}
                    disabled={archivoBulkBusy}
                  />
                  <span className="text-sm font-semibold text-[#3F8E91]">
                    {selIds.length} seleccionado{selIds.length === 1 ? "" : "s"}
                  </span>
                </label>
                <div className="ml-auto flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => void descargarSeleccionados(selIds)}
                    disabled={archivoBulkBusy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {archivoBulkBusy ? <IconSpinner /> : <IconDownload />}
                    Descargar
                  </button>
                  {ownedSelIds.length > 0 ? (
                    <button
                      type="button"
                      onClick={() => void eliminarSeleccionados(ownedSelIds)}
                      disabled={archivoBulkBusy}
                      title={
                        ownedSelIds.length < selIds.length
                          ? "Solo se eliminan los archivos que vos subiste"
                          : undefined
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border border-rose-200 bg-white px-3 py-1.5 text-xs font-semibold text-rose-600 transition-colors hover:bg-rose-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {archivoBulkBusy ? <IconSpinner /> : <IconTrash />}
                      Eliminar ({ownedSelIds.length})
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => setArchivosSel(new Set())}
                    disabled={archivoBulkBusy}
                    className="inline-flex items-center rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-white hover:text-slate-700 disabled:opacity-50"
                  >
                    Cancelar
                  </button>
                </div>
              </div>
            ) : null}

            {archivosAll.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                Sin archivos registrados.
              </div>
            ) : filtrados.length === 0 ? (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                No hay archivos de este tipo.
              </div>
            ) : (
              <div className="mt-5 space-y-6">
                {grupos.map((g) => {
                  const color = ARCHIVO_CATEGORIA_COLOR[g.key];
                  const idsGrupo = g.items.map((a) => String(a.id ?? ""));
                  const selEnGrupo = idsGrupo.filter((id) => archivosSel.has(id));
                  const todoGrupoSel = idsGrupo.length > 0 && selEnGrupo.length === idsGrupo.length;
                  return (
                    <section key={g.key} className="group/sec">
                      <div className="mb-2.5 flex items-center gap-2.5">
                        <span
                          className={`flex h-6 w-6 items-center justify-center rounded-lg ${color.bg} ${color.text}`}
                          aria-hidden="true"
                        >
                          <span className="scale-[0.72]">
                            <ArchivoTipoIcon cat={g.key} />
                          </span>
                        </span>
                        <h3 className="text-[13px] font-semibold text-slate-700">{g.label}</h3>
                        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-400">
                          {g.items.length}
                        </span>
                        <span className="h-px flex-1 bg-gradient-to-r from-slate-200/80 to-transparent" />
                        <label
                          className={`inline-flex cursor-pointer items-center gap-1.5 text-[11px] font-medium text-slate-400 transition-opacity hover:text-[#3F8E91] ${
                            selectionMode || selEnGrupo.length > 0
                              ? "opacity-100"
                              : "opacity-0 group-hover/sec:opacity-100"
                          }`}
                          title={`Seleccionar todos los de ${g.label}`}
                        >
                          <input
                            type="checkbox"
                            className="h-[15px] w-[15px] cursor-pointer rounded border-slate-300 accent-[#4FAEB2]"
                            checked={todoGrupoSel}
                            ref={(el) => {
                              if (el) el.indeterminate = selEnGrupo.length > 0 && !todoGrupoSel;
                            }}
                            onChange={(e) => setArchivoSelLote(idsGrupo, e.target.checked)}
                            disabled={archivoBulkBusy}
                            aria-label={`Seleccionar todos los de ${g.label}`}
                          />
                          Todo
                        </label>
                      </div>
                      <ul className="space-y-0.5">{g.items.map((a) => renderArchivoLi(a))}</ul>
                    </section>
                  );
                })}
              </div>
            )}
          </div>
          );
        })() : null}

        {tab === "cambios" ? (() => {
          const estadoCodigo = String(
            (proyecto as { proyecto_estado?: { codigo?: string } }).proyecto_estado?.codigo ?? ""
          ).toLowerCase();
          const estaEntregado = estadoCodigo === ESTADO_ENTREGADO_CODIGO;
          const desde = (proyecto as { estado_actual_desde?: string | null }).estado_actual_desde;
          const desdeMs = typeof desde === "string" ? Date.parse(desde) : Number.NaN;
          const diaActual = Number.isFinite(desdeMs)
            ? Math.max(1, Math.floor((Date.now() - desdeMs) / (1000 * 60 * 60 * 24)) + 1)
            : null;
          const vencido =
            diaActual != null && diaActual > POSTENTREGA_PERIODO_DIAS;
          const cambiosFromData = data.cambios ?? [];
          const cambiosByNro = new Map<number, ProyectoCambioCliente>();
          for (const c of cambiosFromData) cambiosByNro.set(c.nro, c);

          return (
            <div className={`space-y-4 ${panelCls}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="h-5 w-1 rounded-full bg-[#4FAEB2]" />
                    <h2 className="text-sm font-semibold text-slate-900">Cambios post-entrega</h2>
                  </div>
                  <p className="mt-1.5 text-xs text-slate-500">
                    Hasta 3 cambios gratis dentro de los {POSTENTREGA_PERIODO_DIAS} días desde la
                    entrega.
                  </p>
                </div>
                {estaEntregado && diaActual != null ? (
                  <span
                    className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${
                      vencido
                        ? "border-rose-200 bg-rose-50 text-rose-700"
                        : diaActual >= 25
                          ? "border-amber-200 bg-amber-50 text-amber-700"
                          : "border-[#4FAEB2]/30 bg-[#4FAEB2]/10 text-[#3F8E91]"
                    }`}
                  >
                    {vencido
                      ? `Período cerrado · día ${diaActual}`
                      : `Día ${diaActual} de ${POSTENTREGA_PERIODO_DIAS}`}
                  </span>
                ) : null}
              </div>

              {!estaEntregado ? (
                <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                  La edición se habilita cuando el proyecto está en estado{" "}
                  <span className="font-semibold">Entregado</span>. Mientras tanto podés consultar
                  los cambios ya registrados.
                </p>
              ) : null}

              <ul className="space-y-3">
                {CAMBIOS_SLOTS.map((nro) => {
                  const existing = cambiosByNro.get(nro);
                  const draft =
                    cambiosDraft[nro] ?? { realizado: false, comentario: "" };
                  const enAccion = cambioSavingNro === nro;
                  const editable = estaEntregado && !enAccion;
                  const tienePersistido =
                    existing != null && existing.realizado_at != null;
                  const sinCambios =
                    draft.realizado === (existing?.realizado ?? false) &&
                    (draft.comentario ?? "") === (existing?.comentario ?? "");

                  return (
                    <li
                      key={nro}
                      className="rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-semibold text-slate-900">
                          <input
                            type="checkbox"
                            className="h-4 w-4 rounded border-slate-300 text-[#4FAEB2] focus:ring-[#4FAEB2]"
                            checked={draft.realizado}
                            disabled={!editable}
                            onChange={(e) =>
                              setCambiosDraft((prev) => ({
                                ...prev,
                                [nro]: {
                                  realizado: e.target.checked,
                                  comentario: prev[nro]?.comentario ?? "",
                                },
                              }))
                            }
                          />
                          Cambio {nro} realizado
                        </label>
                        {tienePersistido ? (
                          <span className="text-[11px] text-slate-500">
                            Registrado por{" "}
                            <span className="font-medium text-[#4FAEB2]">
                              {existing?.realizado_por_nombre ?? "—"}
                            </span>{" "}
                            · {formatFechaPyFull(String(existing?.realizado_at ?? ""))}
                          </span>
                        ) : null}
                      </div>
                      <textarea
                        className={`${inputCls} mt-2 min-h-[80px]`}
                        rows={3}
                        placeholder={`Detalle del cambio ${nro}…`}
                        value={draft.comentario}
                        disabled={!editable}
                        onChange={(e) =>
                          setCambiosDraft((prev) => ({
                            ...prev,
                            [nro]: {
                              realizado: prev[nro]?.realizado ?? false,
                              comentario: e.target.value,
                            },
                          }))
                        }
                      />
                      <div className="mt-2 flex items-center justify-end gap-2">
                        <button
                          type="button"
                          disabled={!editable || sinCambios}
                          onClick={() => void guardarCambio(nro)}
                          className="rounded-xl bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
                        >
                          {enAccion ? "Guardando…" : "Guardar"}
                        </button>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          );
        })() : null}

        {tab === "historial" ? (
          <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-slate-100 text-sm">
                <thead className="bg-slate-50 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-2.5">Estado anterior</th>
                    <th className="px-3 py-2.5">Estado nuevo</th>
                    <th className="px-3 py-2.5">Tipo SLA</th>
                    <th className="px-3 py-2.5">Entrada</th>
                    <th className="px-3 py-2.5">Salida</th>
                    <th className="px-3 py-2.5">Duración</th>
                    <th className="px-3 py-2.5">Usuario</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(data.historial ?? []).map((h) => {
                    const hr = h as Record<string, unknown>;
                    const ant =
                      (hr.estado_anterior_nombre as string | undefined) ??
                      (hr.estado_anterior_id ? String(hr.estado_anterior_id) : "—");
                    const nue =
                      (hr.estado_nuevo_nombre as string | undefined) ??
                      String(hr.estado_nuevo_id ?? "—");
                    const slaL =
                      (hr.tipo_sla_label as string | undefined) ??
                      String(hr.tipo_sla_snapshot ?? "—");
                    const usr = (hr.usuario_cambio_label as string | undefined) ?? "No registrado";
                    const dur =
                      (hr.duration_label as string | undefined) ??
                      (hr.duration_seconds != null ? String(hr.duration_seconds) + " s" : "—");
                    return (
                      <tr key={String(h.id)} className="text-slate-700 hover:bg-slate-50/60">
                        <td className="px-3 py-2 text-xs">{ant}</td>
                        <td className="px-3 py-2 text-xs font-semibold text-slate-900">{nue}</td>
                        <td className="px-3 py-2 text-xs text-slate-600">{slaL}</td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-slate-600">
                          {formatFechaPyFull(String(h.entered_at ?? ""))}
                        </td>
                        <td className="whitespace-nowrap px-3 py-2 text-xs tabular-nums text-slate-600">
                          {h.exited_at ? formatFechaPyFull(String(h.exited_at)) : "—"}
                        </td>
                        <td className="px-3 py-2 text-xs text-slate-600">{dur}</td>
                        <td className="max-w-[140px] truncate px-3 py-2 text-xs text-slate-500" title={usr}>
                          {usr}
                        </td>
                      </tr>
                    );
                  })}
                  {(data.historial ?? []).length === 0 ? (
                    <tr>
                      <td colSpan={7} className="px-3 py-6 text-center text-xs text-slate-400">
                        Sin historial registrado.
                      </td>
                    </tr>
                  ) : null}
                </tbody>
              </table>
            </div>
          </div>
        ) : null}
      </div>

      {deleteModalOpen ? (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <button
            type="button"
            aria-label="Cerrar"
            className="absolute inset-0 bg-slate-900/55 backdrop-blur-sm"
            onClick={() => { if (!deleting) setDeleteModalOpen(false); }}
          />
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="proyecto-eliminar-titulo"
            className="relative w-full max-w-md overflow-hidden rounded-2xl border border-red-200 bg-white shadow-2xl"
          >
            <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-red-500 via-red-500/80 to-red-400/40" />
            <div className="flex items-start gap-3 border-b border-slate-100 px-5 pb-4 pt-5">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-50 text-red-600 ring-1 ring-red-200">
                <AlertTriangle className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="min-w-0 flex-1">
                <h2 id="proyecto-eliminar-titulo" className="text-base font-semibold text-slate-900">
                  Eliminar proyecto definitivamente
                </h2>
                <p className="mt-1 text-xs text-slate-500">Esta acción no se puede deshacer.</p>
              </div>
              <button
                type="button"
                aria-label="Cerrar"
                onClick={() => { if (!deleting) setDeleteModalOpen(false); }}
                className="rounded-md p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
                disabled={deleting}
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 px-5 py-4 text-sm text-slate-700">
              <p>
                Vas a eliminar el proyecto{" "}
                <strong className="font-semibold text-slate-900">
                  {String(data?.proyecto?.titulo ?? "")}
                </strong>
                . Esto borra el proyecto y en cascada todas sus tareas, comentarios, archivos e historial.
              </p>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Para confirmar, escribí el título exacto:
                </label>
                <input
                  type="text"
                  autoFocus
                  value={deleteConfirmText}
                  onChange={(e) => { setDeleteConfirmText(e.target.value); if (deleteError) setDeleteError(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") void confirmarEliminacion(); }}
                  placeholder={String(data?.proyecto?.titulo ?? "")}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-red-400 focus:outline-none focus:ring-2 focus:ring-red-200"
                  disabled={deleting}
                />
                {deleteError ? (
                  <p className="mt-1.5 text-xs text-red-600">{deleteError}</p>
                ) : null}
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-100 bg-slate-50 px-5 py-3">
              <button
                type="button"
                onClick={() => setDeleteModalOpen(false)}
                disabled={deleting}
                className="rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => void confirmarEliminacion()}
                disabled={deleting || deleteConfirmText.trim() !== String(data?.proyecto?.titulo ?? "").trim()}
                className="rounded-lg bg-red-600 px-3.5 py-2 text-sm font-medium text-white shadow-sm transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:bg-red-300"
              >
                {deleting ? "Eliminando…" : "Eliminar definitivamente"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
