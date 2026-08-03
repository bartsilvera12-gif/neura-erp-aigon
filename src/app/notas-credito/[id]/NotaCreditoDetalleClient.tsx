"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { NotaCreditoGlobalDetailDTO, NotaCreditoEventoAuditoriaDTO } from "@/lib/nota-credito/types";

function labelTipoEvento(t: string) {
  const m: Record<string, string> = {
    creacion: "Creación",
    validacion: "Validación",
    rechazo_negocio: "Rechazo negocio",
    cambio_estado_erp: "Cambio estado ERP",
    preparacion_sifen: "Preparación SIFEN",
    error: "Error",
    observacion_operativa: "Observación",
    anulacion_borrador: "Anulación borrador",
    xml_generado: "XML generado",
    xml_firmado: "XML firmado",
    enviado_set: "Enviado a SET",
    respuesta_set: "Respuesta SET",
    aprobado: "Aprobado SET",
    rechazado: "Rechazado SET",
    impacto_saldo_aplicado: "Impacto en saldo",
    error_envio: "Error de envío",
  };
  return m[t] ?? t;
}

export type NotaCreditoDetalleClientProps = {
  /** Si se pasa, sobrescribe el id leído de la ruta. Requerido cuando variant === "modal". */
  id?: string;
  variant?: "page" | "modal";
  onClose?: () => void;
};

export default function NotaCreditoDetalleClient({
  id: idProp,
  variant = "page",
  onClose,
}: NotaCreditoDetalleClientProps = {}) {
  const params = useParams();
  const router = useRouter();
  const id = idProp ?? String(params?.id ?? "");
  const isModal = variant === "modal";

  const [data, setData] = useState<NotaCreditoGlobalDetailDTO | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setErr(null);
    try {
      const res = await fetchWithSupabaseSession(`/api/notas-credito/${id}`, { cache: "no-store" });
      const j = (await res.json()) as { success?: boolean; data?: NotaCreditoGlobalDetailDTO; error?: string };
      if (!res.ok || !j.success || !j.data) {
        setData(null);
        setErr(j.error ?? "No se pudo cargar");
        return;
      }
      setData(j.data);
    } catch {
      setData(null);
      setErr("Error de red");
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  const closeOrBack = useCallback(() => {
    if (onClose) onClose();
    else router.push("/notas-credito");
  }, [onClose, router]);

  const Wrapper = ({ children }: { children: React.ReactNode }) =>
    isModal ? (
      <div className="space-y-6">{children}</div>
    ) : (
      <div className="mx-auto max-w-5xl space-y-6 px-4 py-8">{children}</div>
    );

  if (loading) {
    return (
      <Wrapper>
        <div className="flex items-center justify-center gap-3 py-20 text-sm text-slate-500">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#4FAEB2]" />
          Cargando nota de crédito…
        </div>
      </Wrapper>
    );
  }
  if (err || !data) {
    return (
      <Wrapper>
        <div className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          {err ?? "Sin datos"}
        </div>
        <button
          type="button"
          onClick={closeOrBack}
          className="inline-flex items-center gap-1.5 text-sm font-semibold text-[#4FAEB2] hover:text-[#3F8E91] hover:underline"
        >
          ← {isModal ? "Cerrar" : "Volver al listado"}
        </button>
      </Wrapper>
    );
  }

  const nc = data.nota_credito;
  const ne = data.nota_credito_electronica;
  const moneda = String(nc.moneda_snapshot ?? "GS");

  return (
    <Wrapper>
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {!isModal ? (
            <Link
              href="/notas-credito"
              className="text-xs font-semibold text-[#4FAEB2] hover:text-[#3F8E91] hover:underline"
            >
              ← Notas de crédito
            </Link>
          ) : null}
          <div className={`flex items-center gap-2 ${isModal ? "" : "mt-1"}`}>
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Nota de crédito
            </p>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Detalle de nota de crédito
          </h1>
          <p className="mt-1 break-all font-mono text-[11px] text-slate-500">{String(nc.id)}</p>
        </div>
        <Link
          href={`/facturas/${data.factura.id}`}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-3.5 py-2 text-xs font-semibold text-white shadow-sm shadow-[#4FAEB2]/20 transition-colors hover:bg-[#3F8E91]"
        >
          Ir a factura
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
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </Link>
      </div>

      {/* Datos generales */}
      <section className="space-y-3 rounded-2xl border border-[#4FAEB2]/45 bg-white p-5 shadow-sm">
        <div className="mb-1 flex items-center gap-2">
          <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            Datos generales
          </h2>
        </div>
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Cliente</dt>
            <dd className="mt-1 font-medium">
              <Link
                href={`/clientes/${data.cliente.id}`}
                className="text-[#3F8E91] hover:underline"
              >
                {data.cliente.display}
              </Link>
              {data.cliente.ruc ? (
                <span className="ml-1 text-xs text-slate-500">RUC {data.cliente.ruc}</span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Factura</dt>
            <dd className="mt-1 font-mono text-xs text-slate-800">
              {data.factura.numero_factura ?? data.factura.id}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Monto NC</dt>
            <dd className="mt-1">
              <span className="text-[11px] font-medium text-slate-400">
                {moneda === "USD" ? "USD" : "Gs."}
              </span>{" "}
              <span className="text-base font-semibold tabular-nums text-amber-700">
                {Number(nc.monto).toLocaleString(moneda === "USD" ? "en-US" : "es-PY")}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
              Estado ERP / SIFEN
            </dt>
            <dd className="mt-1 flex flex-wrap items-center gap-1.5">
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                {String(nc.estado_erp)}
              </span>
              <span className="text-slate-300">/</span>
              <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">
                {ne?.estado_sifen != null ? String(ne.estado_sifen) : "—"}
              </span>
            </dd>
          </div>
          <div className="sm:col-span-2">
            <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Motivo</dt>
            <dd className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
              {String(nc.motivo ?? "")}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">Creador</dt>
            <dd className="mt-1 text-xs text-slate-700">
              {String(
                nc.created_by_nombre_snapshot ?? nc.created_by_email_snapshot ?? nc.created_by_user_id ?? "—",
              )}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">CDC (NC)</dt>
            <dd className="mt-1 break-all font-mono text-[11px] text-slate-700">
              {ne?.cdc != null ? String(ne.cdc) : "—"}
            </dd>
          </div>
        </dl>
      </section>

      {ne && (
        <section className="space-y-2 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="mb-1 flex items-center gap-2">
            <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
            <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
              Documento electrónico (SIFEN)
            </h2>
          </div>
          <dl className="grid grid-cols-1 gap-2 break-all font-mono text-xs text-slate-700">
            <div>
              <dt className="font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                xml_path
              </dt>
              <dd>{ne.xml_path != null ? String(ne.xml_path) : "—"}</dd>
            </div>
            <div>
              <dt className="font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                xml_firmado_path
              </dt>
              <dd>{ne.xml_firmado_path != null ? String(ne.xml_firmado_path) : "—"}</dd>
            </div>
            <div>
              <dt className="font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                kude_url
              </dt>
              <dd>{ne.kude_url != null ? String(ne.kude_url) : "—"}</dd>
            </div>
            <div>
              <dt className="font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                last_error
              </dt>
              <dd className="text-rose-700">{ne.last_error != null ? String(ne.last_error) : "—"}</dd>
            </div>
            <div>
              <dt className="font-sans text-[10px] font-semibold uppercase tracking-[0.08em] text-slate-500">
                sifen_aprobado_at
              </dt>
              <dd>{ne.sifen_aprobado_at != null ? String(ne.sifen_aprobado_at) : "—"}</dd>
            </div>
          </dl>
          <details className="text-xs">
            <summary className="cursor-pointer font-semibold text-[#4FAEB2] hover:text-[#3F8E91] hover:underline">
              Respuestas SET (JSON)
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-[10px] text-slate-700">
              {JSON.stringify(
                {
                  sifen_ultima_respuesta_recibe_lote: ne.sifen_ultima_respuesta_recibe_lote,
                  sifen_ultima_respuesta_consulta_lote: ne.sifen_ultima_respuesta_consulta_lote,
                  last_response_json: ne.last_response_json,
                },
                null,
                2,
              )}
            </pre>
          </details>
        </section>
      )}

      <section className="space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <div className="flex items-center gap-2">
          <span aria-hidden="true" className="block h-5 w-1 rounded-full bg-[#4FAEB2]" />
          <h2 className="text-[11px] font-semibold uppercase tracking-[0.14em] text-slate-600">
            Auditoría / eventos
          </h2>
          {data.eventos.length > 0 ? (
            <span className="inline-flex items-center rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[10px] font-semibold tabular-nums text-slate-700">
              {data.eventos.length}
            </span>
          ) : null}
        </div>
        {data.eventos.length === 0 ? (
          <p className="text-sm text-slate-500">Sin eventos registrados.</p>
        ) : (
          <ul className="space-y-3">
            {data.eventos.map((ev: NotaCreditoEventoAuditoriaDTO) => (
              <li
                key={ev.id}
                className="rounded-xl border border-slate-200 border-l-[3px] border-l-[#4FAEB2] bg-white p-4"
              >
                <div className="flex flex-wrap items-baseline gap-2">
                  <span className="text-sm font-semibold text-slate-900">{labelTipoEvento(ev.tipo_evento)}</span>
                  <span className="text-xs tabular-nums text-slate-500">
                    {new Date(ev.created_at).toLocaleString("es-PY", {
                      dateStyle: "short",
                      timeStyle: "medium",
                    })}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-500">Actor: {ev.actor_user_id ?? "—"}</p>
                <pre className="mt-2 max-h-48 overflow-auto rounded-lg border border-slate-200 bg-slate-50 p-3 text-[10px] text-slate-700">
                  {JSON.stringify(ev.detalle_json, null, 2)}
                </pre>
              </li>
            ))}
          </ul>
        )}
      </section>
    </Wrapper>
  );
}
