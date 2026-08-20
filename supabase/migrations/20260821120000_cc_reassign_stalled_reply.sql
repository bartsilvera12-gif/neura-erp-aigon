-- =============================================================================
-- Contact Center — reasignación por SLA MID-CONVERSACIÓN
-- =============================================================================
-- La RPC `cc_reassign_on_sla` existente solo reasigna si el vendedor NUNCA
-- respondió al primer mensaje (first_human_response_at IS NULL). No cubre el
-- caso de un chat "activo" donde el vendedor ya respondió antes pero deja al
-- cliente colgado con un mensaje nuevo por más de `sla_minutes`.
--
-- Esta RPC (`cc_reassign_on_stalled_reply`) usa las columnas
-- `last_customer_message_at` y `last_agent_message_at` (ya existentes desde
-- Contact Center V1) para detectar exactamente eso.
--
-- Guardas:
--   - conversación asignada, abierta/pending
--   - último mensaje es del cliente (last_customer_message_at > last_agent_message_at
--     ó last_agent_message_at IS NULL)
--   - transcurrieron > sla_minutes desde ese mensaje del cliente
--
-- El resto de la lógica (elegir siguiente agente, actualizar conteos, etc.)
-- reutiliza el mismo patrón que `cc_reassign_on_sla`. Notar que NO tocamos
-- `first_human_response_at` (se mantiene el que ya estaba).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.cc_reassign_on_stalled_reply(
  p_schema text,
  p_empresa_id uuid,
  p_conversation_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog
AS $fn$
DECLARE
  sch                text := public.cc_assert_schema(p_schema);
  v_prev_agent       uuid;
  v_queue_id         uuid;
  v_channel_id       uuid;
  v_scope_type       text;
  v_scope_id         uuid;
  v_status           text;
  v_reassign_cnt     integer;
  v_max              integer := 2;
  v_sla_minutes      integer := 5;
  v_best             uuid;
  v_dia              date := (now() AT TIME ZONE 'America/Asuncion')::date;
  v_ts               timestamptz := now();
  v_sla_due          timestamptz;
  v_last_customer_at timestamptz;
  v_last_agent_at    timestamptz;
  v_stalled_since    timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_empresa_id::text, 7777));

  EXECUTE format(
    'SELECT assigned_agent_id, queue_id, channel_id, status,
            initial_reassign_count, contact_center_scope_type, contact_center_scope_id,
            sla_minutes, last_customer_message_at, last_agent_message_at
       FROM %I.chat_conversations WHERE id=$1 AND empresa_id=$2 FOR UPDATE', sch
  ) INTO v_prev_agent, v_queue_id, v_channel_id, v_status,
         v_reassign_cnt, v_scope_type, v_scope_id, v_sla_minutes,
         v_last_customer_at, v_last_agent_at
    USING p_conversation_id, p_empresa_id;

  -- Guards mid-convo: asignada, abierta, último mensaje del cliente sin
  -- respuesta y con >= sla_minutes de antigüedad.
  IF v_prev_agent IS NULL OR v_status NOT IN ('open','pending') THEN
    RETURN jsonb_build_object('reassigned', false, 'reason', 'not_eligible');
  END IF;
  IF v_last_customer_at IS NULL THEN
    RETURN jsonb_build_object('reassigned', false, 'reason', 'no_customer_message');
  END IF;
  IF v_last_agent_at IS NOT NULL AND v_last_agent_at >= v_last_customer_at THEN
    RETURN jsonb_build_object('reassigned', false, 'reason', 'agent_replied_after');
  END IF;

  -- Resolver sla_minutes por settings (empresa/canal/cola). Fallback 5.
  EXECUTE format(
    'SELECT sla_minutes FROM %I.contact_center_settings
       WHERE empresa_id=$1
       ORDER BY (queue_id=$2) DESC NULLS LAST, (channel_id=$3) DESC NULLS LAST,
                (queue_id IS NULL AND channel_id IS NULL) DESC
       LIMIT 1', sch
  ) INTO v_sla_minutes USING p_empresa_id, v_queue_id, v_channel_id;
  v_sla_minutes := coalesce(v_sla_minutes, 5);
  v_stalled_since := v_last_customer_at + make_interval(mins => v_sla_minutes);
  IF v_stalled_since > now() THEN
    RETURN jsonb_build_object('reassigned', false, 'reason', 'sla_not_expired');
  END IF;

  -- max_reassignments por settings.
  EXECUTE format(
    'SELECT max_reassignments FROM %I.contact_center_settings
       WHERE empresa_id=$1
       ORDER BY (queue_id=$2) DESC NULLS LAST, (channel_id=$3) DESC NULLS LAST,
                (queue_id IS NULL AND channel_id IS NULL) DESC
       LIMIT 1', sch
  ) INTO v_max USING p_empresa_id, v_queue_id, v_channel_id;
  v_max := coalesce(v_max, 2);
  v_scope_type := coalesce(v_scope_type, CASE WHEN v_queue_id IS NOT NULL THEN 'queue'
                                              WHEN v_channel_id IS NOT NULL THEN 'channel' ELSE 'empresa' END);
  v_scope_id := coalesce(v_scope_id, coalesce(v_queue_id, v_channel_id, p_empresa_id));

  -- Tope de reasignaciones alcanzado → unassigned visible.
  IF coalesce(v_reassign_cnt, 0) >= v_max THEN
    EXECUTE format(
      'UPDATE %I.chat_conversations SET assigned_agent_id=NULL,
         assignment_wait_code=''sla_exhausted_unassigned'', updated_at=$3
       WHERE id=$1 AND empresa_id=$2', sch
    ) USING p_conversation_id, p_empresa_id, v_ts;
    EXECUTE format(
      'INSERT INTO %I.chat_routing_events (empresa_id, conversation_id, queue_id, event_type, payload)
       VALUES ($1,$2,$3,''sla_exhausted_unassigned'',$4)', sch
    ) USING p_empresa_id, p_conversation_id, v_queue_id,
            jsonb_build_object('from_agent_id', v_prev_agent, 'reassign_count', v_reassign_cnt,
                               'source', 'stalled_reply');
    RETURN jsonb_build_object('reassigned', false, 'reason', 'max_reassign_unassigned',
                              'from_agent', v_prev_agent);
  END IF;

  -- Siguiente agente elegible (mismo patrón de reparto que cc_reassign_on_sla).
  EXECUTE format($q$
    WITH elig AS (
      SELECT a.id, a.max_conversations,
             (a.last_heartbeat_at IS NOT NULL AND a.last_heartbeat_at >= now() - interval '60 seconds') AS online,
             a.last_assigned_at
      FROM %I.chat_agents a
      WHERE a.empresa_id=$1 AND a.queue_id=$2 AND a.id <> $6
        AND a.is_active=true AND a.receives_new_chats=true AND a.operational_status='ready'
        AND EXISTS (SELECT 1 FROM %I.chat_usuario_omnicanal uo
                    WHERE uo.empresa_id=$1 AND uo.usuario_id=a.usuario_id AND uo.omnicanal_agent_enabled=true)
    ),
    load AS (
      SELECT assigned_agent_id AS id, count(*)::int AS c FROM %I.chat_conversations
      WHERE empresa_id=$1 AND assigned_agent_id IS NOT NULL AND status IN ('open','pending')
      GROUP BY assigned_agent_id
    ),
    daily AS (
      SELECT agent_id AS id, count FROM %I.cc_daily_assignment_counter
      WHERE empresa_id=$1 AND scope_type=$3 AND scope_id=$4 AND dia_local=$5
    )
    SELECT e.id FROM elig e
    LEFT JOIN load l ON l.id=e.id
    LEFT JOIN daily d ON d.id=e.id
    WHERE coalesce(l.c,0) < greatest(1, e.max_conversations)
    ORDER BY e.online DESC, coalesce(d.count,0) ASC, coalesce(l.c,0) ASC,
             e.last_assigned_at ASC NULLS FIRST, e.id ASC
    LIMIT 1
  $q$, sch, sch, sch, sch)
  INTO v_best USING p_empresa_id, v_queue_id, v_scope_type, v_scope_id, v_dia, v_prev_agent;

  -- Sin otro agente → unassigned visible.
  IF v_best IS NULL THEN
    EXECUTE format(
      'UPDATE %I.chat_conversations SET assigned_agent_id=NULL,
         assignment_wait_code=''sla_no_other_agent'', updated_at=$3
       WHERE id=$1 AND empresa_id=$2', sch
    ) USING p_conversation_id, p_empresa_id, v_ts;
    EXECUTE format(
      'INSERT INTO %I.chat_routing_events (empresa_id, conversation_id, queue_id, event_type, payload)
       VALUES ($1,$2,$3,''timeout_reassign'',$4)', sch
    ) USING p_empresa_id, p_conversation_id, v_queue_id,
            jsonb_build_object('from_agent_id', v_prev_agent, 'to_agent_id', NULL,
                               'result', 'unassigned_no_agent', 'source', 'stalled_reply');
    RETURN jsonb_build_object('reassigned', false, 'reason', 'no_other_agent',
                              'from_agent', v_prev_agent);
  END IF;

  v_sla_due := v_ts + make_interval(mins => v_sla_minutes);

  -- OJO: NO reseteamos first_human_response_at (a diferencia de cc_reassign_on_sla)
  -- porque en mid-convo el chat ya tuvo respuesta inicial válida.
  EXECUTE format(
    'UPDATE %I.chat_conversations
       SET assigned_agent_id=$3, initial_assignment_at=$4,
           initial_reassign_count=coalesce(initial_reassign_count,0)+1,
           assignment_wait_code=NULL, sla_due_at=$5, updated_at=$4
     WHERE id=$1 AND empresa_id=$2', sch
  ) USING p_conversation_id, p_empresa_id, v_best, v_ts, v_sla_due;

  -- Transferir conteo diario: -1 al anterior, +1 al nuevo.
  EXECUTE format(
    'UPDATE %I.cc_daily_assignment_counter SET count = greatest(0, count - 1), updated_at = now()
     WHERE empresa_id=$1 AND scope_type=$2 AND scope_id=$3 AND agent_id=$4 AND dia_local=$5', sch
  ) USING p_empresa_id, v_scope_type, v_scope_id, v_prev_agent, v_dia;
  EXECUTE format(
    'INSERT INTO %I.cc_daily_assignment_counter (empresa_id, scope_type, scope_id, agent_id, dia_local, count)
     VALUES ($1,$2,$3,$4,$5,1)
     ON CONFLICT (empresa_id, scope_type, scope_id, agent_id, dia_local)
     DO UPDATE SET count = %I.cc_daily_assignment_counter.count + 1, updated_at = now()', sch, sch
  ) USING p_empresa_id, v_scope_type, v_scope_id, v_best, v_dia;

  EXECUTE format('UPDATE %I.chat_agents SET last_assigned_at=$2 WHERE id=$1 AND empresa_id=$3', sch)
    USING v_best, v_ts, p_empresa_id;

  EXECUTE format(
    'INSERT INTO %I.chat_routing_events (empresa_id, conversation_id, queue_id, event_type, payload)
     VALUES ($1,$2,$3,''timeout_reassign'',$4)', sch
  ) USING p_empresa_id, p_conversation_id, v_queue_id,
          jsonb_build_object('from_agent_id', v_prev_agent, 'to_agent_id', v_best,
                             'reassign_count', coalesce(v_reassign_cnt,0)+1,
                             'source', 'stalled_reply',
                             'stalled_since', v_last_customer_at);

  EXECUTE format(
    'INSERT INTO %I.agent_notification_events
       (empresa_id, agent_id, conversation_id, type, channel, status, metadata)
     VALUES ($1,$2,$3,''reassigned'',''fcm'',''pending'',$4)', sch
  ) USING p_empresa_id, v_best, p_conversation_id,
          jsonb_build_object('from_agent_id', v_prev_agent, 'queue_id', v_queue_id,
                             'source', 'stalled_reply');

  RETURN jsonb_build_object('reassigned', true, 'reason', 'stalled_reply_reassign',
                            'from_agent', v_prev_agent, 'to_agent', v_best);
END;
$fn$;
REVOKE ALL ON FUNCTION public.cc_reassign_on_stalled_reply(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cc_reassign_on_stalled_reply(text, uuid, uuid) TO service_role;
