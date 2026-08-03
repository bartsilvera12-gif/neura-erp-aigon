-- =============================================================================
-- Anti-duplicados Clientes: candado DURO por DOCUMENTO (RUC/Cédula). SOLO `neura`.
-- Idempotente. Índice único PARCIAL sobre documento normalizado para clientes
-- NO eliminados (deleted_at IS NULL).
--
-- Normalización (idéntica a src/lib/clientes/dedupe.ts normalizarDocumento):
--   coalesce(ruc, documento) -> quitar todo lo no alfanumérico -> upper.
-- Solo indexa filas con documento normalizado no vacío (RUC/Cédula presente).
--
-- El NOMBRE NO se restringe en DB (riesgo de falsos positivos: dos personas con
-- igual nombre y distinta cédula). El nombre sigue validándose a nivel app (409).
--
-- Pre-requisito: auditoría read-only confirmó 0 duplicados por documento.
-- No toca pagos / facturas / SIFEN / Cobranzas / cron.
-- Aplicar: node scripts/apply-migration-file-pg.cjs <este archivo>  (o vía SSH psql)
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_documento_norm_neura
ON neura.clientes (
  empresa_id,
  (upper(regexp_replace(
     coalesce(nullif(btrim(ruc), ''), nullif(btrim(documento), '')),
     '[^A-Za-z0-9]', '', 'g'
   )))
)
WHERE deleted_at IS NULL
  AND upper(regexp_replace(
        coalesce(nullif(btrim(ruc), ''), nullif(btrim(documento), '')),
        '[^A-Za-z0-9]', '', 'g'
      )) <> '';

COMMENT ON INDEX neura.ux_clientes_documento_norm_neura IS
  'Anti-duplicados: RUC/Cedula normalizado unico por empresa entre clientes no eliminados. El nombre se valida a nivel app.';
