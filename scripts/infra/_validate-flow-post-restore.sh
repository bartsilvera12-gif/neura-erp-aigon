#!/usr/bin/env bash
set -e
echo "============================================================"
echo "VALIDACION POST-RESTORE: mensaje → contacto → conversación →"
echo "                          prospecto → atribución Meta        "
echo "============================================================"

echo
echo "=== 1) Último inbound (post fix YCloud URL) ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  m.id::text                                                AS msg_id,
  (m.created_at AT TIME ZONE 'America/Asuncion')::timestamp AS recibido_py,
  m.from_me,
  m.sender_type,
  m.message_type,
  c.channel_id::text                                        AS channel_id,
  ch.config ->> 'ycloud_sender_id'                          AS sender_id,
  ch.provider                                                AS provider,
  (m.raw_payload ? 'referral')                              AS has_referral,
  m.raw_payload -> 'referral' ->> 'source_id'               AS meta_ad_id
FROM neura.chat_messages m
LEFT JOIN neura.chat_conversations c ON c.id = m.conversation_id
LEFT JOIN neura.chat_channels      ch ON ch.id = c.channel_id
WHERE m.from_me = false
ORDER BY m.created_at DESC
LIMIT 5;
"

echo
echo "=== 2) Conversación actualizada (last_message_at) ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  c.id::text                                                  AS conv_id,
  (c.last_message_at AT TIME ZONE 'America/Asuncion')::timestamp AS last_msg_py,
  c.unread_count,
  c.status,
  c.contact_id::text                                          AS contact_id,
  c.channel_id::text                                          AS channel_id
FROM neura.chat_conversations c
WHERE c.last_message_at >= now() - INTERVAL '15 minutes'
ORDER BY c.last_message_at DESC
LIMIT 5;
"

echo
echo "=== 3) Contacto (¿nuevo o actualizado?) ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  ct.id::text                                                  AS contact_id,
  left(ct.phone_number, 4) || '***' || right(ct.phone_number, 2) AS tel_masked,
  ct.display_name,
  (ct.created_at AT TIME ZONE 'America/Asuncion')::timestamp   AS creado_py,
  (ct.updated_at AT TIME ZONE 'America/Asuncion')::timestamp   AS actualizado_py,
  ct.crm_prospecto_id::text                                    AS prospecto_id,
  CASE WHEN ct.created_at >= now() - INTERVAL '15 minutes'
       THEN 'NUEVO HOY'
       ELSE 'YA EXISTIA' END                                    AS estado
FROM neura.chat_contacts ct
WHERE ct.updated_at >= now() - INTERVAL '15 minutes'
   OR ct.created_at >= now() - INTERVAL '15 minutes'
ORDER BY COALESCE(ct.updated_at, ct.created_at) DESC
LIMIT 5;
"

echo
echo "=== 4) Prospecto CRM nuevo (si corresponde) ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  numero_control,
  contacto,
  left(telefono, 4) || '***' || right(telefono, 2)             AS tel_masked,
  origen_creacion,
  (fecha_creacion AT TIME ZONE 'America/Asuncion')::timestamp  AS creado_py,
  first_conversation_id::text                                  AS first_conv_id,
  responsable
FROM neura.crm_prospectos
WHERE fecha_creacion >= now() - INTERVAL '15 minutes'
ORDER BY fecha_creacion DESC
LIMIT 5;
"

echo
echo "=== 5) Atribución Meta (¿llegó algún referral?) ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  conversation_id::text  AS conv_id,
  meta_ad_id,
  meta_source_type,
  left(meta_headline, 40) AS headline,
  (captured_at AT TIME ZONE 'America/Asuncion')::timestamp AS captured_py
FROM neura.chat_conversation_attribution
WHERE captured_at >= now() - INTERVAL '15 minutes'
ORDER BY captured_at DESC;
"

echo
echo "=== 6) Healthcheck final ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  (SELECT COUNT(*) FROM neura.chat_messages WHERE created_at >= now() - INTERVAL '15 minutes' AND from_me=false) AS inbound_ultimos_15min,
  (SELECT COUNT(*) FROM neura.chat_messages WHERE created_at >= now() - INTERVAL '15 minutes' AND from_me=true)  AS outbound_ultimos_15min,
  (SELECT COUNT(*) FROM neura.chat_conversations WHERE last_message_at >= now() - INTERVAL '15 minutes')         AS conv_movidas_15min,
  (SELECT COUNT(*) FROM neura.crm_prospectos WHERE fecha_creacion >= now() - INTERVAL '15 minutes')              AS prosp_nuevos_15min,
  (SELECT COUNT(*) FROM neura.chat_conversation_attribution WHERE captured_at >= now() - INTERVAL '15 minutes')  AS atribuciones_15min;
"
