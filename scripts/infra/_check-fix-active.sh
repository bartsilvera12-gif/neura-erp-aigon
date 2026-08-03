#!/usr/bin/env bash
set -e
echo "=== Último contacto creado (post-redeploy) — ¿tiene prospecto? ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  ct.id::text                                                AS contact_id,
  left(ct.phone_number,4)||'***'||right(ct.phone_number,2)   AS tel,
  ct.name,
  (ct.created_at AT TIME ZONE 'America/Asuncion')::timestamp AS contact_creado_py,
  ct.crm_prospecto_id::text                                  AS prospecto_id,
  CASE WHEN ct.crm_prospecto_id IS NOT NULL THEN '✓ PROSPECTO' ELSE 'HUÉRFANO' END AS estado
FROM neura.chat_contacts ct
WHERE ct.created_at >= now() - INTERVAL '15 minutes'
ORDER BY ct.created_at DESC
LIMIT 5;
"

echo
echo "=== Prospectos creados en últimos 15 min ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  p.numero_control,
  p.contacto,
  left(p.telefono,4)||'***'||right(p.telefono,2)               AS tel,
  p.origen_creacion,
  p.creado_por,
  p.first_conversation_id::text                                AS first_conv_id,
  (p.fecha_creacion AT TIME ZONE 'America/Asuncion')::timestamp AS prospecto_creado_py
FROM neura.crm_prospectos p
WHERE p.fecha_creacion >= now() - INTERVAL '15 minutes'
ORDER BY p.fecha_creacion DESC;
"

echo
echo "=== Mensajes inbound últimos 15 min ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  m.id::text AS msg_id,
  (m.created_at AT TIME ZONE 'America/Asuncion')::timestamp AS recibido_py,
  m.conversation_id::text AS conv_id,
  m.message_type
FROM neura.chat_messages m
WHERE m.from_me = false AND m.created_at >= now() - INTERVAL '15 minutes'
ORDER BY m.created_at DESC
LIMIT 10;
"
