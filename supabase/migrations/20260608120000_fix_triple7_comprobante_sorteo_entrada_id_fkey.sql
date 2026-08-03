-- =============================================================================
-- Micro-corrección Triple 7 — SOLO schema: erp_triple_7_82f8a15a
--
-- Repunta el FK chat_comprobante_validaciones.sorteo_entrada_id desde
-- zentra_erp.sorteo_entradas → erp_triple_7_82f8a15a.sorteo_entradas.
--
-- Causa: el clone omnicanal (zentra_erp.neura_clone_omnicanal_schema) sólo
-- reescribe referencias a tablas del subconjunto chat_*. sorteo_entradas no
-- está en ese subconjunto, así que el FK quedó apuntando al schema global.
-- La migración 20260607120000 reparó otros FKs del comprobante (flow_session_id,
-- y los inversos en sorteo_entradas) pero omitió este.
--
-- Síntoma producción (2026-05-20 ~21:42 PYT): al aprobar manualmente un
-- comprobante, se crea la sorteo_entrada en el tenant, pero el UPDATE de
-- chat_comprobante_validaciones.sorteo_entrada_id falla con
-- "violates foreign key constraint chat_comprobante_validaciones_sorteo_entrada_id_fkey".
--
-- Alcance EXPLÍCITO:
-- - SOLO erp_triple_7_82f8a15a (no bucles, no otros tenants, no zentra_erp).
-- - Idempotente: si ya está local, NOTICE y sale.
-- - Huérfanos = 0 antes de VALIDATE; si no, EXCEPTION.
-- - No toca datos, sólo el constraint.
-- =============================================================================

DO $$
DECLARE
  v_schema text := 'erp_triple_7_82f8a15a';
  ref_ns text;
  orphan bigint;
BEGIN
  EXECUTE 'SET LOCAL lock_timeout = ''8s''';
  EXECUTE 'SET LOCAL statement_timeout = ''120s''';

  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = v_schema) THEN
    RAISE NOTICE '[triple7 micro] Schema % no existe; omitiendo.', v_schema;
    RETURN;
  END IF;

  IF to_regclass(format('%I.chat_comprobante_validaciones', v_schema)) IS NULL
     OR to_regclass(format('%I.sorteo_entradas', v_schema)) IS NULL THEN
    RAISE NOTICE '[triple7 micro] Faltan tablas base en %; omitiendo.', v_schema;
    RETURN;
  END IF;

  SELECT rn.nspname::text INTO ref_ns
  FROM pg_constraint c
  JOIN pg_class cf ON cf.oid = c.conrelid
  JOIN pg_namespace tn ON tn.oid = cf.relnamespace
  JOIN pg_class rt ON rt.oid = c.confrelid
  JOIN pg_namespace rn ON rn.oid = rt.relnamespace
  WHERE c.contype = 'f'
    AND tn.nspname = v_schema
    AND cf.relname = 'chat_comprobante_validaciones'
    AND c.conname = 'chat_comprobante_validaciones_sorteo_entrada_id_fkey';

  IF ref_ns IS NULL THEN
    RAISE NOTICE '[triple7 micro] chat_comprobante_validaciones_sorteo_entrada_id_fkey ausente; omitiendo.';
  ELSIF ref_ns = v_schema THEN
    RAISE NOTICE '[triple7 micro] chat_comprobante_validaciones_sorteo_entrada_id_fkey ya local.';
  ELSIF ref_ns NOT IN ('zentra_erp', 'public') THEN
    RAISE EXCEPTION '[triple7 micro] chat_comprobante_validaciones_sorteo_entrada_id_fkey esquema inesperado: %', ref_ns;
  ELSE
    EXECUTE format(
      'ALTER TABLE %I.chat_comprobante_validaciones DROP CONSTRAINT IF EXISTS chat_comprobante_validaciones_sorteo_entrada_id_fkey',
      v_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.chat_comprobante_validaciones ADD CONSTRAINT chat_comprobante_validaciones_sorteo_entrada_id_fkey
       FOREIGN KEY (sorteo_entrada_id) REFERENCES %I.sorteo_entradas(id) ON DELETE SET NULL NOT VALID',
      v_schema,
      v_schema
    );
    EXECUTE format(
      $q$
        SELECT COUNT(*)::bigint FROM %I.chat_comprobante_validaciones t
        WHERE t.sorteo_entrada_id IS NOT NULL
          AND NOT EXISTS (SELECT 1 FROM %I.sorteo_entradas x WHERE x.id = t.sorteo_entrada_id)
      $q$,
      v_schema,
      v_schema
    ) INTO orphan;
    IF orphan > 0 THEN
      RAISE EXCEPTION '[triple7 micro] Huérfanos chat_comprobante_validaciones.sorteo_entrada_id: %', orphan;
    END IF;
    EXECUTE format(
      'ALTER TABLE %I.chat_comprobante_validaciones VALIDATE CONSTRAINT chat_comprobante_validaciones_sorteo_entrada_id_fkey',
      v_schema
    );
    RAISE NOTICE '[triple7 micro] chat_comprobante_validaciones_sorteo_entrada_id_fkey → sorteo_entradas locales.';
  END IF;
END $$;
