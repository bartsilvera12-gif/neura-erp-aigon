-- =============================================================================
-- Módulo Proyectos — QA Checklists
--
-- Estructura: Proyecto -> Grupos (ej: "Producción") -> Etapas (ej: "Diseño")
-- -> Ítems (checks que el PM marca/tacha). Cada ítem soporta comentario,
-- adjuntos y un historial completo de eventos (audit trail).
--
-- Se replica en todo schema con `proyectos`. El schema de catálogo
-- (empresas, usuarios) se detecta dinámicamente (neura | zentra_erp | public).
-- RLS via puede_acceder_empresa(empresa_id) cuando exista.
-- =============================================================================

DO $$
DECLARE
  r        RECORD;
  sch      text;
  tbl      text;
  cat_sch  text;
  rls_sch  text;
  upd_sch  text;
BEGIN
  -- Detectar schema de catálogo (empresas + usuarios coexistiendo).
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

  -- Detectar schema de puede_acceder_empresa(uuid) — opcional.
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

  -- Detectar set_updated_at() — opcional.
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

    -- =========================================================================
    -- proyecto_qa_grupos
    -- =========================================================================
    IF to_regclass(format('%I.proyecto_qa_grupos', sch)) IS NULL THEN
      EXECUTE format(
        $sql$
        CREATE TABLE %I.proyecto_qa_grupos (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          empresa_id uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
          proyecto_id uuid NOT NULL REFERENCES %I.proyectos(id) ON DELETE CASCADE,
          nombre text NOT NULL,
          descripcion text,
          sort_order integer NOT NULL DEFAULT 0,
          created_by uuid REFERENCES %I.usuarios(id) ON DELETE SET NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT chk_pqg_nombre_non_empty CHECK (length(trim(nombre)) > 0)
        )
        $sql$, sch, cat_sch, sch, cat_sch
      );
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I.proyecto_qa_grupos (empresa_id, proyecto_id, sort_order)',
        'ix_pqg_' || replace(md5(sch::text), '-', '_'), sch
      );

      IF rls_sch IS NOT NULL THEN
        EXECUTE format('ALTER TABLE %I.proyecto_qa_grupos ENABLE ROW LEVEL SECURITY', sch);
        EXECUTE format('CREATE POLICY proyecto_qa_grupos_select ON %I.proyecto_qa_grupos FOR SELECT USING (%I.puede_acceder_empresa(empresa_id))', sch, rls_sch);
        EXECUTE format('CREATE POLICY proyecto_qa_grupos_insert ON %I.proyecto_qa_grupos FOR INSERT WITH CHECK (%I.puede_acceder_empresa(empresa_id))', sch, rls_sch);
        EXECUTE format('CREATE POLICY proyecto_qa_grupos_update ON %I.proyecto_qa_grupos FOR UPDATE USING (%I.puede_acceder_empresa(empresa_id)) WITH CHECK (%I.puede_acceder_empresa(empresa_id))', sch, rls_sch, rls_sch);
        EXECUTE format('CREATE POLICY proyecto_qa_grupos_delete ON %I.proyecto_qa_grupos FOR DELETE USING (%I.puede_acceder_empresa(empresa_id))', sch, rls_sch);
      END IF;

      IF upd_sch IS NOT NULL THEN
        EXECUTE format('CREATE TRIGGER tr_pqg_updated BEFORE UPDATE ON %I.proyecto_qa_grupos FOR EACH ROW EXECUTE FUNCTION %I.set_updated_at()', sch, upd_sch);
      END IF;
    END IF;

    -- =========================================================================
    -- proyecto_qa_etapas
    -- =========================================================================
    IF to_regclass(format('%I.proyecto_qa_etapas', sch)) IS NULL THEN
      EXECUTE format(
        $sql$
        CREATE TABLE %I.proyecto_qa_etapas (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          empresa_id uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
          proyecto_id uuid NOT NULL REFERENCES %I.proyectos(id) ON DELETE CASCADE,
          grupo_id uuid NOT NULL REFERENCES %I.proyecto_qa_grupos(id) ON DELETE CASCADE,
          nombre text NOT NULL,
          descripcion text,
          sort_order integer NOT NULL DEFAULT 0,
          created_by uuid REFERENCES %I.usuarios(id) ON DELETE SET NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT chk_pqe_nombre_non_empty CHECK (length(trim(nombre)) > 0)
        )
        $sql$, sch, cat_sch, sch, sch, cat_sch
      );
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I.proyecto_qa_etapas (empresa_id, grupo_id, sort_order)',
        'ix_pqe_' || replace(md5(sch::text), '-', '_'), sch
      );

      IF rls_sch IS NOT NULL THEN
        EXECUTE format('ALTER TABLE %I.proyecto_qa_etapas ENABLE ROW LEVEL SECURITY', sch);
        EXECUTE format('CREATE POLICY proyecto_qa_etapas_select ON %I.proyecto_qa_etapas FOR SELECT USING (%I.puede_acceder_empresa(empresa_id))', sch, rls_sch);
        EXECUTE format('CREATE POLICY proyecto_qa_etapas_insert ON %I.proyecto_qa_etapas FOR INSERT WITH CHECK (%I.puede_acceder_empresa(empresa_id))', sch, rls_sch);
        EXECUTE format('CREATE POLICY proyecto_qa_etapas_update ON %I.proyecto_qa_etapas FOR UPDATE USING (%I.puede_acceder_empresa(empresa_id)) WITH CHECK (%I.puede_acceder_empresa(empresa_id))', sch, rls_sch, rls_sch);
        EXECUTE format('CREATE POLICY proyecto_qa_etapas_delete ON %I.proyecto_qa_etapas FOR DELETE USING (%I.puede_acceder_empresa(empresa_id))', sch, rls_sch);
      END IF;

      IF upd_sch IS NOT NULL THEN
        EXECUTE format('CREATE TRIGGER tr_pqe_updated BEFORE UPDATE ON %I.proyecto_qa_etapas FOR EACH ROW EXECUTE FUNCTION %I.set_updated_at()', sch, upd_sch);
      END IF;
    END IF;

    -- =========================================================================
    -- proyecto_qa_items
    -- =========================================================================
    IF to_regclass(format('%I.proyecto_qa_items', sch)) IS NULL THEN
      EXECUTE format(
        $sql$
        CREATE TABLE %I.proyecto_qa_items (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          empresa_id uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
          proyecto_id uuid NOT NULL REFERENCES %I.proyectos(id) ON DELETE CASCADE,
          etapa_id uuid NOT NULL REFERENCES %I.proyecto_qa_etapas(id) ON DELETE CASCADE,
          texto text NOT NULL,
          comentario text,
          sort_order integer NOT NULL DEFAULT 0,
          completado boolean NOT NULL DEFAULT false,
          completado_por uuid REFERENCES %I.usuarios(id) ON DELETE SET NULL,
          completado_at timestamptz,
          created_by uuid REFERENCES %I.usuarios(id) ON DELETE SET NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          updated_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT chk_pqi_texto_non_empty CHECK (length(trim(texto)) > 0)
        )
        $sql$, sch, cat_sch, sch, sch, cat_sch, cat_sch
      );
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I.proyecto_qa_items (empresa_id, etapa_id, sort_order)',
        'ix_pqi_' || replace(md5(sch::text), '-', '_'), sch
      );
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I.proyecto_qa_items (empresa_id, proyecto_id, completado)',
        'ix_pqic_' || replace(md5(sch::text), '-', '_'), sch
      );

      IF rls_sch IS NOT NULL THEN
        EXECUTE format('ALTER TABLE %I.proyecto_qa_items ENABLE ROW LEVEL SECURITY', sch);
        EXECUTE format('CREATE POLICY proyecto_qa_items_select ON %I.proyecto_qa_items FOR SELECT USING (%I.puede_acceder_empresa(empresa_id))', sch, rls_sch);
        EXECUTE format('CREATE POLICY proyecto_qa_items_insert ON %I.proyecto_qa_items FOR INSERT WITH CHECK (%I.puede_acceder_empresa(empresa_id))', sch, rls_sch);
        EXECUTE format('CREATE POLICY proyecto_qa_items_update ON %I.proyecto_qa_items FOR UPDATE USING (%I.puede_acceder_empresa(empresa_id)) WITH CHECK (%I.puede_acceder_empresa(empresa_id))', sch, rls_sch, rls_sch);
        EXECUTE format('CREATE POLICY proyecto_qa_items_delete ON %I.proyecto_qa_items FOR DELETE USING (%I.puede_acceder_empresa(empresa_id))', sch, rls_sch);
      END IF;

      IF upd_sch IS NOT NULL THEN
        EXECUTE format('CREATE TRIGGER tr_pqi_updated BEFORE UPDATE ON %I.proyecto_qa_items FOR EACH ROW EXECUTE FUNCTION %I.set_updated_at()', sch, upd_sch);
      END IF;
    END IF;

    -- =========================================================================
    -- proyecto_qa_item_archivos
    -- =========================================================================
    IF to_regclass(format('%I.proyecto_qa_item_archivos', sch)) IS NULL THEN
      EXECUTE format(
        $sql$
        CREATE TABLE %I.proyecto_qa_item_archivos (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          empresa_id uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
          proyecto_id uuid NOT NULL REFERENCES %I.proyectos(id) ON DELETE CASCADE,
          item_id uuid NOT NULL REFERENCES %I.proyecto_qa_items(id) ON DELETE CASCADE,
          nombre text NOT NULL,
          storage_bucket text NOT NULL DEFAULT 'proyectos',
          storage_path text NOT NULL,
          mime_type text,
          size_bytes bigint,
          uploaded_by uuid REFERENCES %I.usuarios(id) ON DELETE SET NULL,
          created_at timestamptz NOT NULL DEFAULT now(),
          CONSTRAINT uq_pqia_storage UNIQUE (empresa_id, storage_bucket, storage_path),
          CONSTRAINT chk_pqia_nombre_non_empty CHECK (length(trim(nombre)) > 0)
        )
        $sql$, sch, cat_sch, sch, sch, cat_sch
      );
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I.proyecto_qa_item_archivos (empresa_id, item_id)',
        'ix_pqia_' || replace(md5(sch::text), '-', '_'), sch
      );

      IF rls_sch IS NOT NULL THEN
        EXECUTE format('ALTER TABLE %I.proyecto_qa_item_archivos ENABLE ROW LEVEL SECURITY', sch);
        EXECUTE format('CREATE POLICY proyecto_qa_item_archivos_select ON %I.proyecto_qa_item_archivos FOR SELECT USING (%I.puede_acceder_empresa(empresa_id))', sch, rls_sch);
        EXECUTE format('CREATE POLICY proyecto_qa_item_archivos_insert ON %I.proyecto_qa_item_archivos FOR INSERT WITH CHECK (%I.puede_acceder_empresa(empresa_id))', sch, rls_sch);
        EXECUTE format('CREATE POLICY proyecto_qa_item_archivos_update ON %I.proyecto_qa_item_archivos FOR UPDATE USING (%I.puede_acceder_empresa(empresa_id)) WITH CHECK (%I.puede_acceder_empresa(empresa_id))', sch, rls_sch, rls_sch);
        EXECUTE format('CREATE POLICY proyecto_qa_item_archivos_delete ON %I.proyecto_qa_item_archivos FOR DELETE USING (%I.puede_acceder_empresa(empresa_id))', sch, rls_sch);
      END IF;
    END IF;

    -- =========================================================================
    -- proyecto_qa_eventos (audit trail completo)
    -- =========================================================================
    IF to_regclass(format('%I.proyecto_qa_eventos', sch)) IS NULL THEN
      EXECUTE format(
        $sql$
        CREATE TABLE %I.proyecto_qa_eventos (
          id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
          empresa_id uuid NOT NULL REFERENCES %I.empresas(id) ON DELETE CASCADE,
          proyecto_id uuid NOT NULL REFERENCES %I.proyectos(id) ON DELETE CASCADE,
          item_id uuid REFERENCES %I.proyecto_qa_items(id) ON DELETE CASCADE,
          etapa_id uuid REFERENCES %I.proyecto_qa_etapas(id) ON DELETE SET NULL,
          grupo_id uuid REFERENCES %I.proyecto_qa_grupos(id) ON DELETE SET NULL,
          accion text NOT NULL CHECK (accion IN (
            'grupo_creado','grupo_editado','grupo_eliminado',
            'etapa_creada','etapa_editada','etapa_eliminada',
            'item_creado','item_editado','item_eliminado',
            'item_marcado','item_desmarcado',
            'comentario_editado',
            'archivo_subido','archivo_eliminado',
            'qa_clonado'
          )),
          payload jsonb NOT NULL DEFAULT '{}'::jsonb,
          usuario_id uuid REFERENCES %I.usuarios(id) ON DELETE SET NULL,
          created_at timestamptz NOT NULL DEFAULT now()
        )
        $sql$, sch, cat_sch, sch, sch, sch, sch, cat_sch
      );
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I.proyecto_qa_eventos (empresa_id, proyecto_id, created_at DESC)',
        'ix_pqev_' || replace(md5(sch::text), '-', '_'), sch
      );
      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I ON %I.proyecto_qa_eventos (empresa_id, item_id, created_at DESC)',
        'ix_pqevi_' || replace(md5(sch::text), '-', '_'), sch
      );

      IF rls_sch IS NOT NULL THEN
        EXECUTE format('ALTER TABLE %I.proyecto_qa_eventos ENABLE ROW LEVEL SECURITY', sch);
        EXECUTE format('CREATE POLICY proyecto_qa_eventos_select ON %I.proyecto_qa_eventos FOR SELECT USING (%I.puede_acceder_empresa(empresa_id))', sch, rls_sch);
        EXECUTE format('CREATE POLICY proyecto_qa_eventos_insert ON %I.proyecto_qa_eventos FOR INSERT WITH CHECK (%I.puede_acceder_empresa(empresa_id))', sch, rls_sch);
      END IF;
    END IF;

    -- Realtime opcional (mantiene paridad con el resto del módulo).
    FOREACH tbl IN ARRAY ARRAY[
      'proyecto_qa_grupos','proyecto_qa_etapas','proyecto_qa_items',
      'proyecto_qa_item_archivos','proyecto_qa_eventos'
    ]
    LOOP
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_publication_tables
          WHERE pubname = 'supabase_realtime'
            AND schemaname = sch
            AND tablename = tbl
        ) THEN
          EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE %I.%I', sch, tbl);
        END IF;
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
  END LOOP;

  PERFORM pg_notify('pgrst', 'reload schema');
END $$;
