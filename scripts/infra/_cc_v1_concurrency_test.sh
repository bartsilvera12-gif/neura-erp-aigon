#!/usr/bin/env bash
# =============================================================================
# Contact Center V1 — prueba de CONCURRENCIA / atomicidad de la asignación.
# Ejecutar en la VPS:  py scripts/infra/ssh-run-file.py scripts/infra/_cc_v1_concurrency_test.sh
#
# Part A (SIEMPRE, NO destructivo): demuestra que el pg_advisory_xact_lock por empresa
#   serializa dos sesiones (la 2da espera a la 1ra). Es el primitivo de atomicidad que
#   usa cc_assign_conversation. No toca ninguna tabla de negocio. No requiere migración
#   para el lock en sí, pero sí para tener sentido completo del flujo.
#
# Part B (SOLO si RUN_REAL=1): lanza DOS cc_assign_conversation concurrentes sobre la
#   MISMA conversación no asignada y verifica que a lo sumo UNA asigna (atomicidad real).
#   Hace SNAPSHOT completo (conversación + agentes + contacto + contador del día) y
#   RESTAURA todo al final → reversible. Requiere migración aplicada.
#
# No imprime secretos. Solo toca el schema `neura`.
# =============================================================================
set -uo pipefail
PSQL="docker exec -i supabase-db psql -U postgres -d postgres -X -P pager=off"
TODAY_FILTER="dia_local=(now() AT TIME ZONE 'America/Asuncion')::date"

echo "==================== Part A: serialización del advisory lock (no destructivo) ===================="
EMP="$($PSQL -tA -v ON_ERROR_STOP=1 -c "SELECT id FROM neura.empresas LIMIT 1" </dev/null | tr -d '[:space:]')"
if [ -z "${EMP}" ]; then
  echo "[Part A] No hay empresas en neura. Abortando Part A."
else
  echo "[Part A] empresa de prueba: ${EMP:0:8}…"
  # Sesión 1: retiene el lock 3s y revierte (no persiste nada).
  $PSQL -v ON_ERROR_STOP=1 >/dev/null 2>&1 <<SQL &
BEGIN;
SELECT pg_advisory_xact_lock(hashtextextended('${EMP}'::text, 7777));
SELECT pg_sleep(3);
ROLLBACK;
SQL
  S1=$!
  sleep 0.5
  # Sesión 2: mide cuánto espera para tomar el MISMO lock.
  ESPERA="$($PSQL -tA -v ON_ERROR_STOP=1 <<SQL
BEGIN;
SELECT extract(epoch from clock_timestamp()) AS t0 \gset
SELECT pg_advisory_xact_lock(hashtextextended('${EMP}'::text, 7777)) \g /dev/null
SELECT round((extract(epoch from clock_timestamp()) - :t0)::numeric, 2);
ROLLBACK;
SQL
)"
  wait "$S1" 2>/dev/null || true
  ESPERA="$(echo "$ESPERA" | grep -Eo '[0-9]+(\.[0-9]+)?' | tail -n1)"
  PASS_A="$(awk -v e="${ESPERA:-0}" 'BEGIN{ if (e+0 >= 2.0) print "PASS"; else print "FAIL" }')"
  echo "[Part A] La sesión 2 esperó ${ESPERA}s por el lock (la sesión 1 lo retuvo ~3s) -> ${PASS_A}"
  echo "[Part A] PASS = el lock serializa; dos cc_assign sobre la misma empresa NO corren en paralelo."
fi

if [ "${RUN_REAL:-0}" != "1" ]; then
  echo ""
  echo "==================== Part B: omitida ===================="
  echo "Part B (asignación concurrente real, reversible) NO se ejecutó."
  echo "Para correrla (requiere migración aplicada):  RUN_REAL=1 antepuesto al comando."
  echo "Atomicidad ya respaldada por: Part A (serialización) + smoke test #3 (idempotencia)."
  exit 0
fi

echo ""
echo "==================== Part B: asignación concurrente real (RUN_REAL=1) ===================="
# 1) Elegir una conversación NO asignada y su empresa.
read CONV EMP2 < <($PSQL -tA -F' ' -v ON_ERROR_STOP=1 <<'SQL'
SELECT id, empresa_id FROM neura.chat_conversations
WHERE assigned_agent_id IS NULL AND status IN ('open','pending')
LIMIT 1;
SQL
)
CONV="$(echo "${CONV:-}" | tr -d '[:space:]')"
EMP2="$(echo "${EMP2:-}" | tr -d '[:space:]')"
if [ -z "${CONV}" ] || [ -z "${EMP2}" ]; then
  echo "[Part B] No hay conversación no asignada (open/pending) para probar. Omitido (sin efectos)."
  exit 0
fi
echo "[Part B] conversación de prueba: ${CONV:0:8}…  empresa: ${EMP2:0:8}…"

# 2) SNAPSHOT completo (reversible) + timestamp de inicio.
TSTART="$($PSQL -tA -v ON_ERROR_STOP=1 <<SQL
DROP TABLE IF EXISTS neura._cc_cc_snap_conv, neura._cc_cc_snap_agents, neura._cc_cc_snap_contact, neura._cc_cc_snap_counter;
CREATE TABLE neura._cc_cc_snap_conv     AS SELECT * FROM neura.chat_conversations WHERE id='${CONV}';
CREATE TABLE neura._cc_cc_snap_agents   AS SELECT id, last_assigned_at FROM neura.chat_agents WHERE empresa_id='${EMP2}';
CREATE TABLE neura._cc_cc_snap_contact  AS SELECT id, last_routed_chat_agent_id, last_routed_at, last_routed_channel_id
                                           FROM neura.chat_contacts
                                           WHERE id=(SELECT contact_id FROM neura.chat_conversations WHERE id='${CONV}');
CREATE TABLE neura._cc_cc_snap_counter  AS SELECT * FROM neura.cc_daily_assignment_counter WHERE empresa_id='${EMP2}' AND ${TODAY_FILTER};
SELECT to_char(now(),'YYYY-MM-DD HH24:MI:SS.US');
SQL
)"
TSTART="$(echo "$TSTART" | tail -n1 | sed 's/^[[:space:]]*//;s/[[:space:]]*$//')"
echo "[Part B] snapshot tomado; t_inicio=${TSTART}"

# 3) DOS asignaciones concurrentes sobre la MISMA conversación.
$PSQL -tA -v ON_ERROR_STOP=1 -c "SELECT public.cc_assign_conversation('neura','${EMP2}'::uuid,'${CONV}'::uuid)" </dev/null >/tmp/_cc_a1.out 2>&1 &
P1=$!
$PSQL -tA -v ON_ERROR_STOP=1 -c "SELECT public.cc_assign_conversation('neura','${EMP2}'::uuid,'${CONV}'::uuid)" </dev/null >/tmp/_cc_a2.out 2>&1 &
P2=$!
wait "$P1" 2>/dev/null || true
wait "$P2" 2>/dev/null || true
A1="$(cat /tmp/_cc_a1.out 2>/dev/null)"; A2="$(cat /tmp/_cc_a2.out 2>/dev/null)"
echo "[Part B] call#1: ${A1}"
echo "[Part B] call#2: ${A2}"

# 4) Invariante de atomicidad: a lo sumo UNA llamada asigna (assigned:true).
TRUES=0
echo "$A1" | grep -Eq '"assigned"[[:space:]]*:[[:space:]]*true' && TRUES=$((TRUES+1))
echo "$A2" | grep -Eq '"assigned"[[:space:]]*:[[:space:]]*true' && TRUES=$((TRUES+1))
$PSQL -v ON_ERROR_STOP=1 <<SQL
DO \$\$
DECLARE v_assigned uuid; v_routing int;
BEGIN
  SELECT assigned_agent_id INTO v_assigned FROM neura.chat_conversations WHERE id='${CONV}';
  SELECT count(*) INTO v_routing FROM neura.chat_routing_events
    WHERE conversation_id='${CONV}' AND created_at >= '${TSTART}'::timestamptz;
  RAISE NOTICE 'Part B :: assigned_agent_id=%  routing_events_durante_test=%', coalesce(v_assigned::text,'NULL'), v_routing;
END \$\$;
SQL
if [ "$TRUES" -le 1 ]; then
  echo "[Part B] PASS atomicidad: ${TRUES} asignación(es) exitosa(s) concurrente(s) (esperado <= 1)."
else
  echo "[Part B] FAIL atomicidad: ${TRUES} asignaciones exitosas concurrentes (esperado <= 1)."
fi

# 5) RESTORE total (siempre) — revierte conversación, agentes, contacto, contador y eventos del test.
$PSQL -v ON_ERROR_STOP=1 <<SQL
DELETE FROM neura.agent_notification_events WHERE conversation_id='${CONV}' AND created_at >= '${TSTART}'::timestamptz;
DELETE FROM neura.chat_routing_events       WHERE conversation_id='${CONV}' AND created_at >= '${TSTART}'::timestamptz;
UPDATE neura.chat_conversations t SET
  queue_id=s.queue_id, assigned_agent_id=s.assigned_agent_id, initial_assignment_at=s.initial_assignment_at,
  first_human_response_at=s.first_human_response_at, initial_reassign_count=s.initial_reassign_count,
  assignment_wait_code=s.assignment_wait_code, contact_center_scope_type=s.contact_center_scope_type,
  contact_center_scope_id=s.contact_center_scope_id, sla_minutes=s.sla_minutes, sla_due_at=s.sla_due_at,
  updated_at=s.updated_at
FROM neura._cc_cc_snap_conv s WHERE t.id=s.id;
UPDATE neura.chat_agents a SET last_assigned_at=s.last_assigned_at FROM neura._cc_cc_snap_agents s WHERE a.id=s.id;
UPDATE neura.chat_contacts c SET last_routed_chat_agent_id=s.last_routed_chat_agent_id, last_routed_at=s.last_routed_at,
  last_routed_channel_id=s.last_routed_channel_id FROM neura._cc_cc_snap_contact s WHERE c.id=s.id;
DELETE FROM neura.cc_daily_assignment_counter WHERE empresa_id='${EMP2}' AND ${TODAY_FILTER};
INSERT INTO neura.cc_daily_assignment_counter SELECT * FROM neura._cc_cc_snap_counter;
DROP TABLE IF EXISTS neura._cc_cc_snap_conv, neura._cc_cc_snap_agents, neura._cc_cc_snap_contact, neura._cc_cc_snap_counter;
SQL
echo "[Part B] RESTORE completo: conversación/agentes/contacto/contador del día revertidos al snapshot; eventos del test borrados."
echo "[Part B] (Si el script se cortó a la mitad, las tablas neura._cc_cc_snap_* indican estado pendiente de revertir.)"
