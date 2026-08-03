"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { MarketingOpsComentario, MarketingOpsHistorial, MarketingOpsPieza } from "@/lib/marketing-ops/types";
import {
  ESTADO_CLIENTE_OPTIONS,
  ESTADO_PRODUCCION_OPTIONS,
  ESTADO_PUBLICACION_OPTIONS,
  PRIORIDAD_OPTIONS,
  clienteLabel,
  estadoBadgeClass,
  estadoBadgeDotClass,
  fmtDate,
  labelFor,
  prioridadBadgeClass,
  prioridadDotClass,
} from "./marketingOpsUi";

const SELECT_CLS =
  "w-full appearance-none rounded-xl border border-slate-200 bg-white bg-[length:14px_14px] bg-[right_0.7rem_center] bg-no-repeat px-3 py-2 pr-8 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:outline-none focus:ring-2 focus:ring-[#4FAEB2]/20";
const CHEVRON_STYLE = {
  backgroundImage:
    "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' fill='none' viewBox='0 0 24 24' stroke='%234FAEB2' stroke-width='2.5'><path stroke-linecap='round' stroke-linejoin='round' d='M6 9l6 6 6-6'/></svg>\")",
} as const;

export type MarketingOpsPiezaDetalleClientProps = {
  piezaId: string;
  /** "page" usa el Link "← Volver" como en la ruta /piezas/[id]. "modal" omite ese link. */
  mode?: "page" | "modal";
};

export default function MarketingOpsPiezaDetalleClient({
  piezaId,
  mode = "page",
}: MarketingOpsPiezaDetalleClientProps) {
  const isModal = mode === "modal";

  const [pieza, setPieza] = useState<MarketingOpsPieza | null>(null);
  const [comentarios, setComentarios] = useState<MarketingOpsComentario[]>([]);
  const [historial, setHistorial] = useState<MarketingOpsHistorial[]>([]);
  const [comentario, setComentario] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setErr(null);
    const res = await fetchWithSupabaseSession(`/api/marketing-ops/piezas/${piezaId}`, { cache: "no-store" });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || !json.success) {
      setErr(typeof json.error === "string" ? json.error : "No se pudo cargar la pieza");
      setLoading(false);
      return;
    }
    const data = json.data as {
      pieza: MarketingOpsPieza;
      comentarios: MarketingOpsComentario[];
      historial: MarketingOpsHistorial[];
    };
    setPieza(data.pieza);
    setComentarios(data.comentarios ?? []);
    setHistorial(data.historial ?? []);
    setLoading(false);
  }, [piezaId]);

  useEffect(() => {
    void load();
  }, [load]);

  async function cambiarEstado(campo: "estado_produccion" | "estado_cliente" | "estado_publicacion", estado: string) {
    setSaving(true);
    const res = await fetchWithSupabaseSession(`/api/marketing-ops/piezas/${piezaId}/cambiar-estado`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ campo, estado }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok || !json.success) {
      setErr(typeof json.error === "string" ? json.error : "No se pudo cambiar estado");
      return;
    }
    await load();
  }

  async function agregarComentario(e: React.FormEvent) {
    e.preventDefault();
    if (!comentario.trim()) return;
    setSaving(true);
    const res = await fetchWithSupabaseSession(`/api/marketing-ops/piezas/${piezaId}/comentarios`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ comentario }),
    });
    const json = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok || !json.success) {
      setErr(typeof json.error === "string" ? json.error : "No se pudo comentar");
      return;
    }
    setComentario("");
    await load();
  }

  if (loading && !pieza) {
    return (
      <div className="flex items-center justify-center gap-3 p-6 text-sm text-slate-500">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#4FAEB2]" />
        Cargando pieza…
      </div>
    );
  }

  if (!pieza) {
    return (
      <div className="p-6">
        {!isModal ? (
          <Link
            href="/dashboard/marketing-ops"
            className="text-sm font-medium text-[#4FAEB2] hover:text-[#3F8E91] hover:underline"
          >
            ← Volver
          </Link>
        ) : null}
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {err ?? "Pieza no encontrada"}
        </div>
      </div>
    );
  }

  return (
    <div
      className={
        isModal
          ? "space-y-6"
          : "mx-auto max-w-6xl space-y-6 p-4 md:p-6"
      }
    >
      {!isModal ? (
        <Link
          href="/dashboard/marketing-ops"
          className="text-sm font-medium text-[#4FAEB2] hover:text-[#3F8E91] hover:underline"
        >
          ← Marketing Ops
        </Link>
      ) : null}

      {err ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">{err}</div>
      ) : null}

      <div className="rounded-2xl border border-[#4FAEB2]/45 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="mb-3 flex flex-wrap gap-1.5">
              <Badge className={prioridadBadgeClass(pieza.prioridad)}>
                <span aria-hidden="true" className={`h-1 w-1 rounded-full ${prioridadDotClass(pieza.prioridad)}`} />
                {labelFor(PRIORIDAD_OPTIONS, pieza.prioridad)}
              </Badge>
              <Badge className={estadoBadgeClass(pieza.estado_produccion)}>
                <span aria-hidden="true" className={`h-1 w-1 rounded-full ${estadoBadgeDotClass(pieza.estado_produccion)}`} />
                {labelFor(ESTADO_PRODUCCION_OPTIONS, pieza.estado_produccion)}
              </Badge>
              <Badge className={estadoBadgeClass(pieza.estado_cliente)}>
                <span aria-hidden="true" className={`h-1 w-1 rounded-full ${estadoBadgeDotClass(pieza.estado_cliente)}`} />
                {labelFor(ESTADO_CLIENTE_OPTIONS, pieza.estado_cliente)}
              </Badge>
              <Badge className={estadoBadgeClass(pieza.estado_publicacion)}>
                <span aria-hidden="true" className={`h-1 w-1 rounded-full ${estadoBadgeDotClass(pieza.estado_publicacion)}`} />
                {labelFor(ESTADO_PUBLICACION_OPTIONS, pieza.estado_publicacion)}
              </Badge>
            </div>
            {!isModal ? (
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900">{pieza.titulo}</h1>
            ) : null}
            <p className={`${isModal ? "" : "mt-1"} text-sm text-slate-500`}>
              {clienteLabel(pieza.cliente)} ·{" "}
              {pieza.responsable?.nombre ?? pieza.responsable?.email ?? "Sin responsable"}
            </p>
          </div>
          {pieza.link_archivo ? (
            <a
              href={pieza.link_archivo}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:bg-[#4FAEB2]/5 hover:text-[#3F8E91]"
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
                <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                <polyline points="15 3 21 3 21 9" />
                <line x1="10" y1="14" x2="21" y2="3" />
              </svg>
              Abrir archivo
            </a>
          ) : null}
        </div>

        <div className="mt-6 grid gap-4 md:grid-cols-4">
          <Info label="Tipo" value={pieza.tipo_pieza ?? "—"} />
          <Info label="Canal" value={pieza.canal ?? "—"} />
          <Info label="Fecha límite" value={fmtDate(pieza.fecha_limite)} />
          <Info label="Fecha publicación" value={fmtDate(pieza.fecha_publicacion)} />
        </div>

        {pieza.observaciones ? (
          <div className="mt-6 rounded-xl border border-slate-100 bg-slate-50/80 p-4 text-sm text-slate-700">
            <p className="mb-1 font-semibold text-slate-900">Observaciones</p>
            <p className="whitespace-pre-wrap">{pieza.observaciones}</p>
          </div>
        ) : null}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
        <div className="rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]" />
              Cambiar estados
            </h2>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <EstadoSelect
              label="Producción"
              value={pieza.estado_produccion}
              options={ESTADO_PRODUCCION_OPTIONS}
              disabled={saving}
              onChange={(v) => void cambiarEstado("estado_produccion", v)}
            />
            <EstadoSelect
              label="Cliente"
              value={pieza.estado_cliente}
              options={ESTADO_CLIENTE_OPTIONS}
              disabled={saving}
              onChange={(v) => void cambiarEstado("estado_cliente", v)}
            />
            <EstadoSelect
              label="Publicación"
              value={pieza.estado_publicacion}
              options={ESTADO_PUBLICACION_OPTIONS}
              disabled={saving}
              onChange={(v) => void cambiarEstado("estado_publicacion", v)}
            />
          </div>
        </div>

        <div className="rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2">
            <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
            <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]" />
              Comentarios
            </h2>
          </div>
          <form onSubmit={agregarComentario} className="mt-4 space-y-2">
            <textarea
              className="min-h-[90px] w-full rounded-xl border border-slate-200 px-3 py-2 text-sm shadow-sm outline-none transition-colors placeholder:text-slate-400 hover:border-[#4FAEB2]/60 focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              placeholder="Agregar comentario interno…"
            />
            <button
              disabled={saving || !comentario.trim()}
              className="rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91] disabled:cursor-not-allowed disabled:bg-slate-200 disabled:text-slate-400 disabled:shadow-none"
            >
              {saving ? "Guardando…" : "Comentar"}
            </button>
          </form>
          <div className="mt-4 space-y-3">
            {comentarios.length === 0 ? (
              <p className="text-sm text-slate-500">Sin comentarios.</p>
            ) : null}
            {comentarios.map((c) => (
              <div
                key={c.id}
                className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm shadow-sm"
              >
                <p className="text-xs text-slate-500">
                  <span className="font-medium text-[#3F8E91]">{c.usuario_nombre ?? "Usuario"}</span> ·{" "}
                  {new Date(c.created_at).toLocaleString()}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-slate-800">{c.comentario}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
          <h2 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full bg-[#4FAEB2]" />
            Historial de estados
          </h2>
        </div>
        <div className="mt-4 space-y-2">
          {historial.length === 0 ? (
            <p className="text-sm text-slate-500">Sin cambios registrados todavía.</p>
          ) : null}
          {historial.map((h) => (
            <div
              key={h.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-100 bg-slate-50/70 px-3 py-2 text-sm"
            >
              <span className="font-semibold text-slate-800">{h.campo}</span>
              <span className="text-slate-600">
                <span className="text-slate-500">{h.estado_anterior ?? "—"}</span>
                {" → "}
                <span className="font-medium text-slate-800">{h.estado_nuevo ?? "—"}</span>
              </span>
              <span className="text-xs text-slate-500">
                {h.usuario_nombre ?? "Usuario"} · {new Date(h.changed_at).toLocaleString()}
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function Badge({ className, children }: { className: string; children: React.ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-semibold ${className}`}>
      {children}
    </span>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-sm">
      <p className="text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900">{value}</p>
    </div>
  );
}

function EstadoSelect({
  label,
  value,
  options,
  disabled,
  onChange,
}: {
  label: string;
  value: string;
  options: { value: string; label: string }[];
  disabled: boolean;
  onChange: (value: string) => void;
}) {
  return (
    <label className="block text-sm">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.12em] text-slate-500">{label}</span>
      <select
        className={SELECT_CLS}
        style={CHEVRON_STYLE}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}
