-- =============================================================================
-- Contact Center WhatsApp V1 — RPC atómicas (asignación + reasignación SLA)
-- =============================================================================
-- Funciones en `public` con schema dinámico (patrón de neura_inbox_awaiting_reply_since_batch).
-- SECURITY DEFINER + search_path fijo + validación estricta de schema (anti-injection).
-- Validan empresa_id en lectura y escritura. Advisory xact lock por empresa para
-- serializar la asignación y mantener consistente el conteo diario.
--
-- Reparto (decisión cerrada):
--   prioridad agentes online; dentro del pool elegible:
--   1) menor count en cc_daily_assignment_counter del día America/Asuncion (por scope)
--   2) menor carga activa (open+pending)
--   3) last_assigned_at más antiguo
--   + same_advisor_window respetado SOLO en asignación inicial (no en reasignación por SLA).
-- =============================================================================

-- Validador de schema reutilizable (mismo criterio que assertAllowedChatDataSchema en TS).
CREATE OR REPLACE FUNCTION public.cc_assert_schema(p_schema text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $$
DECLARE s text := trim(both from coalesce(p_schema, ''));
BEGIN
  IF s = '' THEN RAISE EXCEPTION 'schema vacío'; END IF;
  IF s !~ '^[a-z][a-z0-9_]{0,62}$' THEN RAISE EXCEPTION 'schema no permitido: %', p_schema; END IF;
  IF s IN ('pg_catalog','pg_toast','information_schema','auth','storage','realtime',
           'supabase_functions','supabase_migrations','extensions','vault','graphql',
           'graphql_public','pgsodium','pgsodium_masks','_realtime','_analytics','net','cron') THEN
    RAISE EXCEPTION 'schema reservado no permitido: %', p_schema;
  END IF;
  RETURN s;
END;
$$;
REVOKE ALL ON FUNCTION public.cc_assert_schema(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cc_assert_schema(text) TO service_role;

-- -----------------------------------------------------------------------------
-- cc_assign_conversation: asignación atómica idempotente.
-- Devuelve jsonb { assigned, reason, agent_id, queue_id, scope_type, scope_id }.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cc_assign_conversation(
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
  sch              text := public.cc_assert_schema(p_schema);
  v_exists         boolean;
  v_channel_id     uuid;
  v_contact_id     uuid;
  v_assigned       uuid;
  v_queue_id       uuid;
  v_channel_type   text := 'whatsapp';
  v_distribution   text;
  v_routing        jsonb;
  v_scope_type     text;
  v_scope_id       uuid;
  v_sla_minutes    integer := 5;
  v_dia            date := (now() AT TIME ZONE 'America/Asuncion')::date;
  v_best           uuid;
  v_same_agent     uuid;
  v_sa_enabled     boolean := false;
  v_sa_ms          bigint := 0;
  v_ts             timestamptz := now();
  v_sla_due        timestamptz;
BEGIN
  -- Serializa la asignación de esta empresa (consistencia del conteo diario).
  PERFORM pg_advisory_xact_lock(hashtextextended(p_empresa_id::text, 7777));

  -- Lock de la conversación.
  EXECUTE format(
    'SELECT true, channel_id, contact_id, assigned_agent_id, queue_id
       FROM %I.chat_conversations WHERE id = $1 AND empresa_id = $2 FOR UPDATE',
    sch
  ) INTO v_exists, v_channel_id, v_contact_id, v_assigned, v_queue_id
    USING p_conversation_id, p_empresa_id;

  IF v_exists IS NULL THEN
    RETURN jsonb_build_object('assigned', false, 'reason', 'not_found');
  END IF;
  IF v_assigned IS NOT NULL THEN
    RETURN jsonb_build_object('assigned', false, 'reason', 'already_assigned',
                              'agent_id', v_assigned, 'queue_id', v_queue_id);
  END IF;

  -- Tipo de canal.
  IF v_channel_id IS NOT NULL THEN
    EXECUTE format('SELECT type FROM %I.chat_channels WHERE id=$1 AND empresa_id=$2', sch)
      INTO v_channel_type USING v_channel_id, p_empresa_id;
    v_channel_type := coalesce(v_channel_type, 'whatsapp');
  END IF;

  -- Resolución de cola: vínculo canal→cola, luego por channel_type, luego sin canal.
  EXECUTE format(
    'SELECT q.id, q.distribution_strategy, q.routing_config
       FROM %I.chat_queues q
       WHERE q.empresa_id = $1 AND q.is_active = true
         AND (
           q.id IN (SELECT queue_id FROM %I.chat_queue_channels
                    WHERE empresa_id = $1 AND channel_id = $2)
           OR q.channel_type = $3 OR q.channel_type IS NULL
         )
       ORDER BY
         (q.id IN (SELECT queue_id FROM %I.chat_queue_channels
                   WHERE empresa_id = $1 AND channel_id = $2)) DESC,
         q.priority DESC,
         (q.channel_type IS NOT NULL) DESC,
         q.nombre ASC
       LIMIT 1',
    sch, sch, sch
  ) INTO v_queue_id, v_distribution, v_routing
    USING p_empresa_id, v_channel_id, v_channel_type;

  -- Scope para el conteo diario.
  IF v_queue_id IS NOT NULL THEN
    v_scope_type := 'queue'; v_scope_id := v_queue_id;
  ELSIF v_channel_id IS NOT NULL THEN
    v_scope_type := 'channel'; v_scope_id := v_channel_id;
  ELSE
    v_scope_type := 'empresa'; v_scope_id := p_empresa_id;
  END IF;

  -- SLA: settings más específico (cola → canal → empresa default).
  EXECUTE format(
    'SELECT sla_minutes FROM %I.contact_center_settings
       WHERE empresa_id = $1
       ORDER BY (queue_id = $2) DESC NULLS LAST,
                (channel_id = $3) DESC NULLS LAST,
                (queue_id IS NULL AND channel_id IS NULL) DESC
       LIMIT 1',
    sch
  ) INTO v_sla_minutes USING p_empresa_id, v_queue_id, v_channel_id;
  v_sla_minutes := coalesce(v_sla_minutes, 5);
  v_sla_due := v_ts + make_interval(mins => v_sla_minutes);

  IF v_queue_id IS NULL THEN
    EXECUTE format(
      'UPDATE %I.chat_conversations SET assignment_wait_code=''no_queue'',
         contact_center_scope_type=$3, contact_center_scope_id=$4, updated_at=$5
       WHERE id=$1 AND empresa_id=$2', sch
    ) USING p_conversation_id, p_empresa_id, v_scope_type, v_scope_id, v_ts;
    RETURN jsonb_build_object('assigned', false, 'reason', 'no_queue');
  END IF;

  -- manual_pull: solo deja la cola, no asigna.
  IF coalesce(v_distribution, '') = 'manual_pull' THEN
    EXECUTE format(
      'UPDATE %I.chat_conversations
         SET queue_id=$3, assignment_wait_code=''manual_queue'',
             contact_center_scope_type=$4, contact_center_scope_id=$5, updated_at=$6
       WHERE id=$1 AND empresa_id=$2', sch
    ) USING p_conversation_id, p_empresa_id, v_queue_id, v_scope_type, v_scope_id, v_ts;
    RETURN jsonb_build_object('assigned', false, 'reason', 'manual_pull', 'queue_id', v_queue_id);
  END IF;

  -- same_advisor_window (solo asignación inicial).
  v_sa_enabled := coalesce((v_routing->'same_advisor_window'->>'enabled')::boolean, false);
  IF v_sa_enabled THEN
    v_sa_ms := greatest(1, coalesce((v_routing->'same_advisor_window'->>'value')::int, 24))
               * CASE WHEN (v_routing->'same_advisor_window'->>'unit') = 'days'
                      THEN 86400000 ELSE 3600000 END;
    IF v_contact_id IS NOT NULL THEN
      EXECUTE format(
        'SELECT last_routed_chat_agent_id FROM %I.chat_contacts
           WHERE id=$1 AND empresa_id=$2
             AND last_routed_chat_agent_id IS NOT NULL
             AND last_routed_at IS NOT NULL
             AND (last_routed_channel_id IS NULL OR last_routed_channel_id = $3)
             AND (extract(epoch FROM (now() - last_routed_at)) * 1000) <= $4', sch
      ) INTO v_same_agent USING v_contact_id, p_empresa_id, v_channel_id, v_sa_ms;
    END IF;
  END IF;

  -- Selección del mejor agente elegible.
  -- Prefiere online; dentro del pool: menor conteo diario → menor carga → last_assigned más antiguo.
  EXECUTE format($q$
    WITH elig AS (
      SELECT a.id, a.max_conversations,
             (a.last_heartbeat_at IS NOT NULL
              AND a.last_heartbeat_at >= now() - interval '60 seconds') AS online,
             a.last_assigned_at
      FROM %I.chat_agents a
      WHERE a.empresa_id = $1 AND a.queue_id = $2
        AND a.is_active = true AND a.receives_new_chats = true
        AND a.operational_status = 'ready'
        AND EXISTS (
          SELECT 1 FROM %I.chat_usuario_omnicanal uo
          WHERE uo.empresa_id = $1 AND uo.usuario_id = a.usuario_id
            AND uo.omnicanal_agent_enabled = true
        )
    ),
    load AS (
      SELECT assigned_agent_id AS id, count(*)::int AS c
      FROM %I.chat_conversations
      WHERE empresa_id = $1 AND assigned_agent_id IS NOT NULL
        AND status IN ('open','pending')
      GROUP BY assigned_agent_id
    ),
    daily AS (
      SELECT agent_id AS id, count
      FROM %I.cc_daily_assignment_counter
      WHERE empresa_id = $1 AND scope_type = $3 AND scope_id = $4 AND dia_local = $5
    )
    SELECT e.id
    FROM elig e
    LEFT JOIN load l ON l.id = e.id
    LEFT JOIN daily d ON d.id = e.id
    WHERE coalesce(l.c, 0) < greatest(1, e.max_conversations)
    ORDER BY e.online DESC,
             coalesce(d.count, 0) ASC,
             coalesce(l.c, 0) ASC,
             e.last_assigned_at ASC NULLS FIRST,
             e.id ASC
    LIMIT 1
  $q$, sch, sch, sch, sch)
  INTO v_best USING p_empresa_id, v_queue_id, v_scope_type, v_scope_id, v_dia;

  -- same_advisor gana si ese agente quedó elegible.
  IF v_same_agent IS NOT NULL THEN
    EXECUTE format($q$
      SELECT a.id FROM %I.chat_agents a
      WHERE a.id = $1 AND a.empresa_id = $2 AND a.queue_id = $3
        AND a.is_active = true AND a.receives_new_chats = true AND a.operational_status = 'ready'
        AND (SELECT count(*) FROM %I.chat_conversations c
             WHERE c.empresa_id = $2 AND c.assigned_agent_id = a.id AND c.status IN ('open','pending'))
            < greatest(1, a.max_conversations)
    $q$, sch, sch) INTO v_same_agent USING v_same_agent, p_empresa_id, v_queue_id;
    IF v_same_agent IS NOT NULL THEN v_best := v_same_agent; END IF;
  END IF;

  -- Sin agente: queda unassigned visible para supervisor. Nunca se pierde.
  IF v_best IS NULL THEN
    EXECUTE format(
      'UPDATE %I.chat_conversations
         SET queue_id=$3, assignment_wait_code=''no_eligible_agent'',
             contact_center_scope_type=$4, contact_center_scope_id=$5,
             sla_minutes=$6, updated_at=$7
       WHERE id=$1 AND empresa_id=$2', sch
    ) USING p_conversation_id, p_empresa_id, v_queue_id, v_scope_type, v_scope_id, v_sla_minutes, v_ts;
    EXECUTE format(
      'INSERT INTO %I.chat_routing_events (empresa_id, conversation_id, queue_id, event_type, payload)
       VALUES ($1,$2,$3,''no_eligible_agent'',$4)', sch
    ) USING p_empresa_id, p_conversation_id, v_queue_id,
            jsonb_build_object('scope_type', v_scope_type, 'scope_id', v_scope_id);
    RETURN jsonb_build_object('assigned', false, 'reason', 'no_agent', 'queue_id', v_queue_id);
  END IF;

  -- Asignación.
  EXECUTE format(
    'UPDATE %I.chat_conversations
       SET queue_id=$3, assigned_agent_id=$4, initial_assignment_at=$5,
           first_human_response_at=NULL, initial_reassign_count=0,
           assignment_wait_code=NULL,
           contact_center_scope_type=$6, contact_center_scope_id=$7,
           sla_minutes=$8, sla_due_at=$9, updated_at=$5
     WHERE id=$1 AND empresa_id=$2', sch
  ) USING p_conversation_id, p_empresa_id, v_queue_id, v_best, v_ts,
          v_scope_type, v_scope_id, v_sla_minutes, v_sla_due;

  -- Conteo diario +1 (upsert atómico).
  EXECUTE format(
    'INSERT INTO %I.cc_daily_assignment_counter
       (empresa_id, scope_type, scope_id, agent_id, dia_local, count)
     VALUES ($1,$2,$3,$4,$5,1)
     ON CONFLICT (empresa_id, scope_type, scope_id, agent_id, dia_local)
     DO UPDATE SET count = %I.cc_daily_assignment_counter.count + 1, updated_at = now()', sch, sch
  ) USING p_empresa_id, v_scope_type, v_scope_id, v_best, v_dia;

  -- last_assigned_at del agente.
  EXECUTE format('UPDATE %I.chat_agents SET last_assigned_at=$2 WHERE id=$1 AND empresa_id=$3', sch)
    USING v_best, v_ts, p_empresa_id;

  -- last_routed del contacto (ancla same_advisor).
  IF v_contact_id IS NOT NULL AND v_channel_id IS NOT NULL THEN
    EXECUTE format(
      'UPDATE %I.chat_contacts SET last_routed_chat_agent_id=$1, last_routed_at=$2,
         last_routed_channel_id=$3, updated_at=$2 WHERE id=$4 AND empresa_id=$5', sch
    ) USING v_best, v_ts, v_channel_id, v_contact_id, p_empresa_id;
  END IF;

  -- Auditoría.
  EXECUTE format(
    'INSERT INTO %I.chat_routing_events (empresa_id, conversation_id, queue_id, event_type, payload)
     VALUES ($1,$2,$3,''assigned_auto'',$4)', sch
  ) USING p_empresa_id, p_conversation_id, v_queue_id,
          jsonb_build_object('to_agent_id', v_best, 'scope_type', v_scope_type,
                             'scope_id', v_scope_id, 'same_advisor', (v_same_agent IS NOT NULL));

  -- Evento de notificación pendiente (canal fcm). El dispatcher se implementa en fase APK.
  EXECUTE format(
    'INSERT INTO %I.agent_notification_events
       (empresa_id, agent_id, conversation_id, type, channel, status, metadata)
     VALUES ($1,$2,$3,''new_lead'',''fcm'',''pending'',$4)', sch
  ) USING p_empresa_id, v_best, p_conversation_id,
          jsonb_build_object('queue_id', v_queue_id);

  RETURN jsonb_build_object('assigned', true, 'reason', 'assigned_auto',
                            'agent_id', v_best, 'queue_id', v_queue_id,
                            'scope_type', v_scope_type, 'scope_id', v_scope_id);
END;
$fn$;
REVOKE ALL ON FUNCTION public.cc_assign_conversation(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cc_assign_conversation(text, uuid, uuid) TO service_role;

-- -----------------------------------------------------------------------------
-- cc_reassign_on_sla: reasigna una conversación cuyo SLA venció sin 1ra respuesta.
-- Ignora same_advisor (objetivo: no perder el lead). Evita reasignar al mismo agente.
-- Transfiere el conteo diario del agente anterior al nuevo. Limita reasignaciones.
-- Devuelve jsonb { reassigned, reason, from_agent, to_agent }.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cc_reassign_on_sla(
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
  sch            text := public.cc_assert_schema(p_schema);
  v_prev_agent   uuid;
  v_queue_id     uuid;
  v_channel_id   uuid;
  v_scope_type   text;
  v_scope_id     uuid;
  v_first_resp   timestamptz;
  v_due          timestamptz;
  v_status       text;
  v_reassign_cnt integer;
  v_max          integer := 2;
  v_sla_minutes  integer := 5;
  v_best         uuid;
  v_dia          date := (now() AT TIME ZONE 'America/Asuncion')::date;
  v_ts           timestamptz := now();
  v_sla_due      timestamptz;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(p_empresa_id::text, 7777));

  EXECUTE format(
    'SELECT assigned_agent_id, queue_id, channel_id, first_human_response_at, sla_due_at,
            status, initial_reassign_count, contact_center_scope_type, contact_center_scope_id, sla_minutes
       FROM %I.chat_conversations WHERE id=$1 AND empresa_id=$2 FOR UPDATE', sch
  ) INTO v_prev_agent, v_queue_id, v_channel_id, v_first_resp, v_due,
         v_status, v_reassign_cnt, v_scope_type, v_scope_id, v_sla_minutes
    USING p_conversation_id, p_empresa_id;

  -- Guards: debe estar asignada, sin 1ra respuesta, abierta, vencida.
  IF v_prev_agent IS NULL OR v_first_resp IS NOT NULL
     OR v_status NOT IN ('open','pending') OR v_due IS NULL OR v_due > now() THEN
    RETURN jsonb_build_object('reassigned', false, 'reason', 'not_eligible');
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
  v_sla_minutes := coalesce(v_sla_minutes, 5);

  -- Tope de reasignaciones → unassigned visible.
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
            jsonb_build_object('from_agent_id', v_prev_agent, 'reassign_count', v_reassign_cnt);
    RETURN jsonb_build_object('reassigned', false, 'reason', 'max_reassign_unassigned',
                              'from_agent', v_prev_agent);
  END IF;

  -- Siguiente agente elegible, EXCLUYENDO al actual. Misma regla de reparto.
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
                               'result', 'unassigned_no_agent');
    RETURN jsonb_build_object('reassigned', false, 'reason', 'no_other_agent',
                              'from_agent', v_prev_agent);
  END IF;

  v_sla_due := v_ts + make_interval(mins => v_sla_minutes);

  EXECUTE format(
    'UPDATE %I.chat_conversations
       SET assigned_agent_id=$3, initial_assignment_at=$4, first_human_response_at=NULL,
           initial_reassign_count=coalesce(initial_reassign_count,0)+1,
           assignment_wait_code=NULL, sla_due_at=$5, updated_at=$4
     WHERE id=$1 AND empresa_id=$2', sch
  ) USING p_conversation_id, p_empresa_id, v_best, v_ts, v_sla_due;

  -- Transferir conteo diario: -1 al anterior, +1 al nuevo (no baja de 0).
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
                             'reassign_count', coalesce(v_reassign_cnt,0)+1);

  EXECUTE format(
    'INSERT INTO %I.agent_notification_events
       (empresa_id, agent_id, conversation_id, type, channel, status, metadata)
     VALUES ($1,$2,$3,''reassigned'',''fcm'',''pending'',$4)', sch
  ) USING p_empresa_id, v_best, p_conversation_id,
          jsonb_build_object('from_agent_id', v_prev_agent, 'queue_id', v_queue_id);

  RETURN jsonb_build_object('reassigned', true, 'reason', 'timeout_reassign',
                            'from_agent', v_prev_agent, 'to_agent', v_best);
END;
$fn$;
REVOKE ALL ON FUNCTION public.cc_reassign_on_sla(text, uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cc_reassign_on_sla(text, uuid, uuid) TO service_role;
