#!/usr/bin/env bash
set -e

echo "########################################################"
echo "# F) Query del resolveCrmProspectosSchemaForTenant      #"
echo "#    aplicada a 'neura' (lo que hace la función internam)#"
echo "########################################################"

docker exec supabase-db psql -U postgres -d postgres -c "
-- Paso 1: ¿hay FK chat_contacts.crm_prospecto_id → crm_prospectos en algún schema?
SELECT rn.nspname::text AS ref_ns
FROM pg_constraint c
JOIN pg_class cf ON cf.oid = c.conrelid
JOIN pg_namespace tn ON tn.oid = cf.relnamespace
JOIN pg_attribute a ON a.attrelid = cf.oid AND a.attnum = ANY (c.conkey) AND NOT a.attisdropped
JOIN pg_class rt ON rt.oid = c.confrelid
JOIN pg_namespace rn ON rn.oid = rt.relnamespace
WHERE c.contype = 'f'
  AND tn.nspname::text = 'neura'
  AND cf.relname = 'chat_contacts'
  AND a.attname = 'crm_prospecto_id'
  AND rt.relname = 'crm_prospectos'
LIMIT 1;
"
echo "-- (si esto devuelve filas: ref_ns = ese schema. Si vacío: NO hay FK)"

echo
echo "########################################################"
echo "# G) ¿Existe neura.crm_prospectos? (fallback table_in_tenant)"
echo "########################################################"
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT EXISTS (
  SELECT 1 FROM information_schema.tables t
  WHERE t.table_schema = 'neura' AND t.table_type = 'BASE TABLE' AND t.table_name = 'crm_prospectos'
) AS existe_neura_crm_prospectos;
"

echo
echo "########################################################"
echo "# H) Validador assertAllowedChatDataSchema('neura')     #"
echo "#    El código solo permite: 'public', SUPABASE_APP_SCHEMA,"
echo "#    'erp_*' o 'er_<32hex>'. 'neura' NO matchea ninguno  #"
echo "#    salvo que APP_DB_SCHEMA=neura esté en env del runtime"
echo "########################################################"
echo "Verificá manualmente en Coolify → ERP Neura → Environment Variables:"
echo "  ¿APP_DB_SCHEMA=neura está seteada?"
echo "  ¿SUPABASE_DB_URL o DIRECT_URL está seteada?"
echo ""
echo "Si APP_DB_SCHEMA NO está → assertAllowedChatDataSchema('neura') lanza."
echo "Si SUPABASE_DB_URL SÍ está → getChatPostgresPool() devuelve Pool (no null)."
echo ""
echo "El escenario problemático: SUPABASE_DB_URL presente (pool!=null) +"
echo "APP_DB_SCHEMA ausente → ensureWhatsappInboundCrmLeadPg lanza throw silencioso."

echo
echo "########################################################"
echo "# I) Histórico: cuándo dejó de funcionar el resolver    #"
echo "#    Buscamos último prospecto antes/después del 5-jun  #"
echo "########################################################"
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT
  numero_control,
  creado_por,
  (fecha_creacion AT TIME ZONE 'America/Asuncion')::timestamp AS creado_py
FROM neura.crm_prospectos
WHERE origen_creacion = 'whatsapp'
ORDER BY fecha_creacion DESC
LIMIT 1;
"
docker exec supabase-db psql -U postgres -d postgres -c "
-- Primero del año (para ver cuándo arrancó el flujo)
SELECT
  numero_control,
  creado_por,
  (fecha_creacion AT TIME ZONE 'America/Asuncion')::timestamp AS creado_py
FROM neura.crm_prospectos
WHERE origen_creacion = 'whatsapp'
ORDER BY fecha_creacion ASC
LIMIT 1;
"
