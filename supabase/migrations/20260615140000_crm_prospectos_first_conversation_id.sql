-- =============================================================================
-- crm_prospectos: link directo a la conversación que originó el prospecto
-- =============================================================================
-- Hoy `crm_prospectos.origen_creacion='whatsapp'` solo guarda el origen genérico,
-- sin FK directa a `chat_conversations`. Esta columna agrega un puntero al
-- primer chat asociado, lo que permite:
--  1) cruzar "leads nuevos" del reporte Campaña Meta con la conversación que
--     trae la atribución (sin recurrir a match por teléfono + timestamp).
--  2) navegar de un prospecto al hilo de origen desde CRM (fase posterior).
--
-- Aditivo, nullable. El webhook lo poblará al crear el prospecto; la columna
-- queda NULL en filas existentes (el backfill puede llenarlas opcionalmente).
-- =============================================================================

DO $migration$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'crm_prospectos'
      AND c.relkind = 'r'
      -- Alcance inicial: solo `neura`. Para habilitar en otros tenants,
      -- extender este IN con su nspname (mariacuevas, ncgconstructora, etc.).
      AND n.nspname IN ('neura')
  LOOP
    EXECUTE format(
      'ALTER TABLE %I.crm_prospectos
         ADD COLUMN IF NOT EXISTS first_conversation_id uuid NULL',
      r.sch
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_crm_prospectos_first_conv
         ON %I.crm_prospectos(first_conversation_id)
         WHERE first_conversation_id IS NOT NULL',
      r.sch
    );
    EXECUTE format(
      $c$ COMMENT ON COLUMN %I.crm_prospectos.first_conversation_id IS
        'chat_conversations.id de la primera conversación que originó el prospecto (nullable, para cruce con atribución Meta).' $c$,
      r.sch
    );
  END LOOP;
END
$migration$;
