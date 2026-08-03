#!/usr/bin/env bash
set -e
echo "=== ¿En qué schemas existe 'usuarios'? ==="
docker exec supabase-db psql -U postgres -d postgres -c "
SELECT n.nspname AS schema, c.relname AS table_name
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE c.relname='usuarios' AND c.relkind='r'
ORDER BY n.nspname;
"
