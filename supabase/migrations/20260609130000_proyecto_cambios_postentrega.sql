-- =============================================================================
-- Módulo Proyectos — Cambios post-entrega (política 3 cambios gratis en 30 días).
--
-- Una fila por slot (nro 1..3) por proyecto. Se replica en TODO schema donde
-- ya exista la tabla `proyectos`. El schema de catálogo (empresas, usuarios) se
-- detecta dinámicamente para soportar instancias donde el catálogo vive en
-- `neura`, `zentra_erp` o `public`.
--
-- - RLS: public.puede_acceder_empresa(empresa_id).
-- - Trigger updated_at: public.set_updated_at().
-- - Idempotente: skipea si la tabla ya existe en el schema.
-- =============================================================================

DO $$
DECLARE
  r        RECORD;
  sch      text;
  cat_sch  text;
  rls_sch  text;
  upd_sch  text;
  fq       regclass;
BEGIN
  -- Detectar schema de catálogo: el que tenga `empresas` y `usuarios`.
  -- Prioridad: zentra_erp > neura > public > otros.
  SELECT n.nspname INTO cat_sch
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'empresas'
    AND c.relkind = 'r'
    AND EXISTS (
      SELECT 1
      FROM pg_class c2
      JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
      WHERE c2.relname = 'usuarios'
        AND c2.relkind = 'r'
        AND n2.nspname = n.nspname
    )
  ORDER BY CASE n.nspname
    WHEN 'zentra_erp' THEN 1
    WHEN 'neura' THEN 2
    WHEN 'public' THEN 3
    ELSE 4
  END
  LIMIT 1;

  IF cat_sch IS NULL THEN
    RAISE EXCEPTION 'No se encontró schema de catálogo con tablas empresas + usuarios';
  END IF;

  -- Detectar schema donde vive la función puede_acceder_empresa (1 arg uuid).
  -- Si no se encuentra, las políticas RLS se omiten — la API del módulo usa
  -- service_role (ignora RLS) igual que el resto de las tablas del módulo.
  SELECT n.nspname INTO rls_sch
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'puede_acceder_empresa'
    AND p.pronargs = 1
    AND p.proargtypes[0] = 'uuid'::regtype
  ORDER BY CASE n.nspname
    WHEN 'public' THEN 1
    WHEN 'zentra_erp' THEN 2
    WHEN 'neura' THEN 3
    ELSE 4
  END
  LIMIT 1;

  IF rls_sch IS NULL THEN
    RAISE NOTICE 'puede_acceder_empresa(uuid) no encontrada: se omiten políticas RLS por empresa (la API usa service_role)';
  END IF;

  -- Detectar schema donde vive la función set_updated_at() (trigger fn).
  -- Si no existe, se omite el trigger (updated_at queda al valor inicial hasta que la app lo setee).
  SELECT n.nspname INTO upd_sch
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.proname = 'set_updated_at'
    AND p.pronargs = 0
  ORDER BY CASE n.nspname
    WHEN 'public' THEN 1
    WHEN 'zentra_erp' THEN 2
    WHEN 'neura' THEN 3
    ELSE 4
  END
  LIMIT 1;

  IF upd_sch IS NULL THEN
    RAISE NOTICE 'set_updated_at() no encontrada: se omite el trigger de updated_at';
  END IF;

  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'proyectos'
      AND c.relkind = 'r'
      AND (
        n.nspname IN ('public', 'zentra_erp', 'neura')
        OR n.nspname ~ '^er_[0-9a-f]{32}$'
        OR n.nspname LIKE 'erp\_%' ESCAPE '\'
      )
    ORDER BY 1
  LOOP
    sch := r.sch;
    fq  := to_regclass(format('%I.proyecto_cambios', sch));
    IF fq IS NOT NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format(
      $sql$
      CREATE TABLE %I.proyecto_cambios (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
        proyecto_id uuid NOT NULL REFERENCES %I.proyectos(id) ON DELETE CASCADE,
        nro smallint NOT NULL CHECK (nro BETWEEN 1 AND 3),
        realizado boolean NOT NULL DEFAULT false,
        comentario text,
        realizado_at timestamptz,
        realizado_por uuid REFERENCES %I.usuarios(id) ON DELETE SET NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT uq_proyecto_cambios_slot UNIQUE (empresa_id, proyecto_id, nro)
      )
      $sql$,
      sch,
      cat_sch,
      sch,
      cat_sch
    );

    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.proyecto_cambios (empresa_id, proyecto_id, nro)',
      'ix_pcamb_' || replace(md5(sch::text), '-', '_'),
      sch
    );

    -- Privilegios: sin esto el rol de PostgREST (service_role/authenticated) recibe
    -- "permission denied for table proyecto_cambios". No depender de default privileges.
    EXECUTE format(
      'GRANT SELECT, INSERT, UPDATE, DELETE ON %I.proyecto_cambios TO authenticated',
      sch
    );
    EXECUTE format(
      'GRANT ALL ON %I.proyecto_cambios TO postgres, service_role',
      sch
    );

    IF rls_sch IS NOT NULL THEN
      EXECUTE format($pol$ALTER TABLE %I.proyecto_cambios ENABLE ROW LEVEL SECURITY$pol$, sch);

      EXECUTE format($pol$DROP POLICY IF EXISTS proyecto_cambios_select ON %I.proyecto_cambios$pol$, sch);
      EXECUTE format(
        'CREATE POLICY proyecto_cambios_select ON %I.proyecto_cambios FOR SELECT USING (%I.puede_acceder_empresa(empresa_id))',
        sch, rls_sch
      );
      EXECUTE format($pol$DROP POLICY IF EXISTS proyecto_cambios_insert ON %I.proyecto_cambios$pol$, sch);
      EXECUTE format(
        'CREATE POLICY proyecto_cambios_insert ON %I.proyecto_cambios FOR INSERT WITH CHECK (%I.puede_acceder_empresa(empresa_id))',
        sch, rls_sch
      );
      EXECUTE format($pol$DROP POLICY IF EXISTS proyecto_cambios_update ON %I.proyecto_cambios$pol$, sch);
      EXECUTE format(
        'CREATE POLICY proyecto_cambios_update ON %I.proyecto_cambios FOR UPDATE USING (%I.puede_acceder_empresa(empresa_id)) WITH CHECK (%I.puede_acceder_empresa(empresa_id))',
        sch, rls_sch, rls_sch
      );
      EXECUTE format($pol$DROP POLICY IF EXISTS proyecto_cambios_delete ON %I.proyecto_cambios$pol$, sch);
      EXECUTE format(
        'CREATE POLICY proyecto_cambios_delete ON %I.proyecto_cambios FOR DELETE USING (%I.puede_acceder_empresa(empresa_id))',
        sch, rls_sch
      );
    END IF;

    IF upd_sch IS NOT NULL THEN
      EXECUTE format($tr$DROP TRIGGER IF EXISTS tr_proyecto_cambios_updated ON %I.proyecto_cambios$tr$, sch);
      EXECUTE format(
        'CREATE TRIGGER tr_proyecto_cambios_updated BEFORE UPDATE ON %I.proyecto_cambios FOR EACH ROW EXECUTE FUNCTION %I.set_updated_at()',
        sch, upd_sch
      );
    END IF;

    -- Realtime opcional (mantiene paridad con el resto del módulo).
    BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname = 'supabase_realtime'
          AND schemaname = sch
          AND tablename = 'proyecto_cambios'
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I.proyecto_cambios', sch);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;

  PERFORM pg_notify('pgrst', 'reload schema');
END $$;
