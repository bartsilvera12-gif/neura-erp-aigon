import { NextRequest, NextResponse } from "next/server";
import { requireEmpresaTenantServiceRole } from "@/lib/chat/empresa-tenant-service-role";

export const runtime = "nodejs";

/**
 * POST /api/cc/agent/device-token
 * Registra/actualiza el token FCM del dispositivo del agente (idempotente).
 * Body: { fcm_token, platform?, app_version?, device_label? }
 *
 * Idempotencia: UNIQUE (empresa_id, fcm_token). Si el token ya existe, actualiza
 * last_seen_at, is_active=true y metadatos; nunca duplica.
 * Escopado al usuario logueado (no se puede registrar token de otro).
 *
 * Usa el cliente schema-aware `ctx.supabase` (PostgREST para neura, shim-pool para
 * tenants no expuestos) — NO el pool PG crudo, que no es el camino soportado para neura.
 */
export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await requireEmpresaTenantServiceRole();
  } catch {
    return NextResponse.json({ ok: false, error: "Iniciá sesión", code: "unauthenticated" }, { status: 401 });
  }
  const { supabase, empresa_id, usuario_id } = ctx;

  const body = (await request.json().catch(() => null)) as
    | { fcm_token?: string; platform?: string; app_version?: string; device_label?: string }
    | null;
  const fcmToken = typeof body?.fcm_token === "string" ? body.fcm_token.trim() : "";
  if (!fcmToken) {
    return NextResponse.json({ ok: false, error: "fcm_token requerido" }, { status: 400 });
  }
  const platformRaw = (body?.platform ?? "android").trim().toLowerCase();
  const platform = ["android", "ios", "web"].includes(platformRaw) ? platformRaw : "android";
  const appVersion =
    typeof body?.app_version === "string" ? body.app_version.trim().slice(0, 40) || null : null;
  const deviceLabel =
    typeof body?.device_label === "string" ? body.device_label.trim().slice(0, 120) || null : null;

  try {
    // agent_id del usuario (si es agente). Preferimos la fila activa.
    const { data: agRows } = await supabase
      .from("chat_agents")
      .select("id, is_active")
      .eq("empresa_id", empresa_id)
      .eq("usuario_id", usuario_id)
      .order("is_active", { ascending: false })
      .limit(1);
    const agentId = (agRows?.[0] as { id?: string } | undefined)?.id ?? null;

    const nowIso = new Date().toISOString();
    // device_name/app_version solo si vienen (en conflicto no pisan con null lo previo).
    const payload: Record<string, unknown> = {
      empresa_id,
      agent_id: agentId,
      user_id: usuario_id,
      platform,
      fcm_token: fcmToken,
      is_active: true,
      last_seen_at: nowIso,
      updated_at: nowIso,
    };
    if (deviceLabel != null) payload.device_name = deviceLabel;
    if (appVersion != null) payload.app_version = appVersion;

    const { data, error } = await supabase
      .from("agent_device_tokens")
      .upsert(payload, { onConflict: "empresa_id,fcm_token" })
      .select("id")
      .maybeSingle();
    if (error) {
      console.error("[api/cc/agent/device-token]", error.message);
      return NextResponse.json({ ok: false, error: "No se pudo registrar el dispositivo" }, { status: 500 });
    }
    return NextResponse.json({
      ok: true,
      id: (data as { id?: string } | null)?.id ?? null,
      agent_id: agentId,
      is_agent: agentId != null,
    });
  } catch (e) {
    console.error("[api/cc/agent/device-token] error:", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: "No se pudo registrar el dispositivo" }, { status: 500 });
  }
}
