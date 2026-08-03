#!/usr/bin/env bash
# QA post-fix APP_DB_SCHEMA=neura. Ejecuta los 6 checks del plan.
set -e
SCH=neura

echo "########################################################"
echo "# QA 1) Contactos nuevos en últimos 5 min               #"
echo "########################################################"
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  ct.id::text                                                    AS contact_id,
  left(ct.phone_number, 4) || '***' || right(ct.phone_number, 2) AS tel,
  ct.name,
  (ct.created_at AT TIME ZONE 'America/Asuncion')::timestamp     AS creado_py,
  ct.crm_prospecto_id::text                                       AS prospecto_id,
  CASE WHEN ct.crm_prospecto_id IS NOT NULL THEN '✓ VINCULADO' ELSE '✗ HUÉRFANO' END AS estado
FROM ${SCH}.chat_contacts ct
WHERE ct.created_at >= now() - INTERVAL '5 minutes'
ORDER BY ct.created_at DESC;
"

echo
echo "########################################################"
echo "# QA 2) Prospectos creados en últimos 5 min             #"
echo "########################################################"
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  numero_control,
  contacto,
  left(telefono, 4) || '***'                                  AS tel,
  origen_creacion,
  creado_por,
  first_conversation_id IS NOT NULL                           AS tiene_first_conv,
  (fecha_creacion AT TIME ZONE 'America/Asuncion')::timestamp AS creado_py
FROM ${SCH}.crm_prospectos
WHERE fecha_creacion >= now() - INTERVAL '5 minutes'
ORDER BY fecha_creacion DESC;
"

echo
echo "########################################################"
echo "# QA 3) ¿Hay contacto nuevo SIN prospecto? (debería ser 0)"
echo "########################################################"
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  COUNT(*) AS contactos_nuevos_sin_prospecto
FROM ${SCH}.chat_contacts
WHERE created_at >= now() - INTERVAL '5 minutes'
  AND crm_prospecto_id IS NULL;
"

echo
echo "########################################################"
echo "# QA 4) Mensajes inbound últimos 5 min                  #"
echo "########################################################"
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  m.id::text AS msg_id,
  (m.created_at AT TIME ZONE 'America/Asuncion')::timestamp AS recibido_py,
  m.message_type,
  c.channel_id::text AS channel_id,
  ch.provider AS provider
FROM ${SCH}.chat_messages m
LEFT JOIN ${SCH}.chat_conversations c ON c.id = m.conversation_id
LEFT JOIN ${SCH}.chat_channels      ch ON ch.id = c.channel_id
WHERE m.from_me = false AND m.created_at >= now() - INTERVAL '5 minutes'
ORDER BY m.created_at DESC LIMIT 10;
"

echo
echo "########################################################"
echo "# QA 5) Idempotencia: ningún contacto debe tener 2+ prospectos"
echo "########################################################"
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  ct.phone_number,
  COUNT(p.id) AS prospectos_con_mismo_telefono
FROM ${SCH}.chat_contacts ct
JOIN ${SCH}.crm_prospectos p
  ON regexp_replace(p.telefono, '\D', '', 'g') = ct.phone_normalized
WHERE ct.created_at >= now() - INTERVAL '5 minutes'
GROUP BY ct.phone_number
HAVING COUNT(p.id) > 1;
"
echo "(filas=0 esperado)"
