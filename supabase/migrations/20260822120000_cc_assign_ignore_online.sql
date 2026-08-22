-- =============================================================================
-- Contact Center — repartir chats a TODOS los agentes elegibles, sin importar
-- si tienen heartbeat activo.
-- =============================================================================
-- Antes: las 3 RPCs de asignación (cc_assign_conversation, cc_reassign_on_sla,
-- cc_reassign_on_stalled_reply) ordenaban por `e.online DESC` — el agente con
-- last_heartbeat_at >= 60s ganaba siempre. Efecto práctico: todos los chats
-- iban al único agente que tenía la app abierta.
--
-- Fix: quitar `e.online DESC` del ORDER BY. Ahora reparten SOLO por menor
-- conteo diario, luego menor carga actual, luego más antigua última asignación.
--
-- La eligibilidad NO cambia (siguen siendo elegibles solo agentes ready +
-- receives_new_chats + is_active + habilitados omnicanal); solo el ORDEN de
-- desempate se relaja para no favorecer al "online".
--
-- Idempotente: usa CREATE OR REPLACE FUNCTION con el mismo bugfix aplicado en
-- runtime via regex sobre pg_get_functiondef. Si el ORDER BY ya no contiene
-- "e.online DESC," la función se recrea igual (no-op efectivo).
-- =============================================================================

DO $migration$
DECLARE
  fn_name text;
  fn_names text[] := ARRAY[
    'cc_assign_conversation(text, uuid, uuid)',
    'cc_reassign_on_sla(text, uuid, uuid)',
    'cc_reassign_on_stalled_reply(text, uuid, uuid)'
  ];
  fn_def text;
  fn_patched text;
BEGIN
  FOREACH fn_name IN ARRAY fn_names LOOP
    -- Cargar la definición actual de la función.
    BEGIN
      fn_def := pg_get_functiondef(('public.' || fn_name)::regprocedure);
    EXCEPTION WHEN undefined_function THEN
      RAISE NOTICE 'Función %  no existe todavía, se omite', fn_name;
      CONTINUE;
    END;

    -- Reemplazar "ORDER BY e.online DESC, ..." por "ORDER BY ..." (sin la
    -- primera clave). Regex tolera espacios variables. Idempotente.
    fn_patched := regexp_replace(
      fn_def,
      'ORDER BY\s+e\.online\s+DESC\s*,\s*',
      'ORDER BY ',
      'gi'
    );

    IF fn_patched = fn_def THEN
      RAISE NOTICE 'Función % ya no contenía "e.online DESC" — sin cambios', fn_name;
    ELSE
      EXECUTE fn_patched;
      RAISE NOTICE 'Función % actualizada: se quitó preferencia por online', fn_name;
    END IF;
  END LOOP;
END
$migration$;
