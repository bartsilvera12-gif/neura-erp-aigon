-- =============================================================================
-- Micro-corrección Triple 7 — SOLO schema: erp_triple_7_82f8a15a
--
-- Agrega chat_flows.flow_config jsonb (default '{}'::jsonb) en el tenant y
-- setea el flow_config del flujo 'triple_7' para activar el reinicio suave por
-- intención de compra (flow-restart-intent.ts). En Papu esta columna existe y
-- está poblada; en Triple 7 falta, por lo que cualquier conversación parada en
-- un nodo (p. ej. Combos_explosivos) no se reinicia ante un texto entrante que
-- no es la wake-keyword exacta del canal (ej. "Hola, quiero comprar..." con
-- coma pegada al primer token).
--
-- Alcance EXPLÍCITO:
-- - SOLO erp_triple_7_82f8a15a (no Papu, no zentra_erp, no otros tenants).
-- - Idempotente: ADD COLUMN IF NOT EXISTS + UPDATE de UNA fila por flow_code.
-- - No toca nodos, opciones, destinos, estructura del flujo, ni filas de otros
--   chat_flows del tenant.
-- - restart_node_code = 'mensaje_bienvenida' (confirmado: nodo activo en el
--   flujo triple_7 del tenant, y primer nodo histórico de las sesiones).
-- =============================================================================

DO $$
DECLARE
  v_schema       text := 'erp_triple_7_82f8a15a';
  v_flow_code    text := 'triple_7';
  v_restart_node text := 'mensaje_bienvenida';
  v_node_exists  boolean;
  v_flow_id      uuid;
  v_upd_n        bigint;
  v_cfg          jsonb;
BEGIN
  EXECUTE 'SET LOCAL lock_timeout = ''8s''';
  EXECUTE 'SET LOCAL statement_timeout = ''60s''';

  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = v_schema) THEN
    RAISE NOTICE '[triple7 micro] Schema % no existe; omitiendo.', v_schema;
    RETURN;
  END IF;

  IF to_regclass(format('%I.chat_flows', v_schema)) IS NULL
     OR to_regclass(format('%I.chat_flow_nodes', v_schema)) IS NULL THEN
    RAISE NOTICE '[triple7 micro] Faltan tablas chat_flows/chat_flow_nodes en %; omitiendo.', v_schema;
    RETURN;
  END IF;

  -- 1) ADD COLUMN idempotente
  EXECUTE format(
    'ALTER TABLE %I.chat_flows
       ADD COLUMN IF NOT EXISTS flow_config jsonb NOT NULL DEFAULT ''{}''::jsonb',
    v_schema
  );

  -- 2) Pre-requisito: nodo restart_node_code existe y está activo
  EXECUTE format(
    'SELECT EXISTS (SELECT 1 FROM %I.chat_flow_nodes
       WHERE flow_code=$1 AND node_code=$2 AND is_active=true)',
    v_schema
  ) INTO v_node_exists USING v_flow_code, v_restart_node;

  IF NOT v_node_exists THEN
    RAISE EXCEPTION '[triple7 micro] restart_node_code % no existe/activo en flujo %.%',
      v_restart_node, v_schema, v_flow_code;
  END IF;

  -- 3) Verificar que existe la fila chat_flows del flujo
  EXECUTE format(
    'SELECT id FROM %I.chat_flows WHERE flow_code=$1 LIMIT 1',
    v_schema
  ) INTO v_flow_id USING v_flow_code;

  IF v_flow_id IS NULL THEN
    RAISE EXCEPTION '[triple7 micro] no se encontró chat_flows.flow_code=% en %', v_flow_code, v_schema;
  END IF;

  -- 4) UPDATE puntual de UNA sola fila (chat_flows.flow_code='triple_7')
  v_cfg := jsonb_build_object(
    'restart_enabled', true,
    'restart_node_code', v_restart_node,
    'restart_when_abandoned', true,
    'restart_when_completed', true,
    'do_not_restart_when_human_taken_over', true,
    'restart_strong_keywords', jsonb_build_array(
      'triple 7',
      'triple7',
      'sorteo triple',
      'codigo revendedor',
      'código revendedor',
      'ref='
    )
  );

  EXECUTE format(
    'UPDATE %I.chat_flows SET flow_config=$1, updated_at=now() WHERE flow_code=$2',
    v_schema
  ) USING v_cfg, v_flow_code;
  GET DIAGNOSTICS v_upd_n = ROW_COUNT;

  IF v_upd_n <> 1 THEN
    RAISE EXCEPTION '[triple7 micro] UPDATE chat_flows esperaba 1 fila, obtuvo %', v_upd_n;
  END IF;

  RAISE NOTICE '[triple7 micro] flow_config aplicado a chat_flows.flow_code=% (id=%).',
    v_flow_code, v_flow_id;
END $$;
