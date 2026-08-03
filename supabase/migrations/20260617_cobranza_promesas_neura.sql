-- =============================================================================
-- Cobranzas — Promesas de pago (seguimiento). SOLO schema `neura`. Idempotente.
-- Referencias locales (neura.*). No toca datos existentes.
-- Aplicar: node scripts/apply-migration-file-pg.cjs <este archivo>  (o vía SSH psql)
-- =============================================================================

CREATE TABLE IF NOT EXISTS neura.cobranza_promesas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id     uuid NOT NULL REFERENCES neura.empresas(id) ON DELETE CASCADE,
  cliente_id     uuid NOT NULL REFERENCES neura.clientes(id) ON DELETE CASCADE,
  fecha_promesa  date NOT NULL,
  estado         text NOT NULL DEFAULT 'pendiente'
                   CHECK (estado IN ('pendiente','cumplida','cancelada')),
  creado_por        uuid REFERENCES neura.usuarios(id) ON DELETE SET NULL,
  creado_por_email  text,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS ix_cobranza_promesas_fecha
  ON neura.cobranza_promesas (empresa_id, fecha_promesa);
CREATE INDEX IF NOT EXISTS ix_cobranza_promesas_cliente
  ON neura.cobranza_promesas (empresa_id, cliente_id, estado);

ALTER TABLE neura.cobranza_promesas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS cobranza_promesas_select ON neura.cobranza_promesas;
CREATE POLICY cobranza_promesas_select ON neura.cobranza_promesas
  FOR SELECT USING (neura.puede_acceder_empresa(empresa_id));
DROP POLICY IF EXISTS cobranza_promesas_insert ON neura.cobranza_promesas;
CREATE POLICY cobranza_promesas_insert ON neura.cobranza_promesas
  FOR INSERT WITH CHECK (neura.puede_acceder_empresa(empresa_id));
DROP POLICY IF EXISTS cobranza_promesas_update ON neura.cobranza_promesas;
CREATE POLICY cobranza_promesas_update ON neura.cobranza_promesas
  FOR UPDATE USING (neura.puede_acceder_empresa(empresa_id))
  WITH CHECK (neura.puede_acceder_empresa(empresa_id));
DROP POLICY IF EXISTS cobranza_promesas_delete ON neura.cobranza_promesas;
CREATE POLICY cobranza_promesas_delete ON neura.cobranza_promesas
  FOR DELETE USING (neura.puede_acceder_empresa(empresa_id));

DROP TRIGGER IF EXISTS tr_cobranza_promesas_updated ON neura.cobranza_promesas;
CREATE TRIGGER tr_cobranza_promesas_updated BEFORE UPDATE ON neura.cobranza_promesas
  FOR EACH ROW EXECUTE FUNCTION neura.set_updated_at();
