#!/usr/bin/env bash
set -e
echo "=== Mensajes inbound DESPUÉS del backfill (post 09:59:46 PY) ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  m.id::text                                                AS msg_id,
  (m.created_at AT TIME ZONE 'America/Asuncion')::timestamp AS recibido_py,
  m.message_type,
  c.contact_id::text                                        AS contact_id,
  c.channel_id::text                                        AS channel_id
FROM neura.chat_messages m
LEFT JOIN neura.chat_conversations c ON c.id = m.conversation_id
WHERE m.from_me = false
  AND m.created_at > '2026-06-16 13:59:46+00'
ORDER BY m.created_at DESC
LIMIT 10;
"

echo
echo "=== Contactos creados DESPUÉS del backfill — ¿auto-crearon prospecto? ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  ct.id::text                                                AS contact_id,
  left(ct.phone_number,4)||'***'||right(ct.phone_number,2)   AS tel,
  ct.name,
  (ct.created_at AT TIME ZONE 'America/Asuncion')::timestamp AS contact_creado_py,
  ct.crm_prospecto_id::text                                  AS prospecto_id,
  CASE WHEN ct.crm_prospecto_id IS NOT NULL THEN 'AUTO_PROSPECTO' ELSE 'HUERFANO' END AS estado
FROM neura.chat_contacts ct
WHERE ct.created_at > '2026-06-16 13:59:46+00'
ORDER BY ct.created_at DESC
LIMIT 10;
"

echo
echo "=== Prospectos AUTO-creados después del backfill (deberían tener creado_py > 09:59:46) ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  p.numero_control,
  p.contacto,
  left(p.telefono,4)||'***'||right(p.telefono,2) AS tel,
  p.first_conversation_id::text                  AS first_conv_id,
  p.creado_por,
  (p.fecha_creacion AT TIME ZONE 'America/Asuncion')::timestamp AS creado_py
FROM neura.crm_prospectos p
WHERE p.fecha_creacion > '2026-06-16 13:59:46+00'
ORDER BY p.fecha_creacion DESC
LIMIT 10;
"
