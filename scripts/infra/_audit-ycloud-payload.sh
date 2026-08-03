#!/usr/bin/env bash
set -e
echo "=== 1) Estructura general del raw_payload YCloud (claves top-level) ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  jsonb_object_keys(m.raw_payload) AS top_keys,
  COUNT(*) AS msgs
FROM neura.chat_messages m
JOIN neura.chat_conversations c ON c.id = m.conversation_id
JOIN neura.chat_channels ch ON ch.id = c.channel_id
WHERE m.from_me = false
  AND ch.provider = 'ycloud'
  AND m.created_at >= now() - INTERVAL '24 hours'
GROUP BY 1
ORDER BY 2 DESC;
"

echo
echo "=== 2) Claves dentro de whatsappInboundMessage ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  jsonb_object_keys(m.raw_payload -> 'whatsappInboundMessage') AS keys_inbound,
  COUNT(*) AS msgs
FROM neura.chat_messages m
JOIN neura.chat_conversations c ON c.id = m.conversation_id
JOIN neura.chat_channels ch ON ch.id = c.channel_id
WHERE m.from_me = false
  AND ch.provider = 'ycloud'
  AND m.created_at >= now() - INTERVAL '24 hours'
GROUP BY 1
ORDER BY 2 DESC;
"

echo
echo "=== 3) ¿Existe referral en algún mensaje YCloud histórico? ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  COUNT(*) FILTER (WHERE m.raw_payload ? 'referral')                                       AS top_referral,
  COUNT(*) FILTER (WHERE m.raw_payload -> 'whatsappInboundMessage' ? 'referral')          AS inbound_referral,
  COUNT(*) FILTER (WHERE m.raw_payload -> 'whatsappInboundMessage' ? 'context')           AS inbound_context,
  COUNT(*) FILTER (WHERE m.raw_payload -> 'whatsappInboundMessage' ? 'source')            AS inbound_source,
  COUNT(*) FILTER (WHERE m.raw_payload -> 'whatsappInboundMessage' ? 'ctwa_clid')         AS inbound_ctwa,
  COUNT(*) FILTER (WHERE m.raw_payload -> 'whatsappInboundMessage' ? 'ad')                AS inbound_ad,
  COUNT(*) FILTER (WHERE m.raw_payload -> 'whatsappInboundMessage' ? 'campaign')          AS inbound_campaign,
  COUNT(*) FILTER (WHERE m.raw_payload -> 'whatsappInboundMessage' ? 'external_ad_reply') AS inbound_external_ad,
  COUNT(*) AS total
FROM neura.chat_messages m
JOIN neura.chat_conversations c ON c.id = m.conversation_id
JOIN neura.chat_channels ch ON ch.id = c.channel_id
WHERE m.from_me = false AND ch.provider = 'ycloud';
"

echo
echo "=== 4) Búsqueda profunda: ¿alguno trae substring 'referral' o 'ctwa' o 'ad_id' en el JSON crudo? ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  COUNT(*) FILTER (WHERE m.raw_payload::text ILIKE '%referral%')        AS has_referral_text,
  COUNT(*) FILTER (WHERE m.raw_payload::text ILIKE '%ctwa%')            AS has_ctwa_text,
  COUNT(*) FILTER (WHERE m.raw_payload::text ILIKE '%source_id%')       AS has_source_id_text,
  COUNT(*) FILTER (WHERE m.raw_payload::text ILIKE '%source_type%')     AS has_source_type_text,
  COUNT(*) FILTER (WHERE m.raw_payload::text ILIKE '%ad_id%')           AS has_ad_id_text,
  COUNT(*) FILTER (WHERE m.raw_payload::text ILIKE '%external_ad%')     AS has_external_ad_text,
  COUNT(*) FILTER (WHERE m.raw_payload::text ILIKE '%campaign_id%')     AS has_campaign_id_text,
  COUNT(*) FILTER (WHERE m.raw_payload::text ILIKE '%headline%')        AS has_headline_text,
  COUNT(*) FILTER (WHERE m.raw_payload::text ILIKE '%clickToWhatsapp%') AS has_ctwa_camel,
  COUNT(*) FILTER (WHERE m.raw_payload::text ILIKE '%adContext%')       AS has_adContext_camel,
  COUNT(*) AS total
FROM neura.chat_messages m
JOIN neura.chat_conversations c ON c.id = m.conversation_id
JOIN neura.chat_channels ch ON ch.id = c.channel_id
WHERE m.from_me = false AND ch.provider = 'ycloud';
"

echo
echo "=== 5) Sample real: payload completo de un mensaje YCloud TEXT del último día ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT jsonb_pretty(m.raw_payload) AS payload_completo
FROM neura.chat_messages m
JOIN neura.chat_conversations c ON c.id = m.conversation_id
JOIN neura.chat_channels ch ON ch.id = c.channel_id
WHERE m.from_me = false
  AND ch.provider = 'ycloud'
  AND m.message_type = 'text'
  AND m.created_at >= now() - INTERVAL '6 hours'
ORDER BY m.created_at DESC
LIMIT 1;
"
