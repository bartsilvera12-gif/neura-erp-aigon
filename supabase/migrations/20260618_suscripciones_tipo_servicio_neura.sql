-- =============================================================================
-- Multi-servicio: tipo de servicio POR suscripción. SOLO schema `neura`. Idempotente.
-- Aditiva: columna nullable + backfill desde clientes.tipo_servicio_cliente.
-- No genera facturas, no toca pagos/SIFEN/cron.
-- Aplicar: node scripts/apply-migration-file-pg.cjs <este archivo>  (o vía SSH psql)
-- =============================================================================

ALTER TABLE neura.suscripciones ADD COLUMN IF NOT EXISTS tipo_servicio text;

-- Backfill inicial: cada suscripción hereda el tipo del cliente (punto de partida).
UPDATE neura.suscripciones s
SET tipo_servicio = c.tipo_servicio_cliente
FROM neura.clientes c
WHERE c.id = s.cliente_id
  AND s.tipo_servicio IS NULL
  AND c.tipo_servicio_cliente IS NOT NULL
  AND btrim(c.tipo_servicio_cliente) <> '';
