#!/usr/bin/env bash
# =============================================================================
# Contact Center V1 — verificador de ESTADO en `neura` (READ-ONLY, no destructivo).
# Ejecutar:  py scripts/infra/ssh-run-file.py scripts/infra/_cc_v1_verify_state.sh
# Sirve para:
#   - ANTES de aplicar / tras un rollback: tablas y funciones NO deben existir (NULL / 0).
#   - DESPUÉS de aplicar: deben existir + columnas nuevas = 8 + conteos de control intactos.
# No imprime secretos. Solo lee el schema `neura` (+ funciones en `public`).
# =============================================================================
set -euo pipefail
docker exec -i supabase-db psql -U postgres -d postgres -X -P pager=off -v ON_ERROR_STOP=1 <<'SQL'
\echo '== Tablas CC en neura (NULL = no existe) =='
SELECT to_regclass('neura.contact_center_settings')     AS settings,
       to_regclass('neura.cc_daily_assignment_counter') AS counter,
       to_regclass('neura.agent_device_tokens')         AS device_tokens,
       to_regclass('neura.agent_notification_events')   AS notif_events;
\echo '== Funciones CC en public (0 = no existen) =='
SELECT count(*) AS funcs_cc FROM pg_proc
WHERE proname IN ('cc_assert_schema','cc_assign_conversation','cc_reassign_on_sla');
\echo '== Columnas nuevas en chat_conversations (0 = aun no aplicado; 8 = aplicado) =='
SELECT count(*) AS cols_nuevas FROM information_schema.columns
WHERE table_schema='neura' AND table_name='chat_conversations'
  AND column_name IN ('last_customer_message_at','last_agent_message_at','whatsapp_window_expires_at',
                      'sla_due_at','sla_minutes','needs_template_response',
                      'contact_center_scope_type','contact_center_scope_id');
\echo '== Conteos de control (deben coincidir con el backup: conv=1269, agents=2) =='
SELECT 'chat_conversations' AS tabla, count(*) AS filas FROM neura.chat_conversations
UNION ALL SELECT 'chat_agents' AS tabla, count(*) AS filas FROM neura.chat_agents
ORDER BY 1;
SQL
