-- =============================================================================
-- Facturación mensual de suscripciones: idempotencia por período explícito.
--
-- PROBLEMA: el cron dedupe por (suscripcion_id + fecha_vencimiento ∈ período), lo
-- cual es AMBIGUO: una factura emitida en el mes N con vencimiento en N+1 puede
-- confundirse con la del período N+1 (o suprimirla). Caso real detectado:
-- 25 pares duplicados en 2026-05 (emitida 26-abr venc 10-may + emitida 01-may
-- venc 10-may) y 5 facturas de altas de junio con venc 10-jul que ocupan el
-- slot julio.
--
-- SOLUCIÓN: columna explícita `periodo_facturado` (YYYY-MM) y clave de idempotencia
-- = (empresa_id, suscripcion_id, periodo_facturado). Índice único parcial como
-- guarda dura (defensa contra carreras/inserts manuales).
--
-- Alcance: schema tenant `neura` (instancia single_client sistemas.neura.com.py).
-- No toca otras tablas, pagos, SIFEN, clientes ni suscripciones. Additiva.
--
-- IDEMPOTENTE: reejecutable. El índice único se OMITE automáticamente si aún
-- existen grupos duplicados activos (se limpian aparte); reejecutar tras la
-- limpieza lo crea.
-- =============================================================================

BEGIN;

-- 1) Columna de período facturado (nullable). Solo aplica a facturas de suscripción.
ALTER TABLE neura.facturas
  ADD COLUMN IF NOT EXISTS periodo_facturado text;

COMMENT ON COLUMN neura.facturas.periodo_facturado IS
  'YYYY-MM del período facturado (solo facturas tipo=suscripcion). Clave de idempotencia del cron de facturación mensual; independiente de fecha_vencimiento.';

-- 2) Backfill por MES DE EMISIÓN (`fecha`), NO por vencimiento.
--    Motivo (forense 2026-07-01): el lote emitido 2026-05-01 tiene fecha_vencimiento
--    mal cargada en 2026-05-10 (debía ser ~2026-06-10). Deduplicar por vencimiento
--    colisiona 25 pares que en realidad son meses consecutivos legítimos (cada uno con
--    su pago real). Por mes de emisión hay 0 colisiones y coincide con la convención
--    del cron hacia adelante (emisión = período).
UPDATE neura.facturas
SET periodo_facturado = to_char(fecha, 'YYYY-MM')
WHERE tipo = 'suscripcion'
  AND periodo_facturado IS NULL
  AND fecha IS NOT NULL;

-- 2b) Excepción: 5 facturas de ALTA emitidas en 2026-06 con vencimiento 2026-07-10.
--     Representan el "slot julio" (primera factura de suscripciones dadas de alta a
--     mediados de junio). Se fuerzan a '2026-07' para que el cron de julio las reconozca
--     como ya facturadas y NO genere duplicado. Verificado: exactamente 5 filas, cada
--     suscripción con una única factura (sin colisión). Override explícito (sin guard NULL).
UPDATE neura.facturas
SET periodo_facturado = '2026-07'
WHERE tipo = 'suscripcion'
  AND to_char(fecha, 'YYYY-MM') = '2026-06'
  AND to_char(fecha_vencimiento, 'YYYY-MM') = '2026-07';

-- 3) Guarda dura: índice único parcial. Se crea SOLO si no hay duplicados activos;
--    si los hay, se omite con NOTICE (limpiar los pares y reejecutar la migración).
DO $$
DECLARE
  v_dups int;
BEGIN
  SELECT count(*) INTO v_dups FROM (
    SELECT 1
    FROM neura.facturas
    WHERE tipo = 'suscripcion'
      AND suscripcion_id IS NOT NULL
      AND periodo_facturado IS NOT NULL
      AND estado NOT IN ('Anulado', 'Corregida NC')
    GROUP BY empresa_id, suscripcion_id, periodo_facturado
    HAVING count(*) > 1
  ) d;

  IF v_dups > 0 THEN
    RAISE NOTICE 'periodo_facturado: % grupo(s) duplicado(s) activo(s) — se OMITE uq_facturas_suscripcion_periodo (limpiar y reejecutar)', v_dups;
  ELSE
    EXECUTE $ix$
      CREATE UNIQUE INDEX IF NOT EXISTS uq_facturas_suscripcion_periodo
      ON neura.facturas (empresa_id, suscripcion_id, periodo_facturado)
      WHERE tipo = 'suscripcion'
        AND suscripcion_id IS NOT NULL
        AND periodo_facturado IS NOT NULL
        AND estado NOT IN ('Anulado', 'Corregida NC')
    $ix$;
    RAISE NOTICE 'periodo_facturado: uq_facturas_suscripcion_periodo creado';
  END IF;
END$$;

-- Índice de apoyo para la búsqueda idempotente del motor (no único, siempre seguro).
CREATE INDEX IF NOT EXISTS idx_facturas_susc_periodo
  ON neura.facturas (suscripcion_id, periodo_facturado)
  WHERE tipo = 'suscripcion';

COMMIT;
