"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";

type ReporteProyecto = {
  id: string;
  titulo: string;
  cliente: string;
  entregado_at: string;
};

type ReporteTecnico = {
  tecnico_id: string | null;
  tecnico_nombre: string;
  cantidad: number;
  proyectos: ReporteProyecto[];
};

type ReporteResponse = {
  success: boolean;
  data?: {
    mes: string;
    desde: string;
    hasta: string;
    total: number;
    tecnicos: ReporteTecnico[];
    estado_entregado: { id: string; nombre: string; codigo: string; color: string } | null;
  };
  error?: string;
};

const AVATAR_PALETTE = [
  "bg-[#4FAEB2] text-white",
  "bg-violet-500 text-white",
  "bg-amber-500 text-white",
  "bg-emerald-600 text-white",
  "bg-rose-500 text-white",
  "bg-sky-600 text-white",
  "bg-indigo-500 text-white",
  "bg-fuchsia-500 text-white",
];

function avatarClass(name: string) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h += name.charCodeAt(i);
  return AVATAR_PALETTE[h % AVATAR_PALETTE.length];
}

function initials(name: string) {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

function currentYearMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function shiftMonth(ym: string, delta: number): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return currentYearMonth();
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

function formatMesLargo(ym: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(ym);
  if (!m) return ym;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, 1));
  const fmt = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" });
  const s = fmt.format(d);
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function formatFecha(iso: string): string {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return "—";
  return d.toLocaleDateString("es-PY", { day: "2-digit", month: "2-digit", year: "numeric" });
}

export default function EntregadosPorTecnicoClient() {
  const [mes, setMes] = useState<string>(() => currentYearMonth());
  const [data, setData] = useState<ReporteResponse["data"] | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = useCallback(async (target: string) => {
    setLoading(true);
    setErr(null);
    try {
      const res = await fetchWithSupabaseSession(
        `/api/proyectos/reportes/entregados-por-tecnico?mes=${encodeURIComponent(target)}`,
        { cache: "no-store" }
      );
      const j = (await res.json().catch(() => null)) as ReporteResponse | null;
      if (!res.ok || !j?.success || !j.data) {
        setErr(j?.error ?? "No se pudo cargar el reporte");
        setData(null);
      } else {
        setData(j.data);
      }
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Error de red");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load(mes);
  }, [load, mes]);

  const maxCantidad = useMemo(() => {
    if (!data?.tecnicos.length) return 0;
    return Math.max(...data.tecnicos.map((t) => t.cantidad));
  }, [data]);

  function toggle(id: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="mx-auto max-w-[1200px] space-y-6 p-4 md:p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4FAEB2]">
              Reporte
            </p>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Entregados por técnico
          </h1>
          <p className="text-sm text-slate-500">
            Cuenta sólo la primera vez que cada proyecto entró al estado “Entregado”.
          </p>
        </div>
        <Link
          href="/dashboard/proyectos"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 shadow-sm transition-colors hover:border-[#4FAEB2]/60 hover:text-[#4FAEB2]"
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
            <polyline points="15 18 9 12 15 6" />
          </svg>
          Volver al tablero
        </Link>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={() => setMes((m) => shiftMonth(m, -1))}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-[#4FAEB2]/60 hover:text-[#4FAEB2]"
            aria-label="Mes anterior"
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
              aria-hidden="true"
            >
              <polyline points="15 18 9 12 15 6" />
            </svg>
          </button>
          <input
            type="month"
            value={mes}
            onChange={(e) => setMes(e.target.value || currentYearMonth())}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 outline-none focus:border-[#4FAEB2] focus:ring-2 focus:ring-[#4FAEB2]/20"
            aria-label="Mes a consultar"
          />
          <button
            type="button"
            onClick={() => setMes((m) => shiftMonth(m, 1))}
            className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-slate-200 bg-white text-slate-600 transition-colors hover:border-[#4FAEB2]/60 hover:text-[#4FAEB2]"
            aria-label="Mes siguiente"
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
              aria-hidden="true"
            >
              <polyline points="9 18 15 12 9 6" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          onClick={() => setMes(currentYearMonth())}
          className="rounded-lg border border-transparent px-3 py-1.5 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-700"
        >
          Mes actual
        </button>
        <div className="ml-auto flex items-center gap-3 text-sm text-slate-500">
          <span className="hidden sm:inline">{formatMesLargo(mes)}</span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[#4FAEB2]/30 bg-[#4FAEB2]/10 px-3 py-1 text-xs font-semibold text-[#3F8E91]">
            Total
            <strong className="tabular-nums text-[#3F8E91]">{data?.total ?? 0}</strong>
          </span>
        </div>
      </div>

      {err ? (
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">{err}</div>
      ) : null}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-400">
          Cargando reporte…
        </div>
      ) : !data || data.tecnicos.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-700">Sin entregas este mes</p>
          <p className="mt-1 text-xs text-slate-500">
            No hay proyectos que hayan entrado por primera vez al estado “Entregado” en {formatMesLargo(mes)}.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          {data.tecnicos.map((t) => {
            const id = t.tecnico_id ?? "__SIN__";
            const open = expanded.has(id);
            const pct = maxCantidad > 0 ? Math.round((t.cantidad / maxCantidad) * 100) : 0;
            const sinTecnico = t.tecnico_id == null;
            return (
              <div
                key={id}
                className={`overflow-hidden rounded-2xl border bg-white shadow-sm transition-shadow hover:shadow-md ${
                  sinTecnico ? "border-slate-200" : "border-slate-200"
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggle(id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-slate-50"
                  aria-expanded={open}
                >
                  <span
                    className={`inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ring-2 ring-white ${
                      sinTecnico ? "bg-slate-300 text-white" : avatarClass(t.tecnico_nombre)
                    }`}
                    aria-hidden="true"
                  >
                    {sinTecnico ? "—" : initials(t.tecnico_nombre)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <div
                        className={`min-w-0 truncate text-[13.5px] font-semibold ${
                          sinTecnico ? "italic text-slate-500" : "text-slate-900"
                        }`}
                        title={t.tecnico_nombre}
                      >
                        {t.tecnico_nombre}
                      </div>
                      <div className="shrink-0 text-2xl font-semibold tabular-nums text-slate-900">
                        {t.cantidad}
                      </div>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-[#4FAEB2] to-[#3F8E91]"
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                    <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
                      <span>{t.cantidad === 1 ? "1 proyecto entregado" : `${t.cantidad} proyectos entregados`}</span>
                      <span className="inline-flex items-center gap-1 text-[#4FAEB2]">
                        {open ? "Ocultar" : "Ver detalle"}
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          className={`h-3.5 w-3.5 transition-transform ${open ? "rotate-180" : ""}`}
                          aria-hidden="true"
                        >
                          <path d="m6 9 6 6 6-6" />
                        </svg>
                      </span>
                    </div>
                  </div>
                </button>
                {open ? (
                  <ul className="divide-y divide-slate-100 border-t border-slate-100 bg-slate-50/40">
                    {t.proyectos.map((p) => (
                      <li key={p.id} className="px-4 py-2.5">
                        <Link
                          href={`/dashboard/proyectos/${p.id}`}
                          className="flex items-center justify-between gap-3 transition-colors hover:text-[#3F8E91]"
                        >
                          <div className="min-w-0 flex-1">
                            <div className="truncate text-[12.5px] font-semibold text-slate-800">
                              {p.titulo}
                            </div>
                            <div className="truncate text-[11px] text-slate-500">{p.cliente}</div>
                          </div>
                          <span className="shrink-0 font-mono text-[11px] tabular-nums text-slate-500">
                            {formatFecha(p.entregado_at)}
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
