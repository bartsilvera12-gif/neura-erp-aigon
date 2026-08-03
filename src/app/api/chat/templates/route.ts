import { NextRequest, NextResponse } from "next/server";
import { getAuthWithRol } from "@/lib/middleware/auth";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { pgLoadConversationForSend } from "@/lib/chat/chat-send-persist-pg";
import { fetchDataSchemaForEmpresaId } from "@/lib/supabase/empresa-data-schema";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { isLikelyUnexposedTenantChatSchema } from "@/lib/supabase/chat-data-schema";

/**
 * GET /api/chat/templates?conversation_id=…
 * Plantillas WhatsApp APROBADAS del canal de la conversación, para recontacto manual desde el
 * inbox (sobre todo fuera de la ventana de 24h). Degrada a [] si no hay canal/plantillas.
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await getAuthWithRol(request);
    if (!auth?.empresa_id) {
      return NextResponse.json({ ok: false, error: "No autenticado" }, { status: 401 });
    }
    const conversationId = request.nextUrl.searchParams.get("conversation_id")?.trim() ?? "";
    if (!conversationId) {
      return NextResponse.json({ ok: false, error: "conversation_id requerido" }, { status: 400 });
    }

    const supabase = await getChatServiceClientForEmpresa(auth.empresa_id);
    const dataSchema = await fetchDataSchemaForEmpresaId(auth.empresa_id);
    const pool = getChatPostgresPool();
    const tenantPg = Boolean(pool && isLikelyUnexposedTenantChatSchema(dataSchema));

    let channelId = "";
    if (tenantPg && pool) {
      const conv = await pgLoadConversationForSend(pool, dataSchema, conversationId);
      if (conv && conv.empresa_id === auth.empresa_id) channelId = conv.channel_id;
    } else {
      const { data: cdata } = await supabase
        .from("chat_conversations")
        .select("channel_id, empresa_id")
        .eq("id", conversationId)
        .maybeSingle();
      const row = cdata as { channel_id?: string; empresa_id?: string } | null;
      if (row && row.empresa_id === auth.empresa_id) channelId = String(row.channel_id ?? "");
    }
    if (!channelId) {
      return NextResponse.json({ ok: true, data: [] });
    }

    const { data, error } = await supabase
      .from("chat_campaign_templates")
      .select("id, name, language, category, components_json, variable_schema_json")
      .eq("empresa_id", auth.empresa_id)
      .eq("channel_id", channelId)
      .eq("status", "APPROVED")
      .order("name", { ascending: true });
    if (error) {
      // Degradación segura: sin tabla / error → sin plantillas (no rompe el inbox).
      return NextResponse.json({ ok: true, data: [] });
    }
    return NextResponse.json({ ok: true, data: data ?? [] });
  } catch (e) {
    console.error("[api/chat/templates]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
