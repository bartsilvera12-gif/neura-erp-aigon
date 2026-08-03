-- =============================================================================
-- Comisiones — Comisionabilidad por venta nueva + override manual por pago
-- SOLO schema `neura` (instancia single_client). Referencias 100% locales:
--   neura.empresas / neura.usuarios / neura.puede_acceder_empresa / neura.set_updated_at
-- No toca zentra_erp, public ni otros schemas. DDL aditiva e idempotente.
-- Aplicar con: node scripts/apply-migration-file-pg.cjs <este archivo>
-- =============================================================================

-- ─── A) Flag durable + categoría en facturas (nullable; no rompe datos) ──────
-- comisionable: true = comisiona | false = no comisiona | NULL = regla automática
ALTER TABLE neura.facturas
  ADD COLUMN IF NOT EXISTS comisionable boolean;

ALTER TABLE neura.facturas
  ADD COLUMN IF NOT EXISTS categoria_comision text;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'chk_facturas_categoria_comision'
      AND conrelid = 'neura.facturas'::regclass
  ) THEN
    ALTER TABLE neura.facturas
      ADD CONSTRAINT chk_facturas_categoria_comision
      CHECK (categoria_comision IS NULL OR categoria_comision IN
        ('implementacion_nueva','recurrente','mantenimiento','upsell_manual','otro'));
  END IF;
END $$;

-- ─── B) Overrides de comisión por período/pago, con auditoría ────────────────
CREATE TABLE IF NOT EXISTS neura.comision_overrides (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id         uuid NOT NULL REFERENCES neura.empresas(id) ON DELETE CASCADE,
  periodo_ym         text NOT NULL,                       -- 'YYYY-MM'
  ambito             text NOT NULL DEFAULT 'pago'
                       CHECK (ambito IN ('pago','factura')),
  pago_id            uuid,
  factura_id         uuid,
  decision           text NOT NULL CHECK (decision IN ('incluir','excluir')),
  motivo             text NOT NULL CHECK (length(trim(motivo)) > 0),
  decidido_por       uuid REFERENCES neura.usuarios(id) ON DELETE SET NULL,
  decidido_por_email text,
  decidido_at        timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_comision_override UNIQUE (empresa_id, periodo_ym, ambito, pago_id)
);

CREATE INDEX IF NOT EXISTS ix_comision_override_periodo
  ON neura.comision_overrides (empresa_id, periodo_ym);
CREATE INDEX IF NOT EXISTS ix_comision_override_pago
  ON neura.comision_overrides (empresa_id, pago_id);
CREATE INDEX IF NOT EXISTS ix_comision_override_factura
  ON neura.comision_overrides (empresa_id, factura_id);

ALTER TABLE neura.comision_overrides ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS comision_overrides_select ON neura.comision_overrides;
CREATE POLICY comision_overrides_select ON neura.comision_overrides
  FOR SELECT USING (neura.puede_acceder_empresa(empresa_id));

DROP POLICY IF EXISTS comision_overrides_insert ON neura.comision_overrides;
CREATE POLICY comision_overrides_insert ON neura.comision_overrides
  FOR INSERT WITH CHECK (neura.puede_acceder_empresa(empresa_id));

DROP POLICY IF EXISTS comision_overrides_update ON neura.comision_overrides;
CREATE POLICY comision_overrides_update ON neura.comision_overrides
  FOR UPDATE USING (neura.puede_acceder_empresa(empresa_id))
  WITH CHECK (neura.puede_acceder_empresa(empresa_id));

DROP POLICY IF EXISTS comision_overrides_delete ON neura.comision_overrides;
CREATE POLICY comision_overrides_delete ON neura.comision_overrides
  FOR DELETE USING (neura.puede_acceder_empresa(empresa_id));

DROP TRIGGER IF EXISTS tr_comision_overrides_updated ON neura.comision_overrides;
CREATE TRIGGER tr_comision_overrides_updated BEFORE UPDATE ON neura.comision_overrides
  FOR EACH ROW EXECUTE FUNCTION neura.set_updated_at();
