import { NextRequest, NextResponse } from "next/server";
import { requireEmpresaTenantServiceRole } from "@/lib/chat/empresa-tenant-service-role";

export const runtime = "nodejs";

/**
 * POST /api/cc/agent/device-token/deactivate
 * Desactiva (is_active=false) el token FCM indicado, escopado al usuario logueado.
 * Se usa al cerrar sesión / logout en la app. No borra la fila (auditoría).
 * Body: { fcm_token }
 *
 * Usa el cliente schema-aware `ctx.supabase` (PostgREST para neura), no el pool crudo.
 */
export async function POST(request: NextRequest) {
  let ctx;
  try {
    ctx = await requireEmpresaTenantServiceRole();
  } catch {
    return NextResponse.json({ ok: false, error: "Iniciá sesión", code: "unauthenticated" }, { status: 401 });
  }
  const { supabase, empresa_id, usuario_id } = ctx;

  const body = (await request.json().catch(() => null)) as { fcm_token?: string } | null;
  const fcmToken = typeof body?.fcm_token === "string" ? body.fcm_token.trim() : "";
  if (!fcmToken) return NextResponse.json({ ok: false, error: "fcm_token requerido" }, { status: 400 });

  try {
    const { data, error } = await supabase
      .from("agent_device_tokens")
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq("empresa_id", empresa_id)
      .eq("user_id", usuario_id)
      .eq("fcm_token", fcmToken)
      .select("id");
    if (error) {
      console.error("[api/cc/agent/device-token/deactivate]", error.message);
      return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
    }
    return NextResponse.json({ ok: true, deactivated: (data as unknown[] | null)?.length ?? 0 });
  } catch (e) {
    console.error("[api/cc/agent/device-token/deactivate]", e instanceof Error ? e.message : String(e));
    return NextResponse.json({ ok: false, error: "Error interno" }, { status: 500 });
  }
}
