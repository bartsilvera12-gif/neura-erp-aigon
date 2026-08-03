import { NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { errorResponse, successResponse } from "@/lib/api/response";
import { requireAgendaApiAccess } from "@/lib/agenda/agenda-auth";
import { enrichAgendaRows } from "@/lib/agenda/enrich";
import { buscarConflictoHorario, mensajeConflicto } from "@/lib/agenda/solapes";
import { isAgendaEstado, type AgendaCitaRow } from "@/lib/agenda/types";

function parseIso(v: unknown): string | null {
  if (typeof v !== "string" || !v.trim()) return null;
  const ms = Date.parse(v);
  return Number.isFinite(ms) ? new Date(ms).toISOString() : null;
}

function optStr(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

export async function GET(request: Request) {
  const auth = await requireAgendaApiAccess(request);
  if (!auth.ok) {
    return NextResponse.json(errorResponse(auth.message), { status: auth.status });
  }

  try {
    const sp = new URL(request.url).searchParams;
    const desde = parseIso(sp.get("desde"));
    const hasta = parseIso(sp.get("hasta"));
    const estado = sp.get("estado");
    const responsableId = sp.get("responsable_id");
    const clienteId = sp.get("cliente_id");
    const q = sp.get("q")?.trim();

    const sb = await getChatServiceClientForEmpresa(auth.empresaId);
    const empresaId = auth.empresaId;

    let qq = sb.from("agenda_citas").select("*").eq("empresa_id", empresaId);
    if (desde) qq = qq.gte("inicio_at", desde);
    if (hasta) qq = qq.lte("inicio_at", hasta);
    if (estado && isAgendaEstado(estado)) qq = qq.eq("estado", estado);
    if (responsableId) qq = qq.eq("responsable_id", responsableId);
    if (clienteId) qq = qq.eq("cliente_id", clienteId);
    if (q) qq = qq.or(`titulo.ilike.%${q}%,contacto_nombre.ilike.%${q}%`);

    const { data, error } = await qq.order("inicio_at", { ascending: true });
    if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });

    const rows = (data ?? []) as AgendaCitaRow[];
    const enriched = await enrichAgendaRows(sb, empresaId, rows);
    return NextResponse.json(successResponse(enriched));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireAgendaApiAccess(request);
  if (!auth.ok) {
    return NextResponse.json(errorResponse(auth.message), { status: auth.status });
  }

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json(errorResponse("Body inválido"), { status: 400 });
    }

    const titulo = typeof body.titulo === "string" ? body.titulo.trim() : "";
    const responsableId = optStr(body.responsable_id);
    const inicioIso = parseIso(body.inicio_at);
    const finIso = parseIso(body.fin_at);

    if (!titulo) {
      return NextResponse.json(errorResponse("titulo es obligatorio"), { status: 400 });
    }
    if (!responsableId) {
      return NextResponse.json(errorResponse("responsable_id es obligatorio"), { status: 400 });
    }
    if (!inicioIso || !finIso) {
      return NextResponse.json(errorResponse("inicio_at y fin_at deben ser fechas válidas"), {
        status: 400,
      });
    }
    if (Date.parse(finIso) <= Date.parse(inicioIso)) {
      return NextResponse.json(errorResponse("fin_at debe ser posterior a inicio_at"), {
        status: 400,
      });
    }

    const estadoRaw = typeof body.estado === "string" ? body.estado : "pendiente";
    const estado = isAgendaEstado(estadoRaw) ? estadoRaw : "pendiente";

    const sb = await getChatServiceClientForEmpresa(auth.empresaId);
    const empresaId = auth.empresaId;

    // Anti-doble-reserva server-side.
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

    const metadata =
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? (body.metadata as Record<string, unknown>)
        : {};

    const insert: Record<string, unknown> = {
      empresa_id: empresaId, // forzado server-side, nunca del body
      cliente_id: optStr(body.cliente_id),
      prospecto_id: optStr(body.prospecto_id),
      responsable_id: responsableId,
      contacto_nombre: optStr(body.contacto_nombre),
      contacto_telefono: optStr(body.contacto_telefono),
      titulo,
      tipo: optStr(body.tipo),
      estado,
      inicio_at: inicioIso,
      fin_at: finIso,
      ubicacion: optStr(body.ubicacion),
      observaciones: optStr(body.observaciones),
      metadata,
      created_by: auth.usuarioCatalogId,
      updated_by: auth.usuarioCatalogId,
    };

    const { data: created, error: insErr } = await sb
      .from("agenda_citas")
      .insert(insert)
      .select("*");
    if (insErr || created == null) {
      return NextResponse.json(errorResponse(insErr?.message ?? "No se pudo crear"), {
        status: 400,
      });
    }

    const row = (Array.isArray(created) ? created[0] : created) as AgendaCitaRow;
    const enriched = await enrichAgendaRows(sb, empresaId, [row]);
    return NextResponse.json(successResponse(enriched[0] ?? row));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
