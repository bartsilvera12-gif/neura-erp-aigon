#!/usr/bin/env bash
# Backfill idempotente de chat_conversation_attribution sobre mensajes YCloud
# históricos que tienen referral en raw_payload.whatsappInboundMessage.referral.
# Solo neura. ON CONFLICT (conversation_id) DO NOTHING → first wins.
set -e
docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
BEGIN;

WITH eligible AS (
  -- Primer mensaje con referral por conversación, ordenado por created_at ASC.
  -- DISTINCT ON garantiza "first wins" sin necesidad de aggregate.
  SELECT DISTINCT ON (c.id)
    m.empresa_id,
    c.id                                                            AS conversation_id,
    c.contact_id,
    c.channel_id,
    m.id                                                            AS source_message_id,
    m.created_at                                                    AS first_message_at,
    m.raw_payload -> 'whatsappInboundMessage' -> 'referral'          AS ref
  FROM neura.chat_messages m
  JOIN neura.chat_conversations c ON c.id = m.conversation_id
  JOIN neura.chat_channels      ch ON ch.id = c.channel_id
  WHERE m.from_me = false
    AND ch.provider = 'ycloud'
    AND m.raw_payload -> 'whatsappInboundMessage' ? 'referral'
  ORDER BY c.id, m.created_at ASC
),
inserted AS (
  INSERT INTO neura.chat_conversation_attribution
    (empresa_id, conversation_id, contact_id, channel_id, provider,
     meta_ad_id, meta_source_type, meta_source_url, meta_ctwa_clid,
     meta_headline, meta_body, meta_media_type,
     meta_image_url, meta_video_url, meta_thumbnail_url,
     first_attribution_payload, first_message_at, source_message_id)
  SELECT
    e.empresa_id, e.conversation_id, e.contact_id, e.channel_id, 'ycloud',
    e.ref ->> 'source_id',
    e.ref ->> 'source_type',
    e.ref ->> 'source_url',
    e.ref ->> 'ctwa_clid',
    e.ref ->> 'headline',
    e.ref ->> 'body',
    e.ref ->> 'media_type',
    e.ref ->> 'image_url',
    e.ref ->> 'video_url',
    e.ref ->> 'thumbnail_url',
    -- snapshot acotado: solo campos del referral (mismo formato que el extractor TS)
    jsonb_strip_nulls(jsonb_build_object(
      'source_id',      e.ref ->> 'source_id',
      'source_type',    e.ref ->> 'source_type',
      'source_url',     e.ref ->> 'source_url',
      'ctwa_clid',      e.ref ->> 'ctwa_clid',
      'headline',       e.ref ->> 'headline',
      'body',           e.ref ->> 'body',
      'media_type',     e.ref ->> 'media_type',
      'image_url',      e.ref ->> 'image_url',
      'video_url',      e.ref ->> 'video_url',
      'thumbnail_url',  e.ref ->> 'thumbnail_url',
      'welcome_message', e.ref -> 'welcome_message'
    )),
    e.first_message_at,
    e.source_message_id
  FROM eligible e
  ON CONFLICT (conversation_id) DO NOTHING
  RETURNING id, conversation_id, meta_ad_id
)
SELECT
  (SELECT COUNT(*) FROM neura.chat_messages m
     JOIN neura.chat_conversations c ON c.id = m.conversation_id
     JOIN neura.chat_channels ch ON ch.id = c.channel_id
     WHERE m.from_me = false AND ch.provider = 'ycloud')                AS mensajes_escaneados,
  (SELECT COUNT(*) FROM neura.chat_messages m
     JOIN neura.chat_conversations c ON c.id = m.conversation_id
     JOIN neura.chat_channels ch ON ch.id = c.channel_id
     WHERE m.from_me = false AND ch.provider = 'ycloud'
       AND m.raw_payload -> 'whatsappInboundMessage' ? 'referral')      AS mensajes_con_referral,
  (SELECT COUNT(*) FROM eligible)                                       AS conversaciones_unicas_con_referral,
  (SELECT COUNT(*) FROM inserted)                                       AS atribuciones_creadas,
  (SELECT COUNT(*) FROM eligible) - (SELECT COUNT(*) FROM inserted)     AS existentes_ignoradas,
  (SELECT COUNT(*) FROM neura.chat_conversation_attribution)            AS total_en_tabla;

COMMIT;

\echo
\echo '=== Top anuncios detectados en chat_conversation_attribution ==='
SELECT
  meta_ad_id,
  left(meta_headline, 60) AS headline,
  COUNT(*) AS conversaciones,
  MIN((first_message_at AT TIME ZONE 'America/Asuncion')::date) AS primer,
  MAX((first_message_at AT TIME ZONE 'America/Asuncion')::date) AS ultimo
FROM neura.chat_conversation_attribution
WHERE empresa_id = '9fd29108-4b0f-4faf-9eee-c509f6227d47'
GROUP BY meta_ad_id, meta_headline
ORDER BY 3 DESC
LIMIT 15;

\echo
\echo '=== Distribución por provider ==='
SELECT provider, COUNT(*) FROM neura.chat_conversation_attribution
GROUP BY provider ORDER BY 2 DESC;
SQL
