import { NextRequest, NextResponse } from "next/server";
import { getTenantSupabaseFromAuth } from "@/lib/supabase/tenant-api";
import { successResponse, errorResponse } from "@/lib/api/response";
import { API_ERRORS } from "@/lib/api/errors";
import { toCalendarDateStr } from "@/lib/fechas/calendario";

/**
 * GET /api/reportes/estado-cuenta?desde=YYYY-MM-DD&hasta=YYYY-MM-DD
 *
 * Estado de cuenta de la empresa en un período. Solo lectura, sin tocar
 * pagos POST / dashboard / facturación. Mismo criterio del dashboard para
 * facturado / cobrado / pendiente. Schema resuelto por el patrón multi-schema
 * estándar (getTenantSupabaseFromAuth). `.in()` batcheado para no disparar el
 * 502 de Cloudflare con URLs largas.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function defaultRange(): { desde: string; hasta: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const mm = String(m + 1).padStart(2, "0");
  const lastDay = new Date(y, m + 1, 0).getDate();
  return { desde: `${y}-${mm}-01`, hasta: `${y}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

/** Día siguiente (exclusivo) para comparar también columnas timestamptz con `< hastaEx`. */
function plusOneDay(dateStr: string): string {
  const d = new Date(`${dateStr}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

type AnyRow = Record<string, unknown>;

/** `.in(col, ids)` batcheado (lotes de 25) — mismo patrón anti-502 de /api/pagos. */
async function selectInBatches<T = AnyRow>(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any,
  table: string,
  columns: string,
  col: string,
  ids: string[],
  batchSize = 25
): Promise<T[]> {
  const rows: T[] = [];
  for (let i = 0; i < ids.length; i += batchSize) {
    const slice = ids.slice(i, i + batchSize);
    const { data, error } = await supabase.from(table).select(columns).in(col, slice);
    if (error) {
      console.error(`[api/reportes/estado-cuenta] ${table} batch ${i / batchSize}:`, error.message);
      continue;
    }
    for (const r of (data as T[] | null | undefined) ?? []) rows.push(r);
  }
  return rows;
}

export async function GET(request: NextRequest) {
  try {
    const ctx = await getTenantSupabaseFromAuth(request);
    if (!ctx) {
      return NextResponse.json(errorResponse(API_ERRORS.UNAUTHORIZED), { status: 401 });
    }
    const { auth, supabase } = ctx;
    const empresaId = auth.empresa_id;

    const { searchParams } = new URL(request.url);
    const def = defaultRange();
    const dRaw = toCalendarDateStr(searchParams.get("desde") ?? "");
    const hRaw = toCalendarDateStr(searchParams.get("hasta") ?? "");
    const desde = DATE_RE.test(dRaw) ? dRaw : def.desde;
    const hasta = DATE_RE.test(hRaw) ? hRaw : def.hasta;
    const hastaEx = plusOneDay(hasta);

    // ── Consultas del período (cada una tolerante: si la tabla no existe o falla,
    //    se degrada a [] y la sección queda "Sin datos para este período"). ──────
    const safe = async (run: () => Promise<{ data: unknown; error: unknown }>): Promise<AnyRow[]> => {
      try {
        const { data, error } = await run();
        if (error) {
          console.error("[api/reportes/estado-cuenta] query:", (error as { message?: string })?.message);
          return [];
        }
        return (data as AnyRow[] | null | undefined) ?? [];
      } catch (e) {
        console.error("[api/reportes/estado-cuenta] query throw:", e instanceof Error ? e.message : e);
        return [];
      }
    };

    const [facturasPeriodo, pagosPeriodo, comprasPeriodo, gastosPeriodo, facturasPendientes, inactivosRows] =
      await Promise.all([
        safe(() =>
          supabase
            .from("facturas")
            .select("numero_factura, fecha, monto, estado, cliente_id")
            .eq("empresa_id", empresaId)
            .gte("fecha", desde)
            .lt("fecha", hastaEx)
            .order("fecha", { ascending: false })
        ),
        safe(() =>
          supabase
            .from("pagos")
            .select("monto, fecha_pago, factura_id, referencia, metodo_pago, cliente_id")
            .eq("empresa_id", empresaId)
            .gte("fecha_pago", desde)
            .lt("fecha_pago", hastaEx)
            .order("fecha_pago", { ascending: false })
        ),
        safe(() =>
          supabase
            .from("compras")
            .select("total, fecha, estado, numero_control, proveedor_nombre")
            .eq("empresa_id", empresaId)
            .gte("fecha", desde)
            .lt("fecha", hastaEx)
            .order("fecha", { ascending: false })
        ),
        safe(() =>
          supabase
            .from("gastos")
            .select("monto, fecha, categoria, descripcion, tipo")
            .eq("empresa_id", empresaId)
            .gte("fecha", desde)
            .lt("fecha", hastaEx)
            .order("fecha", { ascending: false })
        ),
        safe(() =>
          supabase
            .from("facturas")
            .select("numero_factura, fecha, fecha_vencimiento, saldo, estado, cliente_id")
            .eq("empresa_id", empresaId)
            .gt("saldo", 0)
            .neq("estado", "Anulado")
            .order("fecha_vencimiento", { ascending: true })
        ),
        safe(() =>
          supabase.from("clientes").select("id").eq("empresa_id", empresaId).eq("estado", "inactivo")
        ),
      ]);

    const inactivos = new Set(inactivosRows.map((c) => String(c.id)));

    // ── Totales (criterios documentados en la respuesta) ──────────────────────
    const ventas = facturasPeriodo
      .filter((f) => String(f.estado) !== "Anulado")
      .reduce((s, f) => s + num(f.monto), 0);
    const cobrado = pagosPeriodo.reduce((s, p) => s + num(p.monto), 0);
    const compras = comprasPeriodo
      .filter((c) => String(c.estado) !== "anulada")
      .reduce((s, c) => s + num(c.total), 0);
    const gastos = gastosPeriodo.reduce((s, g) => s + num(g.monto), 0);
    const pendiente = facturasPendientes
      .filter((f) => !inactivos.has(String(f.cliente_id)))
      .reduce((s, f) => s + num(f.saldo), 0);
    const resultado = cobrado - compras - gastos;

    // ── Pendientes importantes (top por vencimiento, excluye clientes inactivos) ──
    const pendientesFilt = facturasPendientes.filter((f) => !inactivos.has(String(f.cliente_id)));
    const pendientesTop = pendientesFilt.slice(0, 25);

    // ── Movimientos recientes (unificado, orden por fecha desc, top 25) ──────────
    type Mov = {
      fecha: string;
      tipo: "venta" | "cobro" | "compra" | "gasto";
      documento: string;
      contraparte_id: string | null;
      contraparte: string;
      monto: number;
      estado: string;
    };
    const movs: Mov[] = [];
    for (const f of facturasPeriodo) {
      movs.push({
        fecha: String(f.fecha ?? "").slice(0, 10),
        tipo: "venta",
        documento: String(f.numero_factura ?? "—"),
        contraparte_id: f.cliente_id ? String(f.cliente_id) : null,
        contraparte: "",
        monto: num(f.monto),
        estado: String(f.estado ?? "—"),
      });
    }
    for (const p of pagosPeriodo) {
      movs.push({
        fecha: String(p.fecha_pago ?? "").slice(0, 10),
        tipo: "cobro",
        documento: String(p.referencia ?? "").trim() || (p.factura_id ? "" : "Cobro"),
        contraparte_id: p.cliente_id ? String(p.cliente_id) : null,
        contraparte: "",
        monto: num(p.monto),
        estado: "Cobrado",
      });
    }
    for (const c of comprasPeriodo) {
      movs.push({
        fecha: String(c.fecha ?? "").slice(0, 10),
        tipo: "compra",
        documento: String(c.numero_control ?? "—"),
        contraparte_id: null,
        contraparte: String(c.proveedor_nombre ?? "—"),
        monto: num(c.total),
        estado: String(c.estado ?? "—"),
      });
    }
    for (const g of gastosPeriodo) {
      movs.push({
        fecha: String(g.fecha ?? "").slice(0, 10),
        tipo: "gasto",
        documento: String(g.categoria ?? g.descripcion ?? "Gasto"),
        contraparte_id: null,
        contraparte: "—",
        monto: num(g.monto),
        estado: String(g.tipo ?? "—"),
      });
    }
    movs.sort((a, b) => (a.fecha < b.fecha ? 1 : a.fecha > b.fecha ? -1 : 0));
    const movsTop = movs.slice(0, 25);

    // ── Resolver nombres de cliente solo para lo visible (batched) ───────────────
    const clienteIds = [
      ...new Set(
        [
          ...movsTop.map((m) => m.contraparte_id),
          ...pendientesTop.map((f) => (f.cliente_id ? String(f.cliente_id) : null)),
        ].filter((x): x is string => Boolean(x))
      ),
    ];
    const clienteNombre: Record<string, string> = {};
    if (clienteIds.length > 0) {
      const rows = await selectInBatches(
        supabase,
        "clientes",
        "id, empresa, nombre_contacto",
        "id",
        clienteIds
      );
      for (const c of rows) {
        const id = String((c as AnyRow).id);
        const nombre =
          (((c as AnyRow).empresa as string) ?? "").trim() ||
          (((c as AnyRow).nombre_contacto as string) ?? "").trim() ||
          "—";
        clienteNombre[id] = nombre;
      }
    }

    const movimientos = movsTop.map((m) => ({
      fecha: m.fecha,
      tipo: m.tipo,
      documento: m.documento || "—",
      contraparte: m.contraparte || (m.contraparte_id ? clienteNombre[m.contraparte_id] ?? "—" : "—"),
      monto: m.monto,
      estado: m.estado,
    }));

    const pendientes = pendientesTop.map((f) => ({
      numero_factura: String(f.numero_factura ?? "—"),
      cliente: f.cliente_id ? clienteNombre[String(f.cliente_id)] ?? "—" : "—",
      fecha: String(f.fecha ?? "").slice(0, 10),
      fecha_vencimiento: f.fecha_vencimiento ? String(f.fecha_vencimiento).slice(0, 10) : null,
      saldo: num(f.saldo),
      estado: String(f.estado ?? "—"),
    }));

    return NextResponse.json(
      successResponse({
        periodo: { desde, hasta },
        totales: {
          ventas,
          cobrado,
          pendiente,
          compras,
          gastos,
          resultado,
        },
        movimientos,
        pendientes,
        meta: {
          conteos: {
            facturas: facturasPeriodo.length,
            pagos: pagosPeriodo.length,
            compras: comprasPeriodo.length,
            gastos: gastosPeriodo.length,
            pendientes: pendientesFilt.length,
          },
        },
      })
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Error";
    return NextResponse.json(errorResponse(msg), { status: 500 });
  }
}
