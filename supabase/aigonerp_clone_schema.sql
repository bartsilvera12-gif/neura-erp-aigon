-- =============================================================================
-- Clona la ESTRUCTURA COMPLETA del schema `odontoexcell` en un schema nuevo
-- llamado `aigonerp`, SIN copiar ningún dato.
--
-- Uso: pegar todo este archivo en el SQL Editor de Supabase self-hosted
--      (ejecutar como `postgres` / superusuario) y correrlo de una sola vez.
--
-- Qué clona:
--   * schema aigonerp (lo crea)
--   * tipos propios del schema (enums, dominios, composites) y remapeo de columnas
--   * tablas (columnas, defaults, generated, identity, storage, comentarios)
--   * secuencias (recreadas desde 1, con OWNED BY reapuntado)
--   * PK / UNIQUE / CHECK / FOREIGN KEYS (reapuntadas dentro de aigonerp)
--   * índices secundarios
--   * triggers
--   * RLS habilitado + policies
--   * vistas y vistas materializadas (WITH NO DATA)
--   * funciones / procedimientos plpgsql y sql (RPC)
--   * grants para anon / authenticated / service_role / postgres
--   * membresía en la publicación `supabase_realtime`
--
-- Qué NO clona: filas. Todas las tablas quedan vacías.
--
-- Para volver a empezar de cero:  DROP SCHEMA IF EXISTS aigonerp CASCADE;
-- =============================================================================

DO $CLONE$
DECLARE
  v_src   text := 'odontoexcell';   -- schema origen
  v_dst   text := 'aigonerp';       -- schema destino (se crea)
  v_pub   text := 'supabase_realtime';
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = v_src) THEN
    RAISE EXCEPTION 'El schema origen % no existe', v_src;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = v_dst) THEN
    RAISE EXCEPTION 'El schema destino % ya existe. Borralo con DROP SCHEMA % CASCADE; si querés rehacerlo.', v_dst, v_dst;
  END IF;

  EXECUTE format('CREATE SCHEMA %I', v_dst);
  EXECUTE format('GRANT USAGE ON SCHEMA %I TO postgres, anon, authenticated, service_role', v_dst);
  RAISE NOTICE 'clone: schema % creado', v_dst;
END;
$CLONE$;

-- -----------------------------------------------------------------------------
-- Helper: reescribe cualquier referencia a `odontoexcell` por `aigonerp`
-- (cubre odontoexcell.tabla, "odontoexcell".tabla y SET search_path = odontoexcell)
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION aigonerp._clone_rewrite(p_expr text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $fn$
  SELECT CASE
    WHEN p_expr IS NULL THEN NULL
    ELSE regexp_replace(
           regexp_replace(p_expr, '"odontoexcell"', '"aigonerp"', 'g'),
           '\yodontoexcell\y', 'aigonerp', 'g'
         )
  END;
$fn$;

-- -----------------------------------------------------------------------------
-- 1) Tipos propios del schema origen (enums / dominios / composites)
-- -----------------------------------------------------------------------------
DO $CLONE$
DECLARE
  r RECORD;
  v_labels text;
  v_cols text;
BEGIN
  FOR r IN
    SELECT t.oid, t.typname::text AS typname, t.typtype::text AS typtype
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = 'odontoexcell'
      AND t.typtype IN ('e', 'd', 'c')
      -- excluir los tipos fila creados automáticamente por cada tabla/vista
      AND NOT EXISTS (SELECT 1 FROM pg_class c WHERE c.reltype = t.oid)
    ORDER BY t.typname
  LOOP
    BEGIN
      IF r.typtype = 'e' THEN
        SELECT string_agg(quote_literal(e.enumlabel), ', ' ORDER BY e.enumsortorder)
          INTO v_labels
        FROM pg_enum e WHERE e.enumtypid = r.oid;
        EXECUTE format('CREATE TYPE aigonerp.%I AS ENUM (%s)', r.typname, coalesce(v_labels, ''));

      ELSIF r.typtype = 'd' THEN
        EXECUTE format(
          'CREATE DOMAIN aigonerp.%I AS %s %s %s',
          r.typname,
          (SELECT format_type(t.typbasetype, t.typtypmod) FROM pg_type t WHERE t.oid = r.oid),
          coalesce((SELECT 'DEFAULT ' || t.typdefault FROM pg_type t WHERE t.oid = r.oid AND t.typdefault IS NOT NULL), ''),
          coalesce((SELECT string_agg('CHECK ' || regexp_replace(pg_get_constraintdef(c.oid), '^CHECK ', ''), ' ')
                    FROM pg_constraint c WHERE c.contypid = r.oid), '')
        );

      ELSE -- composite
        SELECT string_agg(format('%I %s', a.attname, format_type(a.atttypid, a.atttypmod)), ', ' ORDER BY a.attnum)
          INTO v_cols
        FROM pg_attribute a
        WHERE a.attrelid = (SELECT t.typrelid FROM pg_type t WHERE t.oid = r.oid)
          AND a.attnum > 0 AND NOT a.attisdropped;
        EXECUTE format('CREATE TYPE aigonerp.%I AS (%s)', r.typname, v_cols);
      END IF;
      RAISE NOTICE 'clone: tipo % creado', r.typname;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'clone: tipo % omitido: %', r.typname, SQLERRM;
    END;
  END LOOP;
END;
$CLONE$;

-- -----------------------------------------------------------------------------
-- 2) Tablas (estructura, sin datos)
-- -----------------------------------------------------------------------------
DO $CLONE$
DECLARE
  tbl text;
BEGIN
  FOR tbl IN
    SELECT c.relname::text
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'odontoexcell' AND c.relkind = 'r'
    ORDER BY c.relname
  LOOP
    EXECUTE format(
      'CREATE TABLE aigonerp.%I (LIKE odontoexcell.%I '
      || 'INCLUDING DEFAULTS INCLUDING GENERATED INCLUDING IDENTITY '
      || 'INCLUDING STATISTICS INCLUDING STORAGE INCLUDING COMMENTS '
      || 'EXCLUDING CONSTRAINTS EXCLUDING INDEXES)',
      tbl, tbl
    );
  END LOOP;
  RAISE NOTICE 'clone: tablas creadas';
END;
$CLONE$;

-- -----------------------------------------------------------------------------
-- 3) Remapear columnas que quedaron apuntando a tipos de odontoexcell
-- -----------------------------------------------------------------------------
DO $CLONE$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT c.relname::text AS tabla,
           a.attname::text AS col,
           tn.nspname::text AS tipo_schema,
           bt.typname::text AS tipo_nombre,
           (t.typcategory = 'A') AS es_array
    FROM pg_attribute a
    JOIN pg_class c ON c.oid = a.attrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_type t ON t.oid = a.atttypid
    JOIN pg_type bt ON bt.oid = CASE WHEN t.typcategory = 'A' THEN t.typelem ELSE t.oid END
    JOIN pg_namespace tn ON tn.oid = bt.typnamespace
    WHERE n.nspname = 'aigonerp'
      AND c.relkind = 'r'
      AND a.attnum > 0 AND NOT a.attisdropped
      AND tn.nspname = 'odontoexcell'
      AND EXISTS (
        SELECT 1 FROM pg_type t2
        JOIN pg_namespace n2 ON n2.oid = t2.typnamespace
        WHERE n2.nspname = 'aigonerp' AND t2.typname = bt.typname
      )
  LOOP
    BEGIN
      EXECUTE format(
        'ALTER TABLE aigonerp.%I ALTER COLUMN %I TYPE aigonerp.%I%s USING %I::text%s::aigonerp.%I%s',
        r.tabla, r.col, r.tipo_nombre, CASE WHEN r.es_array THEN '[]' ELSE '' END,
        r.col, CASE WHEN r.es_array THEN '[]' ELSE '' END,
        r.tipo_nombre, CASE WHEN r.es_array THEN '[]' ELSE '' END
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'clone: remapeo de tipo %.% omitido: %', r.tabla, r.col, SQLERRM;
    END;
  END LOOP;
END;
$CLONE$;

-- -----------------------------------------------------------------------------
-- 4) Secuencias propias + defaults nextval() reapuntados al schema nuevo
-- -----------------------------------------------------------------------------
DO $CLONE$
DECLARE
  r RECORD;
BEGIN
  -- 4.a crear las secuencias que falten (las de IDENTITY ya las creó el LIKE)
  FOR r IN
    SELECT s.sequencename::text AS seq, s.data_type::text AS dtype,
           s.increment_by, s.min_value, s.max_value, s.start_value, s.cache_size, s.cycle
    FROM pg_sequences s
    WHERE s.schemaname = 'odontoexcell'
  LOOP
    BEGIN
      EXECUTE format(
        'CREATE SEQUENCE IF NOT EXISTS aigonerp.%I AS %s INCREMENT BY %s MINVALUE %s MAXVALUE %s START WITH %s CACHE %s %s',
        r.seq, r.dtype, r.increment_by, r.min_value, r.max_value, r.start_value, r.cache_size,
        CASE WHEN r.cycle THEN 'CYCLE' ELSE 'NO CYCLE' END
      );
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'clone: secuencia % omitida: %', r.seq, SQLERRM;
    END;
  END LOOP;

  -- 4.b reapuntar defaults que quedaron con nextval('odontoexcell...')
  FOR r IN
    SELECT c.relname::text AS tabla, a.attname::text AS col,
           pg_get_expr(d.adbin, d.adrelid) AS def
    FROM pg_attrdef d
    JOIN pg_class c ON c.oid = d.adrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = d.adrelid AND a.attnum = d.adnum
    WHERE n.nspname = 'aigonerp'
      AND pg_get_expr(d.adbin, d.adrelid) ILIKE '%odontoexcell%'
  LOOP
    BEGIN
      EXECUTE format('ALTER TABLE aigonerp.%I ALTER COLUMN %I SET DEFAULT %s',
                     r.tabla, r.col, aigonerp._clone_rewrite(r.def));
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'clone: default %.% omitido: %', r.tabla, r.col, SQLERRM;
    END;
  END LOOP;

  -- 4.c replicar OWNED BY de las secuencias
  FOR r IN
    SELECT s.relname::text AS seq, t.relname::text AS tabla, a.attname::text AS col
    FROM pg_depend dep
    JOIN pg_class s ON s.oid = dep.objid AND s.relkind = 'S'
    JOIN pg_namespace ns ON ns.oid = s.relnamespace
    JOIN pg_class t ON t.oid = dep.refobjid
    JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = dep.refobjsubid
    WHERE ns.nspname = 'odontoexcell'
      AND dep.classid = 'pg_class'::regclass
      AND dep.refclassid = 'pg_class'::regclass
      AND dep.deptype IN ('a', 'i')
  LOOP
    BEGIN
      EXECUTE format('ALTER SEQUENCE aigonerp.%I OWNED BY aigonerp.%I.%I', r.seq, r.tabla, r.col);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'clone: OWNED BY de % omitido: %', r.seq, SQLERRM;
    END;
  END LOOP;
END;
$CLONE$;

-- -----------------------------------------------------------------------------
-- 5) PK / UNIQUE / EXCLUDE / CHECK, índices secundarios y FKs
-- -----------------------------------------------------------------------------
DO $CLONE$
DECLARE
  r RECORD;
  def text;
BEGIN
  -- 5.a PK, UNIQUE, CHECK, EXCLUDE
  FOR r IN
    SELECT c.oid, c.conname::text AS conname, cf.relname::text AS relname
    FROM pg_constraint c
    JOIN pg_class cf ON cf.oid = c.conrelid
    JOIN pg_namespace nf ON nf.oid = cf.relnamespace
    WHERE nf.nspname = 'odontoexcell'
      AND c.contype IN ('p', 'u', 'c', 'x')
      AND cf.relkind = 'r'
    ORDER BY CASE c.contype WHEN 'p' THEN 1 WHEN 'u' THEN 2 WHEN 'x' THEN 3 ELSE 4 END, c.conname
  LOOP
    def := aigonerp._clone_rewrite(pg_get_constraintdef(r.oid));
    BEGIN
      EXECUTE format('ALTER TABLE aigonerp.%I ADD CONSTRAINT %I %s', r.relname, r.conname, def);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'clone: constraint %.% omitido: %', r.relname, r.conname, SQLERRM;
    END;
  END LOOP;

  -- 5.b índices que no vienen de un constraint
  FOR r IN
    SELECT pg_get_indexdef(i.oid) AS idef, i.relname::text AS iname
    FROM pg_class i
    JOIN pg_namespace n ON n.oid = i.relnamespace
    JOIN pg_index ix ON ix.indexrelid = i.oid
    JOIN pg_class t ON t.oid = ix.indrelid
    WHERE n.nspname = 'odontoexcell'
      AND i.relkind = 'i'
      AND t.relkind = 'r'
      AND ix.indisprimary IS FALSE
      AND NOT EXISTS (SELECT 1 FROM pg_constraint co WHERE co.conindid = i.oid)
  LOOP
    BEGIN
      EXECUTE aigonerp._clone_rewrite(r.idef);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'clone: índice % omitido: %', r.iname, SQLERRM;
    END;
  END LOOP;

  -- 5.c foreign keys (reapuntadas a aigonerp)
  FOR r IN
    SELECT c.oid, c.conname::text AS conname, cf.relname::text AS from_table
    FROM pg_constraint c
    JOIN pg_class cf ON cf.oid = c.conrelid
    JOIN pg_namespace nf ON nf.oid = cf.relnamespace
    WHERE nf.nspname = 'odontoexcell' AND c.contype = 'f' AND cf.relkind = 'r'
    ORDER BY c.conname
  LOOP
    def := aigonerp._clone_rewrite(pg_get_constraintdef(r.oid));
    BEGIN
      EXECUTE format('ALTER TABLE aigonerp.%I ADD CONSTRAINT %I %s', r.from_table, r.conname, def);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'clone: FK %.% omitido: %', r.from_table, r.conname, SQLERRM;
    END;
  END LOOP;
END;
$CLONE$;

-- -----------------------------------------------------------------------------
-- 6) Funciones / procedimientos (varias rondas por dependencias entre ellas)
-- -----------------------------------------------------------------------------
DO $CLONE$
DECLARE
  fn_oid oid;
  fdef text;
  v_round int;
  v_hechas int;
BEGIN
  FOR v_round IN 1..20 LOOP
    v_hechas := 0;
    FOR fn_oid IN
      SELECT p.oid
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      JOIN pg_language l ON l.oid = p.prolang
      WHERE n.nspname = 'odontoexcell'
        AND p.prokind IN ('f', 'p')
        AND l.lanname IN ('plpgsql', 'sql')
        AND p.proname <> '_clone_rewrite'
    LOOP
      fdef := pg_get_functiondef(fn_oid);
      CONTINUE WHEN fdef IS NULL;
      fdef := aigonerp._clone_rewrite(fdef);
      BEGIN
        EXECUTE fdef;
        v_hechas := v_hechas + 1;
      EXCEPTION WHEN OTHERS THEN
        NULL; -- se reintenta en la próxima ronda
      END;
    END LOOP;
    EXIT WHEN v_hechas = 0;
  END LOOP;
  RAISE NOTICE 'clone: funciones clonadas';
END;
$CLONE$;

-- -----------------------------------------------------------------------------
-- 7) Triggers
-- -----------------------------------------------------------------------------
DO $CLONE$
DECLARE
  r RECORD;
  tdef text;
BEGIN
  FOR r IN
    SELECT tg.tgname::text AS tgname, c.relname::text AS tabla,
           pg_get_triggerdef(tg.oid, true) AS tdef
    FROM pg_trigger tg
    JOIN pg_class c ON c.oid = tg.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'odontoexcell'
      AND NOT tg.tgisinternal
      AND c.relkind = 'r'
  LOOP
    tdef := aigonerp._clone_rewrite(r.tdef);
    BEGIN
      EXECUTE format('DROP TRIGGER IF EXISTS %I ON aigonerp.%I', r.tgname, r.tabla);
      EXECUTE tdef;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'clone: trigger % en % omitido: %', r.tgname, r.tabla, SQLERRM;
    END;
  END LOOP;
END;
$CLONE$;

-- -----------------------------------------------------------------------------
-- 8) RLS + policies
-- -----------------------------------------------------------------------------
DO $CLONE$
DECLARE
  r RECORD;
  tbl text;
  qual text;
  chk text;
  roles_clause text;
BEGIN
  FOR tbl IN
    SELECT c.relname::text
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'odontoexcell' AND c.relkind = 'r' AND c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE aigonerp.%I ENABLE ROW LEVEL SECURITY', tbl);
  END LOOP;

  FOR tbl IN
    SELECT c.relname::text
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'odontoexcell' AND c.relkind = 'r' AND c.relforcerowsecurity
  LOOP
    EXECUTE format('ALTER TABLE aigonerp.%I FORCE ROW LEVEL SECURITY', tbl);
  END LOOP;

  FOR r IN
    SELECT pol.polname::text AS polname,
           c.relname::text AS tabla,
           pol.polcmd::text AS cmd,
           pol.polpermissive AS permissive,
           pg_get_expr(pol.polqual, pol.polrelid) AS polqual,
           pg_get_expr(pol.polwithcheck, pol.polrelid) AS polwithcheck,
           ARRAY(SELECT rolname FROM pg_roles WHERE oid = ANY (pol.polroles)) AS roles
    FROM pg_policy pol
    JOIN pg_class c ON c.oid = pol.polrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'odontoexcell'
  LOOP
    BEGIN
      qual := aigonerp._clone_rewrite(r.polqual);
      chk  := aigonerp._clone_rewrite(r.polwithcheck);

      IF r.roles IS NULL OR coalesce(cardinality(r.roles), 0) = 0 THEN
        roles_clause := '';
      ELSE
        roles_clause := ' TO ' || (SELECT string_agg(quote_ident(x), ', ') FROM unnest(r.roles) AS x);
      END IF;

      EXECUTE format('DROP POLICY IF EXISTS %I ON aigonerp.%I', r.polname, r.tabla);

      IF r.cmd = 'r' THEN
        EXECUTE format('CREATE POLICY %I ON aigonerp.%I AS %s FOR SELECT%s USING (%s)',
          r.polname, r.tabla, CASE WHEN r.permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
          roles_clause, coalesce(qual, 'true'));
      ELSIF r.cmd = 'a' THEN
        EXECUTE format('CREATE POLICY %I ON aigonerp.%I AS %s FOR INSERT%s WITH CHECK (%s)',
          r.polname, r.tabla, CASE WHEN r.permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
          roles_clause, coalesce(chk, qual, 'true'));
      ELSIF r.cmd = 'w' THEN
        EXECUTE format('CREATE POLICY %I ON aigonerp.%I AS %s FOR UPDATE%s USING (%s) WITH CHECK (%s)',
          r.polname, r.tabla, CASE WHEN r.permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
          roles_clause, coalesce(qual, 'true'), coalesce(chk, qual, 'true'));
      ELSIF r.cmd = 'd' THEN
        EXECUTE format('CREATE POLICY %I ON aigonerp.%I AS %s FOR DELETE%s USING (%s)',
          r.polname, r.tabla, CASE WHEN r.permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
          roles_clause, coalesce(qual, 'true'));
      ELSE -- '*' = ALL
        EXECUTE format('CREATE POLICY %I ON aigonerp.%I AS %s FOR ALL%s USING (%s) WITH CHECK (%s)',
          r.polname, r.tabla, CASE WHEN r.permissive THEN 'PERMISSIVE' ELSE 'RESTRICTIVE' END,
          roles_clause, coalesce(qual, 'true'), coalesce(chk, qual, 'true'));
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'clone: policy % en % omitida: %', r.polname, r.tabla, SQLERRM;
    END;
  END LOOP;
END;
$CLONE$;

-- -----------------------------------------------------------------------------
-- 9) Vistas y vistas materializadas (sin datos)
-- -----------------------------------------------------------------------------
DO $CLONE$
DECLARE
  r RECORD;
  v_def text;
  v_pass int;
BEGIN
  FOR v_pass IN 1..12 LOOP
    FOR r IN
      SELECT c.relname::text AS vname
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'odontoexcell' AND c.relkind = 'v'
    LOOP
      CONTINUE WHEN EXISTS (
        SELECT 1 FROM pg_class c2
        JOIN pg_namespace n2 ON n2.oid = c2.relnamespace
        WHERE n2.nspname = 'aigonerp' AND c2.relname = r.vname AND c2.relkind = 'v'
      );
      SELECT pg_get_viewdef(format('odontoexcell.%I', r.vname)::regclass, true) INTO v_def;
      CONTINUE WHEN v_def IS NULL;
      BEGIN
        EXECUTE format('CREATE VIEW aigonerp.%I AS %s', r.vname, aigonerp._clone_rewrite(v_def));
      EXCEPTION WHEN OTHERS THEN
        NULL; -- se reintenta en la próxima pasada
      END;
    END LOOP;
  END LOOP;

  FOR r IN
    SELECT c.relname::text AS mname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'odontoexcell' AND c.relkind = 'm'
  LOOP
    SELECT pg_get_viewdef(format('odontoexcell.%I', r.mname)::regclass, true) INTO v_def;
    CONTINUE WHEN v_def IS NULL;
    BEGIN
      EXECUTE format('CREATE MATERIALIZED VIEW aigonerp.%I AS %s WITH NO DATA',
                     r.mname, aigonerp._clone_rewrite(v_def));
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'clone: matview % omitida: %', r.mname, SQLERRM;
    END;
  END LOOP;
END;
$CLONE$;

-- -----------------------------------------------------------------------------
-- 10) Grants, realtime y limpieza
-- -----------------------------------------------------------------------------
DO $CLONE$
DECLARE
  r RECORD;
  v_pub text := 'supabase_realtime';
BEGIN
  EXECUTE 'GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA aigonerp TO authenticated';
  EXECUTE 'GRANT ALL ON ALL TABLES IN SCHEMA aigonerp TO postgres, service_role';
  EXECUTE 'GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA aigonerp TO authenticated';
  EXECUTE 'GRANT ALL ON ALL SEQUENCES IN SCHEMA aigonerp TO postgres, service_role';
  EXECUTE 'GRANT EXECUTE ON ALL ROUTINES IN SCHEMA aigonerp TO authenticated, service_role';
  EXECUTE 'GRANT ALL ON ALL ROUTINES IN SCHEMA aigonerp TO postgres, service_role';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aigonerp GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aigonerp GRANT ALL ON TABLES TO postgres, service_role';
  EXECUTE 'ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA aigonerp GRANT USAGE, SELECT ON SEQUENCES TO authenticated';

  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = v_pub) THEN
    FOR r IN
      SELECT pt.tablename::text AS tablename
      FROM pg_publication_tables pt
      WHERE pt.pubname = v_pub AND pt.schemaname = 'odontoexcell'
    LOOP
      BEGIN
        EXECUTE format('ALTER PUBLICATION %I ADD TABLE aigonerp.%I', v_pub, r.tablename);
      EXCEPTION WHEN OTHERS THEN
        RAISE NOTICE 'clone: realtime % omitido: %', r.tablename, SQLERRM;
      END;
    END LOOP;
  END IF;

  PERFORM pg_notify('pgrst', 'reload schema');
END;
$CLONE$;

DROP FUNCTION IF EXISTS aigonerp._clone_rewrite(text);

-- -----------------------------------------------------------------------------
-- 11) Verificación: comparar objetos origen vs destino (todo debe dar diff = 0)
-- -----------------------------------------------------------------------------
SELECT
  'tablas' AS objeto,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'odontoexcell' AND c.relkind = 'r') AS origen,
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'aigonerp' AND c.relkind = 'r') AS destino
UNION ALL SELECT 'vistas',
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'odontoexcell' AND c.relkind IN ('v','m')),
  (SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'aigonerp' AND c.relkind IN ('v','m'))
UNION ALL SELECT 'columnas',
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'odontoexcell'),
  (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'aigonerp')
UNION ALL SELECT 'constraints',
  (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'odontoexcell'),
  (SELECT count(*) FROM pg_constraint c JOIN pg_namespace n ON n.oid = c.connamespace
    WHERE n.nspname = 'aigonerp')
UNION ALL SELECT 'indices',
  (SELECT count(*) FROM pg_indexes WHERE schemaname = 'odontoexcell'),
  (SELECT count(*) FROM pg_indexes WHERE schemaname = 'aigonerp')
UNION ALL SELECT 'funciones',
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'odontoexcell'),
  (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'aigonerp')
UNION ALL SELECT 'triggers',
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'odontoexcell' AND NOT t.tgisinternal),
  (SELECT count(*) FROM pg_trigger t JOIN pg_class c ON c.oid = t.tgrelid
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'aigonerp' AND NOT t.tgisinternal)
UNION ALL SELECT 'policies',
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'odontoexcell'),
  (SELECT count(*) FROM pg_policies WHERE schemaname = 'aigonerp');
