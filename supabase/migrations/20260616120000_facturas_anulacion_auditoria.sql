-- =============================================================================
-- Facturas: columnas de auditoría para ANULACIÓN ADMINISTRATIVA.
--
-- Agrega SOLO columnas nuevas (idempotente con ADD COLUMN IF NOT EXISTS):
--   - anulado_at        timestamptz null
--   - anulado_por       uuid null   (auth.users(id), ON DELETE SET NULL)
--   - anulacion_motivo  text null
--
-- NO modifica el CHECK de `estado` (ya incluye 'Anulado'), NO toca datos
-- existentes, NO crea/borra otras tablas, NO toca pagos/SIFEN.
--
-- Aplicación multi-schema con el patrón existente (neura_upgrade_*):
--   zentra_erp + public (si existe) + tenants erp_* registrados en empresas.data_schema.
-- =============================================================================

CREATE OR REPLACE FUNCTION zentra_erp.neura_upgrade_facturas_anulacion_auditoria(p_schema text)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  s text := btrim(p_schema);
BEGIN
  IF s IS NULL OR s = '' THEN
    RAISE EXCEPTION 'neura_upgrade_facturas_anulacion_auditoria: schema vacío';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = s) THEN
    RAISE NOTICE 'neura_upgrade_facturas_anulacion_auditoria: schema % no existe (omitido)', s;
    RETURN;
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.tables WHERE table_schema = s AND table_name = 'facturas'
  ) THEN
    RAISE NOTICE 'neura_upgrade_facturas_anulacion_auditoria: sin tabla facturas en % (omitido)', s;
    RETURN;
  END IF;

  EXECUTE format(
    'ALTER TABLE %I.facturas ADD COLUMN IF NOT EXISTS anulado_at timestamptz',
    s
  );
  EXECUTE format(
    'ALTER TABLE %I.facturas ADD COLUMN IF NOT EXISTS anulado_por uuid',
    s
  );
  EXECUTE format(
    'ALTER TABLE %I.facturas ADD COLUMN IF NOT EXISTS anulacion_motivo text',
    s
  );

  -- Nota: `anulado_por` guarda el auth.users(id) del usuario que anuló.
  -- No se agrega FK para mantener esta migración estrictamente "solo columnas"
  -- (no se crean/alteran constraints existentes). La integridad se valida en el endpoint.
END;
$$;

COMMENT ON FUNCTION zentra_erp.neura_upgrade_facturas_anulacion_auditoria(text) IS
  'Agrega columnas de auditoría de anulación (anulado_at, anulado_por, anulacion_motivo) a facturas de un schema ERP. Solo columnas; no toca CHECK ni datos.';

REVOKE ALL ON FUNCTION zentra_erp.neura_upgrade_facturas_anulacion_auditoria(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION zentra_erp.neura_upgrade_facturas_anulacion_auditoria(text) TO service_role;

-- Schema operativo confirmado (Neura/Zentra y empresas legadas con data_schema NULL).
SELECT zentra_erp.neura_upgrade_facturas_anulacion_auditoria('zentra_erp');

-- public legado: solo si la tabla existe (no se crea nada nuevo allí).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'facturas'
  ) THEN
    PERFORM zentra_erp.neura_upgrade_facturas_anulacion_auditoria('public');
  END IF;
END;
$$;

-- Tenants dedicados erp_* (estructura idéntica clonada desde zentra_erp).
-- Solo agrega columnas; no modifica datos de ningún tenant.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT btrim(e.data_schema) AS ds
    FROM zentra_erp.empresas e
    WHERE e.data_schema IS NOT NULL
      AND btrim(e.data_schema) <> ''
      AND btrim(e.data_schema) <> 'zentra_erp'
      AND btrim(e.data_schema) ~ '^erp_[a-z0-9_]+$'
  LOOP
    PERFORM zentra_erp.neura_upgrade_facturas_anulacion_auditoria(r.ds);
    RAISE NOTICE 'facturas anulación auditoría: actualizado schema %', r.ds;
  END LOOP;
END;
$$;

NOTIFY pgrst, 'reload schema';
