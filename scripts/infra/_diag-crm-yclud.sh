#!/usr/bin/env bash
set -e

echo "########################################################"
echo "# A) Contactos nuevos de hoy (post-fix) sin prospecto  #"
echo "########################################################"
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  ct.id::text                                                   AS contact_id,
  left(ct.phone_number, 4) || '***' || right(ct.phone_number, 2) AS tel,
  ct.name,
  (ct.created_at AT TIME ZONE 'America/Asuncion')::timestamp    AS creado_py,
  ct.crm_prospecto_id::text                                     AS prospecto_id,
  ct.empresa_id::text                                           AS empresa_id,
  -- conversación asociada
  conv.id::text                                                 AS conversation_id,
  conv.channel_id::text                                         AS channel_id,
  ch.provider                                                   AS provider
FROM neura.chat_contacts ct
LEFT JOIN neura.chat_conversations conv ON conv.contact_id = ct.id
LEFT JOIN neura.chat_channels      ch   ON ch.id = conv.channel_id
WHERE ct.created_at >= now() - INTERVAL '30 minutes'
ORDER BY ct.created_at DESC;
"

echo
echo "########################################################"
echo "# B) Prospectos por origen_creacion últimos 30 días    #"
echo "########################################################"
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  origen_creacion,
  COUNT(*) AS total,
  MIN((fecha_creacion AT TIME ZONE 'America/Asuncion')::date) AS primera,
  MAX((fecha_creacion AT TIME ZONE 'America/Asuncion')::date) AS ultima
FROM neura.crm_prospectos
WHERE fecha_creacion >= now() - INTERVAL '30 days'
GROUP BY origen_creacion
ORDER BY total DESC;
"

echo
echo "########################################################"
echo "# C) ¿Hay prospecto ya creado por teléfono que se      #"
echo "#    podría vincular a estos contactos huérfanos?      #"
echo "########################################################"
docker exec supabase-db psql -U postgres -d postgres -c "
WITH huerfanos AS (
  SELECT id, phone_number, phone_normalized
  FROM neura.chat_contacts
  WHERE created_at >= now() - INTERVAL '30 minutes'
    AND crm_prospecto_id IS NULL
)
SELECT
  h.id::text                                       AS contact_id,
  left(h.phone_number, 4) || '***'                  AS tel_short,
  p.id::text                                       AS prospecto_existente_id,
  p.numero_control,
  (p.fecha_creacion AT TIME ZONE 'America/Asuncion')::date AS prospecto_creado_py
FROM huerfanos h
LEFT JOIN neura.crm_prospectos p
  ON regexp_replace(p.telefono, '\D', '', 'g') = h.phone_normalized
ORDER BY h.id;
"

echo
echo "########################################################"
echo "# D) Últimos 5 prospectos whatsapp (cómo se ven)       #"
echo "########################################################"
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  numero_control,
  contacto,
  left(telefono, 4) || '***' AS tel,
  origen_creacion,
  origen_detalle,
  responsable,
  empresa_id::text AS empresa_id,
  creado_por,
  first_conversation_id::text AS first_conv_id,
  (fecha_creacion AT TIME ZONE 'America/Asuncion')::timestamp AS creado_py
FROM neura.crm_prospectos
WHERE origen_creacion = 'whatsapp'
ORDER BY fecha_creacion DESC
LIMIT 5;
"

echo
echo "########################################################"
echo "# E) Cuántas conversaciones había con el último        #"
echo "#    contacto creado el 5-jun (referencia)             #"
echo "########################################################"
docker exec supabase-db psql -U postgres -d postgres -c "
WITH ult AS (
  SELECT id, phone_number, crm_prospecto_id, created_at
  FROM neura.chat_contacts
  WHERE created_at::date = '2026-06-05'
  ORDER BY created_at DESC LIMIT 3
)
SELECT
  u.id::text AS contact_id,
  left(u.phone_number,4)||'***' AS tel,
  u.crm_prospecto_id::text       AS prospecto_id,
  (u.created_at AT TIME ZONE 'America/Asuncion')::timestamp AS contact_creado_py
FROM ult u;
"
