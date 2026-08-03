#!/usr/bin/env bash
set -e
echo "=== Server NOW (UTC y PY) ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT now() AS utc, (now() AT TIME ZONE 'America/Asuncion')::timestamp AS py;
"

echo
echo "=== Cualquier mensaje (inbound u outbound) en últimos 30 minutos ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  m.id::text AS msg_id,
  m.from_me,
  m.sender_type,
  m.message_type,
  (m.created_at AT TIME ZONE 'America/Asuncion')::timestamp AS recibido_py,
  c.channel_id::text AS channel_id,
  ch.config ->> 'ycloud_sender_id' AS sender_id
FROM neura.chat_messages m
LEFT JOIN neura.chat_conversations c ON c.id = m.conversation_id
LEFT JOIN neura.chat_channels      ch ON ch.id = c.channel_id
WHERE m.created_at >= now() - INTERVAL '30 minutes'
ORDER BY m.created_at DESC
LIMIT 20;
"

echo
echo "=== Inbound más reciente (last_message_at, sin importar fecha) ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  m.id::text AS msg_id,
  (m.created_at AT TIME ZONE 'America/Asuncion')::timestamp AS recibido_py,
  m.from_me,
  m.sender_type,
  m.message_type,
  c.channel_id::text AS channel_id,
  ch.config ->> 'ycloud_sender_id' AS sender_id
FROM neura.chat_messages m
LEFT JOIN neura.chat_conversations c ON c.id = m.conversation_id
LEFT JOIN neura.chat_channels      ch ON ch.id = c.channel_id
WHERE m.from_me = false
ORDER BY m.created_at DESC
LIMIT 3;
"

echo
echo "=== last_message_at por canal en últimas 24h ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  c.channel_id::text AS channel_id,
  ch.config ->> 'ycloud_sender_id' AS sender_id,
  COUNT(*) AS conversaciones_movidas,
  MAX((c.last_message_at AT TIME ZONE 'America/Asuncion')::timestamp) AS ultimo_movimiento_py
FROM neura.chat_conversations c
LEFT JOIN neura.chat_channels ch ON ch.id = c.channel_id
WHERE c.last_message_at >= now() - INTERVAL '24 hours'
GROUP BY c.channel_id, ch.config ->> 'ycloud_sender_id'
ORDER BY ultimo_movimiento_py DESC;
"
