#!/usr/bin/env bash
# =============================================================================
# Contact Center V1 — pre-flight de DEPENDENCIAS en `neura` (READ-ONLY).
# Verifica que existan las funciones que las migraciones referencian:
#   - neura.puede_acceder_empresa(uuid)  -> usada en las policies RLS.
#   - neura.set_updated_at()             -> trigger de updated_at (opcional; guardado).
# No imprime secretos. Solo lee.
# =============================================================================
set -euo pipefail
docker exec -i supabase-db psql -U postgres -d postgres -X -P pager=off -v ON_ERROR_STOP=1 <<'SQL'
\echo '== Dependencias RLS / triggers en neura (NULL = NO existe) =='
SELECT to_regprocedure('neura.puede_acceder_empresa(uuid)') AS puede_acceder_empresa_uuid,
       to_regprocedure('neura.set_updated_at()')            AS set_updated_at;
\echo '== Firmas reales de puede_acceder_empresa en neura (por si la firma difiere) =='
SELECT n.nspname AS schema, p.proname, pg_get_function_arguments(p.oid) AS args
FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname='neura' AND p.proname IN ('puede_acceder_empresa','set_updated_at')
ORDER BY 2,3;
SQL
