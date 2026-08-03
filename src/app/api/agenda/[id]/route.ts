import { NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { errorResponse, successResponse } from "@/lib/api/response";
import { requireAgendaApiAccess } from "@/lib/agenda/agenda-auth";
import { enrichAgendaRows } from "@/lib/agenda/enrich";
import { buscarConflictoHorario, mensajeConflicto } from "@/lib/agenda/solapes";
import { ESTADOS_NO_BLOQUEAN, isAgendaEstado, type AgendaCitaRow } from "@/lib/agenda/types";

function parseIso(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}
function optStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}
function hasKey(body: Record<string, unknown>, k: string): boolean {
  return Object.prototype.hasOwnProperty.call(body, k);
}

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAgendaApiAccess(request);
  if (!auth.ok) return NextResponse.json(errorResponse(auth.message), { status: auth.status });

  const { id } = await params;
  const cid = id?.trim() ?? "";
  if (!cid) return NextResponse.json(errorResponse("id obligatorio"), { status: 400 });

  try {
    const sb = await getChatServiceClientForEmpresa(auth.empresaId);
    const { data, error } = await sb
      .from("agenda_citas")
      .select("*")
      .eq("empresa_id", auth.empresaId)
      .eq("id", cid)
      .maybeSingle();
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    if (!data) return NextResponse.json(errorResponse("No encontrada"), { status: 404 });

    const enriched = await enrichAgendaRows(sb, auth.empresaId, [data as AgendaCitaRow]);
    return NextResponse.json(successResponse(enriched[0] ?? data));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAgendaApiAccess(request);
  if (!auth.ok) return NextResponse.json(errorResponse(auth.message), { status: auth.status });

  const { id } = await params;
  const cid = id?.trim() ?? "";
  if (!cid) return NextResponse.json(errorResponse("id obligatorio"), { status: 400 });

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json(errorResponse("Body inválido"), { status: 400 });
    }

    const sb = await getChatServiceClientForEmpresa(auth.empresaId);
    const empresaId = auth.empresaId;

    const { data: actual, error: eGet } = await sb
      .from("agenda_citas")
      .select("*")
      .eq("empresa_id", empresaId)
      .eq("id", cid)
      .maybeSingle();
    if (eGet) return NextResponse.json(errorResponse(eGet.message), { status: 400 });
    if (!actual) return NextResponse.json(errorResponse("No encontrada"), { status: 404 });
    const prev = actual as AgendaCitaRow;

    // ---------------------------------------------------------------------
    // Reprogramación: marca la original como `reprogramada` y crea una nueva
    // cita vinculada con reprogramada_de_id.
    // ---------------------------------------------------------------------
    if (body.accion === "reprogramar") {
      const inicioIso = parseIso(body.inicio_at);
      const finIso = parseIso(body.fin_at);
      if (!inicioIso || !finIso) {
        return NextResponse.json(
          errorResponse("Reprogramar requiere inicio_at y fin_at válidos"),
          { status: 400 }
        );
      }
      if (Date.parse(finIso) <= Date.parse(inicioIso)) {
        return NextResponse.json(errorResponse("fin_at debe ser posterior a inicio_at"), {
          status: 400,
        });
      }
      const responsableId = optStr(body.responsable_id) ?? prev.responsable_id;

      const conflicto = await buscarConflictoHorario({
        sb,
        empresaId,
        responsableId,
        inicioIso,
        finIso,
      });
      if (conflicto) {
        return NextResponse.json(errorResponse(mensajeConflicto(conflicto)), { status: 409 });
      }

      const nueva: Record<string, unknown> = {
        empresa_id: empresaId,
        cliente_id: prev.cliente_id,
        prospecto_id: prev.prospecto_id,
        responsable_id: responsableId,
        contacto_nombre: prev.contacto_nombre,
        contacto_telefono: prev.contacto_telefono,
        titulo: prev.titulo,
        tipo: prev.tipo,
        estado: "pendiente",
        inicio_at: inicioIso,
        fin_at: finIso,
        ubicacion: prev.ubicacion,
        observaciones: optStr(body.observaciones) ?? prev.observaciones,
        reprogramada_de_id: prev.id,
        metadata: prev.metadata ?? {},
        created_by: auth.usuarioCatalogId,
        updated_by: auth.usuarioCatalogId,
      };

      const { data: created, error: insErr } = await sb
        .from("agenda_citas")
        .insert(nueva)
        .select("*");
      if (insErr || created == null) {
        return NextResponse.json(errorResponse(insErr?.message ?? "No se pudo reprogramar"), {
          status: 400,
        });
      }

      // Marcar la original como reprogramada (solo si aún no es terminal cancelada/completada).
      await sb
        .from("agenda_citas")
        .update({ estado: "reprogramada", updated_by: auth.usuarioCatalogId })
        .eq("empresa_id", empresaId)
        .eq("id", prev.id);

      const row = (Array.isArray(created) ? created[0] : created) as AgendaCitaRow;
      const enriched = await enrichAgendaRows(sb, empresaId, [row]);
      return NextResponse.json(successResponse(enriched[0] ?? row));
    }

    // ---------------------------------------------------------------------
    // Edición / cambio de estado genérico.
    // ---------------------------------------------------------------------
    const patch: Record<string, unknown> = { updated_by: auth.usuarioCatalogId };

    if (hasKey(body, "titulo")) {
      const t = typeof body.titulo === "string" ? body.titulo.trim() : "";
      if (!t) return NextResponse.json(errorResponse("titulo no puede quedar vacío"), { status: 400 });
      patch.titulo = t;
    }
    if (hasKey(body, "tipo")) patch.tipo = optStr(body.tipo);
    if (hasKey(body, "cliente_id")) patch.cliente_id = optStr(body.cliente_id);
    if (hasKey(body, "prospecto_id")) patch.prospecto_id = optStr(body.prospecto_id);
    if (hasKey(body, "contacto_nombre")) patch.contacto_nombre = optStr(body.contacto_nombre);
    if (hasKey(body, "contacto_telefono")) patch.contacto_telefono = optStr(body.contacto_telefono);
    if (hasKey(body, "ubicacion")) patch.ubicacion = optStr(body.ubicacion);
    if (hasKey(body, "observaciones")) patch.observaciones = optStr(body.observaciones);
    if (hasKey(body, "cancelada_motivo")) patch.cancelada_motivo = optStr(body.cancelada_motivo);
    if (hasKey(body, "metadata") && body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)) {
      patch.metadata = body.metadata;
    }

    if (hasKey(body, "estado")) {
      if (!isAgendaEstado(body.estado)) {
        return NextResponse.json(errorResponse("estado inválido"), { status: 400 });
      }
      patch.estado = body.estado;
    }
    if (hasKey(body, "responsable_id")) {
      const rid = optStr(body.responsable_id);
      if (!rid) return NextResponse.json(errorResponse("responsable_id inválido"), { status: 400 });
      patch.responsable_id = rid;
    }
    if (hasKey(body, "inicio_at")) {
      const v = parseIso(body.inicio_at);
      if (!v) return NextResponse.json(errorResponse("inicio_at inválido"), { status: 400 });
      patch.inicio_at = v;
    }
    if (hasKey(body, "fin_at")) {
      const v = parseIso(body.fin_at);
      if (!v) return NextResponse.json(errorResponse("fin_at inválido"), { status: 400 });
      patch.fin_at = v;
    }

    // Valores efectivos tras el patch para validar rango y solape.
    const inicioEff = (patch.inicio_at as string | undefined) ?? prev.inicio_at;
    const finEff = (patch.fin_at as string | undefined) ?? prev.fin_at;
    const responsableEff = (patch.responsable_id as string | undefined) ?? prev.responsable_id;
    const estadoEff = (patch.estado as string | undefined) ?? prev.estado;

    if (Date.parse(finEff) <= Date.parse(inicioEff)) {
      return NextResponse.json(errorResponse("fin_at debe ser posterior a inicio_at"), {
        status: 400,
      });
    }

    // Anti-solape solo si la cita ocupará horario y cambió tiempo/responsable.
    const cambiaHorario =
      hasKey(body, "inicio_at") || hasKey(body, "fin_at") || hasKey(body, "responsable_id");
    if (cambiaHorario && !ESTADOS_NO_BLOQUEAN.has(estadoEff)) {
      const conflicto = await buscarConflictoHorario({
        sb,
        empresaId,
        responsableId: responsableEff,
        inicioIso: inicioEff,
        finIso: finEff,
        excludeId: prev.id,
      });
      if (conflicto) {
        return NextResponse.json(errorResponse(mensajeConflicto(conflicto)), { status: 409 });
      }
    }

    const { data: updated, error: upErr } = await sb
      .from("agenda_citas")
      .update(patch)
      .eq("empresa_id", empresaId)
      .eq("id", cid)
      .select("*");
    if (upErr || updated == null) {
      return NextResponse.json(errorResponse(upErr?.message ?? "No se pudo actualizar"), {
        status: 400,
      });
    }

    const row = (Array.isArray(updated) ? updated[0] : updated) as AgendaCitaRow;
    const enriched = await enrichAgendaRows(sb, empresaId, [row]);
    return NextResponse.json(successResponse(enriched[0] ?? row));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

/**
 * Por defecto: soft-cancel (estado='cancelada'). Borrado físico solo con ?hard=1.
 */
export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireAgendaApiAccess(request);
  if (!auth.ok) return NextResponse.json(errorResponse(auth.message), { status: auth.status });

  const { id } = await params;
  const cid = id?.trim() ?? "";
  if (!cid) return NextResponse.json(errorResponse("id obligatorio"), { status: 400 });

  try {
    const sp = new URL(request.url).searchParams;
    const hard = sp.get("hard") === "1";
    const motivo = sp.get("motivo")?.trim() || null;

    const sb = await getChatServiceClientForEmpresa(auth.empresaId);
    const empresaId = auth.empresaId;

    if (hard) {
      const { error } = await sb
        .from("agenda_citas")
        .delete()
        .eq("empresa_id", empresaId)
        .eq("id", cid);
      if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
      return NextResponse.json(successResponse({ id: cid, deleted: true }));
    }

    const { data, error } = await sb
      .from("agenda_citas")
      .update({ estado: "cancelada", cancelada_motivo: motivo, updated_by: auth.usuarioCatalogId })
      .eq("empresa_id", empresaId)
      .eq("id", cid)
      .select("*");
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
    if (!data || (Array.isArray(data) && data.length === 0)) {
      return NextResponse.json(errorResponse("No encontrada"), { status: 404 });
    }
    const row = (Array.isArray(data) ? data[0] : data) as AgendaCitaRow;
    return NextResponse.json(successResponse(row));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
