#!/usr/bin/env bash
set -e

echo "############################################"
echo "# Outbound 1-9 jun: estado de entrega       #"
echo "############################################"

docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  (m.created_at AT TIME ZONE 'America/Asuncion')::date AS fecha_py,
  COALESCE(m.whatsapp_delivery_status, '(null)') AS delivery_status,
  COUNT(*) AS total
FROM neura.chat_messages m
WHERE m.from_me = true
  AND m.created_at >= '2026-06-01'
GROUP BY 1, 2
ORDER BY 1 DESC, 3 DESC;
"

echo
echo "############################################"
echo "# Último outbound real con datos completos  #"
echo "############################################"

docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  m.id::text AS msg_id,
  (m.created_at AT TIME ZONE 'America/Asuncion')::timestamp AS recibido_py,
  m.sender_type,
  m.message_type,
  m.whatsapp_delivery_status,
  c.channel_id::text AS channel_id,
  ch.config ->> 'ycloud_sender_id' AS sender
FROM neura.chat_messages m
LEFT JOIN neura.chat_conversations c ON c.id = m.conversation_id
LEFT JOIN neura.chat_channels      ch ON ch.id = c.channel_id
WHERE m.from_me = true
ORDER BY m.created_at DESC
LIMIT 10;
"

echo
echo "############################################"
echo "# Campañas WhatsApp salientes (qué generaba #"
echo "# los 200+ outbound/día en mayo/junio)      #"
echo "############################################"

docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  id::text AS campaign_id,
  COALESCE(name, '(sin nombre)') AS nombre,
  status,
  (created_at AT TIME ZONE 'America/Asuncion')::date AS creada_py,
  (updated_at AT TIME ZONE 'America/Asuncion')::date AS actualizada_py
FROM neura.chat_campaigns
WHERE created_at >= '2026-05-01'
ORDER BY updated_at DESC
LIMIT 20;
"

echo
echo "############################################"
echo "# Jobs de campañas (queue de envío)         #"
echo "############################################"

docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  status,
  COUNT(*) AS jobs,
  MIN(created_at) AS first_at,
  MAX(updated_at) AS last_at
FROM neura.chat_campaign_jobs
WHERE created_at >= '2026-05-15'
GROUP BY status
ORDER BY jobs DESC;
"

echo
echo "############################################"
echo "# Eventos campaign (history reciente)       #"
echo "############################################"

docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  event_type,
  COUNT(*) AS total,
  MAX((created_at AT TIME ZONE 'America/Asuncion')::timestamp) AS ultimo_py
FROM neura.chat_campaign_events
WHERE created_at >= '2026-05-15'
GROUP BY event_type
ORDER BY ultimo_py DESC NULLS LAST;
"

echo
echo "############################################"
echo "# Flow sessions activas / abandonadas       #"
echo "############################################"

docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  status,
  COUNT(*) AS sesiones,
  MAX((last_activity_at AT TIME ZONE 'America/Asuncion')::timestamp) AS ultima_actividad_py
FROM neura.chat_flow_sessions
WHERE last_activity_at >= '2026-05-15'
GROUP BY status
ORDER BY ultima_actividad_py DESC NULLS LAST;
"

echo
echo "############################################"
echo "# Resolver dominio sistemas.neura.com.py    #"
echo "############################################"

getent hosts sistemas.neura.com.py 2>&1 || nslookup sistemas.neura.com.py 8.8.8.8 2>&1 || true
echo
echo "--- Coolify VPS conocido: 34.193.107.9 (panel:8000) ---"
echo "--- Supabase VPS conocido: 187.77.247.54 ---"
