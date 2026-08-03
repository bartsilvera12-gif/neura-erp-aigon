-- =============================================================================
-- Fix: GRANTs faltantes en `proyecto_cambios`.
--
-- La migración 20260609130000 crea la tabla pero NUNCA ejecuta GRANT; dependía
-- de los default privileges del schema. En instancias donde esos default
-- privileges no cubrieron la tabla (p.ej. la tabla se creó en `neura`, schema
-- que esta migración agregó al loop y que la provisión de tenants no contempla),
-- el rol que usa PostgREST (`service_role` / `authenticated`) queda sin permisos
-- y la API responde: "permission denied for table proyecto_cambios" (SQLSTATE 42501).
--
-- Esta migración otorga privilegios en TODO schema donde ya exista la tabla.
-- Es idempotente y segura de re-correr.
-- =============================================================================

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'proyecto_cambios'
      AND c.relkind = 'r'
    ORDER BY 1
  LOOP
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON %I.proyecto_cambios TO authenticated',
      r.sch
    );
    EXECUTE format(
      'GRANT ALL ON %I.proyecto_cambios TO postgres, service_role',
      r.sch
    );
  END LOOP;

  -- Forzar a PostgREST a recargar el cache de schema (toma los nuevos grants).
  PERFORM pg_notify('pgrst', 'reload schema');
END $$;
