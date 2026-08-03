-- =============================================================================
-- Realtime para el módulo Proyectos.
-- Agrega las 5 tablas a la publicación supabase_realtime en cada schema
-- donde existan (multi-tenant: public, zentra_erp, er_*, erp_*).
-- Idempotente: chequea pg_publication_tables antes de hacer el ALTER.
-- =============================================================================

DO $$
DECLARE
  r       RECORD;
  sch     text;
  tabla   text;
  tablas  text[] := ARRAY[
    'proyectos',
    'proyecto_tareas',
    'proyecto_comentarios',
    'proyecto_archivos',
    'proyecto_estado_historial'
  ];
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'proyectos'
      AND c.relkind = 'r'
      AND (
        n.nspname IN ('public', 'zentra_erp')
        OR n.nspname ~ '^er_[0-9a-f]{32}$'
        OR n.nspname LIKE 'erp\_%' ESCAPE '\'
      )
    ORDER BY 1
  LOOP
    sch := r.sch;

    FOREACH tabla IN ARRAY tablas
    LOOP
      IF EXISTS (
        SELECT 1 FROM pg_class c
        JOIN pg_namespace n ON n.oid = c.relnamespace
        WHERE n.nspname = sch
          AND c.relname = tabla
          AND c.relkind = 'r'
      ) AND NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = sch
          AND tablename = tabla
      ) THEN
        BEGIN
          EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I', sch, tabla);
        EXCEPTION WHEN duplicate_object THEN
          NULL;
        END;
      END IF;
    END LOOP;
  END LOOP;

  PERFORM pg_notify('pgrst', 'reload schema');
END $$;
