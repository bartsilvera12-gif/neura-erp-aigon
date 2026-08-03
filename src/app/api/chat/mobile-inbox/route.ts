import { NextRequest, NextResponse } from "next/server";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { requireEmpresaTenantServiceRole } from "@/lib/chat/empresa-tenant-service-role";
import { filterConversationIdsByOmnicanalScope } from "@/lib/chat/omnicanal-scope";

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
    };

    // Candidatas (ventana amplia) ordenadas por actividad. El scope omnicanal se aplica con el
    // mismo helper que el desktop (admin=bypass; agente=asignadas a él + sin-asignar de su cola),
    // y recién después se recorta a 50. Antes este endpoint NO aplicaba scope (sobre-exposición).
    const { data: convs, error } = await supabase
      .from("chat_conversations")
      .select(
        "id, status, last_message_at, last_message_preview, unread_count, contact_id, channel_id"
      )
      .eq("empresa_id", empresaId)
      .in("status", statusList)
      .order("last_message_at", { ascending: false, nullsFirst: false })
      .limit(200);

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
    const rows = candidatas.filter((r) => visibles.has(r.id)).slice(0, 50);

    const contactIds = [...new Set(rows.map((r) => r.contact_id).filter((id): id is string => !!id))];
    const channelIds = [...new Set(rows.map((r) => r.channel_id).filter((id): id is string => !!id))];

    const [contactsRes, channelsRes] = await Promise.all([
      contactIds.length > 0
        ? supabase
            .from("chat_contacts")
            .select("id, nombre, telefono, raw_telefono")
            .eq("empresa_id", empresaId)
            .in("id", contactIds)
        : Promise.resolve({ data: [], error: null } as { data: unknown[]; error: null }),
      channelIds.length > 0
        ? supabase
            .from("chat_channels")
            .select("id, name, provider")
            .eq("empresa_id", empresaId)
            .in("id", channelIds)
        : Promise.resolve({ data: [], error: null } as { data: unknown[]; error: null }),
    ]);

    const contactById = new Map<string, { nombre: string | null; telefono: string | null }>();
    for (const c of (contactsRes.data ?? []) as Array<{
      id: string;
      nombre: string | null;
      telefono: string | null;
      raw_telefono: string | null;
    }>) {
      contactById.set(c.id, {
        nombre: c.nombre ?? null,
        telefono: c.telefono ?? c.raw_telefono ?? null,
      });
    }

    const channelById = new Map<string, { name: string | null; provider: string | null }>();
    for (const c of (channelsRes.data ?? []) as Array<{
      id: string;
      name: string | null;
      provider: string | null;
    }>) {
      channelById.set(c.id, { name: c.name ?? null, provider: c.provider ?? null });
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
      };
    });

    return NextResponse.json(successResponse({ conversations }), {
      headers: {
        // El cliente revalida con polling de 30s; permitimos servir cached con SWR.
        "Cache-Control": "private, max-age=0, stale-while-revalidate=15",
      },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
