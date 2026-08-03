import "server-only";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { SUPABASE_APP_SCHEMA } from "@/lib/supabase/schema";

/**
 * Reportería gerencial comercial (read-only) sobre las views `neura.v_*`.
 * No escribe datos. Scoped por empresa_id. Period = 'YYYY-MM' (default: mes actual).
 */

const S = SUPABASE_APP_SCHEMA; // 'neura'
const num = (v: unknown): number => (v == null ? 0 : Number(v));

export type ComercialReport = {
  period: string;
  generated_at: string;
  kpis: {
    facturado_mes: number;
    cobrado_mes: number;
    pendiente_cobro: number;
    mrr: number;
    ticket_promedio: number;
    facturas_mes: number;
    variacion_facturado_pct: number | null;
    variacion_cobrado_pct: number | null;
  };
  comparativa_mes: { actual: MesRow | null; anterior: MesRow | null };
  igual_dia: { dia: number; facturado_actual: number; facturado_anterior: number; diff: number; diff_pct: number | null };
  serie_mensual: MesRow[];
  mrr: { total: number; subs_activas: number; subs_canceladas: number; por_categoria: { categoria: string; subs_activas: number; mrr: number }[] };
  revenue_por_categoria: { categoria: string; facturado: number; facturas: number }[];
  top_clientes: { cliente: string; facturado: number; facturas: number }[];
  clientes_recurrentes: { cliente: string; meses: number; promedio: number; ultimo: string; categoria: string | null; estado: string | null }[];
  pendientes_cobro: { cliente: string; numero_factura: string | null; saldo: number; fecha: string | null; dias_atraso: number | null }[];
  recurrentes_sin_facturar_mes: { cliente: string; ultimo: string; categoria: string | null }[];
};
type MesRow = {
  mes: string; facturado_total: number; cobrado_total: number; pendiente_total: number;
  ticket_promedio: number; facturas_count: number; facturas_pagadas: number; facturas_pendientes: number;
};

function periodToDate(period?: string): string {
  if (period && /^\d{4}-\d{2}$/.test(period)) return `${period}-01`;
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export async function getComercialReport(empresaId: string, period?: string): Promise<ComercialReport> {
  const pool = getChatPostgresPool();
  if (!pool) throw new Error("Pool Postgres no disponible (SUPABASE_DB_URL)");
  const ref = periodToDate(period);
  const periodStr = ref.slice(0, 7);

  const q = async (sql: string, params: unknown[]) => (await pool.query(sql, params)).rows;

  // serie mensual (últimos 6 meses incluyendo ref)
  const serieRaw = await q(
    `SELECT to_char(mes,'YYYY-MM') mes, facturado_total, cobrado_total, pendiente_total,
            ticket_promedio, facturas_count, facturas_pagadas, facturas_pendientes
       FROM ${S}.v_revenue_mensual
      WHERE empresa_id = $1 AND mes <= date_trunc('month',$2::date)
      ORDER BY mes DESC LIMIT 6`, [empresaId, ref]);
  const serie: MesRow[] = serieRaw.map((r) => ({
    mes: r.mes, facturado_total: num(r.facturado_total), cobrado_total: num(r.cobrado_total),
    pendiente_total: num(r.pendiente_total), ticket_promedio: num(r.ticket_promedio),
    facturas_count: num(r.facturas_count), facturas_pagadas: num(r.facturas_pagadas), facturas_pendientes: num(r.facturas_pendientes),
  })).reverse();

  const actual = serie.find((m) => m.mes === periodStr) || null;
  const prevDate = new Date(`${ref}T00:00:00Z`); prevDate.setUTCMonth(prevDate.getUTCMonth() - 1);
  const prevStr = `${prevDate.getUTCFullYear()}-${String(prevDate.getUTCMonth() + 1).padStart(2, "0")}`;
  const anterior = serie.find((m) => m.mes === prevStr) || null;

  // pendiente total global (CxC vigente)
  const cxc = (await q(`SELECT coalesce(sum(saldo),0) s, count(*) n FROM ${S}.v_cuentas_por_cobrar WHERE empresa_id=$1`, [empresaId]))[0];

  // MRR
  const mrrRows = await q(`SELECT categoria, subs_activas, mrr, subs_canceladas FROM ${S}.v_mrr WHERE empresa_id=$1`, [empresaId]);
  const mrr = {
    total: mrrRows.reduce((a, r) => a + num(r.mrr), 0),
    subs_activas: mrrRows.reduce((a, r) => a + num(r.subs_activas), 0),
    subs_canceladas: mrrRows.reduce((a, r) => a + num(r.subs_canceladas), 0),
    por_categoria: mrrRows.map((r) => ({ categoria: r.categoria, subs_activas: num(r.subs_activas), mrr: num(r.mrr) }))
      .filter((r) => r.mrr > 0).sort((a, b) => b.mrr - a.mrr),
  };

  // revenue por categoría del mes
  const cat = await q(
    `SELECT categoria, coalesce(sum(facturado),0) facturado, coalesce(sum(facturas),0) facturas
       FROM ${S}.v_revenue_por_categoria
      WHERE empresa_id=$1 AND mes = date_trunc('month',$2::date)
      GROUP BY categoria ORDER BY facturado DESC`, [empresaId, ref]);

  // comparación a igual día
  const igualDiaRow = (await q(
    `WITH d AS (SELECT least(extract(day from current_date), extract(day from (date_trunc('month',$2::date)+interval '1 month - 1 day')))::int dia)
     SELECT (SELECT dia FROM d) dia,
       coalesce((SELECT sum(monto) FROM ${S}.facturas WHERE empresa_id=$1 AND estado<>'Anulado'
          AND date_trunc('month',fecha)=date_trunc('month',$2::date) AND extract(day from fecha) <= (SELECT dia FROM d)),0) fa,
       coalesce((SELECT sum(monto) FROM ${S}.facturas WHERE empresa_id=$1 AND estado<>'Anulado'
          AND date_trunc('month',fecha)=date_trunc('month',$2::date - interval '1 month') AND extract(day from fecha) <= (SELECT dia FROM d)),0) fp`,
    [empresaId, ref]))[0];
  const fa = num(igualDiaRow?.fa), fp = num(igualDiaRow?.fp);

  // top clientes del mes
  const top = await q(
    `SELECT cl.nombre cliente, coalesce(sum(f.monto),0) facturado, count(*) facturas
       FROM ${S}.facturas f JOIN ${S}.clientes cl ON cl.id=f.cliente_id
      WHERE f.empresa_id=$1 AND f.estado<>'Anulado' AND date_trunc('month',f.fecha)=date_trunc('month',$2::date)
      GROUP BY cl.nombre ORDER BY facturado DESC LIMIT 10`, [empresaId, ref]);

  // recurrentes
  const rec = await q(
    `SELECT cliente, meses_facturados, monto_promedio, to_char(ultimo_mes,'YYYY-MM-DD') ultimo, categoria_estimada, estado_cliente
       FROM ${S}.v_clientes_recurrentes WHERE empresa_id=$1 ORDER BY meses_facturados DESC, monto_promedio DESC LIMIT 50`, [empresaId]);

  // pendientes de cobro
  const pend = await q(
    `SELECT cliente, numero_factura, saldo, to_char(fecha,'YYYY-MM-DD') fecha, dias_atraso
       FROM ${S}.v_cuentas_por_cobrar WHERE empresa_id=$1 ORDER BY saldo DESC LIMIT 50`, [empresaId]);

  // recurrentes sin facturar este mes
  const sinFact = await q(
    `SELECT r.cliente, to_char(r.ultimo_mes,'YYYY-MM-DD') ultimo, r.categoria_estimada
       FROM ${S}.v_clientes_recurrentes r
      WHERE r.empresa_id=$1
        AND NOT EXISTS (SELECT 1 FROM ${S}.facturas f WHERE f.cliente_id=r.cliente_id AND f.empresa_id=$1
                          AND f.estado<>'Anulado' AND date_trunc('month',f.fecha)=date_trunc('month',$2::date))
      ORDER BY r.ultimo_mes DESC LIMIT 50`, [empresaId, ref]);

  const varPct = (a: number, b: number): number | null => (b === 0 ? null : Math.round(((a - b) / b) * 1000) / 10);

  return {
    period: periodStr,
    generated_at: new Date().toISOString(),
    kpis: {
      facturado_mes: actual?.facturado_total ?? 0,
      cobrado_mes: actual?.cobrado_total ?? 0,
      pendiente_cobro: num(cxc?.s),
      mrr: mrr.total,
      ticket_promedio: actual?.ticket_promedio ?? 0,
      facturas_mes: actual?.facturas_count ?? 0,
      variacion_facturado_pct: varPct(actual?.facturado_total ?? 0, anterior?.facturado_total ?? 0),
      variacion_cobrado_pct: varPct(actual?.cobrado_total ?? 0, anterior?.cobrado_total ?? 0),
    },
    comparativa_mes: { actual, anterior },
    igual_dia: { dia: num(igualDiaRow?.dia), facturado_actual: fa, facturado_anterior: fp, diff: fa - fp, diff_pct: varPct(fa, fp) },
    serie_mensual: serie,
    mrr,
    revenue_por_categoria: cat.map((r) => ({ categoria: r.categoria, facturado: num(r.facturado), facturas: num(r.facturas) })),
    top_clientes: top.map((r) => ({ cliente: r.cliente, facturado: num(r.facturado), facturas: num(r.facturas) })),
    clientes_recurrentes: rec.map((r) => ({ cliente: r.cliente, meses: num(r.meses_facturados), promedio: num(r.monto_promedio), ultimo: r.ultimo, categoria: r.categoria_estimada, estado: r.estado_cliente })),
    pendientes_cobro: pend.map((r) => ({ cliente: r.cliente, numero_factura: r.numero_factura, saldo: num(r.saldo), fecha: r.fecha, dias_atraso: r.dias_atraso == null ? null : num(r.dias_atraso) })),
    recurrentes_sin_facturar_mes: sinFact.map((r) => ({ cliente: r.cliente, ultimo: r.ultimo, categoria: r.categoria_estimada })),
  };
}
