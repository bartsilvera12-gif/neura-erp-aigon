import { NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { errorResponse, successResponse } from "@/lib/api/response";
import { enrichProyectosRows } from "@/lib/proyectos/enrich-proyectos";
import { insertHistorialCambioEstado } from "@/lib/proyectos/historial-actions";
import { requireProyectosApiAccess } from "@/lib/proyectos/proyectos-auth";

const PRIORIDADES = new Set(["baja", "normal", "alta", "urgente"]);

export async function GET(request: Request) {
  const auth = await requireProyectosApiAccess(request);
  if (!auth.ok) {
    return NextResponse.json(errorResponse(auth.message), { status: auth.status });
  }

  try {
    const sp = new URL(request.url).searchParams;
    const estadoId = sp.get("estado_id");
    const tipoId = sp.get("tipo_id");
    const prioridad = sp.get("prioridad");
    const rc = sp.get("responsable_comercial_id");
    const rt = sp.get("responsable_tecnico_id");
    const archivado = sp.get("archivado") === "1";
    const qRaw = sp.get("q");

    const sb = await getChatServiceClientForEmpresa(auth.empresaId);
    const empresaId = auth.empresaId;

    function proyectosFiltrados() {
      let qq = sb.from("proyectos").select("*").eq("empresa_id", empresaId).eq("archivado", archivado);
      if (estadoId) qq = qq.eq("estado_id", estadoId);
      if (tipoId) qq = qq.eq("tipo_id", tipoId);
      if (prioridad && PRIORIDADES.has(prioridad)) qq = qq.eq("prioridad", prioridad);
      if (rc) qq = qq.eq("responsable_comercial_id", rc);
      if (rt) qq = qq.eq("responsable_tecnico_id", rt);
      return qq;
    }

    let rows: Record<string, unknown>[] = [];

    const q = qRaw?.trim();
    if (!q) {
      const { data, error } = await proyectosFiltrados().order("last_activity_at", { ascending: false });
      if (error) return NextResponse.json(errorResponse(error.message), { status: 400 });
      rows = (data ?? []) as Record<string, unknown>[];
    } else {
      // Búsqueda: proyectos cuyo título matchea, o cuyo cliente (empresa /
      // contacto) matchea. Traemos los proyectos con los filtros base en UNA
      // sola query y filtramos en memoria. Evita armar `.in(id/cliente_id, [...])`
      // con cientos de UUIDs, que genera una URL enorme que el gateway rechaza
      // (URI too long → página HTML de error). Los proyectos por empresa son
      // acotados, así que filtrar en memoria es barato y seguro.
      const term = `%${q}%`;
      const qLower = q.toLowerCase();
      const [cEmp, cNom, todos] = await Promise.all([
        sb.from("clientes").select("id").eq("empresa_id", empresaId).ilike("empresa", term),
        sb.from("clientes").select("id").eq("empresa_id", empresaId).ilike("nombre_contacto", term),
        proyectosFiltrados().order("last_activity_at", { ascending: false }),
      ]);

      if (todos.error) {
        return NextResponse.json(errorResponse(todos.error.message), { status: 400 });
      }

      const clienteMatch = new Set<string>([
        ...((cEmp.data ?? []) as { id: string }[]).map((x) => x.id),
        ...((cNom.data ?? []) as { id: string }[]).map((x) => x.id),
      ]);

      rows = ((todos.data ?? []) as Record<string, unknown>[]).filter((r) => {
        const titulo = typeof r.titulo === "string" ? r.titulo.toLowerCase() : "";
        const cid = typeof r.cliente_id === "string" ? r.cliente_id : "";
        return titulo.includes(qLower) || (cid !== "" && clienteMatch.has(cid));
      });
    }

    const enriched = await enrichProyectosRows(sb, empresaId, rows);
    return NextResponse.json(successResponse(enriched));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}

export async function POST(request: Request) {
  const auth = await requireProyectosApiAccess(request);
  if (!auth.ok) {
    return NextResponse.json(errorResponse(auth.message), { status: auth.status });
  }

  try {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    if (!body || typeof body !== "object") {
      return NextResponse.json(errorResponse("Body inválido"), { status: 400 });
    }

    const titulo = typeof body.titulo === "string" ? body.titulo.trim() : "";
    const tipoId = typeof body.tipo_id === "string" ? body.tipo_id : "";
    if (!titulo || !tipoId) {
      return NextResponse.json(errorResponse("titulo y tipo_id son obligatorios"), { status: 400 });
    }

    const prioridadRaw = typeof body.prioridad === "string" ? body.prioridad : "normal";
    const prioridad = PRIORIDADES.has(prioridadRaw) ? prioridadRaw : "normal";

    const sb = await getChatServiceClientForEmpresa(auth.empresaId);
    const empresaId = auth.empresaId;

    let estadoId = typeof body.estado_id === "string" ? body.estado_id : "";
    if (!estadoId) {
      const { data: ini, error: eIni } = await sb
        .from("proyecto_estados")
        .select("id")
        .eq("empresa_id", empresaId)
        .eq("es_estado_inicial", true)
        .eq("activo", true)
        .limit(1)
        .maybeSingle();
      if (eIni) return NextResponse.json(errorResponse(eIni.message), { status: 400 });
      estadoId = (ini as { id?: string } | null)?.id ?? "";
    }
    if (!estadoId) {
      return NextResponse.json(errorResponse("No hay estado inicial configurado"), { status: 400 });
    }

    const { data: estRow, error: eEst } = await sb
      .from("proyecto_estados")
      .select("id, tipo_sla")
      .eq("empresa_id", empresaId)
      .eq("id", estadoId)
      .maybeSingle();
    if (eEst || !estRow) {
      return NextResponse.json(errorResponse("Estado no válido"), { status: 400 });
    }

    const tipoSla = String((estRow as { tipo_sla?: string }).tipo_sla ?? "interno");

    const clienteId =
      typeof body.cliente_id === "string" && body.cliente_id ? body.cliente_id : null;

    const brief_data =
      body.brief_data && typeof body.brief_data === "object" && !Array.isArray(body.brief_data)
        ? body.brief_data
        : {};
    const metadata =
      body.metadata && typeof body.metadata === "object" && !Array.isArray(body.metadata)
        ? body.metadata
        : {};

    const insert: Record<string, unknown> = {
      empresa_id: empresaId,
      cliente_id: clienteId,
      tipo_id: tipoId,
      estado_id: estadoId,
      titulo,
      descripcion: typeof body.descripcion === "string" ? body.descripcion : null,
      prioridad,
      responsable_comercial_id:
        typeof body.responsable_comercial_id === "string" ? body.responsable_comercial_id : null,
      responsable_tecnico_id:
        typeof body.responsable_tecnico_id === "string" ? body.responsable_tecnico_id : null,
      fecha_ingreso:
        typeof body.fecha_ingreso === "string" && body.fecha_ingreso
          ? body.fecha_ingreso
          : new Date().toISOString(),
      fecha_prometida:
        typeof body.fecha_prometida === "string" && body.fecha_prometida
          ? body.fecha_prometida
          : null,
      monto_vendido:
        body.monto_vendido === null || body.monto_vendido === undefined
          ? null
          : Number(body.monto_vendido),
      observaciones_comerciales:
        typeof body.observaciones_comerciales === "string" ? body.observaciones_comerciales : null,
      brief_data,
      metadata,
      bloqueado: body.bloqueado === true,
      bloqueo_motivo: typeof body.bloqueo_motivo === "string" ? body.bloqueo_motivo : null,
      created_by: auth.usuarioCatalogId,
      updated_by: auth.usuarioCatalogId,
      ultimo_movimiento_at: new Date().toISOString(),
      last_activity_at: new Date().toISOString(),
    };

    const { data: created, error: insErr } = await sb.from("proyectos").insert(insert).select("*");
    if (insErr || created == null) {
      return NextResponse.json(errorResponse(insErr?.message ?? "No se pudo crear"), { status: 400 });
    }

    const row = (Array.isArray(created) ? created[0] : created) as Record<string, unknown>;
    const proyectoId = row.id as string;

    await insertHistorialCambioEstado({
      sb,
      empresaId,
      proyectoId,
      estadoAnteriorId: null,
      estadoNuevoId: estadoId,
      tipoSlaSnapshot: tipoSla,
      changedBy: auth.usuarioCatalogId,
      responsableTecnicoId: (insert.responsable_tecnico_id as string | null) ?? null,
    });

    const enriched = await enrichProyectosRows(sb, empresaId, [row]);
    return NextResponse.json(successResponse(enriched[0] ?? row));
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
