import { NextRequest, NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { successResponse, errorResponse } from "@/lib/api/response";
import { requireCampanasApiAccess } from "@/lib/campaigns/campaign-auth";

type RouteCtx = { params: Promise<{ id: string }> };

const CANCELLABLE_STATUSES = new Set(["draft", "ready", "sending"]);

export async function POST(request: NextRequest, ctx: RouteCtx) {
  const auth = await requireCampanasApiAccess(request);
  if (!auth.ok) {
    return NextResponse.json(errorResponse(auth.message), { status: auth.status });
  }

  const { id: campaignId } = await ctx.params;

  try {
    const sb = await getChatServiceClientForEmpresa(auth.empresaId);
    const ts = new Date().toISOString();

    const { data: campaign, error: cErr } = await sb
      .from("chat_campaigns")
      .select("status")
      .eq("id", campaignId)
      .eq("empresa_id", auth.empresaId)
      .maybeSingle();

    if (cErr || !campaign) {
      return NextResponse.json(errorResponse("Campaña no encontrada"), { status: 404 });
    }

    const st = String((campaign as { status?: string }).status ?? "");
    if (!CANCELLABLE_STATUSES.has(st)) {
      return NextResponse.json(
        errorResponse(
          "Solo se pueden cancelar campañas en borrador, listas o en envío. Los envíos ya completados no se cancelan."
        ),
        { status: 400 }
      );
    }

    // 1) Recipients pendientes -> skipped (no toca sent/replied/failed)
    const { count: skippedRecipients } = await sb
      .from("chat_campaign_recipients")
      .update(
        { status: "skipped", error_message: "manual_safety_stop", updated_at: ts },
        { count: "exact" }
      )
      .eq("campaign_id", campaignId)
      .eq("empresa_id", auth.empresaId)
      .in("status", ["queued", "pending", "sending"])
      .is("provider_message_id", null);

    // 2) Jobs pendientes/running -> failed con last_error
    const { count: cancelledJobs } = await sb
      .from("chat_campaign_jobs")
      .update(
        { status: "failed", last_error: "manual_safety_stop", updated_at: ts },
        { count: "exact" }
      )
      .eq("campaign_id", campaignId)
      .eq("empresa_id", auth.empresaId)
      .in("status", ["pending", "running"]);

    // 3) Campaign -> cancelled
    await sb
      .from("chat_campaigns")
      .update({
        status: "cancelled",
        completed_at: ts,
        updated_at: ts,
      })
      .eq("id", campaignId)
      .eq("empresa_id", auth.empresaId);

    // 4) Evento de auditoría
    await sb.from("chat_campaign_events").insert({
      empresa_id: auth.empresaId,
      campaign_id: campaignId,
      recipient_id: null,
      event_type: "campaign_cancelled",
      event_payload_json: {
        kind: "cancelled",
        previous_status: st,
        skipped_recipients: skippedRecipients ?? 0,
        cancelled_jobs: cancelledJobs ?? 0,
        actor: "user",
      },
    });

    return NextResponse.json(
      successResponse({
        cancelled: true,
        previous_status: st,
        skipped_recipients: skippedRecipients ?? 0,
        cancelled_jobs: cancelledJobs ?? 0,
      })
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
