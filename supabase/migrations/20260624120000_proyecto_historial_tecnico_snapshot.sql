-- =============================================================================
-- Módulo Proyectos — Snapshot del responsable_tecnico en el historial de estados
--
-- Motivación: el reporte "proyectos entregados por técnico" debe atribuir la
-- entrega al técnico que estaba asignado *al momento* de la transición, no al
-- técnico actual (que puede haber cambiado después).
--
-- Estrategia:
--   1. Agregar columna `responsable_tecnico_id` (uuid, nullable) a
--      `proyecto_estado_historial` en todo schema con proyectos.
--   2. Backfill best-effort: copiar el técnico actual del proyecto a todos
--      los segmentos históricos que estén en NULL. Para datos previos a esta
--      migración es lo único reconstruíble — la imprecisión es esperable.
--   3. Las nuevas transiciones (POST /api/proyectos/{id}/cambiar-estado) van
--      a popular el campo en el insert.
-- =============================================================================

DO $$
DECLARE
  r        RECORD;
  sch      text;
  cat_sch  text;
BEGIN
  -- Detectar schema de catálogo (donde vive `usuarios`).
  SELECT n.nspname INTO cat_sch
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE c.relname = 'usuarios'
    AND c.relkind = 'r'
  ORDER BY CASE n.nspname
    WHEN 'neura' THEN 1
    WHEN 'zentra_erp' THEN 2
    WHEN 'public' THEN 3
    ELSE 4
  END
  LIMIT 1;

  IF cat_sch IS NULL THEN
    RAISE EXCEPTION 'No se encontró schema con tabla `usuarios`';
  END IF;

  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'proyecto_estado_historial'
      AND c.relkind = 'r'
      AND (
        n.nspname IN ('public', 'zentra_erp', 'neura')
        OR n.nspname ~ '^er_[0-9a-f]{32}$'
        OR n.nspname LIKE 'erp\_%' ESCAPE '\'
      )
    ORDER BY 1
  LOOP
    sch := r.sch;

    -- 1) Agregar columna si no existe.
    IF NOT EXISTS (
      SELECT 1
      FROM information_schema.columns
      WHERE table_schema = sch
        AND table_name = 'proyecto_estado_historial'
        AND column_name = 'responsable_tecnico_id'
    ) THEN
      EXECUTE format(
        'ALTER TABLE %I.proyecto_estado_historial
           ADD COLUMN responsable_tecnico_id uuid
           REFERENCES %I.usuarios(id) ON DELETE SET NULL',
        sch, cat_sch
      );

      EXECUTE format(
        'CREATE INDEX IF NOT EXISTS %I
           ON %I.proyecto_estado_historial (empresa_id, responsable_tecnico_id, entered_at)',
        'ix_peh_tec_' || replace(md5(sch::text), '-', '_'),
        sch
      );
    END IF;

    -- 2) Backfill: copiar el técnico actual del proyecto a las filas en NULL.
    --    Best-effort — para entregas viejas es lo único que tenemos.
    EXECUTE format(
      'UPDATE %I.proyecto_estado_historial h
         SET responsable_tecnico_id = p.responsable_tecnico_id
        FROM %I.proyectos p
        WHERE p.id = h.proyecto_id
          AND p.empresa_id = h.empresa_id
          AND h.responsable_tecnico_id IS NULL
          AND p.responsable_tecnico_id IS NOT NULL',
      sch, sch
    );
  END LOOP;
END $$;
