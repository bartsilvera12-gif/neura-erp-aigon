-- Fase 4F - Etiquetas Automáticas
-- Clasificador de etiquetas basado en SEÑALES WHATSAPP (no estado administrativo).
--
-- Cambio respecto a la versión anterior:
--   * No usa sorteo_entradas.estado_pago como condición para "compra completada".
--   * Considera compra completada cuando:
--       - chat_conversations.flow_current_node = 'compra_realizada', o
--       - existen cupones generados (sorteo_cupones via sorteo_entradas), o
--       - existe al menos una entrada con numero_orden NOT NULL.
--   * El conteo de boletos suma cantidad_boletos sin importar estado_pago.
--   * Si el cliente envió comprobante OCR-válido o en revisión pero NO completó
--     la compra en WhatsApp, se etiqueta como payment_received_incomplete.
--   * data_incomplete y no_purchase siguen igual.
--
-- IDEMPOTENTE: CREATE OR REPLACE. Sólo toca la función; no toca tablas operativas
-- ni datos de chat_conversations, sorteo_entradas, sorteo_cupones, etc.

CREATE OR REPLACE FUNCTION erp_el_papu_store_5ad0bdda.chat_tag_purchase_category(p_conversation_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SET search_path TO 'erp_el_papu_store_5ad0bdda', 'pg_catalog'
AS $function$
DECLARE
  v_current_node text := NULL;
  v_total_boletos integer := 0;
  v_distinct_sorteos integer := 0;
  v_entries_with_order integer := 0;
  v_cupones_total integer := 0;
  v_purchase_completed boolean := false;
  v_pending_validations integer := 0;
  v_has_cedula boolean := false;
  v_has_nombre boolean := false;
  v_has_apellido boolean := false;
  v_abandoned boolean := false;
BEGIN
  IF p_conversation_id IS NULL THEN
    RETURN 'unknown';
  END IF;

  -- Nodo actual de la conversación (señal WhatsApp).
  SELECT flow_current_node INTO v_current_node
  FROM erp_el_papu_store_5ad0bdda.chat_conversations
  WHERE id = p_conversation_id;

  -- Entradas sin filtrar por estado_pago: medimos lo que WhatsApp registró.
  SELECT
    COALESCE(SUM(GREATEST(COALESCE(cantidad_boletos, 1), 1)), 0),
    COUNT(DISTINCT sorteo_id),
    COUNT(*) FILTER (WHERE numero_orden IS NOT NULL)
    INTO v_total_boletos, v_distinct_sorteos, v_entries_with_order
  FROM erp_el_papu_store_5ad0bdda.sorteo_entradas
  WHERE chat_conversation_id = p_conversation_id;

  -- Cupones físicos efectivamente generados para esa conversación.
  SELECT COUNT(*) INTO v_cupones_total
  FROM erp_el_papu_store_5ad0bdda.sorteo_cupones sc
  WHERE sc.entrada_id IN (
    SELECT id FROM erp_el_papu_store_5ad0bdda.sorteo_entradas
    WHERE chat_conversation_id = p_conversation_id
  );

  -- Compra completada según señales WhatsApp:
  --   * el flujo llegó al nodo terminal compra_realizada, o
  --   * existe al menos un cupón generado, o
  --   * existe al menos una entrada con número de orden.
  v_purchase_completed :=
    (v_current_node = 'compra_realizada')
    OR (v_cupones_total > 0)
    OR (v_entries_with_order > 0);

  IF v_purchase_completed THEN
    IF v_total_boletos > 0 THEN
      IF v_distinct_sorteos > 1 THEN
        RETURN 'repurchased';
      ELSIF v_total_boletos > 1 THEN
        RETURN 'purchased_multiple_tickets';
      ELSE
        RETURN 'purchased_once';
      END IF;
    ELSIF v_cupones_total > 0 THEN
      IF v_cupones_total > 1 THEN
        RETURN 'purchased_multiple_tickets';
      ELSE
        RETURN 'purchased_once';
      END IF;
    ELSE
      -- compra_realizada sin entrada/cupón: tratamos como purchased_once por garantía de señal WhatsApp.
      RETURN 'purchased_once';
    END IF;
  END IF;

  -- No completó compra pero envió comprobante OCR-válido / en revisión.
  SELECT COUNT(*) INTO v_pending_validations
  FROM erp_el_papu_store_5ad0bdda.chat_comprobante_validaciones
  WHERE conversation_id = p_conversation_id
    AND COALESCE(estado_validacion, '') NOT IN ('', 'rechazado', 'descartado');

  IF v_pending_validations > 0 THEN
    RETURN 'payment_received_incomplete';
  END IF;

  -- Sesión abandonada explícita.
  SELECT EXISTS (
    SELECT 1
    FROM erp_el_papu_store_5ad0bdda.chat_flow_sessions
    WHERE conversation_id = p_conversation_id
      AND (status = 'abandoned' OR COALESCE(end_reason, '') = 'abandoned')
  ) INTO v_abandoned;
  IF v_abandoned THEN
    RETURN 'abandoned';
  END IF;

  -- Datos básicos incompletos.
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
$function$;

-- Copy: la etiqueta "comprobante_pendiente" ahora se llama "Comprobante sin finalizar"
-- (sólo cambia el label/descripcion visible; el code se preserva por compatibilidad
-- con reglas, snapshots históricos y mapeos UI).
UPDATE erp_el_papu_store_5ad0bdda.chat_conversation_tags
   SET label = 'Comprobante sin finalizar',
       description = 'El cliente envió comprobante pero no completó la compra en WhatsApp',
       updated_at = now()
 WHERE empresa_id = '5ad0bdda-f94f-446c-9032-1fedf34e8479'
   AND code = 'comprobante_pendiente';
