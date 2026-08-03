-- =============================================================================
-- Módulo Agenda (Citas / Turnos / Reuniones) — Fase 1A
-- Módulo AUTÓNOMO: no depende de WhatsApp / Conversaciones / Omnicanal.
--
-- Diseño multi-schema (igual que Proyectos): se replica `agenda_citas` en TODO
-- schema que tenga tabla `clientes` (public, zentra_erp, er_*, erp_*).
--
-- Regla arquitectónica de esta fase (decisión de producto):
--   La tabla vive ÍNTEGRAMENTE dentro del schema de datos del tenant y NO usa
--   FK cross-schema hacia `zentra_erp.*`. Por eso `empresa_id`, `responsable_id`,
--   `created_by` y `updated_by` son `uuid` SIN foreign key. La integridad por
--   empresa se garantiza con RLS (public.puede_acceder_empresa) + validación API.
--   Las ÚNICAS FK son dentro del mismo schema: cliente, prospecto (si existe la
--   tabla CRM), y auto-referencia para reprogramación.
--
-- RLS: public.puede_acceder_empresa(empresa_id)   (función base, schema public)
-- Trigger updated_at: public.set_updated_at()       (función base, schema public)
--
-- Anti-doble-reserva: en Fase 1A se valida server-side (API → 409). La constraint
-- EXCLUDE/GiST queda propuesta para Fase 1B (requiere btree_gist y validación de
-- compatibilidad en todos los tenants). NO se crea aquí.
-- =============================================================================

DO $$
DECLARE
  r    RECORD;
  sch  text;
BEGIN
  FOR r IN
    SELECT n.nspname AS sch
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relname = 'clientes'
      AND c.relkind = 'r'
      AND (
        n.nspname IN ('public', 'zentra_erp')
        OR n.nspname ~ '^er_[0-9a-f]{32}$'
        OR n.nspname LIKE 'erp\_%' ESCAPE '\'
      )
    ORDER BY 1
  LOOP
    sch := r.sch;

    -- Idempotencia: si la tabla ya existe en este schema, saltar.
    IF to_regclass(format('%I.agenda_citas', sch)) IS NOT NULL THEN
      CONTINUE;
    END IF;

    -- ---------------------------------------------------------------------
    -- Tabla principal. FK SOLO same-schema (cliente + auto-referencia).
    -- prospecto_id se agrega como uuid plano y, más abajo, se le pone FK
    -- únicamente si existe %I.crm_prospectos en este schema.
    -- ---------------------------------------------------------------------
    EXECUTE format(
      $sql$
      CREATE TABLE %1$I.agenda_citas (
        id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        empresa_id         uuid NOT NULL,
        cliente_id         uuid REFERENCES %1$I.clientes(id) ON DELETE SET NULL,
        prospecto_id       uuid,
        responsable_id     uuid NOT NULL,
        contacto_nombre    text,
        contacto_telefono  text,
        titulo             text NOT NULL,
        tipo               text,
        estado             text NOT NULL DEFAULT 'pendiente',
        inicio_at          timestamptz NOT NULL,
        fin_at             timestamptz NOT NULL,
        ubicacion          text,
        observaciones      text,
        reprogramada_de_id uuid REFERENCES %1$I.agenda_citas(id) ON DELETE SET NULL,
        cancelada_motivo   text,
        metadata           jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_by         uuid,
        updated_by         uuid,
        created_at         timestamptz NOT NULL DEFAULT now(),
        updated_at         timestamptz NOT NULL DEFAULT now(),
        CONSTRAINT chk_agenda_citas_titulo_non_empty CHECK (length(trim(titulo)) > 0),
        CONSTRAINT chk_agenda_citas_rango CHECK (fin_at > inicio_at),
        CONSTRAINT chk_agenda_citas_estado CHECK (
          estado IN ('pendiente','confirmada','completada','no_asistio','cancelada','reprogramada')
        )
      )
      $sql$,
      sch
    );

    -- FK opcional a CRM solo si el schema tiene la tabla (módulo CRM presente).
    IF to_regclass(format('%I.crm_prospectos', sch)) IS NOT NULL THEN
      EXECUTE format(
        'ALTER TABLE %1$I.agenda_citas
           ADD CONSTRAINT fk_agenda_citas_prospecto
           FOREIGN KEY (prospecto_id) REFERENCES %1$I.crm_prospectos(id) ON DELETE SET NULL',
        sch
      );
    END IF;

    -- ---------------------------------------------------------------------
    -- Índices (nombres únicos por schema vía hash, igual que Proyectos).
    -- ---------------------------------------------------------------------
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.agenda_citas (empresa_id, inicio_at)',
      'ix_ac_ini_' || replace(md5(sch::text), '-', '_'), sch
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.agenda_citas (empresa_id, responsable_id, inicio_at)',
      'ix_ac_resp_' || replace(md5(sch::text), '-', '_'), sch
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.agenda_citas (empresa_id, estado)',
      'ix_ac_est_' || replace(md5(sch::text), '-', '_'), sch
    );
    EXECUTE format(
      'CREATE INDEX IF NOT EXISTS %I ON %I.agenda_citas (empresa_id, cliente_id)',
      'ix_ac_cli_' || replace(md5(sch::text), '-', '_'), sch
    );

    -- ---------------------------------------------------------------------
    -- RLS por empresa (idéntico patrón a Proyectos / Sorteos).
    -- ---------------------------------------------------------------------
    EXECUTE format('ALTER TABLE %I.agenda_citas ENABLE ROW LEVEL SECURITY', sch);

    EXECUTE format('DROP POLICY IF EXISTS agenda_citas_select ON %I.agenda_citas', sch);
    EXECUTE format(
      'CREATE POLICY agenda_citas_select ON %I.agenda_citas FOR SELECT USING (public.puede_acceder_empresa(empresa_id))',
      sch
    );
    EXECUTE format('DROP POLICY IF EXISTS agenda_citas_insert ON %I.agenda_citas', sch);
    EXECUTE format(
      'CREATE POLICY agenda_citas_insert ON %I.agenda_citas FOR INSERT WITH CHECK (public.puede_acceder_empresa(empresa_id))',
      sch
    );
    EXECUTE format('DROP POLICY IF EXISTS agenda_citas_update ON %I.agenda_citas', sch);
    EXECUTE format(
      'CREATE POLICY agenda_citas_update ON %I.agenda_citas FOR UPDATE USING (public.puede_acceder_empresa(empresa_id)) WITH CHECK (public.puede_acceder_empresa(empresa_id))',
      sch
    );
    EXECUTE format('DROP POLICY IF EXISTS agenda_citas_delete ON %I.agenda_citas', sch);
    EXECUTE format(
      'CREATE POLICY agenda_citas_delete ON %I.agenda_citas FOR DELETE USING (public.puede_acceder_empresa(empresa_id))',
      sch
    );

    -- Trigger updated_at.
    EXECUTE format('DROP TRIGGER IF EXISTS tr_agenda_citas_updated ON %I.agenda_citas', sch);
    EXECUTE format(
      'CREATE TRIGGER tr_agenda_citas_updated BEFORE UPDATE ON %I.agenda_citas FOR EACH ROW EXECUTE FUNCTION public.set_updated_at()',
      sch
    );

  END LOOP;
END $$;

-- =============================================================================
-- Catálogo de módulos: registrar 'agenda' (SIN activación masiva).
--
-- Decisión de producto (Fase 1A): la migración NO debe activar Agenda para todas
-- las empresas. Solo registra el módulo en el catálogo. La activación por empresa
-- se gestiona puntualmente (ver bloque "seed correctivo" más abajo) o desde el
-- panel de módulos. Así una instancia base o dedicada no habilita Agenda de golpe.
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'zentra_erp' AND table_name = 'modulos'
  ) THEN
    INSERT INTO zentra_erp.modulos (id, nombre, slug)
    SELECT gen_random_uuid(), 'Agenda', 'agenda'
    WHERE NOT EXISTS (SELECT 1 FROM zentra_erp.modulos WHERE slug = 'agenda');
  END IF;

  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'modulos'
  ) THEN
    INSERT INTO public.modulos (id, nombre, slug)
    SELECT gen_random_uuid(), 'Agenda', 'agenda'
    WHERE NOT EXISTS (SELECT 1 FROM public.modulos WHERE slug = 'agenda');
  END IF;
END $$;

-- =============================================================================
-- Seed correctivo puntual: activar Agenda SOLO para la empresa "neura".
--
-- Identifica a Neura por nombre (case-insensitive) de forma segura e idempotente.
-- - Si la empresa "neura" no existe en el schema (instancia base/dedicada de otro
--   cliente), este bloque NO activa nada (no-op) y la activación queda para el
--   panel de módulos.
-- - Si ya existe la fila empresa_modulos, garantiza activo=true; si no, la inserta.
-- - NO toca la activación de ninguna otra empresa.
-- =============================================================================
DO $$
DECLARE
  neura_id uuid;
  agenda_id uuid;
BEGIN
  -- zentra_erp
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'zentra_erp' AND table_name = 'empresa_modulos'
  ) THEN
    SELECT id INTO neura_id FROM zentra_erp.empresas
      WHERE lower(nombre_empresa) = 'neura' ORDER BY created_at LIMIT 1;
    SELECT id INTO agenda_id FROM zentra_erp.modulos WHERE slug = 'agenda' LIMIT 1;
    IF neura_id IS NOT NULL AND agenda_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM zentra_erp.empresa_modulos WHERE empresa_id = neura_id AND modulo_id = agenda_id) THEN
        UPDATE zentra_erp.empresa_modulos SET activo = true
          WHERE empresa_id = neura_id AND modulo_id = agenda_id;
      ELSE
        INSERT INTO zentra_erp.empresa_modulos (empresa_id, modulo_id, activo)
          VALUES (neura_id, agenda_id, true);
      END IF;
    END IF;
  END IF;

  neura_id := NULL; agenda_id := NULL;

  -- public (legacy)
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'empresa_modulos'
  ) THEN
    SELECT id INTO neura_id FROM public.empresas
      WHERE lower(nombre_empresa) = 'neura' ORDER BY created_at LIMIT 1;
    SELECT id INTO agenda_id FROM public.modulos WHERE slug = 'agenda' LIMIT 1;
    IF neura_id IS NOT NULL AND agenda_id IS NOT NULL THEN
      IF EXISTS (SELECT 1 FROM public.empresa_modulos WHERE empresa_id = neura_id AND modulo_id = agenda_id) THEN
        UPDATE public.empresa_modulos SET activo = true
          WHERE empresa_id = neura_id AND modulo_id = agenda_id;
      ELSE
        INSERT INTO public.empresa_modulos (empresa_id, modulo_id, activo)
          VALUES (neura_id, agenda_id, true);
      END IF;
    END IF;
  END IF;
END $$;
