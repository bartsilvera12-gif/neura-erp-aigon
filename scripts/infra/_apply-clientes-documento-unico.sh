#!/usr/bin/env bash
set -e
docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
SET search_path = neura, public;

CREATE UNIQUE INDEX IF NOT EXISTS ux_clientes_documento_norm_neura
ON neura.clientes (
  empresa_id,
  (upper(regexp_replace(
     coalesce(nullif(btrim(ruc), ''), nullif(btrim(documento), '')),
     '[^A-Za-z0-9]', '', 'g'
   )))
)
WHERE deleted_at IS NULL
  AND upper(regexp_replace(
        coalesce(nullif(btrim(ruc), ''), nullif(btrim(documento), '')),
        '[^A-Za-z0-9]', '', 'g'
      )) <> '';

COMMENT ON INDEX neura.ux_clientes_documento_norm_neura IS
  'Anti-duplicados: RUC/Cedula normalizado unico por empresa entre clientes no eliminados. El nombre se valida a nivel app.';

\echo '=== Verificacion: indice creado ==='
SELECT indexname, indexdef
FROM pg_indexes
WHERE schemaname='neura' AND tablename='clientes' AND indexname='ux_clientes_documento_norm_neura';
SQL
