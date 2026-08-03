-- =============================================================================
-- Mapeo configurable: tipificación de cierre → outcome comercial
-- =============================================================================
-- Permite que cada empresa configure cómo sus labels de `chat_queue_closure_states`
-- / `chat_queue_closure_substates` se traducen a outcomes comerciales usados por
-- el reporte de campañas Meta y futuros reportes.
--
-- Match por labels denormalizados (string) — más estable que por id si el
-- catálogo cambia. Si `closure_substate_label` es NULL, la regla aplica a
-- cualquier subestado del mismo estado. Si `queue_id` es NULL, aplica a TODAS
-- las colas de la empresa.
--
-- Seed: se incluye una heurística por sufijos de label que cubre casos comunes
-- (venta/ganado/perdido/no respondió/reclamo). Es solo orientativa; cada
-- empresa puede editar via SQL hoy o UI futura.
-- =============================================================================

DO $migration$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'chat_conversations'
      AND c.relkind = 'r'
      -- Alcance inicial: solo `neura`. Para habilitar en otros tenants,
      -- extender este IN con su nspname (mariacuevas, ncgconstructora, etc.).
      AND n.nspname IN ('neura')
  LOOP
    IF to_regclass(format('%I.empresa_outcome_mapping', r.sch)) IS NULL THEN
      EXECUTE format($ct$
        CREATE TABLE %I.empresa_outcome_mapping (
          id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          empresa_id             uuid NOT NULL,
          queue_id               uuid NULL,
          closure_state_label    text NOT NULL,
          closure_substate_label text NULL,
          outcome_type           text NOT NULL
                                 CHECK (outcome_type IN (
                                   'qualified_lead','conversion','lost','no_response','claim','other'
                                 )),
          notas                  text NULL,
          created_at             timestamptz NOT NULL DEFAULT now(),
          updated_at             timestamptz NOT NULL DEFAULT now()
        )
      $ct$, r.sch);
    END IF;

    -- Unicidad por triple (empresa, cola opcional, label estado, label subestado opcional)
    EXECUTE format(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_eom_key
         ON %I.empresa_outcome_mapping(
           empresa_id,
           COALESCE(queue_id, ''00000000-0000-0000-0000-000000000000''::uuid),
           closure_state_label,
           COALESCE(closure_substate_label, '''')
         )',
      r.sch
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS idx_eom_empresa_outcome
         ON %I.empresa_outcome_mapping(empresa_id, outcome_type)',
      r.sch
    );

    -- RLS
    EXECUTE format(
      'ALTER TABLE %I.empresa_outcome_mapping ENABLE ROW LEVEL SECURITY',
      r.sch
    );

    EXECUTE format($p$
      DROP POLICY IF EXISTS empresa_outcome_mapping_select
        ON %I.empresa_outcome_mapping;
      CREATE POLICY empresa_outcome_mapping_select
        ON %I.empresa_outcome_mapping
        FOR SELECT
        USING (%I.puede_acceder_empresa(empresa_id))
    $p$, r.sch, r.sch, r.sch);

    EXECUTE format($p$
      DROP POLICY IF EXISTS empresa_outcome_mapping_insert
        ON %I.empresa_outcome_mapping;
      CREATE POLICY empresa_outcome_mapping_insert
        ON %I.empresa_outcome_mapping
        FOR INSERT
        WITH CHECK (%I.puede_acceder_empresa(empresa_id))
    $p$, r.sch, r.sch, r.sch);

    EXECUTE format($p$
      DROP POLICY IF EXISTS empresa_outcome_mapping_update
        ON %I.empresa_outcome_mapping;
      CREATE POLICY empresa_outcome_mapping_update
        ON %I.empresa_outcome_mapping
        FOR UPDATE
        USING (%I.puede_acceder_empresa(empresa_id))
        WITH CHECK (%I.puede_acceder_empresa(empresa_id))
    $p$, r.sch, r.sch, r.sch, r.sch);

    EXECUTE format($p$
      DROP POLICY IF EXISTS empresa_outcome_mapping_delete
        ON %I.empresa_outcome_mapping;
      CREATE POLICY empresa_outcome_mapping_delete
        ON %I.empresa_outcome_mapping
        FOR DELETE
        USING (%I.puede_acceder_empresa(empresa_id))
    $p$, r.sch, r.sch, r.sch);

    EXECUTE format(
      $c$ COMMENT ON TABLE %I.empresa_outcome_mapping IS
        'Mapeo configurable por empresa de labels de cierre a outcome comercial (qualified_lead, conversion, lost, no_response, claim). Match por strings denormalizados.' $c$,
      r.sch
    );

    -- Seed heurístico: si la empresa tiene closure_states pero NO tiene aún
    -- mapeos para ese label, sembramos una sugerencia por keywords. Editable.
    -- Si el catálogo está vacío no inserta nada.
    EXECUTE format($seed$
      INSERT INTO %I.empresa_outcome_mapping
        (empresa_id, queue_id, closure_state_label, closure_substate_label, outcome_type, notas)
      SELECT DISTINCT
        s.empresa_id,
        NULL::uuid,
        s.label,
        NULL::text,
        CASE
          WHEN lower(s.label) ~ '(venta|ganad|convertid|comprad|cerrad.*positiv|exito)' THEN 'conversion'
          WHEN lower(s.label) ~ '(califica|interesad|caliente|prospect.*activ)'         THEN 'qualified_lead'
          WHEN lower(s.label) ~ '(perdid|no.*compr|no.*interes|descart|rechaz)'         THEN 'lost'
          WHEN lower(s.label) ~ '(no.*respond|sin.*respue|inactiv|abandon)'             THEN 'no_response'
          WHEN lower(s.label) ~ '(reclam|queja|soporte|consult|no.*comercial)'          THEN 'claim'
          ELSE 'other'
        END,
        'seed automático — editable'
      FROM %I.chat_queue_closure_states s
      WHERE s.is_active = true
        AND NOT EXISTS (
          SELECT 1 FROM %I.empresa_outcome_mapping m
          WHERE m.empresa_id = s.empresa_id
            AND m.closure_state_label = s.label
            AND m.closure_substate_label IS NULL
            AND m.queue_id IS NULL
        )
    $seed$, r.sch, r.sch, r.sch);
  END LOOP;
END
$migration$;
