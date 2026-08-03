"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { fetchWithSupabaseSession } from "@/lib/api/fetch-with-supabase-session";
import type { ChatQueueAdminRow } from "@/lib/chat/queue-admin-repo";
import { apiCreateQueueDraft, apiListQueues } from "./queue-admin-api";
import ColaEditorModal from "./components/ColaEditorModal";

function hasOmnichannelFromModuleAccess(body: {
  superAdmin?: boolean;
  slugs?: string[];
}): boolean {
  if (body.superAdmin) return true;
  const slugs = Array.isArray(body.slugs) ? body.slugs : [];
  return slugs.includes("conversaciones") || slugs.includes("omnicanal");
}

const STRAT_LABEL: Record<string, string> = {
  least_load: "Menor carga",
  round_robin: "Circular",
  manual_pull: "Manual (sin autoasignación)",
};

export default function ConfiguracionColasPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const colaGuardadaOk = searchParams?.get("cola_guardada") === "1";
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [rows, setRows] = useState<ChatQueueAdminRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingIsNew, setEditingIsNew] = useState(false);
  const [showSaved, setShowSaved] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await apiListQueues());
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchWithSupabaseSession("/api/empresas/module-access", { cache: "no-store" })
      .then(async (res) => {
        if (!res.ok) {
          setAllowed(false);
          return;
        }
        const body = (await res.json()) as { superAdmin?: boolean; slugs?: string[] };
        setAllowed(hasOmnichannelFromModuleAccess(body));
      })
      .catch(() => setAllowed(false));
  }, []);

  useEffect(() => {
    if (allowed) void load();
  }, [allowed, load]);

  useEffect(() => {
    if (!colaGuardadaOk) return;
    const id = window.setTimeout(() => {
      router.replace("/configuracion/colas");
    }, 10_000);
    return () => window.clearTimeout(id);
  }, [colaGuardadaOk, router]);

  useEffect(() => {
    if (!showSaved) return;
    const id = window.setTimeout(() => setShowSaved(false), 4000);
    return () => window.clearTimeout(id);
  }, [showSaved]);

  async function handleNew() {
    setError(null);
    try {
      const id = await apiCreateQueueDraft();
      setEditingIsNew(true);
      setEditingId(id);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo crear la cola");
    }
  }

  function openEdit(id: string) {
    setEditingIsNew(false);
    setEditingId(id);
  }

  function closeEditor() {
    setEditingId(null);
    setEditingIsNew(false);
  }

  if (allowed === null) {
    return (
      <div className="flex items-center justify-center gap-3 py-24 text-sm text-slate-500">
        <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-[#4FAEB2]" />
        Cargando…
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="max-w-xl rounded-2xl border border-amber-200 bg-amber-50 p-6 text-sm text-amber-900">
        Módulo no habilitado.{" "}
        <Link href="/configuracion" className="font-semibold underline">
          Volver
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <nav className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
        <Link href="/configuracion" className="font-medium text-slate-500 transition-colors hover:text-[#4FAEB2]">
          Configuración
        </Link>
        <span aria-hidden className="text-slate-300">/</span>
        <span className="font-semibold text-slate-700">Colas y enrutamiento</span>
        <span aria-hidden className="text-slate-300">·</span>
        <Link
          href="/configuracion/omnicanal-equipos"
          className="font-medium text-[#4FAEB2] hover:text-[#3F8E91] hover:underline"
        >
          Equipos y supervisión
        </Link>
      </nav>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span
              aria-hidden="true"
              className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#4FAEB2] shadow-[0_0_0_3px_rgba(79,174,178,0.18)]"
            />
            <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[#4FAEB2]">
              Omnicanal · Routing
            </p>
          </div>
          <h1 className="mt-1 text-2xl font-semibold tracking-tight text-slate-900">
            Colas y enrutamiento
          </h1>
          <p className="mt-1 max-w-xl text-sm text-slate-500">
            Definí colas, canales asociados, estrategia de distribución y agentes por cola. El inbox y el webhook
            existentes siguen usando la misma base de datos.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void handleNew()}
          className="inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-4 py-2.5 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91]"
        >
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-4 w-4"
            aria-hidden="true"
          >
            <path d="M12 5v14M5 12h14" />
          </svg>
          Nueva cola
        </button>
      </div>
      {colaGuardadaOk || showSaved ? (
        <div
          className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900"
          role="status"
        >
          Cola guardada correctamente.
        </div>
      ) : null}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}
      <div className="rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-slate-400">Cargando…</p>
        ) : rows.length === 0 ? (
          <p className="p-6 text-sm text-slate-600">No hay colas. Creá la primera con el botón superior.</p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {rows.map((q) => (
              <li key={q.id} className="flex flex-wrap items-center justify-between gap-3 px-5 py-4">
                <div>
                  <p className="font-semibold text-slate-900">{q.nombre}</p>
                  <p className="text-xs text-slate-500 mt-0.5">
                    {STRAT_LABEL[q.distribution_strategy] ?? q.distribution_strategy}
                    {q.channel_type ? ` · tipo ${q.channel_type}` : " · todos los canales (legado)"} · prioridad{" "}
                    {q.priority}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs font-bold uppercase ${q.is_active ? "text-emerald-700" : "text-slate-400"}`}>
                    {q.is_active ? "Activa" : "Inactiva"}
                  </span>
                  <button
                    type="button"
                    onClick={() => openEdit(String(q.id ?? "").trim())}
                    className="text-sm font-semibold text-[#4FAEB2] transition-colors hover:text-[#3F8E91] hover:underline"
                  >
                    Editar
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-xs text-slate-400">
        El módulo <Link href="/dashboard/monitoreo" className="text-[#4FAEB2] hover:underline">Monitoreo</Link> resume
        carga operativa en tiempo casi real.
      </p>

      <ColaEditorModal
        queueId={editingId}
        isNew={editingIsNew}
        open={editingId != null}
        onClose={closeEditor}
        onSaved={() => {
          setShowSaved(true);
          void load();
        }}
        onDeleted={() => {
          setShowSaved(false);
          void load();
        }}
      />
    </div>
  );
}
