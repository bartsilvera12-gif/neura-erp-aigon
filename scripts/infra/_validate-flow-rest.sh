#!/usr/bin/env bash
set -e

echo "=== Columnas reales de chat_contacts ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT column_name FROM information_schema.columns
WHERE table_schema='neura' AND table_name='chat_contacts'
ORDER BY ordinal_position;
"

echo
echo "=== 3) Contactos movidos en últimos 15 min ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  ct.id::text                                                    AS contact_id,
  left(ct.phone_number, 4) || '***' || right(ct.phone_number, 2) AS tel,
  ct.name,
  (ct.created_at AT TIME ZONE 'America/Asuncion')::timestamp     AS creado_py,
  (ct.updated_at AT TIME ZONE 'America/Asuncion')::timestamp     AS actualizado_py,
  ct.crm_prospecto_id::text                                       AS prospecto_id,
  CASE WHEN ct.created_at >= now() - INTERVAL '15 minutes'
       THEN 'NUEVO' ELSE 'YA EXISTIA' END                         AS estado
FROM neura.chat_contacts ct
WHERE ct.updated_at >= now() - INTERVAL '15 minutes'
   OR ct.created_at >= now() - INTERVAL '15 minutes'
ORDER BY COALESCE(ct.updated_at, ct.created_at) DESC
LIMIT 10;
"

echo
echo "=== 4) Prospectos CRM creados/actualizados ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  numero_control,
  contacto,
  left(telefono, 4) || '***' || right(telefono, 2)             AS tel,
  origen_creacion,
  (fecha_creacion AT TIME ZONE 'America/Asuncion')::timestamp  AS creado_py,
  first_conversation_id::text                                  AS first_conv_id,
  responsable
FROM neura.crm_prospectos
WHERE fecha_creacion >= now() - INTERVAL '15 minutes'
ORDER BY fecha_creacion DESC
LIMIT 10;
"

echo
echo "=== 5) Atribución Meta de los últimos mensajes ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  conversation_id::text  AS conv_id,
  meta_ad_id,
  meta_source_type,
  left(meta_headline, 40) AS headline,
  (captured_at AT TIME ZONE 'America/Asuncion')::timestamp AS captured_py
FROM neura.chat_conversation_attribution
WHERE captured_at >= now() - INTERVAL '60 minutes'
ORDER BY captured_at DESC;
"

echo
echo "=== 6) Healthcheck final ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  (SELECT COUNT(*) FROM neura.chat_messages WHERE created_at >= now() - INTERVAL '15 minutes' AND from_me=false) AS inbound_15min,
  (SELECT COUNT(*) FROM neura.chat_messages WHERE created_at >= now() - INTERVAL '15 minutes' AND from_me=true)  AS outbound_15min,
  (SELECT COUNT(*) FROM neura.chat_conversations WHERE last_message_at >= now() - INTERVAL '15 minutes')         AS conv_15min,
  (SELECT COUNT(*) FROM neura.chat_contacts WHERE created_at >= now() - INTERVAL '15 minutes')                   AS contactos_nuevos_15min,
  (SELECT COUNT(*) FROM neura.crm_prospectos WHERE fecha_creacion >= now() - INTERVAL '15 minutes')              AS prosp_nuevos_15min,
  (SELECT COUNT(*) FROM neura.chat_conversation_attribution WHERE captured_at >= now() - INTERVAL '15 minutes')  AS atribuciones_15min;
"
