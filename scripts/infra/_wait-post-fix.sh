#!/usr/bin/env bash
# Detecta primer contacto nuevo POST 15:02:42 UTC (post deploy fix 1f16a38)
set -e
START="2026-06-16T15:02:42Z"
echo "Esperando contacto nuevo > $START..."

for i in $(seq 1 25); do
  STATS=$(docker exec supabase-db psql -U postgres -d postgres -tAc "
    SELECT json_build_object(
      'contactos_nuevos', (SELECT COUNT(*) FROM neura.chat_contacts WHERE created_at > '${START}'),
      'con_prospecto',    (SELECT COUNT(*) FROM neura.chat_contacts WHERE created_at > '${START}' AND crm_prospecto_id IS NOT NULL),
      'huerfanos',        (SELECT COUNT(*) FROM neura.chat_contacts WHERE created_at > '${START}' AND crm_prospecto_id IS NULL)
    )
  ")
  TS=$(date -u +%H:%M:%S)
  echo "[$TS] intento $i: $STATS"
  CON_P=$(echo "$STATS" | grep -oE '"con_prospecto":[0-9]+' | grep -oE '[0-9]+$')
  HUE=$(echo "$STATS" | grep -oE '"huerfanos":[0-9]+' | grep -oE '[0-9]+$')
  if [ "${CON_P:-0}" -gt 0 ]; then
    echo "=========================================="
    echo "FIX CONFIRMADO: contacto nuevo CON prospecto"
    echo "=========================================="
    docker exec supabase-db psql -U postgres -d postgres -c "
      SELECT
        ct.id::text                                                AS contact_id,
        left(ct.phone_number,4)||'***'||right(ct.phone_number,2)   AS tel,
        ct.name,
        ct.crm_prospecto_id::text                                  AS prospecto_id,
        p.numero_control,
        p.first_conversation_id::text                              AS first_conv_id,
        (ct.created_at AT TIME ZONE 'America/Asuncion')::timestamp AS contact_creado_py,
        (p.fecha_creacion AT TIME ZONE 'America/Asuncion')::timestamp AS prosp_creado_py
      FROM neura.chat_contacts ct
      LEFT JOIN neura.crm_prospectos p ON p.id = ct.crm_prospecto_id
      WHERE ct.created_at > '${START}'
      ORDER BY ct.created_at DESC LIMIT 5;
    "
    exit 0
  fi
  if [ "${HUE:-0}" -gt 0 ]; then
    echo "[$TS] hay huerfano post-deploy — fix NO surtió"
  fi
  sleep 45
done
echo "TIMEOUT: 18 min sin mensaje nuevo post-deploy"
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT COUNT(*) FROM neura.chat_contacts WHERE created_at > '${START}';
"
