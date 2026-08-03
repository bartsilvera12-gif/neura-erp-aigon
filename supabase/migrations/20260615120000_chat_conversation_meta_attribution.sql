-- =============================================================================
-- Atribución de campañas Meta por conversación (Click-to-WhatsApp / CTWA)
-- =============================================================================
-- Captura, por conversación, los campos del nodo `referral` que Meta envía en
-- el primer mensaje que entra desde un anuncio (CTWA). Regla "first wins": el
-- registro es inmutable post-creación gracias a UNIQUE(conversation_id) +
-- ON CONFLICT DO NOTHING en el storage.
--
-- - Solo aplica a canales `chat_channels.provider = 'meta'`. YCloud no expone
--   `referral` en su payload, por lo que esas conversaciones nunca van a tener
--   fila en esta tabla.
-- - `raw_payload` del mensaje original NO se duplica acá; solo se persiste un
--   snapshot acotado del `referral` (`first_attribution_payload`) suficiente
--   para auditar y reportar.
-- - Sin FK cross-schema a `empresas` (patrón actual: empresa_id "blando",
--   integridad garantizada por la API + RLS).
--
-- Idempotencia: UNIQUE (conversation_id). El extractor server-side inserta con
-- ON CONFLICT DO NOTHING para preservar la primera atribución.
-- =============================================================================

DO $migration$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'chat_conversations'
      AND c.relkind = 'r'
      -- Alcance inicial: solo `neura`. Para habilitar en otros tenants,
      -- extender este IN con su nspname (mariacuevas, ncgconstructora, etc.).
      AND n.nspname IN ('neura')
  LOOP
    -- Crear tabla si no existe
    IF to_regclass(format('%I.chat_conversation_attribution', r.sch)) IS NULL THEN
      EXECUTE format($ct$
        CREATE TABLE %I.chat_conversation_attribution (
          id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          empresa_id                uuid NOT NULL,
          conversation_id           uuid NOT NULL UNIQUE,
          contact_id                uuid NULL,
          channel_id                uuid NULL,
          provider                  text NOT NULL DEFAULT 'meta'
                                    CHECK (provider IN ('meta','ycloud')),

          -- Campos que Meta entrega en referral (CTWA):
          meta_ad_id                text NULL,    -- referral.source_id (cuando source_type='ad')
          meta_source_type          text NULL,    -- 'ad' | 'post'
          meta_source_url           text NULL,
          meta_ctwa_clid            text NULL,
          meta_headline             text NULL,
          meta_body                 text NULL,
          meta_media_type           text NULL,    -- 'image' | 'video' | etc.
          meta_image_url            text NULL,
          meta_video_url            text NULL,
          meta_thumbnail_url        text NULL,

          -- Enriquecidos vía Meta Marketing API (fase posterior, nullable):
          meta_campaign_id          text NULL,
          meta_campaign_name        text NULL,
          meta_adset_id             text NULL,
          meta_adset_name           text NULL,
          meta_ad_name              text NULL,

          -- UTMs si llegan parseables en source_url o body:
          utm_source                text NULL,
          utm_medium                text NULL,
          utm_campaign              text NULL,
          utm_content               text NULL,
          utm_term                  text NULL,

          -- Snapshot acotado del referral original (NO el payload completo):
          first_attribution_payload jsonb NOT NULL DEFAULT '{}'::jsonb,
          first_message_at          timestamptz NOT NULL,
          source_message_id         uuid NULL,    -- id del chat_messages de origen
          captured_at               timestamptz NOT NULL DEFAULT now()
        )
      $ct$, r.sch);
    END IF;

    -- Índices
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_cca_empresa_first_msg
         ON %I.chat_conversation_attribution(empresa_id, first_message_at)',
      r.sch
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_cca_meta_ad
         ON %I.chat_conversation_attribution(empresa_id, meta_ad_id)
         WHERE meta_ad_id IS NOT NULL',
      r.sch
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_cca_meta_campaign
         ON %I.chat_conversation_attribution(empresa_id, meta_campaign_id)
         WHERE meta_campaign_id IS NOT NULL',
      r.sch
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_cca_contact
         ON %I.chat_conversation_attribution(empresa_id, contact_id)
         WHERE contact_id IS NOT NULL',
      r.sch
    );

    -- RLS
    EXECUTE format(
      'ALTER TABLE %I.chat_conversation_attribution ENABLE ROW LEVEL SECURITY',
      r.sch
    );

    -- Policies: solo lectura por usuarios de la empresa; inserts vía service role.
    -- Drop+create para reproducibilidad (las policies son idempotentes así).
    EXECUTE format($p$
      DROP POLICY IF EXISTS chat_conversation_attribution_select
        ON %I.chat_conversation_attribution;
      CREATE POLICY chat_conversation_attribution_select
        ON %I.chat_conversation_attribution
        FOR SELECT
        USING (%I.puede_acceder_empresa(empresa_id))
    $p$, r.sch, r.sch, r.sch);

    EXECUTE format($p$
      DROP POLICY IF EXISTS chat_conversation_attribution_insert
        ON %I.chat_conversation_attribution;
      CREATE POLICY chat_conversation_attribution_insert
        ON %I.chat_conversation_attribution
        FOR INSERT
        WITH CHECK (%I.puede_acceder_empresa(empresa_id))
    $p$, r.sch, r.sch, r.sch);

    EXECUTE format($p$
      DROP POLICY IF EXISTS chat_conversation_attribution_update
        ON %I.chat_conversation_attribution;
      CREATE POLICY chat_conversation_attribution_update
        ON %I.chat_conversation_attribution
        FOR UPDATE
        USING (%I.puede_acceder_empresa(empresa_id))
        WITH CHECK (%I.puede_acceder_empresa(empresa_id))
    $p$, r.sch, r.sch, r.sch, r.sch);

    -- Comentarios
    EXECUTE format(
      $c$ COMMENT ON TABLE %I.chat_conversation_attribution IS
        'Atribución 1:1 de conversaciones Meta a anuncios (referral / CTWA). First wins via UNIQUE(conversation_id).' $c$,
      r.sch
    );
  END LOOP;
END
$migration$;
