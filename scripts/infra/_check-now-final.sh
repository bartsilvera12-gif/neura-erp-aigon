#!/usr/bin/env bash
set -e
START="2026-06-16T15:02:42Z"
echo "=== Estado ahora vs deploy fix ${START} ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  now() AS server_now_utc,
  (SELECT COUNT(*) FROM neura.chat_messages WHERE from_me=false AND created_at > '${START}') AS inbound_post_fix,
  (SELECT COUNT(*) FROM neura.chat_contacts WHERE created_at > '${START}') AS contactos_nuevos_post_fix,
  (SELECT COUNT(*) FROM neura.chat_contacts WHERE created_at > '${START}' AND crm_prospecto_id IS NOT NULL) AS con_prospecto,
  (SELECT COUNT(*) FROM neura.chat_contacts WHERE created_at > '${START}' AND crm_prospecto_id IS NULL) AS huerfanos,
  (SELECT COUNT(*) FROM neura.crm_prospectos WHERE fecha_creacion > '${START}') AS prospectos_post_fix;
"
echo
echo "=== Total contactos huerfanos HOY (debe ser 0) ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  COUNT(*) AS huerfanos_hoy
FROM neura.chat_contacts
WHERE created_at::date = '2026-06-16'
  AND crm_prospecto_id IS NULL;
"
echo
echo "=== Detalle si hay contactos post-fix ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  ct.id::text AS contact_id,
  left(ct.phone_number,4)||'***'||right(ct.phone_number,2) AS tel,
  ct.name,
  ct.crm_prospecto_id::text AS prospecto_id,
  (ct.created_at AT TIME ZONE 'America/Asuncion')::timestamp AS creado_py
FROM neura.chat_contacts ct
WHERE ct.created_at > '${START}'
ORDER BY ct.created_at DESC LIMIT 10;
"
