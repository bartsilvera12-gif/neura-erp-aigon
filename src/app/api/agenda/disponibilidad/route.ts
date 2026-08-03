import { NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { errorResponse, successResponse } from "@/lib/api/response";
import { requireAgendaApiAccess } from "@/lib/agenda/agenda-auth";
import { buscarConflictoHorario, mensajeConflicto } from "@/lib/agenda/solapes";

function parseIso(v: string | null): string | null {
  if (!v || !v.trim()) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

/**
 * Chequeo de disponibilidad para el formulario: ¿el responsable está libre en el
 * rango propuesto? Usado para advertir conflictos antes de guardar.
 */
export async function GET(request: Request) {
  const auth = await requireAgendaApiAccess(request);
  if (!auth.ok) return NextResponse.json(errorResponse(auth.message), { status: auth.status });

  try {
    const sp = new URL(request.url).searchParams;
    const responsableId = sp.get("responsable_id")?.trim();
    const inicioIso = parseIso(sp.get("inicio"));
    const finIso = parseIso(sp.get("fin"));
    const excludeId = sp.get("exclude_id")?.trim() || null;

    if (!responsableId || !inicioIso || !finIso) {
      return NextResponse.json(
        errorResponse("responsable_id, inicio y fin son obligatorios"),
        { status: 400 }
      );
    }
    if (Date.parse(finIso) <= Date.parse(inicioIso)) {
      return NextResponse.json(errorResponse("fin debe ser posterior a inicio"), { status: 400 });
    }

    const sb = await getChatServiceClientForEmpresa(auth.empresaId);
    const conflicto = await buscarConflictoHorario({
      sb,
      empresaId: auth.empresaId,
      responsableId,
      inicioIso,
      finIso,
      excludeId,
    });

    return NextResponse.json(
      successResponse({
        disponible: !conflicto,
        conflicto: conflicto
          ? { ...conflicto, mensaje: mensajeConflicto(conflicto) }
          : null,
      })
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
