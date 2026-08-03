-- =============================================================================
-- Contact Center WhatsApp V1 — Núcleo de datos (Fase backend)
-- =============================================================================
-- Idempotente. Multi-schema acotado a los schemas que YA tienen chat_conversations
-- dentro del set autorizado (hoy: neura). Para habilitar otro tenant, extender el
-- IN del loop con su nspname. No asume `public`. No toca campañas/sorteos/facturación.
--
-- Agrega:
--   1) contact_center_settings        — SLA + flags por empresa/canal/cola.
--   2) cc_daily_assignment_counter    — conteo parejo diario por empresa+scope+agente.
--   3) agent_device_tokens            — preparación FCM (sin dispatcher todavía).
--   4) agent_notification_events      — auditoría de notificaciones (pending/sent/...).
--   5) Columnas en chat_conversations — ventana 24h + SLA + scope contact center.
--   6) chat_agents.last_assigned_at   — desempate de reparto.
--
-- NOTA assignment_status: NO se agrega columna física. El estado se deriva de
--   (assigned_agent_id IS NULL) + status(open/pending/closed) + assignment_wait_code,
--   que ya existen. El sweep de SLA y la vista de supervisor consultan por esos campos.
-- NOTA reassignment_count: se reutiliza `chat_conversations.initial_reassign_count`
--   (ya existe) en vez de duplicar columna.
-- =============================================================================

DO $migration$
DECLARE
  r RECORD;
  has_set_updated_at boolean;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'chat_conversations'
      AND c.relkind = 'r'
      -- Alcance inicial: solo `neura`. Extender este IN para más tenants.
      AND n.nspname IN ('neura')
  LOOP
    has_set_updated_at := to_regprocedure(format('%I.set_updated_at()', r.sch)) IS NOT NULL;

    -- =========================================================================
    -- 1) contact_center_settings
    -- =========================================================================
    IF to_regclass(format('%I.contact_center_settings', r.sch)) IS NULL THEN
      EXECUTE format($ct$
        CREATE TABLE %I.contact_center_settings (
          id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          empresa_id            uuid NOT NULL,
          channel_id            uuid NULL,
          queue_id              uuid NULL,
          sla_minutes           integer NOT NULL DEFAULT 5  CHECK (sla_minutes >= 1),
          max_reassignments     integer NOT NULL DEFAULT 2  CHECK (max_reassignments >= 0),
          daily_counter_scope   text    NOT NULL DEFAULT 'queue_or_channel'
                                  CHECK (daily_counter_scope IN ('queue_or_channel','channel','empresa')),
          fcm_enabled           boolean NOT NULL DEFAULT true,
          email_enabled         boolean NOT NULL DEFAULT false,
          sms_enabled           boolean NOT NULL DEFAULT false,
          created_at            timestamptz NOT NULL DEFAULT now(),
          updated_at            timestamptz NOT NULL DEFAULT now()
        )
      $ct$, r.sch);
    END IF;

    -- Una sola fila por (empresa, canal opcional, cola opcional). 00..0 = NULL normalizado.
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_ccs_scope
         ON %I.contact_center_settings(
           empresa_id,
           COALESCE(channel_id, ''00000000-0000-0000-0000-000000000000''::uuid),
           COALESCE(queue_id,   ''00000000-0000-0000-0000-000000000000''::uuid)
         )',
      r.sch
    );

    EXECUTE format('ALTER TABLE %I.contact_center_settings ENABLE ROW LEVEL SECURITY', r.sch);
    EXECUTE format($p$
      DROP POLICY IF EXISTS ccs_select ON %I.contact_center_settings;
      CREATE POLICY ccs_select ON %I.contact_center_settings FOR SELECT
        USING (%I.puede_acceder_empresa(empresa_id));
      DROP POLICY IF EXISTS ccs_insert ON %I.contact_center_settings;
      CREATE POLICY ccs_insert ON %I.contact_center_settings FOR INSERT
        WITH CHECK (%I.puede_acceder_empresa(empresa_id));
      DROP POLICY IF EXISTS ccs_update ON %I.contact_center_settings;
      CREATE POLICY ccs_update ON %I.contact_center_settings FOR UPDATE
        USING (%I.puede_acceder_empresa(empresa_id))
        WITH CHECK (%I.puede_acceder_empresa(empresa_id))
    $p$, r.sch, r.sch, r.sch, r.sch, r.sch, r.sch, r.sch, r.sch, r.sch, r.sch);

    IF has_set_updated_at THEN
      EXECUTE format('DROP TRIGGER IF EXISTS tr_ccs_updated ON %I.contact_center_settings', r.sch);
      EXECUTE format(
        'CREATE TRIGGER tr_ccs_updated BEFORE UPDATE ON %I.contact_center_settings
           FOR EACH ROW EXECUTE FUNCTION %I.set_updated_at()',
        r.sch, r.sch
      );
    END IF;

    -- Seed: una fila default por empresa (scope global empresa) si no existe ninguna.
    EXECUTE format($seed$
      INSERT INTO %I.contact_center_settings (empresa_id)
      SELECT e.id FROM %I.empresas e
      WHERE NOT EXISTS (
        SELECT 1 FROM %I.contact_center_settings s
        WHERE s.empresa_id = e.id AND s.channel_id IS NULL AND s.queue_id IS NULL
      )
    $seed$, r.sch, r.sch, r.sch);

    -- =========================================================================
    -- 2) cc_daily_assignment_counter
    -- =========================================================================
    IF to_regclass(format('%I.cc_daily_assignment_counter', r.sch)) IS NULL THEN
      EXECUTE format($ct$
        CREATE TABLE %I.cc_daily_assignment_counter (
          empresa_id  uuid NOT NULL,
          scope_type  text NOT NULL CHECK (scope_type IN ('queue','channel','empresa')),
          scope_id    uuid NOT NULL,
          agent_id    uuid NOT NULL,
          dia_local   date NOT NULL,
          count       integer NOT NULL DEFAULT 0,
          created_at  timestamptz NOT NULL DEFAULT now(),
          updated_at  timestamptz NOT NULL DEFAULT now(),
          PRIMARY KEY (empresa_id, scope_type, scope_id, agent_id, dia_local)
        )
      $ct$, r.sch);
    END IF;
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_ccdac_lookup
         ON %I.cc_daily_assignment_counter(empresa_id, scope_type, scope_id, dia_local)',
      r.sch
    );
    EXECUTE format('ALTER TABLE %I.cc_daily_assignment_counter ENABLE ROW LEVEL SECURITY', r.sch);
    EXECUTE format($p$
      DROP POLICY IF EXISTS ccdac_select ON %I.cc_daily_assignment_counter;
      CREATE POLICY ccdac_select ON %I.cc_daily_assignment_counter FOR SELECT
        USING (%I.puede_acceder_empresa(empresa_id))
    $p$, r.sch, r.sch, r.sch);

    -- =========================================================================
    -- 3) agent_device_tokens  (preparación FCM; sin dispatcher en esta fase)
    -- =========================================================================
    IF to_regclass(format('%I.agent_device_tokens', r.sch)) IS NULL THEN
      EXECUTE format($ct$
        CREATE TABLE %I.agent_device_tokens (
          id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          empresa_id        uuid NOT NULL,
          agent_id          uuid NULL,
          user_id           uuid NOT NULL,
          platform          text NOT NULL DEFAULT 'android'
                             CHECK (platform IN ('android','ios','web')),
          fcm_token         text NOT NULL,
          device_name       text NULL,
          app_version       text NULL,
          is_active         boolean NOT NULL DEFAULT true,
          last_seen_at      timestamptz NULL,
          last_push_ack_at  timestamptz NULL,
          created_at        timestamptz NOT NULL DEFAULT now(),
          updated_at        timestamptz NOT NULL DEFAULT now()
        )
      $ct$, r.sch);
    END IF;
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_adt_empresa_token
         ON %I.agent_device_tokens(empresa_id, fcm_token)',
      r.sch
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_adt_user_active
         ON %I.agent_device_tokens(empresa_id, user_id, is_active)',
      r.sch
    );
    EXECUTE format('ALTER TABLE %I.agent_device_tokens ENABLE ROW LEVEL SECURITY', r.sch);
    EXECUTE format($p$
      DROP POLICY IF EXISTS adt_select ON %I.agent_device_tokens;
      CREATE POLICY adt_select ON %I.agent_device_tokens FOR SELECT
        USING (%I.puede_acceder_empresa(empresa_id));
      DROP POLICY IF EXISTS adt_insert ON %I.agent_device_tokens;
      CREATE POLICY adt_insert ON %I.agent_device_tokens FOR INSERT
        WITH CHECK (%I.puede_acceder_empresa(empresa_id));
      DROP POLICY IF EXISTS adt_update ON %I.agent_device_tokens;
      CREATE POLICY adt_update ON %I.agent_device_tokens FOR UPDATE
        USING (%I.puede_acceder_empresa(empresa_id))
        WITH CHECK (%I.puede_acceder_empresa(empresa_id))
    $p$, r.sch, r.sch, r.sch, r.sch, r.sch, r.sch, r.sch, r.sch, r.sch, r.sch);
    IF has_set_updated_at THEN
      EXECUTE format('DROP TRIGGER IF EXISTS tr_adt_updated ON %I.agent_device_tokens', r.sch);
      EXECUTE format(
        'CREATE TRIGGER tr_adt_updated BEFORE UPDATE ON %I.agent_device_tokens
           FOR EACH ROW EXECUTE FUNCTION %I.set_updated_at()',
        r.sch, r.sch
      );
    END IF;

    -- =========================================================================
    -- 4) agent_notification_events  (auditoría; canal principal 'fcm')
    -- =========================================================================
    IF to_regclass(format('%I.agent_notification_events', r.sch)) IS NULL THEN
      EXECUTE format($ct$
        CREATE TABLE %I.agent_notification_events (
          id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          empresa_id          uuid NOT NULL,
          agent_id            uuid NULL,
          conversation_id     uuid NULL REFERENCES %I.chat_conversations(id) ON DELETE CASCADE,
          type                text NOT NULL
                               CHECK (type IN ('new_lead','new_message','reassigned','sla_warning')),
          channel             text NOT NULL DEFAULT 'fcm'
                               CHECK (channel IN ('fcm','email','sms','realtime')),
          status              text NOT NULL DEFAULT 'pending'
                               CHECK (status IN ('pending','sent','failed','acknowledged','skipped')),
          provider_message_id text NULL,
          error_message       text NULL,
          sent_at             timestamptz NULL,
          acknowledged_at     timestamptz NULL,
          created_at          timestamptz NOT NULL DEFAULT now(),
          metadata            jsonb NOT NULL DEFAULT '{}'::jsonb
        )
      $ct$, r.sch, r.sch);
    END IF;
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_ane_pending
         ON %I.agent_notification_events(empresa_id, status, created_at)',
      r.sch
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_ane_agent_conv
         ON %I.agent_notification_events(empresa_id, agent_id, conversation_id)',
      r.sch
    );
    EXECUTE format('ALTER TABLE %I.agent_notification_events ENABLE ROW LEVEL SECURITY', r.sch);
    EXECUTE format($p$
      DROP POLICY IF EXISTS ane_select ON %I.agent_notification_events;
      CREATE POLICY ane_select ON %I.agent_notification_events FOR SELECT
        USING (%I.puede_acceder_empresa(empresa_id))
    $p$, r.sch, r.sch, r.sch);

    -- =========================================================================
    -- 5) Columnas en chat_conversations (solo las que falten)
    -- =========================================================================
    EXECUTE format(
      'ALTER TABLE %I.chat_conversations
         ADD COLUMN IF NOT EXISTS last_customer_message_at   timestamptz,
         ADD COLUMN IF NOT EXISTS last_agent_message_at       timestamptz,
         ADD COLUMN IF NOT EXISTS whatsapp_window_expires_at  timestamptz,
         ADD COLUMN IF NOT EXISTS sla_due_at                  timestamptz,
         ADD COLUMN IF NOT EXISTS sla_minutes                 integer,
         ADD COLUMN IF NOT EXISTS needs_template_response     boolean NOT NULL DEFAULT false,
         ADD COLUMN IF NOT EXISTS contact_center_scope_type   text,
         ADD COLUMN IF NOT EXISTS contact_center_scope_id     uuid',
      r.sch
    );
    -- Índice para el barrido de SLA: pendientes vencidas sin primera respuesta.
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_cc_sla_due
         ON %I.chat_conversations(empresa_id, sla_due_at)
         WHERE assigned_agent_id IS NOT NULL
           AND first_human_response_at IS NULL
           AND status IN (''open'',''pending'')',
      r.sch
    );

    -- =========================================================================
    -- 6) chat_agents.last_assigned_at (desempate de reparto)
    -- =========================================================================
    IF to_regclass(format('%I.chat_agents', r.sch)) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE %I.chat_agents ADD COLUMN IF NOT EXISTS last_assigned_at timestamptz',
        r.sch
      );
    END IF;

  END LOOP;
END
$migration$;
