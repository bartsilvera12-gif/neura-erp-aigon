-- =============================================================================
-- Micro-corrección Triple 7 — SOLO schema: erp_triple_7_82f8a15a
--
-- Repunta el FK sorteo_revendedores.sorteo_id desde zentra_erp.sorteos →
-- erp_triple_7_82f8a15a.sorteos. El sorteo TRIPLE 7 (d891810e-...) sólo existe
-- en el schema local; no está espejado en zentra_erp.sorteos, por lo que toda
-- inserción en Triple 7.sorteo_revendedores violaba el FK.
--
-- Alcance EXPLÍCITO:
-- - SOLO erp_triple_7_82f8a15a (no Papu, no otros tenants).
-- - Idempotente: si ya está local, NOTICE y sale.
-- - Huérfanos = 0 antes de VALIDATE; si no, EXCEPTION.
-- - Preserva ON DELETE CASCADE del constraint original.
-- - No toca datos ni otros constraints.
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

  IF to_regclass(format('%I.sorteo_revendedores', v_schema)) IS NULL
     OR to_regclass(format('%I.sorteos', v_schema)) IS NULL THEN
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
    AND cf.relname = 'sorteo_revendedores'
    AND c.conname = 'sorteo_revendedores_sorteo_id_fkey';

  IF ref_ns IS NULL THEN
    RAISE NOTICE '[triple7 micro] sorteo_revendedores_sorteo_id_fkey ausente; omitiendo.';
  ELSIF ref_ns = v_schema THEN
    RAISE NOTICE '[triple7 micro] sorteo_revendedores_sorteo_id_fkey ya local.';
  ELSIF ref_ns NOT IN ('zentra_erp', 'public') THEN
    RAISE EXCEPTION '[triple7 micro] sorteo_revendedores_sorteo_id_fkey esquema inesperado: %', ref_ns;
  ELSE
    EXECUTE format(
      'ALTER TABLE %I.sorteo_revendedores DROP CONSTRAINT IF EXISTS sorteo_revendedores_sorteo_id_fkey',
      v_schema
    );
    EXECUTE format(
      'ALTER TABLE %I.sorteo_revendedores ADD CONSTRAINT sorteo_revendedores_sorteo_id_fkey
       FOREIGN KEY (sorteo_id) REFERENCES %I.sorteos(id) ON DELETE CASCADE NOT VALID',
      v_schema,
      v_schema
    );
    EXECUTE format(
      $q$
        SELECT COUNT(*)::bigint FROM %I.sorteo_revendedores t
        WHERE NOT EXISTS (SELECT 1 FROM %I.sorteos x WHERE x.id = t.sorteo_id)
      $q$,
      v_schema,
      v_schema
    ) INTO orphan;
    IF orphan > 0 THEN
      RAISE EXCEPTION '[triple7 micro] Huérfanos sorteo_revendedores.sorteo_id: %', orphan;
    END IF;
    EXECUTE format(
      'ALTER TABLE %I.sorteo_revendedores VALIDATE CONSTRAINT sorteo_revendedores_sorteo_id_fkey',
      v_schema
    );
    RAISE NOTICE '[triple7 micro] sorteo_revendedores_sorteo_id_fkey → sorteos locales.';
  END IF;
END $$;
