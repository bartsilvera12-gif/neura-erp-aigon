"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useSearchParams } from "next/navigation";
import { getClientes, clienteNombre } from "@/lib/clientes/storage";
import type { Cliente } from "@/lib/clientes/types";
import { etiquetaVisibleTipoServicio, type ClienteTipoServicioRow } from "@/lib/clientes/tipo-servicio-catalogo";
import { filasTiposDesdeSistemaEstatico, fetchTiposFormCliente } from "@/lib/clientes/fetch-tipos-servicio-form";
import { FancySelect } from "@/app/dashboard/proyectos/components/FancySelect";
import EdgeScrollArea from "@/components/ui/EdgeScrollArea";
import ClienteNuevoModal from "@/app/clientes/components/ClienteNuevoModal";
import ClienteDetalleModal from "@/app/clientes/components/ClienteDetalleModal";

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatFecha(iso: string) {
  try {
    const d = new Date(iso);
    return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}/${d.getFullYear()}`;
  } catch { return ""; }
}

// ── Badges ────────────────────────────────────────────────────────────────────

function BadgeEstado({ estado }: { estado: Cliente["estado"] }) {
  const activo = estado === "activo";
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
        activo
          ? "border-emerald-200 bg-emerald-50 text-emerald-700"
          : "border-slate-200 bg-slate-50 text-slate-500"
      }`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${activo ? "bg-emerald-500" : "bg-slate-400"}`} />
      {activo ? "Activo" : "Inactivo"}
    </span>
  );
}

function BadgeOrigen({ origen }: { origen: Cliente["origen"] }) {
  const cfg: Record<Cliente["origen"], { cls: string; dot: string }> = {
    CRM: {
      cls: "border-violet-200 bg-violet-50 text-violet-700",
      dot: "bg-violet-500",
    },
    VENTA: {
      cls: "border-[#4FAEB2]/30 bg-[#4FAEB2]/10 text-[#3F8E91]",
      dot: "bg-[#4FAEB2]",
    },
    MANUAL: {
      cls: "border-slate-200 bg-slate-50 text-slate-600",
      dot: "bg-slate-400",
    },
  };
  const it = cfg[origen];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${it.cls}`}
    >
      <span aria-hidden="true" className={`h-1 w-1 rounded-full ${it.dot}`} />
      {origen}
    </span>
  );
}

// ── Color del avatar según iniciales del nombre (estable, no aleatorio) ───────

const AVATAR_TONES = [
  { bg: "bg-[#4FAEB2]/12 text-[#3F8E91] border border-[#4FAEB2]/30" },
  { bg: "bg-violet-50 text-violet-700 border border-violet-200" },
  { bg: "bg-amber-50 text-amber-700 border border-amber-200" },
  { bg: "bg-emerald-50 text-emerald-700 border border-emerald-200" },
  { bg: "bg-rose-50 text-rose-700 border border-rose-200" },
  { bg: "bg-sky-50 text-sky-700 border border-sky-200" },
];

function avatarToneFor(label: string): string {
  let hash = 0;
  for (let i = 0; i < label.length; i++) hash = (hash * 31 + label.charCodeAt(i)) | 0;
  const idx = Math.abs(hash) % AVATAR_TONES.length;
  return AVATAR_TONES[idx].bg;
}

function avatarInitial(label: string): string {
  const cleaned = label.replace(/^[^A-Za-z0-9]+/, "");
  const m = cleaned.match(/[A-Za-z0-9]/);
  return (m?.[0] ?? "?").toUpperCase();
}

// ── Tipo servicio: chip turquesa cuando hay valor ────────────────────────────

function TipoServicioCell({ slug, mapNombreTipo }: { slug: string | null; mapNombreTipo: Record<string, string> }) {
  const label = etiquetaVisibleTipoServicio(slug, mapNombreTipo);
  if (!label || label === "—") return <span className="text-xs text-slate-400">—</span>;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-medium text-slate-700">
      <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[#4FAEB2]" />
      {label}
    </span>
  );
}

// ── Columnas configurables ────────────────────────────────────────────────────

const CLIENTES_COLUMNAS_STORAGE_KEY = "neura.erp.clientes.columnas.v1";

type ClienteColumnKey =
  | "codigo"
  | "empresa_nombre"
  | "contacto"
  | "telefono"
  | "plan_activo"
  | "origen"
  | "tipo_servicio"
  | "estado"
  | "desde"
  | "creado_por"
  | "ruc_documento"
  | "email"
  | "vendedor_responsable";

type ClienteColumnDef = {
  key: ClienteColumnKey;
  label: string;
  visibleDefault: boolean;
  required?: boolean;
  headerClassName?: string;
  className?: string;
  render: (cliente: Cliente) => ReactNode;
};

const DEFAULT_VISIBLE_COLUMN_KEYS: ClienteColumnKey[] = [
  "codigo",
  "empresa_nombre",
  "contacto",
  "telefono",
  "plan_activo",
  "origen",
  "tipo_servicio",
  "estado",
  "desde",
];

function normalizeVisibleColumnKeys(raw: unknown, columns: ClienteColumnDef[]): ClienteColumnKey[] {
  const validKeys = new Set(columns.map((c) => c.key));
  const requiredKeys = columns.filter((c) => c.required).map((c) => c.key);
  const source = Array.isArray(raw) ? raw : DEFAULT_VISIBLE_COLUMN_KEYS;
  const next = source.filter((k): k is ClienteColumnKey => typeof k === "string" && validKeys.has(k as ClienteColumnKey));

  for (const key of requiredKeys) {
    if (!next.includes(key)) next.push(key);
  }
  return next.length > 0 ? next : [...DEFAULT_VISIBLE_COLUMN_KEYS];
}

function documentoCliente(c: Cliente): string {
  return c.ruc?.trim() || c.documento?.trim() || "—";
}

function VendedorResponsableCell({ cliente }: { cliente: Cliente }) {
  const nombre = cliente.vendedor_usuario_nombre?.trim();
  const email = cliente.vendedor_usuario_email?.trim();
  const legacy = cliente.vendedor_asignado?.trim();

  if (cliente.vendedor_usuario_id) {
    return nombre || email || "Usuario ERP asignado";
  }

  if (legacy) {
    return (
      <span className="inline-flex items-center gap-1.5">
        <span>{legacy}</span>
        <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-slate-500">
          Texto libre
        </span>
      </span>
    );
  }

  return <span className="text-slate-400">Sin asignar</span>;
}

function buildClienteColumns(mapNombreTipo: Record<string, string>): ClienteColumnDef[] {
  const th =
    "text-left text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500 px-3 py-2 whitespace-nowrap";
  const td = "px-3 py-2.5";
  return [
    {
      key: "codigo",
      label: "Código",
      visibleDefault: true,
      headerClassName: th,
      className: td,
      render: (c) => (
        <span className="inline-flex items-center rounded-md border border-slate-200 bg-slate-50 px-2 py-0.5 font-mono text-[11px] font-medium text-slate-600">
          {c.codigo_cliente}
        </span>
      ),
    },
    {
      key: "empresa_nombre",
      label: "Empresa / Nombre",
      visibleDefault: true,
      required: true,
      headerClassName: th,
      className: td,
      render: (c) => {
        const nombre = clienteNombre(c);
        const tone = avatarToneFor(nombre);
        return (
          <div className="flex min-w-56 items-center gap-2.5">
            <div
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${tone}`}
            >
              {avatarInitial(nombre)}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-1.5">
                <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-slate-950">
                  {nombre}
                </p>
                {c.perfil_tributario_activo && (
                  <span className="inline-flex items-center gap-1 rounded-full border border-violet-200 bg-violet-50 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-violet-700">
                    Tributario
                  </span>
                )}
              </div>
              {c.tipo_cliente === "empresa" && c.ruc ? (
                <p className="mt-0.5 text-[11px] text-slate-500">
                  <span className="font-medium text-slate-400">RUC:</span> {c.ruc}
                </p>
              ) : c.tipo_cliente === "persona" ? (
                <p className="mt-0.5 text-[11px] text-slate-400">Persona física</p>
              ) : null}
            </div>
          </div>
        );
      },
    },
    {
      key: "contacto",
      label: "Contacto",
      visibleDefault: true,
      headerClassName: th,
      className: `${td} text-sm text-slate-700 whitespace-nowrap`,
      render: (c) => (c.tipo_cliente === "empresa" ? c.nombre_contacto : (c.ciudad ?? "—")),
    },
    {
      key: "telefono",
      label: "Teléfono",
      visibleDefault: true,
      headerClassName: th,
      className: `${td} text-sm tabular-nums text-slate-600 whitespace-nowrap`,
      render: (c) => c.telefono ?? "—",
    },
    {
      key: "plan_activo",
      label: "Plan activo",
      visibleDefault: true,
      headerClassName: th,
      className: td,
      render: (c) =>
        c.plan_activo ? (
          <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-[#4FAEB2]/30 bg-[#4FAEB2]/10 px-2 py-0.5 text-[11px] font-semibold text-[#3F8E91]">
            <span aria-hidden="true" className="h-1 w-1 rounded-full bg-[#4FAEB2]" />
            {c.plan_activo}
          </span>
        ) : (
          <span className="whitespace-nowrap text-xs italic text-slate-400">Sin suscripción</span>
        ),
    },
    {
      key: "origen",
      label: "Origen",
      visibleDefault: true,
      headerClassName: th,
      className: td,
      render: (c) => <BadgeOrigen origen={c.origen} />,
    },
    {
      key: "tipo_servicio",
      label: "Tipo servicio",
      visibleDefault: true,
      headerClassName: th,
      className: `${td} whitespace-nowrap`,
      render: (c) => <TipoServicioCell slug={c.tipo_servicio_cliente ?? null} mapNombreTipo={mapNombreTipo} />,
    },
    {
      key: "estado",
      label: "Estado",
      visibleDefault: true,
      headerClassName: th,
      className: td,
      render: (c) => <BadgeEstado estado={c.estado} />,
    },
    {
      key: "desde",
      label: "Desde",
      visibleDefault: true,
      headerClassName: th,
      className: `${td} text-xs tabular-nums text-slate-500 whitespace-nowrap`,
      render: (c) => formatFecha(c.created_at),
    },
    {
      key: "creado_por",
      label: "Creado por",
      visibleDefault: false,
      headerClassName: th,
      className: `${td} text-xs text-slate-500 whitespace-nowrap`,
      render: (c) => c.created_by_nombre ?? "—",
    },
    {
      key: "ruc_documento",
      label: "RUC / documento",
      visibleDefault: false,
      headerClassName: th,
      className: `${td} text-sm text-slate-600 whitespace-nowrap`,
      render: documentoCliente,
    },
    {
      key: "email",
      label: "Email",
      visibleDefault: false,
      headerClassName: th,
      className: `${td} text-sm text-slate-600 whitespace-nowrap`,
      render: (c) => c.email ?? "—",
    },
    {
      key: "vendedor_responsable",
      label: "Vendedor responsable",
      visibleDefault: false,
      headerClassName: th,
      className: `${td} text-xs text-slate-500 whitespace-nowrap`,
      render: (c) => <VendedorResponsableCell cliente={c} />,
    },
  ];
}

// ── Componente principal ──────────────────────────────────────────────────────

export default function ClientesPage() {
  const searchParams = useSearchParams();
  const [clientes,    setClientes]    = useState<Cliente[]>([]);
  const [cargando,    setCargando]    = useState(true);
  const [busqueda,    setBusqueda]    = useState("");
  const [bajaOk,      setBajaOk]      = useState(false);
  const [filtroEstado, setFiltroEstado] = useState<"" | "activo" | "inactivo">("");
  const [filtroOrigen, setFiltroOrigen] = useState<"" | "CRM" | "VENTA" | "MANUAL">("");
  const [filtroTipo,   setFiltroTipo]   = useState<"" | "empresa" | "persona">("");
  const [filtroTipoServicio, setFiltroTipoServicio] = useState<"" | string>("");
  const [nuevoOpen, setNuevoOpen] = useState(false);
  const [detalleId, setDetalleId] = useState<string | null>(null);
  const [columnasOpen, setColumnasOpen] = useState(false);
  const [columnasInicializadas, setColumnasInicializadas] = useState(false);
  const [visibleColumnKeys, setVisibleColumnKeys] = useState<ClienteColumnKey[]>(DEFAULT_VISIBLE_COLUMN_KEYS);
  const [filasTipoCatalogo, setFilasTipoCatalogo] = useState<ClienteTipoServicioRow[]>(() => filasTiposDesdeSistemaEstatico());
  const mapNombreTipo = useMemo(() => {
    const m: Record<string, string> = {};
    for (const t of filasTipoCatalogo) m[t.slug] = t.nombre;
    return m;
  }, [filasTipoCatalogo]);
  const clienteColumns = useMemo(() => buildClienteColumns(mapNombreTipo), [mapNombreTipo]);
  const visibleColumnSet = useMemo(() => new Set(visibleColumnKeys), [visibleColumnKeys]);
  const visibleColumns = useMemo(
    () => clienteColumns.filter((col) => visibleColumnSet.has(col.key)),
    [clienteColumns, visibleColumnSet]
  );

  const recargarClientes = () => {
    setCargando(true);
    void getClientes({ incluirPlanActivo: true }).then((data) => {
      setClientes(data);
      setCargando(false);
    });
  };

  useEffect(() => {
    getClientes({ incluirPlanActivo: true }).then((data) => {
      setClientes(data);
      setCargando(false);
    });
  }, []);

  useEffect(() => {
    void fetchTiposFormCliente().then(setFilasTipoCatalogo);
  }, []);

  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(CLIENTES_COLUMNAS_STORAGE_KEY);
      const parsed = raw ? JSON.parse(raw) : null;
      setVisibleColumnKeys(normalizeVisibleColumnKeys(parsed, clienteColumns));
    } catch {
      setVisibleColumnKeys([...DEFAULT_VISIBLE_COLUMN_KEYS]);
    } finally {
      setColumnasInicializadas(true);
    }
  }, [clienteColumns]);

  useEffect(() => {
    if (!columnasInicializadas) return;
    try {
      window.localStorage.setItem(CLIENTES_COLUMNAS_STORAGE_KEY, JSON.stringify(visibleColumnKeys));
    } catch {
      /* localStorage puede fallar en modo privado; los defaults siguen funcionando. */
    }
  }, [visibleColumnKeys, columnasInicializadas]);

  const slugsExtraFiltro = useMemo(() => {
    const known = new Set(filasTipoCatalogo.map((f) => f.slug));
    const u = new Set<string>();
    for (const c of clientes) {
      const t = (c.tipo_servicio_cliente ?? "").trim();
      if (t && !known.has(t)) u.add(t);
    }
    return Array.from(u).sort();
  }, [clientes, filasTipoCatalogo]);

  useEffect(() => {
    if (searchParams?.get("baja_ok") === "1") {
      setBajaOk(true);
      window.history.replaceState({}, "", "/clientes");
      const t = setTimeout(() => setBajaOk(false), 5000);
      return () => clearTimeout(t);
    }
  }, [searchParams]);

  const filtrados = clientes.filter((c) => {
    const nombre = clienteNombre(c).toLowerCase();
    const q      = busqueda.toLowerCase();
    if (q) {
      const match =
        nombre.includes(q) ||
        (c.codigo_cliente ?? "").toLowerCase().includes(q) ||
        (c.email          ?? "").toLowerCase().includes(q) ||
        (c.telefono       ?? "").toLowerCase().includes(q) ||
        (c.ruc            ?? "").toLowerCase().includes(q) ||
        (c.ciudad         ?? "").toLowerCase().includes(q);
      if (!match) return false;
    }
    if (filtroEstado       && c.estado              !== filtroEstado) return false;
    if (filtroOrigen       && c.origen              !== filtroOrigen) return false;
    if (filtroTipo         && c.tipo_cliente        !== filtroTipo) return false;
    if (filtroTipoServicio && c.tipo_servicio_cliente !== filtroTipoServicio) return false;
    return true;
  });

  const hayFiltros = busqueda || filtroEstado || filtroOrigen || filtroTipo || filtroTipoServicio;

  function toggleColumn(key: ClienteColumnKey) {
    const col = clienteColumns.find((c) => c.key === key);
    if (!col || col.required) return;
    setVisibleColumnKeys((prev) => {
      if (prev.includes(key)) return prev.filter((k) => k !== key);
      return [...prev, key];
    });
  }

  function resetColumnas() {
    setVisibleColumnKeys([...DEFAULT_VISIBLE_COLUMN_KEYS]);
  }

  return (
    <div className="space-y-4">

      {/* Mensaje de éxito baja operativa */}
      {bajaOk && (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-xl px-3 py-2.5 text-green-800">
          <span className="text-lg">✓</span>
          <p className="text-sm font-medium">Baja procesada correctamente</p>
        </div>
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Base
            </p>
          </div>
          <h1 className="mt-0.5 text-lg font-semibold tracking-tight text-slate-900">Clientes</h1>
          <p className="text-xs text-slate-500">Base de clientes activos de la empresa</p>
        </div>
        <button
          type="button"
          onClick={() => setNuevoOpen(true)}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#4FAEB2] px-3 py-1.5 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/20 transition-colors hover:bg-[#3F8E91]"
        >
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
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nuevo cliente
        </button>
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-2.5 shadow-sm">
        <div className="relative min-w-[200px] flex-1">
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
            type="text"
            placeholder="Buscar por nombre, código, email, RUC…"
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-9 pr-3 text-xs text-slate-900 shadow-sm transition-colors placeholder:text-slate-400 hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20"
          />
        </div>
        <FancySelect
          size="sm"
          className="min-w-[150px] shrink-0"
          ariaLabel="Filtrar por estado"
          placeholder="Todos los estados"
          value={filtroEstado}
          onChange={(v) => setFiltroEstado(v as "" | "activo" | "inactivo")}
          options={[
            { value: "", label: "Todos los estados" },
            { value: "activo", label: "Activo" },
            { value: "inactivo", label: "Inactivo" },
          ]}
        />
        <FancySelect
          size="sm"
          className="min-w-[140px] shrink-0"
          ariaLabel="Filtrar por tipo"
          placeholder="Todos los tipos"
          value={filtroTipo}
          onChange={(v) => setFiltroTipo(v as "" | "empresa" | "persona")}
          options={[
            { value: "", label: "Todos los tipos" },
            { value: "empresa", label: "Empresa" },
            { value: "persona", label: "Persona" },
          ]}
        />
        <FancySelect
          size="sm"
          className="min-w-[160px] shrink-0"
          ariaLabel="Filtrar por origen"
          placeholder="Todos los orígenes"
          value={filtroOrigen}
          onChange={(v) => setFiltroOrigen(v as "" | "CRM" | "VENTA" | "MANUAL")}
          options={[
            { value: "", label: "Todos los orígenes" },
            { value: "CRM", label: "CRM" },
            { value: "VENTA", label: "Venta" },
            { value: "MANUAL", label: "Manual" },
          ]}
        />
        <FancySelect
          size="sm"
          className="min-w-[160px] shrink-0"
          ariaLabel="Filtrar por tipo de servicio"
          placeholder="Tipo servicio"
          value={filtroTipoServicio}
          onChange={(v) => setFiltroTipoServicio(v)}
          options={[
            { value: "", label: "Todos los servicios" },
            ...filasTipoCatalogo.map((t) => ({ value: t.slug, label: t.nombre })),
            ...slugsExtraFiltro.map((slug) => ({
              value: slug,
              label: etiquetaVisibleTipoServicio(slug, mapNombreTipo),
            })),
          ]}
        />
        {hayFiltros && (
          <button
            onClick={() => {
              setBusqueda("");
              setFiltroEstado("");
              setFiltroOrigen("");
              setFiltroTipo("");
              setFiltroTipoServicio("");
            }}
            className="shrink-0 rounded-lg border border-transparent px-2.5 py-1.5 text-[11px] font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
          >
            Limpiar filtros
          </button>
        )}
      </div>

      {/* Contador */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-slate-500">
          <span className="font-semibold text-slate-800 tabular-nums">{filtrados.length}</span> de{" "}
          <span className="font-semibold text-slate-800 tabular-nums">{clientes.length}</span> clientes
        </p>
        <div className="flex items-center gap-2.5">
          <div className="hidden gap-2.5 text-[11px] text-slate-500 sm:flex">
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              <span className="tabular-nums">
                {clientes.filter((c) => c.estado === "activo").length}
              </span>{" "}
              activos
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-[#4FAEB2]" />
              <span className="tabular-nums">
                {clientes.filter((c) => c.tipo_cliente === "empresa").length}
              </span>{" "}
              empresas
            </span>
          </div>
          <div className="relative">
            <button
              type="button"
              onClick={() => setColumnasOpen((v) => !v)}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#3F8E91]"
              aria-expanded={columnasOpen}
            >
              <span>Columnas</span>
              <span className="rounded-full bg-[#4FAEB2]/10 px-1.5 py-0.5 text-[10px] font-semibold text-[#3F8E91] tabular-nums">
                {visibleColumns.length}/{clienteColumns.length}
              </span>
            </button>
            {columnasOpen && (
              <div className="absolute right-0 z-20 mt-2 w-80 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl ring-1 ring-[#4FAEB2]/15">
                <div className="border-b border-slate-100 p-4">
                  <p className="text-sm font-semibold text-slate-800">Columnas visibles</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Personalizá qué información querés ver en esta tabla.
                  </p>
                </div>
                <div className="max-h-80 overflow-y-auto p-2">
                  {clienteColumns.map((col) => {
                    const checked = visibleColumnSet.has(col.key);
                    return (
                      <label
                        key={col.key}
                        className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition-colors ${
                          col.required
                            ? "cursor-not-allowed bg-slate-50 text-slate-500"
                            : "cursor-pointer text-slate-700 hover:bg-[#4FAEB2]/8"
                        }`}
                      >
                        <span>{col.label}</span>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={col.required}
                          onChange={() => toggleColumn(col.key)}
                          className="h-4 w-4 rounded border-slate-300 text-[#4FAEB2] accent-[#4FAEB2] focus:ring-[#4FAEB2]/30"
                        />
                      </label>
                    );
                  })}
                </div>
                <div className="flex items-center justify-between gap-3 border-t border-slate-100 p-3">
                  <p className="text-[11px] text-slate-400">Empresa / Nombre queda siempre visible.</p>
                  <button
                    type="button"
                    onClick={resetColumnas}
                    className="text-xs font-semibold text-[#4FAEB2] transition-colors hover:text-[#3F8E91]"
                  >
                    Restablecer
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Tabla */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        {cargando ? (
          <div className="flex items-center justify-center gap-3 py-20 text-sm text-slate-500">
            <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#4FAEB2]" />
            Cargando clientes…
          </div>
        ) : filtrados.length === 0 ? (
          <div className="py-20 text-center">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full border border-[#4FAEB2]/25 bg-[#4FAEB2]/10 text-[#4FAEB2]">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5"
                aria-hidden="true"
              >
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                <circle cx="9" cy="7" r="4" />
                <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                <path d="M16 3.13a4 4 0 0 1 0 7.75" />
              </svg>
            </div>
            <p className="text-sm font-semibold text-slate-700">
              {clientes.length === 0 ? "No hay clientes registrados" : "Sin resultados para los filtros aplicados"}
            </p>
            <p className="mx-auto mt-1 max-w-md text-xs text-slate-500">
              {clientes.length === 0
                ? "Empezá creando tu primer cliente para construir tu base."
                : "Probá ajustar la búsqueda o limpiar los filtros."}
            </p>
            {clientes.length === 0 && (
              <button
                type="button"
                onClick={() => setNuevoOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-3.5 py-2 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/20 transition-colors hover:bg-[#3F8E91]"
              >
                Crear primer cliente
              </button>
            )}
          </div>
        ) : /* tabla */ (
          <EdgeScrollArea>
            <table className="w-full min-w-full">
              <thead className="border-b border-slate-200 bg-slate-50/80 backdrop-blur-sm">
                <tr>
                  {visibleColumns.map((col) => (
                    <th key={col.key} className={col.headerClassName}>
                      {col.label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtrados.map((c) => (
                  <tr
                    key={c.id}
                    className="group cursor-pointer transition-colors hover:bg-[#4FAEB2]/[0.04]"
                    onClick={() => setDetalleId(c.id)}
                  >
                    {visibleColumns.map((col) => (
                      <td key={col.key} className={col.className}>
                        {col.render(c)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </EdgeScrollArea>
        )}
      </div>

      <ClienteNuevoModal
        open={nuevoOpen}
        onClose={() => setNuevoOpen(false)}
        onCreated={(id) => {
          setNuevoOpen(false);
          recargarClientes();
          setDetalleId(id);
        }}
      />

      <ClienteDetalleModal
        id={detalleId}
        open={detalleId != null}
        onClose={() => setDetalleId(null)}
        onUpdated={() => recargarClientes()}
      />
    </div>
  );
}
