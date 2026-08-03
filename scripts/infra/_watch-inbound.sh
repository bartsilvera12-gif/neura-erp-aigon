#!/usr/bin/env bash
# Watcher: detecta el primer mensaje inbound nuevo en neura.chat_messages
# (any from_me=false con created_at >= ahora). Sale apenas detecta uno o tras 25 minutos.
set -e

START="$(docker exec supabase-db psql -U postgres -d postgres -tAc "SELECT to_char(now(), 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')")"
echo "watcher_start_utc=${START}"

ATTEMPTS=50
for i in $(seq 1 $ATTEMPTS); do
  HIT=$(docker exec supabase-db psql -U postgres -d postgres -tAc "
    SELECT
      json_build_object(
        'count', COUNT(*),
        'first', (
          SELECT json_build_object(
            'msg_id', m.id::text,
            'created_at_utc', m.created_at,
            'created_at_py', (m.created_at AT TIME ZONE 'America/Asuncion')::timestamp,
            'channel_id', c.channel_id::text,
            'provider', ch.provider,
            'sender_id', ch.config ->> 'ycloud_sender_id',
            'message_type', m.message_type,
            'has_referral', (m.raw_payload ? 'referral'),
            'meta_ad_id', m.raw_payload -> 'referral' ->> 'source_id'
          )
          FROM neura.chat_messages m
          LEFT JOIN neura.chat_conversations c ON c.id = m.conversation_id
          LEFT JOIN neura.chat_channels      ch ON ch.id = c.channel_id
          WHERE m.from_me = false AND m.created_at > '${START}'
          ORDER BY m.created_at ASC LIMIT 1
        )
      )
    FROM neura.chat_messages m
    WHERE m.from_me = false AND m.created_at > '${START}';
  ")
  COUNT=$(echo "$HIT" | grep -oE '"count" : [0-9]+' | grep -oE '[0-9]+$')
  TS=$(date -u +%H:%M:%S)
  if [ "${COUNT:-0}" -gt 0 ]; then
    echo "[$TS] DETECTADO inbound nuevo (intento $i):"
    echo "$HIT"
    exit 0
  fi
  echo "[$TS] intento $i: sin inbound nuevo"
  sleep 30
done

echo "TIMEOUT: 25 minutos sin inbound desde watcher_start_utc=${START}"
echo "Conclusión: YCloud no entregó NINGÚN webhook al ERP en este período."
