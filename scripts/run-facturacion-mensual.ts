/**
 * Ejecuta el motor de facturación mensual de suscripciones manualmente.
 * Requiere .env.local con acceso a la DB (SUPABASE_DB_URL / DIRECT_URL).
 * NOTA: el puerto 5432 suele estar firewalleado desde fuera del VPS; este script
 * está pensado para correrse en un host con acceso a la DB (o el server). El QA
 * habitual se hace contra el endpoint desplegado /api/cron/facturacion-mensual?dryRun=1.
 *
 * Uso:
 *   npx tsx scripts/run-facturacion-mensual.ts --empresa=<uuid> [--periodo=YYYY-MM] [--apply] [--susc=<uuid,uuid>]
 *
 * Por defecto es DRY-RUN (no inserta). Agregá --apply para crear de verdad.
 */
import { config } from "dotenv";
import { join } from "path";
config({ path: join(process.cwd(), ".env.local") });

import { getFacturasServiceClientForEmpresa } from "../src/lib/facturacion/facturas-service-client";
import { generarFacturasMensuales } from "../src/lib/facturacion/generar-facturas-mensuales";

function arg(name: string): string | undefined {
  const pref = `--${name}=`;
  const a = process.argv.find((x) => x.startsWith(pref));
  return a ? a.slice(pref.length) : undefined;
}

async function main() {
  const empresaId = arg("empresa") || (process.env.FACTURACION_MENSUAL_EMPRESA_IDS ?? "").split(",")[0]?.trim();
  if (!empresaId) {
    console.error("Falta --empresa=<uuid> (o FACTURACION_MENSUAL_EMPRESA_IDS en .env.local).");
    process.exit(1);
  }
  const periodo = arg("periodo");
  const dryRun = !process.argv.includes("--apply");
  const suscParam = arg("susc");
  const suscripcionIds = suscParam ? suscParam.split(",").map((s) => s.trim()).filter(Boolean) : undefined;

  console.log(`[facturacion-mensual] empresa=${empresaId.slice(0, 8)} periodo=${periodo ?? "(actual)"} dryRun=${dryRun}`);

  const supabase = await getFacturasServiceClientForEmpresa(empresaId);
  const resumen = await generarFacturasMensuales({ supabase, empresaId, periodo, dryRun, suscripcionIds });
  console.log(JSON.stringify(resumen, null, 2));
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
