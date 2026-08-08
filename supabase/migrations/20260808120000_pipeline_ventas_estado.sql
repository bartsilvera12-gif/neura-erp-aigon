-- =============================================================================
-- Pipeline de ventas — etiquetas de estado por conversación
-- =============================================================================
-- Idempotente. Multi-schema acotado a los schemas que YA tienen
-- chat_conversations dentro del set autorizado (hoy: neura). Extender el IN del
-- loop para más tenants.
--
-- Objetivo: cada conversación de chat puede llevar una etiqueta de estado del
-- ciclo de venta que el vendedor cambia manualmente. Se registra quién y cuándo.
-- Estados: nuevo | seguimiento | confirmado | pagado_entregado | perdido.
--
-- Agrega:
--   1) Columnas en chat_conversations
--        estado_pipeline                text (nullable, CHECK enumerado)
--        estado_pipeline_updated_at     timestamptz
--        estado_pipeline_updated_by     uuid    (usuario que cambió)
--        seguimiento_fecha              date    (solo Seguimiento)
--        venta_monto                    numeric(14,2)  (solo Pagado y Entregado)
--   2) chat_conversation_pipeline_events — historial inmutable de cambios
--   3) Amplía CHECK de agent_notification_events.type con 'seguimiento_hoy'
--   4) Índices para consultas del panel admin y del cron diario.
-- =============================================================================

DO $migration$
DECLARE
  r RECORD;
  ck_name text;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'chat_conversations'
      AND c.relkind = 'r'
      AND n.nspname IN ('neura')
  LOOP
    -- =========================================================================
    -- 1) Columnas en chat_conversations
    -- =========================================================================
    EXECUTE format(
      'ALTER TABLE %I.chat_conversations
         ADD COLUMN IF NOT EXISTS estado_pipeline            text,
         ADD COLUMN IF NOT EXISTS estado_pipeline_updated_at timestamptz,
         ADD COLUMN IF NOT EXISTS estado_pipeline_updated_by uuid,
         ADD COLUMN IF NOT EXISTS seguimiento_fecha          date,
         ADD COLUMN IF NOT EXISTS venta_monto                numeric(14,2)',
      r.sch
    );

    -- CHECK del enum sobre estado_pipeline (drop/re-create para reforzar cambios).
    EXECUTE format(
      'ALTER TABLE %I.chat_conversations DROP CONSTRAINT IF EXISTS chk_estado_pipeline',
      r.sch
    );
    EXECUTE format(
      'ALTER TABLE %I.chat_conversations
         ADD CONSTRAINT chk_estado_pipeline
         CHECK (estado_pipeline IS NULL OR estado_pipeline IN
           (''nuevo'',''seguimiento'',''confirmado'',''pagado_entregado'',''perdido''))',
      r.sch
    );

    -- Índices para consultas del panel admin.
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_conv_estado_pipeline
         ON %I.chat_conversations(empresa_id, estado_pipeline)
         WHERE estado_pipeline IS NOT NULL',
      r.sch
    );
    -- Índice del cron diario: seguimientos con fecha establecida.
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_conv_seguimiento_fecha
         ON %I.chat_conversations(empresa_id, seguimiento_fecha)
         WHERE estado_pipeline = ''seguimiento'' AND seguimiento_fecha IS NOT NULL',
      r.sch
    );

    -- =========================================================================
    -- 2) chat_conversation_pipeline_events — historial inmutable
    -- =========================================================================
    IF to_regclass(format('%I.chat_conversation_pipeline_events', r.sch)) IS NULL THEN
      EXECUTE format($ct$
        CREATE TABLE %I.chat_conversation_pipeline_events (
          id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          empresa_id          uuid NOT NULL,
          conversation_id     uuid NOT NULL REFERENCES %I.chat_conversations(id) ON DELETE CASCADE,
          estado_anterior     text,
          estado_nuevo        text NOT NULL,
          cambiado_por        uuid,
          cambiado_por_nombre text,
          seguimiento_fecha   date,
          venta_monto         numeric(14,2),
          notas               text,
          created_at          timestamptz NOT NULL DEFAULT now(),
          CHECK (estado_nuevo IN
            ('nuevo','seguimiento','confirmado','pagado_entregado','perdido'))
        )
      $ct$, r.sch, r.sch);
    END IF;

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_pipeline_events_conv
         ON %I.chat_conversation_pipeline_events(conversation_id, created_at DESC)',
      r.sch
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_pipeline_events_empresa_fecha
         ON %I.chat_conversation_pipeline_events(empresa_id, created_at DESC)',
      r.sch
    );

    EXECUTE format(
      'ALTER TABLE %I.chat_conversation_pipeline_events ENABLE ROW LEVEL SECURITY',
      r.sch
    );
    EXECUTE format($p$
      DROP POLICY IF EXISTS cpe_select ON %I.chat_conversation_pipeline_events;
      CREATE POLICY cpe_select ON %I.chat_conversation_pipeline_events FOR SELECT
        USING (%I.puede_acceder_empresa(empresa_id));
      DROP POLICY IF EXISTS cpe_insert ON %I.chat_conversation_pipeline_events;
      CREATE POLICY cpe_insert ON %I.chat_conversation_pipeline_events FOR INSERT
        WITH CHECK (%I.puede_acceder_empresa(empresa_id))
    $p$, r.sch, r.sch, r.sch, r.sch, r.sch, r.sch);

    -- =========================================================================
    -- 3) Ampliar CHECK de agent_notification_events.type con 'seguimiento_hoy'
    -- =========================================================================
    -- El nombre del constraint depende de cómo lo generó PG; lo buscamos.
    SELECT con.conname INTO ck_name
    FROM pg_constraint con
    JOIN pg_class rel ON rel.oid = con.conrelid
    JOIN pg_namespace nsp ON nsp.oid = rel.relnamespace
    WHERE rel.relname = 'agent_notification_events'
      AND nsp.nspname = r.sch
      AND con.contype = 'c'
      AND pg_get_constraintdef(con.oid) ILIKE '%new_lead%';

    IF ck_name IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE %I.agent_notification_events DROP CONSTRAINT %I',
        r.sch, ck_name
      );
    END IF;

    EXECUTE format(
      'ALTER TABLE %I.agent_notification_events
         ADD CONSTRAINT agent_notification_events_type_check
         CHECK (type IN
           (''new_lead'',''new_message'',''reassigned'',''sla_warning'',''seguimiento_hoy''))',
      r.sch
    );

  END LOOP;
END
$migration$;
