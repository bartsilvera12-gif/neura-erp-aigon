import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { requireEmpresaTenantServiceRole } from "@/lib/chat/empresa-tenant-service-role";
import { filterConversationIdsByOmnicanalScope, getOmnicanalScope } from "@/lib/chat/omnicanal-scope";

/**
 * GET /api/chat/mobile-inbox
 *
 * Endpoint LIVIANO para el inbox mobile. Devuelve hasta 50 conversaciones
 * abiertas/pendientes con contacto enriquecido para mostrar en la lista mobile.
 * No usa el bootstrap pesado del desktop ConversacionesClient.
 *
 * Devuelve:
 *   { conversations: [{ id, status, last_message_at, last_message_preview,
 *                       unread_count, contact_nombre, contact_telefono, channel_name }] }
 */
export async function GET(request: NextRequest) {
  try {
    let ctx;
    try {
      ctx = await requireEmpresaTenantServiceRole();
    } catch {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { supabase, catalogSr, empresa_id: empresaId, usuario_id: usuarioId } = ctx;

    const onlyOpen = request.nextUrl.searchParams.get("only_open") !== "0";
    const statusList = onlyOpen ? ["open", "pending"] : ["open", "pending", "closed"];

    type Row = {
      id: string;
      status: string;
      last_message_at: string | null;
      last_message_preview: string | null;
      unread_count: number | null;
      contact_id: string | null;
      channel_id: string | null;
      estado_pipeline: string | null;
      seguimiento_fecha: string | null;
    };

    // Candidatas (ventana amplia) ordenadas por actividad. El scope omnicanal se aplica con el
    // mismo helper que el desktop (admin=bypass; agente=asignadas a él + sin-asignar de su cola),
    // y recién después se recorta a 50. Antes este endpoint NO aplicaba scope (sobre-exposición).
    const { data: convs, error } = await supabase
      .from("chat_conversations")
      .select(
        "id, status, last_message_at, last_message_preview, unread_count, contact_id, channel_id, estado_pipeline, seguimiento_fecha"
      )
      .eq("empresa_id", empresaId)
      .in("status", statusList)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(500);

    if (error) {
      return NextResponse.json(errorResponse(error.message), { status: 400 });
    }

    const candidatas = (convs ?? []) as Row[];
    const visibles = await filterConversationIdsByOmnicanalScope(
      supabase,
      catalogSr,
      empresaId,
      usuarioId,
      candidatas.map((r) => r.id)
    );

    // Filtro fuerte para vendedores mobile: SOLO chats asignados a este usuario.
    // El scope omnicanal incluye "sin-asignar de su cola" (para que puedan tomar
    // chats), pero eso hace que TODOS los vendedores vean la misma lista de
    // sin-asignar → confusión. En mobile un vendedor solo ve lo SUYO. El pool
    // de sin-asignar queda para admin/desktop.
    // Admins con bypass no entran a este bloque (scope.role='admin').
    const scope = await getOmnicanalScope(supabase, empresaId, usuarioId);
    let restrictToOwnAssigned = false;
    const ownAgentIds = new Set<string>();
    if (scope.role === "agente" || scope.role === null) {
      const { data: myAgents } = await supabase
        .from("chat_agents")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("usuario_id", usuarioId)
        .eq("is_active", true);
      for (const a of (myAgents ?? []) as Array<{ id?: string }>) {
        const id = (a.id ?? "").trim();
        if (id) ownAgentIds.add(id);
      }
      if (ownAgentIds.size > 0) restrictToOwnAssigned = true;
    }

    let rows = candidatas.filter((r) => visibles.has(r.id));
    if (restrictToOwnAssigned) {
      // Necesitamos assigned_agent_id de cada conv. Chunk por 50 para no romper
      // Cloudflare con URLs largas (mismo problema que teníamos con contactos).
      const convIds = rows.map((r) => r.id);
      const assignedByConv = new Map<string, string | null>();
      const CHUNK = 50;
      for (let i = 0; i < convIds.length; i += CHUNK) {
        const batch = convIds.slice(i, i + CHUNK);
        const { data } = await supabase
          .from("chat_conversations")
          .select("id, assigned_agent_id")
          .eq("empresa_id", empresaId)
          .in("id", batch);
        for (const c of (data ?? []) as Array<{ id: string; assigned_agent_id: string | null }>) {
          assignedByConv.set(c.id, c.assigned_agent_id ?? null);
        }
      }
      rows = rows.filter((r) => {
        const aid = assignedByConv.get(r.id);
        return aid != null && ownAgentIds.has(aid);
      });
    }
    rows = rows.slice(0, 200);

    const contactIds = [...new Set(rows.map((r) => r.contact_id).filter((id): id is string => !!id))];
    const channelIds = [...new Set(rows.map((r) => r.channel_id).filter((id): id is string => !!id))];

    // Chunkeo por 50: Cloudflare devuelve 502 con .in("id", [+100 UUIDs]) por
    // tamaño de URL. Batches chicos y merge del resultado.
    async function fetchContactsChunked(ids: string[]): Promise<{
      data: Array<{ id: string; name: string | null; phone_number: string | null }>;
      error: { message: string } | null;
    }> {
      const CHUNK = 50;
      const acc: Array<{ id: string; name: string | null; phone_number: string | null }> = [];
      for (let i = 0; i < ids.length; i += CHUNK) {
        const batch = ids.slice(i, i + CHUNK);
        const { data, error } = await supabase
          .from("chat_contacts")
          .select("id, name, phone_number")
          .eq("empresa_id", empresaId)
          .in("id", batch);
        if (error) return { data: acc, error: { message: error.message } };
        if (data) acc.push(...(data as Array<{ id: string; name: string | null; phone_number: string | null }>));
      }
      return { data: acc, error: null };
    }

    const [contactsRes, channelsRes] = await Promise.all([
      contactIds.length > 0
        ? fetchContactsChunked(contactIds)
        : Promise.resolve({ data: [] as Array<{ id: string; name: string | null; phone_number: string | null }>, error: null as { message: string } | null }),
      channelIds.length > 0
        ? supabase
            .from("chat_channels")
            .select("id, nombre, provider")
            .eq("empresa_id", empresaId)
            .in("id", channelIds)
        : Promise.resolve({ data: [], error: null } as { data: unknown[]; error: null }),
    ]);

    // Log explícito si algo falla — el trace silencioso nos dejó ciegos con
    // contact_nombre=null en la APK.
    if ((contactsRes as { error?: { message?: string } | null }).error) {
      console.error("[mobile-inbox] contacts_query_error", {
        message: (contactsRes as { error?: { message?: string } | null }).error?.message,
        contactIdsCount: contactIds.length,
        empresa_id_prefix: String(empresaId).slice(0, 8),
      });
    }
    if ((channelsRes as { error?: { message?: string } | null }).error) {
      console.error("[mobile-inbox] channels_query_error", {
        message: (channelsRes as { error?: { message?: string } | null }).error?.message,
      });
    }

    const contactById = new Map<string, { nombre: string | null; telefono: string | null }>();
    for (const c of (contactsRes.data ?? []) as Array<{
      id: string;
      name: string | null;
      phone_number: string | null;
    }>) {
      contactById.set(c.id, {
        nombre: c.name ?? null,
        telefono: c.phone_number ?? null,
      });
    }

    const channelById = new Map<string, { name: string | null; provider: string | null }>();
    for (const c of (channelsRes.data ?? []) as Array<{
      id: string;
      nombre: string | null;
      provider: string | null;
    }>) {
      channelById.set(c.id, { name: c.nombre ?? null, provider: c.provider ?? null });
    }

    const conversations = rows.map((r) => {
      const contact = r.contact_id ? contactById.get(r.contact_id) : null;
      const channel = r.channel_id ? channelById.get(r.channel_id) : null;
      return {
        id: r.id,
        status: r.status,
        last_message_at: r.last_message_at,
        last_message_preview: r.last_message_preview,
        unread_count: Number(r.unread_count ?? 0),
        contact_nombre: contact?.nombre ?? null,
        contact_telefono: contact?.telefono ?? null,
        channel_name: channel?.name ?? null,
        channel_provider: channel?.provider ?? null,
        estado_pipeline: r.estado_pipeline ?? null,
        seguimiento_fecha: r.seguimiento_fecha ?? null,
      };
    });

    // DEBUG TEMPORAL: expone en la respuesta si contacts/channels fallaron y
    // cuántos rows se resolvieron. Se puede quitar cuando el bug esté cerrado.
    const debug = {
      contact_ids_count: contactIds.length,
      contacts_resolved: contactById.size,
      contacts_error: (contactsRes as { error?: { message?: string } | null }).error?.message ?? null,
      channel_ids_count: channelIds.length,
      channels_resolved: channelById.size,
      channels_error: (channelsRes as { error?: { message?: string } | null }).error?.message ?? null,
    };

    return NextResponse.json(successResponse({ conversations, debug }), {
      headers: {
        "Cache-Control": "no-store, must-revalidate",
        Pragma: "no-cache",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
