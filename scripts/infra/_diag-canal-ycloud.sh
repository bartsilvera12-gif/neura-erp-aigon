#!/usr/bin/env bash
set -e

echo "############################################################"
echo "# PASO 3 — Config de canales YCloud en neura (sin secretos) #"
echo "############################################################"

docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  id::text                           AS channel_id,
  provider,
  type,
  connection_mode,
  activo,
  config_status,
  (config ? 'ycloud_api_key')          AS api_key_set,
  (config ? 'ycloud_sender_id')        AS sender_set,
  (config ? 'ycloud_channel_id')       AS channel_external_set,
  (config ? 'webhook_secret')          AS webhook_secret_set,
  (config ? 'ycloud_business_account_id') AS biz_acct_set,
  config ->> 'ycloud_sender_id'        AS sender_id_visible,
  config ->> 'ycloud_channel_id'       AS channel_external_visible,
  COALESCE(provider_channel_id, '(null)') AS provider_channel_id,
  created_at::date                    AS creado,
  updated_at::date                    AS actualizado
FROM neura.chat_channels
WHERE provider = 'ycloud'
ORDER BY created_at;
"

echo
echo "--- Claves disponibles en config (estructura visible, sin valores secretos) ---"
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  id::text AS channel_id,
  jsonb_object_keys(config) AS config_keys
FROM neura.chat_channels
WHERE provider = 'ycloud'
ORDER BY id, config_keys;
"

echo
echo "############################################################"
echo "# Último mensaje inbound REAL del último mes (con channel)  #"
echo "############################################################"

docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  (m.created_at AT TIME ZONE 'America/Asuncion')::timestamp AS recibido_py,
  m.message_type,
  c.channel_id::text                                        AS channel_id,
  ch.provider                                                AS provider,
  ch.connection_mode                                         AS mode,
  COALESCE(ch.config ->> 'ycloud_sender_id', '(null)')       AS sender_id
FROM neura.chat_messages m
JOIN neura.chat_conversations c ON c.id = m.conversation_id
LEFT JOIN neura.chat_channels  ch ON ch.id = c.channel_id
WHERE m.from_me = false
  AND m.created_at >= now() - INTERVAL '30 days'
ORDER BY m.created_at DESC
LIMIT 5;
"

echo
echo "############################################################"
echo "# Outbound (mensajes salientes desde Neura) últimos 30 días #"
echo "############################################################"
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  (m.created_at AT TIME ZONE 'America/Asuncion')::date AS fecha_py,
  COUNT(*) AS outbound
FROM neura.chat_messages m
WHERE m.from_me = true
  AND m.created_at >= now() - INTERVAL '30 days'
GROUP BY 1 ORDER BY 1 DESC LIMIT 15;
"
