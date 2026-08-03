#!/usr/bin/env bash
# Espera deploy nuevo + corre QA automático.
# Plan: cada 30s pollea NEW contacts sin prospecto. Mientras siga apareciendo, deploy viejo.
# Cuando un contacto NUEVO entre CON prospecto_id seteado, deploy nuevo activo.
set -e

START="$(docker exec supabase-db psql -U postgres -d postgres -tAc "SELECT to_char(now(), 'YYYY-MM-DD\"T\"HH24:MI:SS.MS\"Z\"')")"
echo "waiter_start=${START}"
echo "Esperando: que llegue un mensaje NUEVO post-deploy y se cree prospecto."
echo "Si llega contacto SIN prospecto desde ${START}, deploy viejo todavía."
echo "Si llega contacto CON prospecto desde ${START}, deploy nuevo activo."

for i in $(seq 1 40); do
  TS=$(date -u +%H:%M:%S)
  STATS=$(docker exec supabase-db psql -U postgres -d postgres -tAc "
    SELECT json_build_object(
      'inbound_post',     (SELECT COUNT(*) FROM neura.chat_messages WHERE created_at > '${START}' AND from_me=false),
      'contacts_post',    (SELECT COUNT(*) FROM neura.chat_contacts WHERE created_at > '${START}'),
      'contacts_huerfanos', (SELECT COUNT(*) FROM neura.chat_contacts WHERE created_at > '${START}' AND crm_prospecto_id IS NULL),
      'contacts_con_prospecto', (SELECT COUNT(*) FROM neura.chat_contacts WHERE created_at > '${START}' AND crm_prospecto_id IS NOT NULL),
      'prospectos_post',  (SELECT COUNT(*) FROM neura.crm_prospectos WHERE fecha_creacion > '${START}')
    )
  ")
  CON_P=$(echo "$STATS" | grep -oE '"contacts_con_prospecto" : [0-9]+' | grep -oE '[0-9]+$')
  INB=$(echo "$STATS" | grep -oE '"inbound_post" : [0-9]+' | grep -oE '[0-9]+$')
  HUE=$(echo "$STATS" | grep -oE '"contacts_huerfanos" : [0-9]+' | grep -oE '[0-9]+$')
  echo "[$TS] intento $i: $STATS"

  if [ "${CON_P:-0}" -gt 0 ]; then
    echo
    echo "==================================================="
    echo "✓ DEPLOY NUEVO ACTIVO — contacto creado CON prospecto"
    echo "==================================================="
    docker exec supabase-db psql -U postgres -d postgres -c "
      SELECT
        ct.id::text                                                AS contact_id,
        left(ct.phone_number,4)||'***'||right(ct.phone_number,2)   AS tel,
        ct.name,
        ct.crm_prospecto_id::text                                  AS prospecto_id,
        p.numero_control,
        p.first_conversation_id IS NOT NULL                        AS tiene_first_conv,
        (ct.created_at AT TIME ZONE 'America/Asuncion')::timestamp AS creado_py
      FROM neura.chat_contacts ct
      LEFT JOIN neura.crm_prospectos p ON p.id = ct.crm_prospecto_id
      WHERE ct.created_at > '${START}'
      ORDER BY ct.created_at DESC LIMIT 10;
    "
    exit 0
  fi

  if [ "${INB:-0}" -gt 0 ] && [ "${HUE:-0}" -gt 0 ] && [ "$i" -gt 6 ]; then
    # Llegaron mensajes pero siguen huérfanos después de 3 min — deploy viejo aún sirviendo
    echo "[$TS] aún recibiendo con prospecto NULL (deploy viejo o fix no surtió)"
  fi
  sleep 30
done

echo "TIMEOUT: 20 minutos sin confirmación de deploy nuevo"
docker exec supabase-db psql -U postgres -d postgres -c "
  SELECT COUNT(*) FROM neura.chat_contacts
   WHERE created_at > '${START}' AND crm_prospecto_id IS NULL;
"
