#!/usr/bin/env bash
# =============================================================================
# Contact Center V1 — smoke test funcional (NO destructivo: BEGIN ... ROLLBACK).
# Ejecutar en la VPS:  py scripts/infra/ssh-run-file.py scripts/infra/_cc_v1_smoke.sh
# Requiere las migraciones 20260626120000 + 20260626121000 aplicadas en `neura`.
# Corre los escenarios contra datos reales pero revierte todo al final.
# La prueba de CONCURRENCIA real (2 sesiones) está en _cc_v1_concurrency_test.sh.
# No imprime secretos. Solo toca el schema `neura` (+ funciones en `public`).
# =============================================================================
set -euo pipefail
docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 -X -P pager=off <<'SQL'
SET search_path = neura, public;

\echo '=== 0) Estructuras creadas ==='
SELECT to_regclass('neura.contact_center_settings')      AS settings,
       to_regclass('neura.cc_daily_assignment_counter')  AS counter,
       to_regclass('neura.agent_device_tokens')          AS device_tokens,
       to_regclass('neura.agent_notification_events')    AS notif_events;
SELECT proname FROM pg_proc WHERE proname IN ('cc_assign_conversation','cc_reassign_on_sla','cc_assert_schema') ORDER BY 1;

\echo ''
\echo '=== 0.b) CONFIRMACION: el loop solo creo objetos en neura (tablas) y public (funciones) ==='
SELECT n.nspname AS schema, c.relname AS tabla
FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE c.relname IN ('contact_center_settings','cc_daily_assignment_counter','agent_device_tokens','agent_notification_events')
  AND c.relkind = 'r'
ORDER BY 1,2;
DO $$
DECLARE v_bad int;
BEGIN
  SELECT count(*) INTO v_bad
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname IN ('contact_center_settings','cc_daily_assignment_counter','agent_device_tokens','agent_notification_events')
    AND c.relkind = 'r' AND n.nspname <> 'neura';
  IF v_bad > 0 THEN RAISE EXCEPTION 'FALLO: hay % tabla(s) CC fuera de neura', v_bad; END IF;
  RAISE NOTICE 'OK: todas las tablas CC viven solo en neura';
END $$;
SELECT n.nspname AS schema, p.proname AS funcion
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE p.proname IN ('cc_assert_schema','cc_assign_conversation','cc_reassign_on_sla')
ORDER BY 2,1;

\echo ''
\echo '=== 1) Columnas nuevas en chat_conversations ==='
SELECT column_name FROM information_schema.columns
WHERE table_schema='neura' AND table_name='chat_conversations'
  AND column_name IN ('last_customer_message_at','last_agent_message_at','whatsapp_window_expires_at',
                      'sla_due_at','sla_minutes','needs_template_response',
                      'contact_center_scope_type','contact_center_scope_id')
ORDER BY 1;

\echo ''
\echo '=== 2) Validador de schema rechaza lo no permitido (espera 2 excepciones controladas) ==='
DO $$
BEGIN
  BEGIN PERFORM public.cc_assert_schema('pg_catalog'); RAISE EXCEPTION 'NO debería aceptar pg_catalog';
  EXCEPTION WHEN others THEN RAISE NOTICE 'OK rechazó pg_catalog: %', SQLERRM; END;
  BEGIN PERFORM public.cc_assert_schema('neura; drop table x'); RAISE EXCEPTION 'NO debería aceptar injection';
  EXCEPTION WHEN others THEN RAISE NOTICE 'OK rechazó injection'; END;
  RAISE NOTICE 'cc_assert_schema(neura) = %', public.cc_assert_schema('neura');
END $$;

\echo ''
\echo '=== 3) Idempotencia: una conversación ya asignada no se reasigna ni duplica evento ==='
BEGIN;
  -- toma una conversación asignada real (si existe) y reintenta asignar
  DO $$
  DECLARE v_emp uuid; v_conv uuid; v_res jsonb; v_ev_before int; v_ev_after int;
  BEGIN
    SELECT empresa_id, id INTO v_emp, v_conv FROM neura.chat_conversations
    WHERE assigned_agent_id IS NOT NULL LIMIT 1;
    IF v_conv IS NULL THEN RAISE NOTICE 'sin conversaciones asignadas para probar idempotencia'; RETURN; END IF;
    SELECT count(*) INTO v_ev_before FROM neura.chat_routing_events WHERE conversation_id=v_conv;
    v_res := public.cc_assign_conversation('neura', v_emp, v_conv);
    SELECT count(*) INTO v_ev_after FROM neura.chat_routing_events WHERE conversation_id=v_conv;
    RAISE NOTICE 'idempotencia: res=% eventos_antes=% eventos_despues=% (deben ser iguales)', v_res, v_ev_before, v_ev_after;
    IF v_ev_after <> v_ev_before THEN RAISE EXCEPTION 'FALLO: se duplicó evento en idempotencia'; END IF;
  END $$;
ROLLBACK;

\echo ''
\echo '=== 4) Reasignación SLA: solo aplica si vencida + sin 1ra respuesta (dry, ROLLBACK) ==='
BEGIN;
  DO $$
  DECLARE v_emp uuid; v_conv uuid; v_res jsonb;
  BEGIN
    SELECT empresa_id, id INTO v_emp, v_conv FROM neura.chat_conversations
    WHERE assigned_agent_id IS NOT NULL AND first_human_response_at IS NULL
      AND status IN ('open','pending') LIMIT 1;
    IF v_conv IS NULL THEN RAISE NOTICE 'sin candidata para SLA'; RETURN; END IF;
    -- forzar vencimiento en una copia transaccional
    UPDATE neura.chat_conversations SET sla_due_at = now() - interval '1 min' WHERE id=v_conv;
    v_res := public.cc_reassign_on_sla('neura', v_emp, v_conv);
    RAISE NOTICE 'reassign_on_sla = %', v_res;
  END $$;
ROLLBACK;

\echo ''
\echo '=== 5) Conteo diario vacío inicialmente para hoy (informativo) ==='
SELECT scope_type, count(*) AS filas, sum(count) AS total
FROM neura.cc_daily_assignment_counter
WHERE dia_local = (now() AT TIME ZONE 'America/Asuncion')::date
GROUP BY 1 ORDER BY 1;

\echo ''
\echo '=== SMOKE OK (todo lo de prueba quedó en ROLLBACK; nada persistido) ==='
SQL
