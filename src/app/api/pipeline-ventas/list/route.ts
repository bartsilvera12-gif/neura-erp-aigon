import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol, isAdmin } from "@/lib/middleware/auth";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";

export const runtime = "nodejs";

/**
 * GET /api/pipeline-ventas/list
 *
 * Query params:
 *   estado          — nuevo|seguimiento|confirmado|pagado_entregado|perdido|sin_estado (opcional)
 *   vendedor_id     — usuario_id (opcional; filtra por assigned_agent_id → chat_agents.usuario_id)
 *   desde           — YYYY-MM-DD (opcional; filtra estado_pipeline_updated_at >=)
 *   hasta           — YYYY-MM-DD (opcional; filtra estado_pipeline_updated_at <)
 *   limit           — default 200, max 500
 *
 * Solo admin. Devuelve conversaciones con estado_pipeline + contacto + vendedor.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth?.empresa_id) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    if (!isAdmin(auth)) {
      return NextResponse.json({ ok: false, error: "Solo admin" }, { status: 403 });
    }

    const sp = request.nextUrl.searchParams;
    const estado = (sp.get("estado") ?? "").trim();
    const vendedorId = (sp.get("vendedor_id") ?? "").trim();
    const desde = (sp.get("desde") ?? "").trim();
    const hasta = (sp.get("hasta") ?? "").trim();
    const limitRaw = Number(sp.get("limit") ?? 200);
    const limit = Math.max(1, Math.min(500, Number.isFinite(limitRaw) ? limitRaw : 200));

    const supabase = await getChatServiceClientForEmpresa(auth.empresa_id);

    // Base: conversaciones de la empresa.
    let q = supabase
      .from("chat_conversations")
      .select(
        "id, status, contact_id, channel_id, assigned_agent_id, last_message_at, last_message_preview, estado_pipeline, estado_pipeline_updated_at, estado_pipeline_updated_by, seguimiento_fecha, venta_monto"
      )
      .eq("empresa_id", auth.empresa_id);

    if (estado === "sin_estado") {
      q = q.is("estado_pipeline", null);
    } else if (estado) {
      q = q.eq("estado_pipeline", estado);
    }
    if (desde) q = q.gte("estado_pipeline_updated_at", `${desde}T00:00:00Z`);
    if (hasta) q = q.lt("estado_pipeline_updated_at", `${hasta}T00:00:00Z`);

    q = q.order("estado_pipeline_updated_at", { ascending: false, nullsFirst: false }).limit(limit);

    const { data: convsRaw, error } = await q;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    let convs = (convsRaw ?? []) as Array<{
      id: string;
      status: string;
      contact_id: string | null;
      channel_id: string | null;
      assigned_agent_id: string | null;
      last_message_at: string | null;
      last_message_preview: string | null;
      estado_pipeline: string | null;
      estado_pipeline_updated_at: string | null;
      estado_pipeline_updated_by: string | null;
      seguimiento_fecha: string | null;
      venta_monto: number | null;
    }>;

    // Resolver vendedor: chat_agents.usuario_id → usuario.nombre (catálogo).
    const agentIds = [...new Set(convs.map((c) => c.assigned_agent_id).filter((x): x is string => !!x))];
    let agentUsuarioMap = new Map<string, { usuario_id: string | null; usuario_nombre: string | null }>();
    if (agentIds.length > 0) {
      const { data: ags } = await supabase
        .from("chat_agents")
        .select("id, usuario_id")
        .in("id", agentIds);
      const usuarioIds: string[] = [];
      const idToUsuario = new Map<string, string | null>();
      for (const a of (ags ?? []) as Array<{ id: string; usuario_id: string | null }>) {
        idToUsuario.set(a.id, a.usuario_id ?? null);
        if (a.usuario_id) usuarioIds.push(a.usuario_id);
      }
      // Nombre de usuario vive en catálogo (zentra_erp.usuarios) — se resuelve arriba.
      // Aquí lo dejamos como usuario_id; el nombre se resuelve en el frontend admin
      // o en un pass posterior. Simple: guardamos usuario_id para filtrado.
      agentUsuarioMap = new Map(
        agentIds.map((agentId) => [
          agentId,
          { usuario_id: idToUsuario.get(agentId) ?? null, usuario_nombre: null },
        ])
      );
    }

    // Filtro por vendedor (post-fetch: si hay chat_agents.usuario_id).
    if (vendedorId) {
      convs = convs.filter((c) => {
        if (!c.assigned_agent_id) return false;
        const m = agentUsuarioMap.get(c.assigned_agent_id);
        return m?.usuario_id === vendedorId;
      });
    }

    // Contactos
    const contactIds = [...new Set(convs.map((c) => c.contact_id).filter((x): x is string => !!x))];
    const contactById = new Map<string, { nombre: string | null; telefono: string | null }>();
    if (contactIds.length > 0) {
      const { data: cs } = await supabase
        .from("chat_contacts")
        .select("id, name, phone_number")
        .in("id", contactIds);
      for (const c of (cs ?? []) as Array<{ id: string; name: string | null; phone_number: string | null }>) {
        contactById.set(c.id, { nombre: c.name ?? null, telefono: c.phone_number ?? null });
      }
    }

    // Canales
    const channelIds = [...new Set(convs.map((c) => c.channel_id).filter((x): x is string => !!x))];
    const channelById = new Map<string, string | null>();
    if (channelIds.length > 0) {
      const { data: chs } = await supabase
        .from("chat_channels")
        .select("id, nombre")
        .in("id", channelIds);
      for (const c of (chs ?? []) as Array<{ id: string; nombre: string | null }>) {
        channelById.set(c.id, c.nombre ?? null);
      }
    }

    const rows = convs.map((c) => {
      const contact = c.contact_id ? contactById.get(c.contact_id) : null;
      const agentInfo = c.assigned_agent_id ? agentUsuarioMap.get(c.assigned_agent_id) : null;
      return {
        conversation_id: c.id,
        status: c.status,
        estado_pipeline: c.estado_pipeline,
        estado_pipeline_updated_at: c.estado_pipeline_updated_at,
        seguimiento_fecha: c.seguimiento_fecha,
        venta_monto: c.venta_monto == null ? null : Number(c.venta_monto),
        contact_nombre: contact?.nombre ?? null,
        contact_telefono: contact?.telefono ?? null,
        channel_name: c.channel_id ? channelById.get(c.channel_id) ?? null : null,
        assigned_agent_id: c.assigned_agent_id,
        vendedor_usuario_id: agentInfo?.usuario_id ?? null,
        last_message_at: c.last_message_at,
        last_message_preview: c.last_message_preview,
      };
    });

    return NextResponse.json({ ok: true, rows });
  } catch (e) {
    console.error("[api/pipeline-ventas/list]", e);
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
