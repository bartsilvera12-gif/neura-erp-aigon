"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Lock, Save, X, Plus } from "lucide-react";

/**
 * Etiquetas Automáticas - FASE 4B.
 * Panel de configuración SHADOW de reglas en la card WhatsApp.
 * - GET /api/chat/tags/rules
 * - PATCH /api/chat/tags/rules  (sólo campos editables; shadow_mode bloqueado)
 *
 * Importante: la columna shadow_mode se renderiza como toggle deshabilitado
 * en true. El backend rechaza intentos de cambiarlo (lock estricto).
 */

interface RuleConfig {
  source?: string | null;
  critical_node_grace_hours?: number | null;
  critical_node_codes?: string[] | null;
  [k: string]: unknown;
}

interface Rule {
  id: string;
  name: string | null;
  tag_id: string;
  tag_code: string;
  tag_label: string;
  purchase_condition: string | null;
  days_without_activity: number;
  priority: number;
  is_active: boolean;
  shadow_mode: boolean;
  channel_id: string | null;
  exclude_human_taken_over: boolean;
  exclude_active_bot_session: boolean;
  exclude_manual_closure: boolean;
  recontact_exclusion: unknown;
  config: RuleConfig | null;
}

interface ListResponse {
  ok: boolean;
  error?: string;
  rules?: Rule[];
}

interface PatchResponse {
  ok: boolean;
  error?: string;
  rule?: Rule | null;
}

interface RuleDraft {
  is_active: boolean;
  days_without_activity: number;
  priority: number;
  exclude_human_taken_over: boolean;
  exclude_active_bot_session: boolean;
  exclude_manual_closure: boolean;
  critical_node_grace_hours: number;
  critical_node_codes: string[];
}

function toDraft(r: Rule): RuleDraft {
  const cfg = r.config ?? {};
  return {
    is_active: !!r.is_active,
    days_without_activity: Number(r.days_without_activity ?? 7),
    priority: Number(r.priority ?? 100),
    exclude_human_taken_over: !!r.exclude_human_taken_over,
    exclude_active_bot_session: !!r.exclude_active_bot_session,
    exclude_manual_closure: !!r.exclude_manual_closure,
    critical_node_grace_hours:
      typeof cfg.critical_node_grace_hours === "number"
        ? (cfg.critical_node_grace_hours as number)
        : 48,
    critical_node_codes: Array.isArray(cfg.critical_node_codes)
      ? (cfg.critical_node_codes as string[]).filter((x) => typeof x === "string")
      : [],
  };
}

function diffDraft(orig: RuleDraft, next: RuleDraft): Partial<RuleDraft> {
  const out: Partial<RuleDraft> = {};
  if (orig.is_active !== next.is_active) out.is_active = next.is_active;
  if (orig.days_without_activity !== next.days_without_activity)
    out.days_without_activity = next.days_without_activity;
  if (orig.priority !== next.priority) out.priority = next.priority;
  if (orig.exclude_human_taken_over !== next.exclude_human_taken_over)
    out.exclude_human_taken_over = next.exclude_human_taken_over;
  if (orig.exclude_active_bot_session !== next.exclude_active_bot_session)
    out.exclude_active_bot_session = next.exclude_active_bot_session;
  if (orig.exclude_manual_closure !== next.exclude_manual_closure)
    out.exclude_manual_closure = next.exclude_manual_closure;
  if (orig.critical_node_grace_hours !== next.critical_node_grace_hours)
    out.critical_node_grace_hours = next.critical_node_grace_hours;
  const ac = orig.critical_node_codes.slice().sort().join("|");
  const bc = next.critical_node_codes.slice().sort().join("|");
  if (ac !== bc) out.critical_node_codes = next.critical_node_codes;
  return out;
}

export function WhatsAppTagRulesPanel({ channelId: _channelId }: { channelId?: string | null }) {
  // Las reglas Fase 3B están a nivel empresa (channel_id IS NULL); ignoramos
  // _channelId por ahora y consultamos las globales de la empresa.
  const [rules, setRules] = useState<Rule[]>([]);
  const [originals, setOriginals] = useState<Record<string, RuleDraft>>({});
  const [drafts, setDrafts] = useState<Record<string, RuleDraft>>({});
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [newNodeInput, setNewNodeInput] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/chat/tags/rules", { cache: "no-store" });
      const json: ListResponse = await res.json();
      if (!json.ok) {
        setError(json.error || "Error al cargar reglas");
        setRules([]);
        return;
      }
      const list = json.rules ?? [];
      setRules(list);
      const ori: Record<string, RuleDraft> = {};
      const dft: Record<string, RuleDraft> = {};
      for (const r of list) {
        const d = toDraft(r);
        ori[r.id] = d;
        dft[r.id] = { ...d };
      }
      setOriginals(ori);
      setDrafts(dft);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Error inesperado");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const update = (id: string, patch: Partial<RuleDraft>) => {
    setDrafts((prev) => ({ ...prev, [id]: { ...(prev[id] as RuleDraft), ...patch } }));
  };

  const dirty = useMemo(() => {
    const out: Record<string, boolean> = {};
    for (const id of Object.keys(drafts)) {
      const o = originals[id];
      const d = drafts[id];
      if (!o || !d) continue;
      out[id] = Object.keys(diffDraft(o, d)).length > 0;
    }
    return out;
  }, [drafts, originals]);

  const anyDirty = useMemo(() => Object.values(dirty).some(Boolean), [dirty]);

  const saveRule = useCallback(
    async (id: string) => {
      const o = originals[id];
      const d = drafts[id];
      if (!o || !d) return;
      const patch = diffDraft(o, d);
      if (Object.keys(patch).length === 0) return;
      setSavingId(id);
      setError(null);
      setNotice(null);
      try {
        const res = await fetch("/api/chat/tags/rules", {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ id, ...patch }),
        });
        const json: PatchResponse = await res.json();
        if (!json.ok || !json.rule) {
          setError(json.error || "Error al guardar");
          return;
        }
        const fresh = toDraft(json.rule);
        setOriginals((prev) => ({ ...prev, [id]: fresh }));
        setDrafts((prev) => ({ ...prev, [id]: { ...fresh } }));
        setRules((prev) => prev.map((r) => (r.id === id ? (json.rule as Rule) : r)));
        setNotice("Regla actualizada en modo shadow.");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Error inesperado");
      } finally {
        setSavingId(null);
      }
    },
    [originals, drafts]
  );

  const saveAll = useCallback(async () => {
    const ids = Object.keys(dirty).filter((k) => dirty[k]);
    for (const id of ids) {
      // eslint-disable-next-line no-await-in-loop
      await saveRule(id);
    }
  }, [dirty, saveRule]);

  const addNodeChip = (ruleId: string) => {
    const raw = (newNodeInput[ruleId] ?? "").trim();
    if (!raw) return;
    if (!/^[a-zA-Z0-9_:-]+$/.test(raw) || raw.length > 64) {
      setError("Código de nodo inválido (a-z, 0-9, _-: hasta 64 caracteres).");
      return;
    }
    const d = drafts[ruleId];
    if (!d) return;
    if (d.critical_node_codes.includes(raw)) {
      setNewNodeInput((p) => ({ ...p, [ruleId]: "" }));
      return;
    }
    if (d.critical_node_codes.length >= 16) {
      setError("Máximo 16 nodos críticos por regla.");
      return;
    }
    update(ruleId, { critical_node_codes: [...d.critical_node_codes, raw] });
    setNewNodeInput((p) => ({ ...p, [ruleId]: "" }));
  };

  const removeNodeChip = (ruleId: string, code: string) => {
    const d = drafts[ruleId];
    if (!d) return;
    update(ruleId, {
      critical_node_codes: d.critical_node_codes.filter((c) => c !== code),
    });
  };

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6 lg:p-8">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xs font-bold text-slate-500 uppercase tracking-wider">
            Etiquetas automáticas
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Reglas que clasifican conversaciones por última actividad y estado de
            compra. Editables en{" "}
            <span className="font-semibold">modo shadow</span>.
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900">
          <AlertTriangle size={14} />
          <span>
            Modo shadow: las reglas todavía no sacan chats de Conversaciones.
          </span>
        </div>
      </div>

      {error && (
        <div className="mb-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </div>
      )}
      {notice && (
        <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          {notice}
        </div>
      )}

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-400 animate-pulse">
          Cargando reglas…
        </div>
      ) : rules.length === 0 ? (
        <div className="py-10 text-center text-sm text-slate-500">
          Sin reglas configuradas para esta empresa.
        </div>
      ) : (
        <div className="space-y-4">
          {rules.map((r) => {
            const d = drafts[r.id];
            if (!d) return null;
            const isDirty = !!dirty[r.id];
            return (
              <div
                key={r.id}
                className="rounded-xl border border-slate-200 bg-slate-50/40 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-sm font-semibold text-slate-900">
                      {r.tag_label || r.tag_code || r.name || r.id.slice(0, 8)}
                    </div>
                    <div className="text-[11px] uppercase tracking-wide text-slate-500 font-mono">
                      {r.tag_code} · condición: {r.purchase_condition ?? "—"}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span
                      title="shadow_mode bloqueado en esta fase"
                      className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold uppercase text-amber-900"
                    >
                      <Lock size={10} /> shadow
                    </span>
                    <label className="inline-flex items-center gap-1.5 text-xs text-slate-700">
                      <input
                        type="checkbox"
                        checked={d.is_active}
                        onChange={(e) =>
                          update(r.id, { is_active: e.target.checked })
                        }
                      />
                      Activa
                    </label>
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
                      Días sin actividad
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={d.days_without_activity}
                      onChange={(e) =>
                        update(r.id, {
                          days_without_activity: Math.max(
                            1,
                            Math.min(365, parseInt(e.target.value || "0", 10) || 0)
                          ),
                        })
                      }
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
                      Prioridad
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={1000}
                      value={d.priority}
                      onChange={(e) =>
                        update(r.id, {
                          priority: Math.max(
                            0,
                            Math.min(1000, parseInt(e.target.value || "0", 10) || 0)
                          ),
                        })
                      }
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
                      Horas de gracia (nodo crítico)
                    </label>
                    <input
                      type="number"
                      min={0}
                      max={720}
                      value={d.critical_node_grace_hours}
                      onChange={(e) =>
                        update(r.id, {
                          critical_node_grace_hours: Math.max(
                            0,
                            Math.min(720, parseInt(e.target.value || "0", 10) || 0)
                          ),
                        })
                      }
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm"
                    />
                  </div>
                </div>

                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={d.exclude_human_taken_over}
                      onChange={(e) =>
                        update(r.id, { exclude_human_taken_over: e.target.checked })
                      }
                    />
                    Excluir si humano tomó la conversación
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={d.exclude_active_bot_session}
                      onChange={(e) =>
                        update(r.id, { exclude_active_bot_session: e.target.checked })
                      }
                    />
                    Excluir si bot está activo
                  </label>
                  <label className="inline-flex items-center gap-2 text-xs text-slate-700">
                    <input
                      type="checkbox"
                      checked={d.exclude_manual_closure}
                      onChange={(e) =>
                        update(r.id, { exclude_manual_closure: e.target.checked })
                      }
                    />
                    Excluir cierres manuales
                  </label>
                </div>

                <div className="mt-3">
                  <label className="block text-[11px] font-medium text-slate-500 uppercase tracking-wide mb-1">
                    Nodos críticos (máx. 16)
                  </label>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {d.critical_node_codes.map((code) => (
                      <span
                        key={code}
                        className="inline-flex items-center gap-1 rounded-full border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-mono text-slate-700"
                      >
                        {code}
                        <button
                          type="button"
                          onClick={() => removeNodeChip(r.id, code)}
                          className="rounded-full p-0.5 text-slate-400 hover:text-rose-600"
                          aria-label={`Quitar ${code}`}
                        >
                          <X size={10} />
                        </button>
                      </span>
                    ))}
                    <div className="inline-flex items-center gap-1">
                      <input
                        value={newNodeInput[r.id] ?? ""}
                        onChange={(e) =>
                          setNewNodeInput((p) => ({ ...p, [r.id]: e.target.value }))
                        }
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            addNodeChip(r.id);
                          }
                        }}
                        placeholder="agregar_nodo"
                        className="w-32 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => addNodeChip(r.id)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 bg-white px-2 py-1 text-[11px] hover:bg-slate-50"
                      >
                        <Plus size={11} /> Añadir
                      </button>
                    </div>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-between">
                  <div className="text-[11px] text-slate-500">
                    {isDirty ? (
                      <span className="font-semibold text-amber-700">
                        Cambios sin guardar
                      </span>
                    ) : (
                      <span>Sin cambios</span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={!isDirty || savingId === r.id}
                    onClick={() => void saveRule(r.id)}
                    className="inline-flex items-center gap-1.5 rounded-md bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 disabled:opacity-40"
                  >
                    <Save size={12} />
                    {savingId === r.id ? "Guardando…" : "Guardar regla"}
                  </button>
                </div>
              </div>
            );
          })}

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => void saveAll()}
              disabled={!anyDirty || !!savingId}
              className="inline-flex items-center gap-1.5 rounded-xl bg-[#4FAEB2] px-4 py-2 text-sm font-semibold text-white shadow-sm shadow-[#4FAEB2]/25 transition-colors hover:bg-[#3F8E91] disabled:opacity-40"
            >
              <Save size={13} />
              Guardar todos los cambios
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

export default WhatsAppTagRulesPanel;
