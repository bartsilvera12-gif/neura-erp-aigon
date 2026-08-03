"use server";

import { requireEmpresaTenantServiceRole } from "@/lib/chat/empresa-tenant-service-role";
import type { OmnicanalScope } from "@/lib/chat/omnicanal-scope";
import {
  appendOmnicanalConversationScopeToQuery,
  getOmnicanalScope,
  isOmnicanalAdminScope,
  resolveChatAgentIdsForUsuarios,
  resolveQueueIdsForUsuarios,
  shouldBypassOmnicanalConversationScope,
} from "@/lib/chat/omnicanal-scope";
import type { AppSupabaseClient } from "@/lib/supabase/schema";

export type FinalizedClosureListRow = {
  closure_id: string;
  conversation_id: string;
  closed_at: string;
  contact_name: string | null;
  phone_number: string;
  channel_type: string;
  channel_nombre: string | null;
  queue_nombre: string | null;
  /** Usuario operador vía chat_agents / assigned_agent_id */
  assigned_agent_nombre: string | null;
  /** Usuario que registró el cierre (auditoría) */
  closed_by_nombre: string | null;
  state_label: string;
  substate_label: string;
  comment: string;
  last_preview: string | null;
};

export type FinalizedClosuresFilters = {
  date_from?: string | null;
  date_to?: string | null;
  queue_id?: string | null;
  /** Filtro principal: usuario asignado (chat_agents.usuario_id → conversación.assigned_agent_id) */
  assigned_usuario_id?: string | null;
  /** Filtro secundario: quién ejecutó el cierre */
  closed_by_usuario_id?: string | null;
  channel_id?: string | null;
  state_label?: string | null;
  substate_label?: string | null;
  q?: string | null;
};

export type FinalizedClosuresListResult = {
  rows: FinalizedClosureListRow[];
  total: number;
  page: number;
  page_size: number;
};

export type FinalizedFilterUxScope = "full" | "team" | "own";

export type FinalizedFilterOptions = {
  queues: { id: string; nombre: string }[];
  channels: { id: string; nombre: string | null; type: string }[];
  /** Usuarios con fila en chat_agents (operadores); id = usuarios.id */
  agents: { id: string; nombre: string }[];
  /** Usuarios vistos como closed_by en muestra de cierres (combo “Cerrado por”) */
  closed_by_users: { id: string; nombre: string }[];
  state_labels: string[];
  substate_labels: string[];
  /** `team` = combos acotados al alcance omnicanal (p. ej. supervisor). */
  ux_scope: FinalizedFilterUxScope;
};

function endOfDayIso(dateYmd: string): string {
  return new Date(`${dateYmd.slice(0, 10)}T23:59:59.999Z`).toISOString();
}

function startOfDayIso(dateYmd: string): string {
  return new Date(`${dateYmd.slice(0, 10)}T00:00:00.000Z`).toISOString();
}

function isMissingClosureTable(err: { message?: string } | null): boolean {
  const m = (err?.message ?? "").toLowerCase();
  return m.includes("chat_conversation_closures") && m.includes("does not exist");
}

function intersectIds(a: string[] | null, b: string[]): string[] {
  if (!a) return b;
  const s = new Set(b);
  return a.filter((id) => s.has(id));
}

/**
 * Máximo de IDs por request `.in()`. PostgREST arma la lista en la URL; con muchos UUIDs la URL
 * excede el límite del proxy y devuelve 414 (que antes rompía la vista de finalizadas de un asesor
 * con ~100 conversaciones). Troceamos en lotes y unimos en memoria.
 */
const ID_IN_CHUNK = 50;

/** Corre un `.in(col, ids)` en lotes de ID_IN_CHUNK y concatena los resultados. */
async function selectInChunks<T>(
  ids: string[],
  run: (slice: string[]) => Promise<T[]>
): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < ids.length; i += ID_IN_CHUNK) {
    const slice = ids.slice(i, i + ID_IN_CHUNK);
    if (slice.length === 0) continue;
    out.push(...(await run(slice)));
  }
  return out;
}

type ClosureRow = {
  id: string;
  conversation_id: string;
  queue_id: string | null;
  closure_state_label: string;
  closure_substate_label: string;
  comment: string;
  closed_at: string;
  closed_by_usuario_id: string;
};

async function loadFinalizedFilterOptionsAllEmpresa(
  supabase: AppSupabaseClient,
  catalogSr: AppSupabaseClient,
  empresa_id: string
): Promise<FinalizedFilterOptions> {
  const empty: FinalizedFilterOptions = {
    queues: [],
    channels: [],
    agents: [],
    closed_by_users: [],
    state_labels: [],
    substate_labels: [],
    ux_scope: "full",
  };

  const [{ data: queues, error: qe }, { data: channels, error: che }, { data: chatAgentRows, error: gae }] =
    await Promise.all([
      supabase.from("chat_queues").select("id, nombre").eq("empresa_id", empresa_id).order("nombre", { ascending: true }),
      supabase.from("chat_channels").select("id, nombre, type").eq("empresa_id", empresa_id).order("nombre", { ascending: true }),
      supabase.from("chat_agents").select("usuario_id").eq("empresa_id", empresa_id).limit(8000),
    ]);
  if (qe) console.warn("[loadFinalizedFilterOptions] queues:", qe.message);
  if (che) console.warn("[loadFinalizedFilterOptions] channels:", che.message);
  if (gae) console.warn("[loadFinalizedFilterOptions] chat_agents:", gae.message);

  const operatorUsuarioIds = [
    ...new Set(
      (chatAgentRows ?? [])
        .map((r) => String((r as { usuario_id?: string | null }).usuario_id ?? "").trim())
        .filter(Boolean)
    ),
  ];

  let agents: { id: string; nombre: string }[] = [];
  if (operatorUsuarioIds.length > 0) {
    const { data: urows, error: ue } = await catalogSr
      .from("usuarios")
      .select("id, nombre, email")
      .in("id", operatorUsuarioIds.slice(0, 500));
    if (!ue && urows) {
      agents = (urows as { id: string; nombre?: string | null; email?: string | null }[]).map((u) => ({
        id: u.id,
        nombre: (u.nombre?.trim() || u.email?.trim() || u.id) as string,
      }));
      agents.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    }
  }

  const { data: closureSample, error: ce } = await supabase
    .from("chat_conversation_closures")
    .select("closed_by_usuario_id, closure_state_label, closure_substate_label")
    .eq("empresa_id", empresa_id)
    .order("closed_at", { ascending: false })
    .limit(4000);
  if (ce) {
    if (isMissingClosureTable(ce)) {
      return {
        ...empty,
        queues: mapQueues(queues),
        channels: mapChannels(channels),
        agents,
      };
    }
    console.warn("[loadFinalizedFilterOptions] closures:", ce.message);
    return { ...empty, queues: mapQueues(queues), channels: mapChannels(channels), agents };
  }

  const closerIds = [
    ...new Set(
      (closureSample ?? [])
        .map((r) => String((r as { closed_by_usuario_id?: string | null }).closed_by_usuario_id ?? "").trim())
        .filter(Boolean)
    ),
  ];
  const states = new Set<string>();
  const subs = new Set<string>();
  for (const r of closureSample ?? []) {
    const st = String((r as { closure_state_label?: string }).closure_state_label ?? "").trim();
    const su = String((r as { closure_substate_label?: string }).closure_substate_label ?? "").trim();
    if (st) states.add(st);
    if (su) subs.add(su);
  }

  let closed_by_users: { id: string; nombre: string }[] = [];
  if (closerIds.length > 0) {
    const { data: uc, error: uce } = await catalogSr
      .from("usuarios")
      .select("id, nombre, email")
      .in("id", closerIds.slice(0, 500));
    if (!uce && uc) {
      closed_by_users = (uc as { id: string; nombre?: string | null; email?: string | null }[]).map((u) => ({
        id: u.id,
        nombre: (u.nombre?.trim() || u.email?.trim() || u.id) as string,
      }));
      closed_by_users.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    }
  }

  return {
    queues: mapQueues(queues),
    channels: mapChannels(channels),
    agents,
    closed_by_users,
    state_labels: [...states].sort((a, b) => a.localeCompare(b, "es")),
    substate_labels: [...subs].sort((a, b) => a.localeCompare(b, "es")),
    ux_scope: "full",
  };
}

async function loadFinalizedFilterOptionsScopedTeam(
  supabase: AppSupabaseClient,
  catalogSr: AppSupabaseClient,
  empresa_id: string,
  scope: OmnicanalScope
): Promise<FinalizedFilterOptions> {
  const emptyTeam: FinalizedFilterOptions = {
    queues: [],
    channels: [],
    agents: [],
    closed_by_users: [],
    state_labels: [],
    substate_labels: [],
    ux_scope: "team",
  };

  const queueIds = await resolveQueueIdsForUsuarios(supabase, empresa_id, scope.agentUsuarioIds);
  let queues: { id: string; nombre: string }[] = [];
  if (queueIds.length > 0) {
    const { data: qrows, error: qe } = await supabase
      .from("chat_queues")
      .select("id, nombre")
      .eq("empresa_id", empresa_id)
      .in("id", queueIds)
      .order("nombre", { ascending: true });
    if (!qe && qrows) queues = mapQueues(qrows);
  }

  const agentUsuarioPick = [...new Set(scope.agentUsuarioIds.map((x) => String(x ?? "").trim()).filter(Boolean))];
  let agents: { id: string; nombre: string }[] = [];
  if (agentUsuarioPick.length > 0) {
    const { data: urows, error: ue } = await catalogSr
      .from("usuarios")
      .select("id, nombre, email")
      .in("id", agentUsuarioPick.slice(0, 500));
    if (!ue && urows) {
      agents = (urows as { id: string; nombre?: string | null; email?: string | null }[]).map((u) => ({
        id: u.id,
        nombre: (u.nombre?.trim() || u.email?.trim() || u.id) as string,
      }));
      agents.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    }
  }

  const agentFkIds = await resolveChatAgentIdsForUsuarios(supabase, empresa_id, scope.agentUsuarioIds);
  let channels: { id: string; nombre: string | null; type: string }[] = [];
  if (agentFkIds.length > 0) {
    const { data: convCh, error: cErr } = await supabase
      .from("chat_conversations")
      .select("channel_id")
      .eq("empresa_id", empresa_id)
      .not("channel_id", "is", null)
      .in("assigned_agent_id", agentFkIds)
      .limit(8000);
    if (!cErr && convCh) {
      const chIds = [
        ...new Set(
          (convCh ?? [])
            .map((r) => String((r as { channel_id?: string | null }).channel_id ?? "").trim())
            .filter(Boolean)
        ),
      ];
      if (chIds.length > 0) {
        const { data: chRows, error: chErr } = await supabase
          .from("chat_channels")
          .select("id, nombre, type")
          .eq("empresa_id", empresa_id)
          .in("id", chIds)
          .order("nombre", { ascending: true });
        if (!chErr && chRows) channels = mapChannels(chRows);
      }
    }
  }

  let convIds: string[] = [];
  let cq = supabase.from("chat_conversations").select("id").eq("empresa_id", empresa_id);
  cq = (await appendOmnicanalConversationScopeToQuery(supabase, empresa_id, scope, cq)).builder;
  const { data: scopedConv, error: convErr } = await cq.limit(8000);
  if (convErr) {
    console.warn("[loadFinalizedFilterOptions] scoped conv ids:", convErr.message);
    return { ...emptyTeam, queues, agents, channels };
  }
  convIds = (scopedConv ?? [])
    .map((r: { id?: string }) => String(r.id ?? "").trim())
    .filter(Boolean);

  if (convIds.length === 0) {
    return { ...emptyTeam, queues, agents, channels };
  }

  const states = new Set<string>();
  const subs = new Set<string>();
  const closerIdSet = new Set<string>();
  const chunk = 120;
  for (let i = 0; i < convIds.length; i += chunk) {
    const slice = convIds.slice(i, i + chunk);
    const { data: closureSample, error: ce } = await supabase
      .from("chat_conversation_closures")
      .select("closed_by_usuario_id, closure_state_label, closure_substate_label")
      .eq("empresa_id", empresa_id)
      .in("conversation_id", slice)
      .limit(4000);
    if (ce) {
      if (!isMissingClosureTable(ce)) console.warn("[loadFinalizedFilterOptions] closures scoped:", ce.message);
      continue;
    }
    for (const r of closureSample ?? []) {
      const cl = String((r as { closed_by_usuario_id?: string | null }).closed_by_usuario_id ?? "").trim();
      if (cl) closerIdSet.add(cl);
      const st = String((r as { closure_state_label?: string }).closure_state_label ?? "").trim();
      const su = String((r as { closure_substate_label?: string }).closure_substate_label ?? "").trim();
      if (st) states.add(st);
      if (su) subs.add(su);
    }
  }

  let closed_by_users: { id: string; nombre: string }[] = [];
  const closerIds = [...closerIdSet];
  if (closerIds.length > 0) {
    const { data: uc, error: uce } = await catalogSr
      .from("usuarios")
      .select("id, nombre, email")
      .in("id", closerIds.slice(0, 500));
    if (!uce && uc) {
      closed_by_users = (uc as { id: string; nombre?: string | null; email?: string | null }[]).map((u) => ({
        id: u.id,
        nombre: (u.nombre?.trim() || u.email?.trim() || u.id) as string,
      }));
      closed_by_users.sort((a, b) => a.nombre.localeCompare(b.nombre, "es"));
    }
  }

  return {
    queues,
    channels,
    agents,
    closed_by_users,
    state_labels: [...states].sort((a, b) => a.localeCompare(b, "es")),
    substate_labels: [...subs].sort((a, b) => a.localeCompare(b, "es")),
    ux_scope: "team",
  };
}

/**
 * Opciones de filtro para el ASESOR PURO (vista "own"). Espeja EXACTAMENTE el alcance de
 * `listFinalizedClosures` (conversaciones ASIGNADAS a él + status='closed'), de modo que los
 * estados/subestados del dropdown siempre concuerden con las filas que efectivamente ve.
 * (El path scoped-team/Regla-B derivaba estados de un set que en runtime salía vacío → dropdown
 * "Estado" sin opciones.)
 */
async function loadFinalizedFilterOptionsOwn(
  supabase: AppSupabaseClient,
  empresa_id: string,
  usuario_id: string
): Promise<FinalizedFilterOptions> {
  const base: FinalizedFilterOptions = {
    queues: [],
    channels: [],
    agents: [],
    closed_by_users: [],
    state_labels: [],
    substate_labels: [],
    ux_scope: "own",
  };

  const ownFkIds = await resolveChatAgentIdsForUsuarios(supabase, empresa_id, [usuario_id]);
  if (ownFkIds.length === 0) return base;

  const { data: ownConv, error: ownErr } = await supabase
    .from("chat_conversations")
    .select("id")
    .eq("empresa_id", empresa_id)
    .in("assigned_agent_id", ownFkIds)
    .eq("status", "closed")
    .limit(15000);
  if (ownErr) {
    console.warn("[loadFinalizedFilterOptions] alcance asesor:", ownErr.message);
    return base;
  }
  const convIds = (ownConv ?? [])
    .map((r: { id?: string }) => String(r.id ?? "").trim())
    .filter(Boolean);
  if (convIds.length === 0) return base;

  const states = new Set<string>();
  const subs = new Set<string>();
  const chunk = 120;
  for (let i = 0; i < convIds.length; i += chunk) {
    const slice = convIds.slice(i, i + chunk);
    const { data: closureSample, error: ce } = await supabase
      .from("chat_conversation_closures")
      .select("closure_state_label, closure_substate_label")
      .eq("empresa_id", empresa_id)
      .in("conversation_id", slice)
      .limit(4000);
    if (ce) {
      if (!isMissingClosureTable(ce)) console.warn("[loadFinalizedFilterOptions] closures asesor:", ce.message);
      continue;
    }
    for (const r of closureSample ?? []) {
      const st = String((r as { closure_state_label?: string }).closure_state_label ?? "").trim();
      const su = String((r as { closure_substate_label?: string }).closure_substate_label ?? "").trim();
      if (st) states.add(st);
      if (su) subs.add(su);
    }
  }

  return {
    ...base,
    state_labels: [...states].sort((a, b) => a.localeCompare(b, "es")),
    substate_labels: [...subs].sort((a, b) => a.localeCompare(b, "es")),
  };
}

export async function loadFinalizedFilterOptions(): Promise<FinalizedFilterOptions> {
  const { supabase, catalogSr, empresa_id, usuario_id } = await requireEmpresaTenantServiceRole();
  const scope = await getOmnicanalScope(supabase, empresa_id, usuario_id);
  const bypass = await shouldBypassOmnicanalConversationScope(catalogSr, usuario_id, scope);
  if (bypass || isOmnicanalAdminScope(scope)) {
    return loadFinalizedFilterOptionsAllEmpresa(supabase, catalogSr, empresa_id);
  }
  // Asesor puro (no supervisor): vista simplificada "own" → el cliente muestra solo Fecha,
  // Estado y búsqueda. Opciones acotadas a SUS finalizadas (mismo alcance que la lista).
  if (scope.role !== "supervisor") {
    return loadFinalizedFilterOptionsOwn(supabase, empresa_id, usuario_id);
  }
  return loadFinalizedFilterOptionsScopedTeam(supabase, catalogSr, empresa_id, scope);
}

function mapQueues(rows: unknown): { id: string; nombre: string }[] {
  return ((rows as { id: string; nombre?: string | null }[]) ?? []).map((r) => ({
    id: r.id,
    nombre: String(r.nombre ?? "Cola"),
  }));
}

function mapChannels(rows: unknown): { id: string; nombre: string | null; type: string }[] {
  return ((rows as { id: string; nombre?: string | null; type?: string | null }[]) ?? []).map((r) => ({
    id: r.id,
    nombre: r.nombre ?? null,
    type: String(r.type ?? "whatsapp"),
  }));
}

export async function listFinalizedClosures(
  filters: FinalizedClosuresFilters,
  page: number,
  page_size: number
): Promise<FinalizedClosuresListResult> {
  const { supabase, catalogSr, empresa_id, usuario_id } = await requireEmpresaTenantServiceRole();
  const ps = Math.min(Math.max(page_size, 5), 1000);
  const p = Math.max(1, page);
  const from = (p - 1) * ps;
  const to = from + ps - 1;

  let conversationIdFilter: string[] | null = null;

  const scope = await getOmnicanalScope(supabase, empresa_id, usuario_id);
  const bypass = await shouldBypassOmnicanalConversationScope(catalogSr, usuario_id, scope);

  if (!bypass && !isOmnicanalAdminScope(scope)) {
    const fq = filters.queue_id?.trim();
    if (fq) {
      const allowedQ = await resolveQueueIdsForUsuarios(supabase, empresa_id, scope.agentUsuarioIds);
      if (!allowedQ.includes(fq)) {
        return { rows: [], total: 0, page: p, page_size: ps };
      }
    }
    const fa = filters.assigned_usuario_id?.trim();
    if (fa) {
      const allowedAgents = new Set(scope.agentUsuarioIds.map((x) => String(x ?? "").trim()).filter(Boolean));
      if (scope.role === "supervisor") {
        if (!allowedAgents.has(fa)) return { rows: [], total: 0, page: p, page_size: ps };
      } else if (scope.role === "agente") {
        if (fa !== usuario_id) return { rows: [], total: 0, page: p, page_size: ps };
      } else if (allowedAgents.size > 0 && !allowedAgents.has(fa)) {
        return { rows: [], total: 0, page: p, page_size: ps };
      }
    }
    const fc = filters.channel_id?.trim();
    if (fc) {
      const fks = await resolveChatAgentIdsForUsuarios(supabase, empresa_id, scope.agentUsuarioIds);
      if (fks.length === 0) return { rows: [], total: 0, page: p, page_size: ps };
      const { data: chHit } = await supabase
        .from("chat_conversations")
        .select("id")
        .eq("empresa_id", empresa_id)
        .eq("channel_id", fc)
        .in("assigned_agent_id", fks)
        .limit(1)
        .maybeSingle();
      if (!chHit) return { rows: [], total: 0, page: p, page_size: ps };
    }
  }

  let omnicanalConvIds: string[] | null = null;
  if (!bypass && !isOmnicanalAdminScope(scope)) {
    // ASESOR PURO (rol 'agente' o sin rol con fila chat_agents): ve SOLO SUS finalizadas =
    // conversaciones ASIGNADAS a él. No usamos la Regla B del inbox (que además sumaría las
    // sin-asignar de su cola). Acotamos a status='closed' para mantener el .in() chico (evita
    // URLs largas de PostgREST). SUPERVISOR conserva su alcance de equipo (appendOmnicanal).
    const esAsesorPuro = scope.role !== "supervisor";
    if (esAsesorPuro) {
      const ownFkIds = await resolveChatAgentIdsForUsuarios(supabase, empresa_id, [usuario_id]);
      if (ownFkIds.length === 0) {
        return { rows: [], total: 0, page: p, page_size: ps };
      }
      const { data: ownConv, error: ownErr } = await supabase
        .from("chat_conversations")
        .select("id")
        .eq("empresa_id", empresa_id)
        .in("assigned_agent_id", ownFkIds)
        .eq("status", "closed")
        .limit(15000);
      if (ownErr) {
        console.warn("[listFinalizedClosures] alcance asesor:", ownErr.message);
        return { rows: [], total: 0, page: p, page_size: ps };
      }
      omnicanalConvIds = (ownConv ?? [])
        .map((r: { id?: string }) => String(r.id ?? "").trim())
        .filter(Boolean);
    } else {
      let cq = supabase.from("chat_conversations").select("id").eq("empresa_id", empresa_id);
      cq = (await appendOmnicanalConversationScopeToQuery(supabase, empresa_id, scope, cq)).builder;
      const { data: scopedConv, error: omnErr } = await cq.limit(15000);
      if (omnErr) {
        console.warn("[listFinalizedClosures] alcance omnicanal:", omnErr.message);
        return { rows: [], total: 0, page: p, page_size: ps };
      }
      omnicanalConvIds = (scopedConv ?? [])
        .map((r: { id?: string }) => String(r.id ?? "").trim())
        .filter(Boolean);
      if (omnicanalConvIds.length >= 15000) {
        console.warn("[listFinalizedClosures] alcance omnicanal truncado a 15000 conversaciones");
      }
    }
    if (omnicanalConvIds.length === 0) {
      return { rows: [], total: 0, page: p, page_size: ps };
    }
  }

  const qTrim = filters.q?.trim() ?? "";
  if (qTrim) {
    const orParts = [`name.ilike.%${qTrim}%`, `phone_number.ilike.%${qTrim}%`];
    const qDigits = qTrim.replace(/\D/g, "");
    if (qDigits.length >= 4) {
      orParts.push(`phone_number.ilike.%${qDigits}%`);
    }
    const { data: contacts, error: ctErr } = await supabase
      .from("chat_contacts")
      .select("id")
      .eq("empresa_id", empresa_id)
      .or(orParts.join(","))
      .limit(500);
    if (ctErr) {
      console.warn("[listFinalizedClosures] contacts search:", ctErr.message);
    } else {
      const cids = (contacts ?? []).map((c) => c.id as string).filter(Boolean);
      if (cids.length === 0) {
        return { rows: [], total: 0, page: p, page_size: ps };
      }
      const convs = await selectInChunks(cids, async (slice) => {
        const { data, error } = await supabase
          .from("chat_conversations")
          .select("id")
          .eq("empresa_id", empresa_id)
          .in("contact_id", slice)
          .limit(2000);
        if (error) {
          console.warn("[listFinalizedClosures] conversations by contact:", error.message);
          return [];
        }
        return (data ?? []) as { id: string }[];
      });
      conversationIdFilter = convs.map((x) => x.id).filter(Boolean);
      if (conversationIdFilter.length === 0) {
        return { rows: [], total: 0, page: p, page_size: ps };
      }
    }
  }

  if (filters.channel_id?.trim()) {
    const ch = filters.channel_id.trim();
    const { data: convCh, error: eCh } = await supabase
      .from("chat_conversations")
      .select("id")
      .eq("empresa_id", empresa_id)
      .eq("channel_id", ch)
      .limit(5000);
    if (eCh) {
      console.warn("[listFinalizedClosures] channel conv:", eCh.message);
    } else {
      const ids = (convCh ?? []).map((x) => x.id as string).filter(Boolean);
      conversationIdFilter = intersectIds(conversationIdFilter, ids);
      if (conversationIdFilter.length === 0) {
        return { rows: [], total: 0, page: p, page_size: ps };
      }
    }
  }

  if (filters.assigned_usuario_id?.trim()) {
    const uid = filters.assigned_usuario_id.trim();
    const { data: caRows, error: cae } = await supabase
      .from("chat_agents")
      .select("id")
      .eq("empresa_id", empresa_id)
      .eq("usuario_id", uid);
    if (cae) {
      console.warn("[listFinalizedClosures] chat_agents by usuario:", cae.message);
      return { rows: [], total: 0, page: p, page_size: ps };
    } else {
      const caIds = (caRows ?? []).map((x) => String((x as { id?: string }).id ?? "").trim()).filter(Boolean);
      if (caIds.length === 0) {
        return { rows: [], total: 0, page: p, page_size: ps };
      }
      const { data: convA, error: convAe } = await supabase
        .from("chat_conversations")
        .select("id")
        .eq("empresa_id", empresa_id)
        .in("assigned_agent_id", caIds)
        .limit(8000);
      if (convAe) {
        console.warn("[listFinalizedClosures] conv by assigned agent:", convAe.message);
        return { rows: [], total: 0, page: p, page_size: ps };
      }
      const ids = (convA ?? []).map((x) => x.id as string).filter(Boolean);
      conversationIdFilter = intersectIds(conversationIdFilter, ids);
      if (conversationIdFilter !== null && conversationIdFilter.length === 0) {
        return { rows: [], total: 0, page: p, page_size: ps };
      }
    }
  }

  if (omnicanalConvIds && omnicanalConvIds.length > 0) {
    conversationIdFilter = intersectIds(conversationIdFilter, omnicanalConvIds);
    if (conversationIdFilter.length === 0) {
      return { rows: [], total: 0, page: p, page_size: ps };
    }
  }

  const df = filters.date_from?.trim();
  const dt = filters.date_to?.trim();

  let total = 0;
  let cl: ClosureRow[] = [];

  if (conversationIdFilter && conversationIdFilter.length > 0) {
    // Alcance acotado (asesor = sus finalizadas; o admin con búsqueda/filtro de canal): puede haber
    // MUCHAS conversaciones. Traemos las closures en LOTES por conversation_id (evita URLs largas de
    // PostgREST → 414 que rompía la vista) y paginamos en memoria, ordenando por closed_at desc.
    const gathered: ClosureRow[] = [];
    const seenIds = new Set<string>();
    for (let i = 0; i < conversationIdFilter.length; i += ID_IN_CHUNK) {
      const slice = conversationIdFilter.slice(i, i + ID_IN_CHUNK);
      if (slice.length === 0) continue;
      let q = supabase
        .from("chat_conversation_closures")
        .select(
          "id, conversation_id, queue_id, closure_state_label, closure_substate_label, comment, closed_at, closed_by_usuario_id"
        )
        .eq("empresa_id", empresa_id)
        .in("conversation_id", slice);
      if (df) q = q.gte("closed_at", startOfDayIso(df));
      if (dt) q = q.lte("closed_at", endOfDayIso(dt));
      if (filters.queue_id?.trim()) q = q.eq("queue_id", filters.queue_id.trim());
      if (filters.closed_by_usuario_id?.trim()) q = q.eq("closed_by_usuario_id", filters.closed_by_usuario_id.trim());
      if (filters.state_label?.trim()) q = q.eq("closure_state_label", filters.state_label.trim());
      if (filters.substate_label?.trim()) q = q.eq("closure_substate_label", filters.substate_label.trim());
      const { data, error } = await q.limit(5000);
      if (error) {
        if (isMissingClosureTable(error)) return { rows: [], total: 0, page: p, page_size: ps };
        throw new Error(error.message);
      }
      for (const r of (data ?? []) as ClosureRow[]) {
        const id = String(r.id ?? "");
        if (id && !seenIds.has(id)) {
          seenIds.add(id);
          gathered.push(r);
        }
      }
    }
    gathered.sort((a, b) => String(b.closed_at ?? "").localeCompare(String(a.closed_at ?? "")));
    total = gathered.length;
    cl = gathered.slice(from, to + 1);
  } else {
    // Admin / bypass sin filtro de conversaciones: count + range directo (una sola query).
    let countQuery = supabase
      .from("chat_conversation_closures")
      .select("id", { count: "exact", head: true })
      .eq("empresa_id", empresa_id);
    if (df) countQuery = countQuery.gte("closed_at", startOfDayIso(df));
    if (dt) countQuery = countQuery.lte("closed_at", endOfDayIso(dt));
    if (filters.queue_id?.trim()) countQuery = countQuery.eq("queue_id", filters.queue_id.trim());
    if (filters.closed_by_usuario_id?.trim()) {
      countQuery = countQuery.eq("closed_by_usuario_id", filters.closed_by_usuario_id.trim());
    }
    if (filters.state_label?.trim()) countQuery = countQuery.eq("closure_state_label", filters.state_label.trim());
    if (filters.substate_label?.trim()) {
      countQuery = countQuery.eq("closure_substate_label", filters.substate_label.trim());
    }
    const { count, error: cErr } = await countQuery;
    if (cErr) {
      if (isMissingClosureTable(cErr)) return { rows: [], total: 0, page: p, page_size: ps };
      throw new Error(cErr.message);
    }
    total = count ?? 0;

    let dataQuery = supabase
      .from("chat_conversation_closures")
      .select(
        "id, conversation_id, queue_id, closure_state_label, closure_substate_label, comment, closed_at, closed_by_usuario_id"
      )
      .eq("empresa_id", empresa_id)
      .order("closed_at", { ascending: false })
      .range(from, to);
    if (df) dataQuery = dataQuery.gte("closed_at", startOfDayIso(df));
    if (dt) dataQuery = dataQuery.lte("closed_at", endOfDayIso(dt));
    if (filters.queue_id?.trim()) dataQuery = dataQuery.eq("queue_id", filters.queue_id.trim());
    if (filters.closed_by_usuario_id?.trim()) {
      dataQuery = dataQuery.eq("closed_by_usuario_id", filters.closed_by_usuario_id.trim());
    }
    if (filters.state_label?.trim()) dataQuery = dataQuery.eq("closure_state_label", filters.state_label.trim());
    if (filters.substate_label?.trim()) {
      dataQuery = dataQuery.eq("closure_substate_label", filters.substate_label.trim());
    }
    const { data: closures, error: dErr } = await dataQuery;
    if (dErr) {
      if (isMissingClosureTable(dErr)) return { rows: [], total: 0, page: p, page_size: ps };
      throw new Error(dErr.message);
    }
    cl = (closures ?? []) as ClosureRow[];
  }

  if (cl.length === 0) {
    return { rows: [], total, page: p, page_size: ps };
  }

  const convIds = [...new Set(cl.map((c) => c.conversation_id).filter(Boolean))];
  const queueIds = [...new Set(cl.map((c) => c.queue_id).filter(Boolean) as string[])];

  const convRows = await selectInChunks(convIds, async (slice) => {
    const { data, error } = await supabase
      .from("chat_conversations")
      .select("id, contact_id, channel_id, last_message_preview, assigned_agent_id")
      .eq("empresa_id", empresa_id)
      .in("id", slice);
    if (error) throw new Error(error.message);
    return (data ?? []) as {
      id: string;
      contact_id: string;
      channel_id: string;
      last_message_preview: string | null;
      assigned_agent_id: string | null;
    }[];
  });
  const convById = new Map(convRows.map((row) => [row.id, row] as const));

  const assignedFkIds = [
    ...new Set([...convById.values()].map((c) => c.assigned_agent_id).filter(Boolean) as string[]),
  ];
  const chatAgentIdToUsuarioId = new Map<string, string>();
  if (assignedFkIds.length > 0) {
    const caJoin = await selectInChunks(assignedFkIds, async (slice) => {
      const { data, error } = await supabase
        .from("chat_agents")
        .select("id, usuario_id")
        .eq("empresa_id", empresa_id)
        .in("id", slice);
      if (error) {
        console.warn("[listFinalizedClosures] chat_agents join:", error.message);
        return [];
      }
      return (data ?? []) as { id: string; usuario_id: string }[];
    });
    for (const r of caJoin) {
      if (r.id && r.usuario_id) chatAgentIdToUsuarioId.set(r.id, r.usuario_id);
    }
  }

  const usuarioIdsForNames = new Set<string>();
  for (const row of cl) {
    if (row.closed_by_usuario_id) usuarioIdsForNames.add(row.closed_by_usuario_id);
  }
  for (const conv of convById.values()) {
    const ua = conv.assigned_agent_id ? chatAgentIdToUsuarioId.get(conv.assigned_agent_id) : undefined;
    if (ua) usuarioIdsForNames.add(ua);
  }
  const agentIds = [...usuarioIdsForNames];

  const contactIds = [...new Set([...convById.values()].map((c) => c.contact_id).filter(Boolean))];
  const channelIds = [...new Set([...convById.values()].map((c) => c.channel_id).filter(Boolean))];

  const contacts = await selectInChunks(contactIds, async (slice) => {
    const { data, error } = await supabase
      .from("chat_contacts")
      .select("id, name, phone_number")
      .eq("empresa_id", empresa_id)
      .in("id", slice);
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; name: string | null; phone_number: string | null }[];
  });
  const contactById = new Map(contacts.map((row) => [row.id, row] as const));

  const chRows = await selectInChunks(channelIds, async (slice) => {
    const { data, error } = await supabase
      .from("chat_channels")
      .select("id, type, nombre")
      .eq("empresa_id", empresa_id)
      .in("id", slice);
    if (error) throw new Error(error.message);
    return (data ?? []) as { id: string; type: string | null; nombre: string | null }[];
  });
  const channelById = new Map(chRows.map((row) => [row.id, row] as const));

  let queueById = new Map<string, string>();
  if (queueIds.length > 0) {
    const qrows = await selectInChunks(queueIds, async (slice) => {
      const { data, error } = await supabase
        .from("chat_queues")
        .select("id, nombre")
        .eq("empresa_id", empresa_id)
        .in("id", slice);
      if (error) {
        console.warn("[listFinalizedClosures] chat_queues:", error.message);
        return [];
      }
      return (data ?? []) as { id: string; nombre?: string | null }[];
    });
    queueById = new Map(qrows.map((r) => [r.id, String(r.nombre ?? "")] as const));
  }

  let usuarioNombre = new Map<string, string>();
  if (agentIds.length > 0) {
    const urows = await selectInChunks(agentIds, async (slice) => {
      const { data, error } = await catalogSr
        .from("usuarios")
        .select("id, nombre, email")
        .in("id", slice);
      if (error) {
        console.warn("[listFinalizedClosures] usuarios:", error.message);
        return [];
      }
      return (data ?? []) as { id: string; nombre?: string | null; email?: string | null }[];
    });
    usuarioNombre = new Map(
      urows.map((u) => [u.id, (u.nombre?.trim() || u.email?.trim() || "—") as string] as const)
    );
  }

  const rows: FinalizedClosureListRow[] = cl.map((row) => {
    const conv = convById.get(row.conversation_id);
    const contact = conv ? contactById.get(conv.contact_id) : undefined;
    const ch = conv ? channelById.get(conv.channel_id) : undefined;
    const assignedUid =
      conv?.assigned_agent_id ? chatAgentIdToUsuarioId.get(conv.assigned_agent_id) : undefined;
    return {
      closure_id: row.id,
      conversation_id: row.conversation_id,
      closed_at: row.closed_at,
      contact_name: contact?.name?.trim() || null,
      phone_number: (contact?.phone_number ?? "").trim() || "—",
      channel_type: String(ch?.type ?? "whatsapp"),
      channel_nombre: ch?.nombre ?? null,
      queue_nombre: row.queue_id ? queueById.get(row.queue_id) ?? null : null,
      assigned_agent_nombre: assignedUid ? usuarioNombre.get(assignedUid) ?? null : null,
      closed_by_nombre: usuarioNombre.get(row.closed_by_usuario_id) ?? null,
      state_label: row.closure_state_label,
      substate_label: row.closure_substate_label,
      comment: row.comment,
      last_preview: conv?.last_message_preview ?? null,
    };
  });

  return { rows, total, page: p, page_size: ps };
}
