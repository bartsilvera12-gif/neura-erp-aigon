#!/usr/bin/env bash
set -e

echo "===================================================================="
echo "DIAGNOSTICO Meta Ads vs ERP — schema neura — fecha actual del server"
echo "===================================================================="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT now() AS server_now_utc,
       current_setting('TimeZone') AS server_tz,
       date_trunc('day', now() AT TIME ZONE 'America/Asuncion')::date AS hoy_py;
"

echo
echo "############################################"
echo "# 1) MENSAJES INBOUND HOY (zona Asunción)  #"
echo "############################################"

echo "--- 1.a) Total inbound hoy ---"
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  COUNT(*)                                                  AS inbound_total_hoy,
  COUNT(*) FILTER (WHERE raw_payload ? 'referral')          AS con_referral,
  COUNT(*) FILTER (WHERE raw_payload -> 'referral' ? 'ctwa_clid') AS con_ctwa_clid
FROM neura.chat_messages
WHERE from_me = false
  AND (created_at AT TIME ZONE 'America/Asuncion')::date
      = (now() AT TIME ZONE 'America/Asuncion')::date;
"

echo "--- 1.b) Por provider/canal hoy ---"
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  COALESCE(ch.provider, '(unknown)')               AS provider,
  COALESCE(ch.type, '(unknown)')                   AS channel_type,
  ch.id::text                                      AS channel_id,
  COUNT(m.id)                                      AS mensajes_hoy
FROM neura.chat_messages m
LEFT JOIN neura.chat_conversations c ON c.id = m.conversation_id
LEFT JOIN neura.chat_channels      ch ON ch.id = c.channel_id
WHERE m.from_me = false
  AND (m.created_at AT TIME ZONE 'America/Asuncion')::date
      = (now() AT TIME ZONE 'America/Asuncion')::date
GROUP BY ch.provider, ch.type, ch.id
ORDER BY mensajes_hoy DESC;
"

echo "--- 1.c) Distribución por hora (Asunción) ---"
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  date_trunc('hour', m.created_at AT TIME ZONE 'America/Asuncion')::time AS hora_py,
  COUNT(*) AS mensajes
FROM neura.chat_messages m
WHERE m.from_me = false
  AND (m.created_at AT TIME ZONE 'America/Asuncion')::date
      = (now() AT TIME ZONE 'America/Asuncion')::date
GROUP BY 1
ORDER BY 1;
"

echo "--- 1.d) Últimos 20 mensajes inbound hoy (telefonos enmascarados) ---"
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  m.id::text                                                 AS message_id,
  m.conversation_id::text                                    AS conversation_id,
  (m.created_at AT TIME ZONE 'America/Asuncion')::timestamp  AS created_at_py,
  m.message_type,
  (m.raw_payload ? 'referral')                               AS has_referral,
  (m.raw_payload -> 'referral' ? 'ctwa_clid')                AS has_ctwa,
  m.raw_payload -> 'referral' ->> 'source_id'                AS meta_ad_id,
  left(coalesce(m.raw_payload -> 'referral' ->> 'headline',''), 60) AS headline
FROM neura.chat_messages m
WHERE m.from_me = false
  AND (m.created_at AT TIME ZONE 'America/Asuncion')::date
      = (now() AT TIME ZONE 'America/Asuncion')::date
ORDER BY m.created_at DESC
LIMIT 20;
"

echo
echo "###################################"
echo "# 2) CONVERSACIONES                #"
echo "###################################"

echo "--- 2.a) Conversaciones creadas hoy + last_message_at hoy ---"
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  (SELECT COUNT(*) FROM neura.chat_conversations c
    WHERE (c.created_at AT TIME ZONE 'America/Asuncion')::date
        = (now() AT TIME ZONE 'America/Asuncion')::date) AS creadas_hoy,
  (SELECT COUNT(*) FROM neura.chat_conversations c
    WHERE (c.last_message_at AT TIME ZONE 'America/Asuncion')::date
        = (now() AT TIME ZONE 'America/Asuncion')::date) AS con_last_msg_hoy;
"

echo "--- 2.b) Conversaciones de hoy por provider + con atribución Meta? ---"
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  COALESCE(ch.provider, '(unknown)')             AS provider,
  COUNT(*) AS conversaciones,
  COUNT(att.id) FILTER (WHERE att.id IS NOT NULL) AS con_atribucion_meta
FROM neura.chat_conversations c
LEFT JOIN neura.chat_channels                  ch  ON ch.id = c.channel_id
LEFT JOIN neura.chat_conversation_attribution  att ON att.conversation_id = c.id
WHERE (c.last_message_at AT TIME ZONE 'America/Asuncion')::date
    = (now() AT TIME ZONE 'America/Asuncion')::date
GROUP BY ch.provider
ORDER BY conversaciones DESC;
"

echo
echo "##############################"
echo "# 3) CONTACTOS WHATSAPP      #"
echo "##############################"

docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  (SELECT COUNT(*) FROM neura.chat_contacts
     WHERE (created_at AT TIME ZONE 'America/Asuncion')::date
         = (now() AT TIME ZONE 'America/Asuncion')::date) AS creados_hoy,
  (SELECT COUNT(*) FROM neura.chat_contacts
     WHERE updated_at IS NOT NULL
       AND (updated_at AT TIME ZONE 'America/Asuncion')::date
         = (now() AT TIME ZONE 'America/Asuncion')::date) AS actualizados_hoy,
  (SELECT COUNT(DISTINCT c.id)
     FROM neura.chat_contacts c
     JOIN neura.chat_conversations conv ON conv.contact_id = c.id
     JOIN neura.chat_messages m ON m.conversation_id = conv.id
    WHERE m.from_me = false
      AND (m.created_at AT TIME ZONE 'America/Asuncion')::date
          = (now() AT TIME ZONE 'America/Asuncion')::date) AS contactos_con_mensaje_hoy,
  (SELECT COUNT(*) FROM neura.chat_contacts
     WHERE crm_prospecto_id IS NOT NULL) AS contactos_con_prospecto_total,
  (SELECT COUNT(*) FROM neura.chat_contacts
     WHERE crm_prospecto_id IS NULL) AS contactos_sin_prospecto_total;
"

echo
echo "####################################"
echo "# 4) PROSPECTOS CRM HOY            #"
echo "####################################"

echo "--- 4.a) Resumen prospectos hoy ---"
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  COUNT(*) AS total_hoy,
  COUNT(*) FILTER (WHERE origen_creacion = 'whatsapp') AS desde_whatsapp_hoy,
  COUNT(*) FILTER (WHERE first_conversation_id IS NOT NULL) AS con_first_conv_hoy
FROM neura.crm_prospectos
WHERE (fecha_creacion AT TIME ZONE 'America/Asuncion')::date
    = (now() AT TIME ZONE 'America/Asuncion')::date;
"

echo "--- 4.b) Distribución por origen_creacion hoy ---"
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  COALESCE(origen_creacion, '(null)') AS origen,
  COUNT(*) AS cantidad
FROM neura.crm_prospectos
WHERE (fecha_creacion AT TIME ZONE 'America/Asuncion')::date
    = (now() AT TIME ZONE 'America/Asuncion')::date
GROUP BY origen_creacion
ORDER BY cantidad DESC;
"

echo "--- 4.c) Últimos 20 prospectos whatsapp (cualquier fecha) ---"
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  numero_control,
  contacto,
  left(telefono, 4) || '***' || right(telefono, 2) AS tel_masked,
  origen_creacion,
  (fecha_creacion AT TIME ZONE 'America/Asuncion')::timestamp AS creado_py,
  first_conversation_id IS NOT NULL AS tiene_first_conv
FROM neura.crm_prospectos
WHERE origen_creacion = 'whatsapp'
ORDER BY fecha_creacion DESC
LIMIT 20;
"

echo
echo "####################################################"
echo "# 5) CRUCE mensaje → contacto → prospecto (hoy)    #"
echo "####################################################"

docker exec supabase-db psql -U postgres -d postgres -c "
WITH msgs_hoy AS (
  SELECT m.id, m.conversation_id, m.created_at, m.raw_payload, c.contact_id, c.channel_id
  FROM neura.chat_messages m
  JOIN neura.chat_conversations c ON c.id = m.conversation_id
  WHERE m.from_me = false
    AND (m.created_at AT TIME ZONE 'America/Asuncion')::date
        = (now() AT TIME ZONE 'America/Asuncion')::date
)
SELECT
  msgs_hoy.id::text                          AS message_id,
  (msgs_hoy.created_at AT TIME ZONE 'America/Asuncion')::timestamp AS msg_at_py,
  msgs_hoy.conversation_id::text             AS conv_id,
  msgs_hoy.contact_id::text                  AS contact_id,
  left(ct.phone_number, 4) || '***' || right(ct.phone_number, 2) AS tel,
  ct.crm_prospecto_id::text                  AS prospecto_id,
  (p.fecha_creacion AT TIME ZONE 'America/Asuncion')::timestamp AS prosp_at_py,
  CASE WHEN p.id IS NOT NULL
        AND (p.fecha_creacion AT TIME ZONE 'America/Asuncion')::date
          = (now() AT TIME ZONE 'America/Asuncion')::date
       THEN 'sí' ELSE 'no' END AS prospecto_nuevo_hoy,
  (msgs_hoy.raw_payload ? 'referral') AS tiene_referral,
  msgs_hoy.raw_payload -> 'referral' ->> 'source_id' AS meta_ad_id
FROM msgs_hoy
LEFT JOIN neura.chat_contacts   ct ON ct.id = msgs_hoy.contact_id
LEFT JOIN neura.crm_prospectos  p  ON p.id  = ct.crm_prospecto_id
ORDER BY msgs_hoy.created_at DESC
LIMIT 30;
"

echo
echo "##############################################"
echo "# 6) ATRIBUCIÓN Campañas Meta                #"
echo "##############################################"

docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  (SELECT COUNT(*) FROM neura.chat_conversation_attribution) AS total,
  (SELECT COUNT(*) FROM neura.chat_conversation_attribution
    WHERE (captured_at AT TIME ZONE 'America/Asuncion')::date
        = (now() AT TIME ZONE 'America/Asuncion')::date) AS capturadas_hoy;
"

docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  meta_ad_id,
  left(meta_headline, 50) AS headline,
  (first_message_at AT TIME ZONE 'America/Asuncion')::timestamp AS first_msg_py,
  (captured_at      AT TIME ZONE 'America/Asuncion')::timestamp AS captured_py
FROM neura.chat_conversation_attribution
ORDER BY captured_at DESC NULLS LAST
LIMIT 20;
"

echo
echo "######################################"
echo "# 7) CANALES Meta configurados        #"
echo "######################################"

docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  id::text AS channel_id,
  provider,
  type,
  activo,
  config_status,
  connection_mode,
  CASE WHEN meta_phone_number_id IS NULL THEN '(null)'
       ELSE left(meta_phone_number_id, 4) || '***' || right(meta_phone_number_id, 4)
  END AS meta_phone_number_id_masked,
  created_at::date AS creado
FROM neura.chat_channels
ORDER BY provider, activo DESC;
"

echo
echo "############################################"
echo "# 8) Bonus: histórico reciente             #"
echo "############################################"

echo "--- 8.a) Inbound últimos 5 días (sanity check de tráfico) ---"
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  (created_at AT TIME ZONE 'America/Asuncion')::date AS fecha_py,
  COUNT(*) AS inbound
FROM neura.chat_messages
WHERE from_me = false
  AND created_at >= now() - INTERVAL '5 days'
GROUP BY 1 ORDER BY 1 DESC;
"

echo "--- 8.b) Prospectos creados últimos 5 días ---"
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  (fecha_creacion AT TIME ZONE 'America/Asuncion')::date AS fecha_py,
  COUNT(*) AS prospectos,
  COUNT(*) FILTER (WHERE origen_creacion='whatsapp') AS desde_whatsapp
FROM neura.crm_prospectos
WHERE fecha_creacion >= now() - INTERVAL '5 days'
GROUP BY 1 ORDER BY 1 DESC;
"
