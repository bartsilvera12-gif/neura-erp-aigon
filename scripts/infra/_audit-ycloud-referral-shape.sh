#!/usr/bin/env bash
set -e
echo "=== 1) Sample real de mensaje YCloud CON referral (payload completo) ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT jsonb_pretty(m.raw_payload) AS payload
FROM neura.chat_messages m
JOIN neura.chat_conversations c ON c.id = m.conversation_id
JOIN neura.chat_channels ch ON ch.id = c.channel_id
WHERE m.from_me = false
  AND ch.provider = 'ycloud'
  AND m.raw_payload -> 'whatsappInboundMessage' ? 'referral'
ORDER BY m.created_at DESC
LIMIT 2;
"

echo
echo "=== 2) Claves DENTRO de referral (frecuencia) ==="
docker exec supabase-db psql -U postgres -d postgres -c "
WITH ref AS (
  SELECT m.raw_payload -> 'whatsappInboundMessage' -> 'referral' AS r
  FROM neura.chat_messages m
  JOIN neura.chat_conversations c ON c.id = m.conversation_id
  JOIN neura.chat_channels ch ON ch.id = c.channel_id
  WHERE m.from_me = false
    AND ch.provider = 'ycloud'
    AND m.raw_payload -> 'whatsappInboundMessage' ? 'referral'
)
SELECT jsonb_object_keys(r) AS keys, COUNT(*) AS msgs
FROM ref
GROUP BY 1
ORDER BY 2 DESC;
"

echo
echo "=== 3) Sample de los valores reales por campo (sin truncar) ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  m.raw_payload -> 'whatsappInboundMessage' -> 'referral' ->> 'sourceId'   AS sourceId,
  m.raw_payload -> 'whatsappInboundMessage' -> 'referral' ->> 'sourceType' AS sourceType,
  m.raw_payload -> 'whatsappInboundMessage' -> 'referral' ->> 'sourceUrl'  AS sourceUrl,
  m.raw_payload -> 'whatsappInboundMessage' -> 'referral' ->> 'source_id'  AS source_id_snake,
  m.raw_payload -> 'whatsappInboundMessage' -> 'referral' ->> 'ctwaClid'   AS ctwaClid,
  m.raw_payload -> 'whatsappInboundMessage' -> 'referral' ->> 'ctwa_clid'  AS ctwa_clid_snake,
  left(m.raw_payload -> 'whatsappInboundMessage' -> 'referral' ->> 'headline', 50) AS headline,
  (m.created_at AT TIME ZONE 'America/Asuncion')::timestamp AS recibido_py
FROM neura.chat_messages m
JOIN neura.chat_conversations c ON c.id = m.conversation_id
JOIN neura.chat_channels ch ON ch.id = c.channel_id
WHERE m.from_me = false
  AND ch.provider = 'ycloud'
  AND m.raw_payload -> 'whatsappInboundMessage' ? 'referral'
ORDER BY m.created_at DESC
LIMIT 10;
"

echo
echo "=== 4) Anuncios CTWA distintos detectados (top 15 por volumen) ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  COALESCE(
    m.raw_payload -> 'whatsappInboundMessage' -> 'referral' ->> 'sourceId',
    m.raw_payload -> 'whatsappInboundMessage' -> 'referral' ->> 'source_id'
  ) AS source_id,
  COALESCE(
    m.raw_payload -> 'whatsappInboundMessage' -> 'referral' ->> 'sourceType',
    m.raw_payload -> 'whatsappInboundMessage' -> 'referral' ->> 'source_type'
  ) AS source_type,
  left(m.raw_payload -> 'whatsappInboundMessage' -> 'referral' ->> 'headline', 60) AS headline,
  COUNT(*) AS mensajes,
  MIN((m.created_at AT TIME ZONE 'America/Asuncion')::date) AS primero,
  MAX((m.created_at AT TIME ZONE 'America/Asuncion')::date) AS ultimo
FROM neura.chat_messages m
JOIN neura.chat_conversations c ON c.id = m.conversation_id
JOIN neura.chat_channels ch ON ch.id = c.channel_id
WHERE m.from_me = false
  AND ch.provider = 'ycloud'
  AND m.raw_payload -> 'whatsappInboundMessage' ? 'referral'
GROUP BY 1,2,3
ORDER BY 4 DESC
LIMIT 15;
"
