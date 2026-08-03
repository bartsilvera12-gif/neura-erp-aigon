import { NextRequest, NextResponse } from "next/server";
import { getChatPostgresPool } from "@/lib/supabase/chat-pg-pool";
import { getFacturasServiceClientForEmpresa } from "@/lib/facturacion/facturas-service-client";
import {
  generarFacturasMensuales,
  type ResumenFacturacionMensual,
} from "@/lib/facturacion/generar-facturas-mensuales";

/**
 * Cron de FACTURACIÓN MENSUAL de suscripciones. Protegido por `CRON_SECRET`.
 *
 * Genera una factura interna por cada suscripción ACTIVA (emisión día 01, vencimiento
 * mismo mes según `dia_vencimiento`). Idempotente. No toca pagos/SIFEN/numeración histórica,
 * no envía emails ni documentos electrónicos.
 *
 * Programar: día 01 de cada mes 00:10 PYT (UTC-4) → 04:10 UTC → cron `10 4 1 * *`.
 *
 * Seguridad: `Authorization: Bearer <CRON_SECRET>`. Sin secret válido → 401.
 *
 * Query params:
 *  - `dryRun=1` → no inserta, solo cuenta.
 *  - `periodo=YYYY-MM` → período a facturar (default mes corriente).
 *  - `suscripcion_ids=uuid,uuid` → (opcional, QA/targeted) limitar a esas suscripciones.
 *
 * Empresas objetivo: `FACTURACION_MENSUAL_EMPRESA_IDS` (csv) si está seteada; si no,
 * auto-resuelve desde `"<APP_DB_SCHEMA>".empresas` (instancia single-client neura).
 */

function isAuthorized(request: NextRequest): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return false;
  const auth = request.headers.get("authorization") ?? "";
  return auth === `Bearer ${expected}`;
}

function parseBool(v: string | null): boolean {
  const s = (v ?? "").trim().toLowerCase();
  return s === "1" || s === "true" || s === "yes";
}

async function resolverEmpresaIds(): Promise<string[]> {
  const fromEnv = (process.env.FACTURACION_MENSUAL_EMPRESA_IDS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (fromEnv.length > 0) return fromEnv;

  // Auto-resolver desde el schema configurado (single-client).
  const schemaRaw = (process.env.APP_DB_SCHEMA ?? "neura").trim();
  const schema = /^[a-z0-9_]+$/.test(schemaRaw) ? schemaRaw : "neura";
  const pool = getChatPostgresPool();
  if (!pool) return [];
  const r = await pool.query(`SELECT id::text AS id FROM "${schema}".empresas`);
  return (r.rows as Array<{ id: string }>).map((x) => x.id).filter(Boolean);
}

async function handle(request: NextRequest) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ ok: false, error: "no autorizado" }, { status: 401 });
  }

  const url = new URL(request.url);
  const dryRun = parseBool(url.searchParams.get("dryRun"));
  const periodoParam = url.searchParams.get("periodo") ?? undefined;
  const suscParam = url.searchParams.get("suscripcion_ids");
  const suscripcionIds = suscParam
    ? suscParam.split(",").map((s) => s.trim()).filter(Boolean)
    : undefined;

  let empresaIds: string[];
  try {
    empresaIds = await resolverEmpresaIds();
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: `No se pudieron resolver empresas: ${e instanceof Error ? e.message : e}` },
      { status: 500 }
    );
  }
  if (empresaIds.length === 0) {
    return NextResponse.json({ ok: false, error: "Sin empresas objetivo" }, { status: 500 });
  }

  const startedAt = new Date().toISOString();
  const resultados: Array<ResumenFacturacionMensual | { empresa_id: string; error: string }> = [];

  for (const empresaId of empresaIds) {
    try {
      const supabase = await getFacturasServiceClientForEmpresa(empresaId);
      const resumen = await generarFacturasMensuales({
        supabase,
        empresaId,
        periodo: periodoParam,
        dryRun,
        suscripcionIds,
      });
      resultados.push(resumen);
      console.info("[cron][facturacion-mensual]", {
        empresa_id_short: empresaId.slice(0, 8),
        periodo: resumen.periodo,
        dry_run: resumen.dry_run,
        activas: resumen.total_suscripciones_activas,
        a_crear: resumen.facturas_a_crear,
        creadas: resumen.facturas_creadas,
        skip_existente: resumen.skipped_existente,
        skip_cliente: resumen.skipped_cliente_inactivo,
        legacy_sin_periodo: resumen.legacy_sin_periodo,
        errores: resumen.errores.length,
      });
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      resultados.push({ empresa_id: empresaId, error });
      console.error("[cron][facturacion-mensual] empresa falló", { empresa_id_short: empresaId.slice(0, 8), error });
    }
  }

  return NextResponse.json({
    ok: true,
    started_at: startedAt,
    ended_at: new Date().toISOString(),
    dry_run: dryRun,
    empresas: empresaIds.length,
    resultados,
  });
}

export async function GET(request: NextRequest) {
  return handle(request);
}

export async function POST(request: NextRequest) {
  return handle(request);
}
