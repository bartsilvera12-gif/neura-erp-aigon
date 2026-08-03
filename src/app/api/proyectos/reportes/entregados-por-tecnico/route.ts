import { NextResponse } from "next/server";
import { getChatServiceClientForEmpresa } from "@/app/api/chat/_chat-service-client";
import { createServiceRoleClient } from "@/lib/supabase/service-admin";
import { errorResponse, successResponse } from "@/lib/api/response";
import { requireProyectosApiAccess } from "@/lib/proyectos/proyectos-auth";

/**
 * Reporte: cantidad de proyectos entregados por técnico en un mes.
 *
 * Regla:
 * - "Entregado" = estado con codigo='publicado' (nombre "Publicado / Entregado").
 * - Sólo cuenta la PRIMERA vez que un proyecto entró a ese estado. Si vuelve
 *   a Entregado después de salirse, no suma otra vez.
 * - El técnico atribuido es el snapshot guardado en
 *   `proyecto_estado_historial.responsable_tecnico_id` al momento de la
 *   transición. Para entregas anteriores a esta funcionalidad, el snapshot
 *   se completó por backfill con el técnico actual del proyecto.
 *
 * Query param:
 *   ?mes=YYYY-MM (default: mes actual)
 */
export async function GET(request: Request) {
  const auth = await requireProyectosApiAccess(request);
  if (!auth.ok) {
    return NextResponse.json(errorResponse(auth.message), { status: auth.status });
  }

  try {
    const url = new URL(request.url);
    const mesParam = (url.searchParams.get("mes") ?? "").trim();
    const now = new Date();
    const mesMatch = /^(\d{4})-(\d{2})$/.exec(mesParam);
    const year = mesMatch ? Number(mesMatch[1]) : now.getUTCFullYear();
    const month = mesMatch ? Number(mesMatch[2]) - 1 : now.getUTCMonth();
    const desde = new Date(Date.UTC(year, month, 1)).toISOString();
    const hasta = new Date(Date.UTC(year, month + 1, 1)).toISOString();
    const mesLabel = `${year}-${String(month + 1).padStart(2, "0")}`;

    const sb = await getChatServiceClientForEmpresa(auth.empresaId);
    const empresaId = auth.empresaId;

    // 1) Estado "Entregado" (codigo='publicado') de la empresa.
    const { data: estadoEntregado, error: eEst } = await sb
      .from("proyecto_estados")
      .select("id, nombre, codigo, color")
      .eq("empresa_id", empresaId)
      .eq("codigo", "publicado")
      .maybeSingle();

    if (eEst) return NextResponse.json(errorResponse(eEst.message), { status: 400 });
    if (!estadoEntregado) {
      return NextResponse.json(
        successResponse({
          mes: mesLabel,
          desde,
          hasta,
          total: 0,
          tecnicos: [],
          estado_entregado: null,
        })
      );
    }

    const estadoEntregadoId = (estadoEntregado as { id: string }).id;

    // 2) Todo el historial de transiciones a "Entregado" para esta empresa.
    //    Pedimos ordenado ascendente para que el primer match por proyecto
    //    sea la primera entrega.
    const { data: histRows, error: eHist } = await sb
      .from("proyecto_estado_historial")
      .select("proyecto_id, entered_at, responsable_tecnico_id")
      .eq("empresa_id", empresaId)
      .eq("estado_nuevo_id", estadoEntregadoId)
      .order("entered_at", { ascending: true });

    if (eHist) return NextResponse.json(errorResponse(eHist.message), { status: 400 });

    type HistRow = {
      proyecto_id: string;
      entered_at: string;
      responsable_tecnico_id: string | null;
    };
    const rows = (histRows ?? []) as HistRow[];

    // 3) Para cada proyecto, quedarnos con la primera entrega y filtrar por mes.
    const firstByProyecto = new Map<string, HistRow>();
    for (const r of rows) {
      if (!firstByProyecto.has(r.proyecto_id)) firstByProyecto.set(r.proyecto_id, r);
    }
    const enMes: HistRow[] = [];
    for (const r of firstByProyecto.values()) {
      if (r.entered_at >= desde && r.entered_at < hasta) enMes.push(r);
    }

    if (enMes.length === 0) {
      return NextResponse.json(
        successResponse({
          mes: mesLabel,
          desde,
          hasta,
          total: 0,
          tecnicos: [],
          estado_entregado: estadoEntregado,
        })
      );
    }

    // 4) Hidratar proyectos para mostrar título + cliente.
    const proyectoIds = enMes.map((r) => r.proyecto_id);
    const { data: proyectos } = await sb
      .from("proyectos")
      .select("id, titulo, cliente_id, responsable_tecnico_id")
      .eq("empresa_id", empresaId)
      .in("id", proyectoIds);

    type ProyectoRow = {
      id: string;
      titulo: string | null;
      cliente_id: string | null;
      responsable_tecnico_id: string | null;
    };
    const proyectoById = new Map<string, ProyectoRow>();
    for (const p of (proyectos ?? []) as ProyectoRow[]) proyectoById.set(p.id, p);

    const clienteIds = Array.from(
      new Set(
        (proyectos ?? [])
          .map((p) => (p as ProyectoRow).cliente_id)
          .filter((v): v is string => typeof v === "string" && v.length > 0)
      )
    );
    const clienteNombreById = new Map<string, string>();
    if (clienteIds.length > 0) {
      const { data: clientes } = await sb
        .from("clientes")
        .select("id, empresa, nombre_contacto")
        .eq("empresa_id", empresaId)
        .in("id", clienteIds);
      for (const c of (clientes ?? []) as {
        id: string;
        empresa: string | null;
        nombre_contacto: string | null;
      }[]) {
        const label = (c.empresa ?? "").trim() || (c.nombre_contacto ?? "").trim() || "—";
        clienteNombreById.set(c.id, label);
      }
    }

    // 5) Hidratar nombres de técnicos desde el schema de catálogo (neura/zentra_erp).
    const tecnicoIds = Array.from(
      new Set(
        enMes.map((r) => r.responsable_tecnico_id).filter((v): v is string => typeof v === "string")
      )
    );
    const tecnicoNombreById = new Map<string, string>();
    if (tecnicoIds.length > 0) {
      const catalog = createServiceRoleClient();
      const { data: usuarios } = await catalog
        .from("usuarios")
        .select("id, nombre, email")
        .in("id", tecnicoIds);
      for (const u of (usuarios ?? []) as {
        id: string;
        nombre: string | null;
        email: string | null;
      }[]) {
        tecnicoNombreById.set(u.id, (u.nombre ?? "").trim() || (u.email ?? "").trim() || "—");
      }
    }

    // 6) Agrupar por técnico (snapshot del historial).
    type Bucket = {
      tecnico_id: string | null;
      tecnico_nombre: string;
      cantidad: number;
      proyectos: {
        id: string;
        titulo: string;
        cliente: string;
        entregado_at: string;
      }[];
    };
    const buckets = new Map<string, Bucket>();
    for (const r of enMes) {
      const key = r.responsable_tecnico_id ?? "__SIN_TECNICO__";
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          tecnico_id: r.responsable_tecnico_id,
          tecnico_nombre: r.responsable_tecnico_id
            ? tecnicoNombreById.get(r.responsable_tecnico_id) ?? "Técnico sin nombre"
            : "Sin técnico asignado",
          cantidad: 0,
          proyectos: [],
        };
        buckets.set(key, bucket);
      }
      const proy = proyectoById.get(r.proyecto_id);
      bucket.cantidad += 1;
      bucket.proyectos.push({
        id: r.proyecto_id,
        titulo: (proy?.titulo ?? "").trim() || "(sin título)",
        cliente: (proy?.cliente_id && clienteNombreById.get(proy.cliente_id)) || "—",
        entregado_at: r.entered_at,
      });
    }

    // 7) Ordenar técnicos por cantidad desc (los sin técnico al final) y proyectos por fecha.
    const tecnicos = Array.from(buckets.values())
      .map((b) => ({
        ...b,
        proyectos: b.proyectos.slice().sort((a, b2) => a.entregado_at.localeCompare(b2.entregado_at)),
      }))
      .sort((a, b) => {
        if (a.tecnico_id == null && b.tecnico_id != null) return 1;
        if (a.tecnico_id != null && b.tecnico_id == null) return -1;
        return b.cantidad - a.cantidad || a.tecnico_nombre.localeCompare(b.tecnico_nombre);
      });

    return NextResponse.json(
      successResponse({
        mes: mesLabel,
        desde,
        hasta,
        total: enMes.length,
        tecnicos,
        estado_entregado: estadoEntregado,
      })
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
