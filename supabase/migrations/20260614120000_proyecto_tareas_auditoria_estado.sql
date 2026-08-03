-- =============================================================================
-- Proyectos · Tareas: auditoría de cambio de estado
-- Agrega columnas status_changed_by / status_changed_at a proyecto_tareas
-- y backfill best-effort de filas existentes.
-- Replica en todos los schemas que tengan la tabla (public, zentra_erp, er_*, erp_*).
-- =============================================================================

DO $$
DECLARE
  r   RECORD;
  sch text;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'proyecto_tareas'
      AND c.relkind = 'r'
      AND (
        n.nspname IN ('public', 'zentra_erp')
        OR n.nspname ~ '^er_[0-9a-f]{32}$'
        OR n.nspname LIKE 'erp\_%' ESCAPE '\'
      )
    ORDER BY 1
  LOOP
    sch := r.sch;

    EXECUTE format(
      $sql$
      ALTER TABLE %I.proyecto_tareas
        ADD COLUMN IF NOT EXISTS status_changed_by uuid REFERENCES zentra_erp.usuarios(id) ON DELETE SET NULL,
        ADD COLUMN IF NOT EXISTS status_changed_at timestamptz
      $sql$,
      sch
    );

    -- Backfill: si la fila nunca cambió de estado, asumimos que el "último cambio"
    -- fue la creación. Si ya estaba completada, usamos completed_at como referencia.
    EXECUTE format(
      $sql$
      UPDATE %I.proyecto_tareas
         SET status_changed_at = COALESCE(completed_at, updated_at, created_at),
             status_changed_by = created_by
       WHERE status_changed_at IS NULL
      $sql$,
      sch
    );
  END LOOP;
END $$;
