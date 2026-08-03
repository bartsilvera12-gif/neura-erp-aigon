-- =============================================================================
-- Crea el usuario administrador inicial de Aigon ERP: admin@aigon.com
--
-- Hace dos cosas, que son las dos que hacen falta para poder loguearse:
--   1) la credencial en Supabase Auth (auth.users + auth.identities)
--   2) la fila de perfil en aigonerp.usuarios con rol = 'super_admin'
--
-- Es idempotente: si el usuario ya existe, le actualiza la contraseña y el rol.
--
-- ANTES DE EJECUTAR: cambiá el valor de v_password en la línea marcada.
-- Ejecutar en el SQL Editor de Supabase como `postgres`.
-- =============================================================================

DO $SEED$
DECLARE
  v_email    text := 'admin@aigon.com';
  v_password text := 'CAMBIAR_ESTA_CLAVE';   -- <<<<<< PONÉ ACÁ LA CONTRASEÑA
  v_nombre   text := 'Administrador';
  v_schema   text := 'aigonerp';

  v_uid uuid;
  v_hash text;
  v_cols text := '';
  v_vals text := '';
BEGIN
  PERFORM set_config('search_path', 'public, extensions, auth', true);

  IF v_password = 'CAMBIAR_ESTA_CLAVE' OR length(v_password) < 8 THEN
    RAISE EXCEPTION 'Poné una contraseña real en v_password (mínimo 8 caracteres).';
  END IF;

  v_hash := crypt(v_password, gen_salt('bf'));

  -- ---------------------------------------------------------------------------
  -- 1) Credencial en Supabase Auth
  -- ---------------------------------------------------------------------------
  SELECT id INTO v_uid FROM auth.users WHERE lower(email) = lower(v_email) LIMIT 1;

  IF v_uid IS NULL THEN
    v_uid := gen_random_uuid();

    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, last_sign_in_at,
      raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) VALUES (
      '00000000-0000-0000-0000-000000000000',
      v_uid, 'authenticated', 'authenticated', lower(v_email), v_hash,
      now(), now(),
      '{"provider":"email","providers":["email"]}'::jsonb,
      jsonb_build_object('nombre', v_nombre),
      now(), now(),
      '', '', '', ''
    );
    RAISE NOTICE 'seed: auth.users creado (%)', v_uid;
  ELSE
    UPDATE auth.users
    SET encrypted_password = v_hash,
        email_confirmed_at = coalesce(email_confirmed_at, now()),
        banned_until       = NULL,
        deleted_at         = NULL,
        updated_at         = now()
    WHERE id = v_uid;
    RAISE NOTICE 'seed: auth.users ya existía, contraseña actualizada (%)', v_uid;
  END IF;

  -- identity de tipo email (GoTrue la exige para login con contraseña)
  IF NOT EXISTS (
    SELECT 1 FROM auth.identities WHERE user_id = v_uid AND provider = 'email'
  ) THEN
    -- `provider_id` existe solo en versiones recientes de GoTrue: se agrega si está
    v_cols := 'id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at';
    v_vals := format(
      '%L::uuid, %L::uuid, %L::jsonb, %L, now(), now(), now()',
      gen_random_uuid(), v_uid,
      jsonb_build_object('sub', v_uid::text, 'email', lower(v_email), 'email_verified', true)::text,
      'email'
    );

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'auth' AND table_name = 'identities' AND column_name = 'provider_id'
    ) THEN
      v_cols := v_cols || ', provider_id';
      v_vals := v_vals || format(', %L', v_uid::text);
    END IF;

    EXECUTE format('INSERT INTO auth.identities (%s) VALUES (%s)', v_cols, v_vals);
    RAISE NOTICE 'seed: auth.identities creada';
  END IF;

  -- ---------------------------------------------------------------------------
  -- 2) Perfil en aigonerp.usuarios con rol super_admin
  --    (empresa_id NULL: es el rol global, ve y administra todas las empresas)
  -- ---------------------------------------------------------------------------
  v_cols := 'email, nombre, rol, auth_user_id, empresa_id';
  v_vals := format('%L, %L, %L, %L::uuid, NULL::uuid', lower(v_email), v_nombre, 'super_admin', v_uid);

  -- columnas opcionales según cómo esté definida la tabla
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = v_schema AND table_name = 'usuarios' AND column_name = 'estado') THEN
    v_cols := v_cols || ', estado';
    v_vals := v_vals || ', ''activo''';
  END IF;
  IF EXISTS (SELECT 1 FROM information_schema.columns
             WHERE table_schema = v_schema AND table_name = 'usuarios' AND column_name = 'activo') THEN
    v_cols := v_cols || ', activo';
    v_vals := v_vals || ', true';
  END IF;

  IF EXISTS (SELECT 1 FROM aigonerp.usuarios WHERE lower(email) = lower(v_email)) THEN
    UPDATE aigonerp.usuarios
    SET rol = 'super_admin',
        auth_user_id = v_uid,
        nombre = coalesce(nullif(trim(nombre), ''), v_nombre)
    WHERE lower(email) = lower(v_email);
    RAISE NOTICE 'seed: aigonerp.usuarios actualizado a super_admin';
  ELSE
    EXECUTE format('INSERT INTO aigonerp.usuarios (%s) VALUES (%s)', v_cols, v_vals);
    RAISE NOTICE 'seed: aigonerp.usuarios creado como super_admin';
  END IF;
END;
$SEED$;

-- -----------------------------------------------------------------------------
-- Verificación
-- -----------------------------------------------------------------------------
SELECT
  u.email,
  u.rol,
  u.empresa_id,
  u.auth_user_id,
  (au.id IS NOT NULL)                    AS tiene_credencial,
  (au.email_confirmed_at IS NOT NULL)    AS email_confirmado,
  (i.id IS NOT NULL)                     AS tiene_identity,
  (au.id = u.auth_user_id)               AS enlace_ok
FROM aigonerp.usuarios u
LEFT JOIN auth.users au ON lower(au.email) = lower(u.email)
LEFT JOIN auth.identities i ON i.user_id = au.id AND i.provider = 'email'
WHERE lower(u.email) = 'admin@aigon.com';
