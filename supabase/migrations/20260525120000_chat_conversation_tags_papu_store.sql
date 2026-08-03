-- =============================================================================
-- Etiquetas Automáticas de Conversación - FASE 2 (foundation, OFF by default)
-- Tenant: erp_el_papu_store_5ad0bdda  (El Papu Store)
-- Idempotente. No modifica otros tenants.
-- =============================================================================

-- chat_conversation_tags ------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_el_papu_store_5ad0bdda.chat_conversation_tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  code text NOT NULL,
  label text NOT NULL,
  description text,
  color text,
  is_system boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_chat_conv_tags_empresa_code
  ON erp_el_papu_store_5ad0bdda.chat_conversation_tags (empresa_id, code);
CREATE INDEX IF NOT EXISTS idx_chat_conv_tags_empresa
  ON erp_el_papu_store_5ad0bdda.chat_conversation_tags (empresa_id, code);

-- chat_conversation_tag_rules -------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_el_papu_store_5ad0bdda.chat_conversation_tag_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  channel_id uuid,
  tag_id uuid NOT NULL REFERENCES erp_el_papu_store_5ad0bdda.chat_conversation_tags(id) ON DELETE RESTRICT,
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT false,
  shadow_mode boolean NOT NULL DEFAULT true,
  days_without_activity integer NOT NULL DEFAULT 3 CHECK (days_without_activity >= 1),
  purchase_condition text NOT NULL,
  priority integer NOT NULL DEFAULT 100,
  exclude_human_taken_over boolean NOT NULL DEFAULT true,
  exclude_active_bot_session boolean NOT NULL DEFAULT true,
  exclude_manual_closure boolean NOT NULL DEFAULT true,
  recontact_exclusion boolean NOT NULL DEFAULT false,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_conv_tag_rules_empresa_active
  ON erp_el_papu_store_5ad0bdda.chat_conversation_tag_rules (empresa_id, is_active, shadow_mode);

-- chat_conversation_tag_history ----------------------------------------------
CREATE TABLE IF NOT EXISTS erp_el_papu_store_5ad0bdda.chat_conversation_tag_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  empresa_id uuid NOT NULL,
  conversation_id uuid NOT NULL,
  contact_id uuid,
  previous_tag_id uuid,
  new_tag_id uuid,
  rule_id uuid,
  action text NOT NULL CHECK (action IN ('applied','replaced','cleared','dry_run')),
  reason text,
  source text NOT NULL DEFAULT 'auto_rule' CHECK (source IN ('auto_rule','manual','client_replied','dry_run')),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_chat_conv_tag_history_conv_created
  ON erp_el_papu_store_5ad0bdda.chat_conversation_tag_history (conversation_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_chat_conv_tag_history_empresa_created
  ON erp_el_papu_store_5ad0bdda.chat_conversation_tag_history (empresa_id, created_at DESC);

-- chat_conversations: extensiones (todas con IF NOT EXISTS, OFF por default) -
ALTER TABLE erp_el_papu_store_5ad0bdda.chat_conversations
  ADD COLUMN IF NOT EXISTS current_tag_id uuid,
  ADD COLUMN IF NOT EXISTS hidden_by_tag boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS hidden_by_tag_at timestamptz,
  ADD COLUMN IF NOT EXISTS hidden_by_tag_rule_id uuid,
  ADD COLUMN IF NOT EXISTS last_tagged_at timestamptz,
  ADD COLUMN IF NOT EXISTS tag_reactivated_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_chat_conv_hidden_by_tag_lm
  ON erp_el_papu_store_5ad0bdda.chat_conversations (hidden_by_tag, last_message_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_chat_conv_current_tag
  ON erp_el_papu_store_5ad0bdda.chat_conversations (current_tag_id)
  WHERE current_tag_id IS NOT NULL;

-- Semillas de etiquetas del sistema (idempotentes) ----------------------------
INSERT INTO erp_el_papu_store_5ad0bdda.chat_conversation_tags
  (empresa_id, code, label, description, color, is_system, sort_order)
VALUES
  ('5ad0bdda-f94f-446c-9032-1fedf34e8479'::uuid, 'compro_boleta',          'Compró boleta',          'Cliente realizó una compra confirmada',                                 '#16a34a', true, 10),
  ('5ad0bdda-f94f-446c-9032-1fedf34e8479'::uuid, 'compro_varias',          'Compró varias boletas',  'Cliente compró múltiples boletas en una misma orden',                   '#15803d', true, 20),
  ('5ad0bdda-f94f-446c-9032-1fedf34e8479'::uuid, 'recomprador',            'Recomprador',            'Cliente compró en más de un sorteo distinto',                           '#0d9488', true, 30),
  ('5ad0bdda-f94f-446c-9032-1fedf34e8479'::uuid, 'no_compro',              'No compró',              'Sin compra confirmada después del último mensaje',                       '#94a3b8', true, 40),
  ('5ad0bdda-f94f-446c-9032-1fedf34e8479'::uuid, 'comprobante_pendiente',  'Comprobante pendiente',  'Comprobante recibido pero pago incompleto o no validado',               '#f59e0b', true, 50),
  ('5ad0bdda-f94f-446c-9032-1fedf34e8479'::uuid, 'datos_incompletos',      'Datos incompletos',      'Cliente no completó cédula / nombre / apellido y no tiene entradas',    '#a855f7', true, 60),
  ('5ad0bdda-f94f-446c-9032-1fedf34e8479'::uuid, 'abandonado',             'Abandonado',             'Sesión de bot terminó con estado abandoned o agotado',                  '#ef4444', true, 70)
ON CONFLICT (empresa_id, code) DO NOTHING;

-- Función chat_tag_purchase_category(conversation_id) -------------------------
-- READ-ONLY (STABLE). Devuelve la categoría de compra de una conversación.
-- Categorías:
--   'repurchased'                  -> entradas confirmadas en >1 sorteo distinto
--   'purchased_multiple_tickets'   -> entradas confirmadas en 1 solo sorteo, total>1
--   'purchased_once'               -> exactamente 1 entrada confirmada
--   'payment_received_incomplete'  -> hay validaciones de comprobante con estados pendientes/parciales y sin confirmadas
--   'data_incomplete'              -> sin entradas y sin cédula/nombre/apellido en chat_flow_data
--   'abandoned'                    -> flow session terminó con status='abandoned' / end_reason='abandoned'
--   'no_purchase'                  -> sin entradas, datos básicos presentes
--   'unknown'                      -> nada coincide
CREATE OR REPLACE FUNCTION erp_el_papu_store_5ad0bdda.chat_tag_purchase_category(p_conversation_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY INVOKER
SET search_path = erp_el_papu_store_5ad0bdda, pg_catalog
AS $func$
DECLARE
  v_confirmed_total integer := 0;
  v_distinct_sorteos integer := 0;
  v_pending_validations integer := 0;
  v_has_cedula boolean := false;
  v_has_nombre boolean := false;
  v_has_apellido boolean := false;
  v_abandoned boolean := false;
BEGIN
  IF p_conversation_id IS NULL THEN
    RETURN 'unknown';
  END IF;

  SELECT
    COALESCE(SUM(GREATEST(COALESCE(cantidad_boletos, 1), 1)), 0),
    COUNT(DISTINCT sorteo_id)
    INTO v_confirmed_total, v_distinct_sorteos
  FROM erp_el_papu_store_5ad0bdda.sorteo_entradas
  WHERE chat_conversation_id = p_conversation_id
    AND estado_pago = 'confirmado';

  IF v_confirmed_total > 0 THEN
    IF v_distinct_sorteos > 1 THEN
      RETURN 'repurchased';
    ELSIF v_confirmed_total > 1 THEN
      RETURN 'purchased_multiple_tickets';
    ELSE
      RETURN 'purchased_once';
    END IF;
  END IF;

  -- sin compras confirmadas: revisar comprobantes en estados intermedios
  SELECT COUNT(*) INTO v_pending_validations
  FROM erp_el_papu_store_5ad0bdda.chat_comprobante_validaciones
  WHERE conversation_id = p_conversation_id
    AND COALESCE(estado_validacion, '') NOT IN ('', 'rechazado', 'descartado');

  IF v_pending_validations > 0 THEN
    RETURN 'payment_received_incomplete';
  END IF;

  -- sesión de bot abandonada
  SELECT EXISTS (
    SELECT 1
    FROM erp_el_papu_store_5ad0bdda.chat_flow_sessions
    WHERE conversation_id = p_conversation_id
      AND (
        status = 'abandoned'
        OR COALESCE(end_reason, '') = 'abandoned'
      )
  ) INTO v_abandoned;

  IF v_abandoned THEN
    RETURN 'abandoned';
  END IF;

  -- datos básicos en chat_flow_data
  SELECT
    bool_or(lower(coalesce(field_name,'')) IN ('cedula','documento','ci','dni')
            AND coalesce(field_value,'') <> ''),
    bool_or(lower(coalesce(field_name,'')) IN ('nombre','first_name')
            AND coalesce(field_value,'') <> ''),
    bool_or(lower(coalesce(field_name,'')) IN ('apellido','last_name','surname')
            AND coalesce(field_value,'') <> '')
    INTO v_has_cedula, v_has_nombre, v_has_apellido
  FROM erp_el_papu_store_5ad0bdda.chat_flow_data
  WHERE conversation_id = p_conversation_id;

  IF NOT COALESCE(v_has_cedula, false)
     OR NOT COALESCE(v_has_nombre, false)
     OR NOT COALESCE(v_has_apellido, false) THEN
    RETURN 'data_incomplete';
  END IF;

  RETURN 'no_purchase';
END;
$func$;

COMMENT ON FUNCTION erp_el_papu_store_5ad0bdda.chat_tag_purchase_category(uuid) IS
  'Etiquetas Automáticas FASE 2: clasifica el estado de compra de una conversación. READ-ONLY.';
