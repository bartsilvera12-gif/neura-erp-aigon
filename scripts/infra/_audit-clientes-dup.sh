#!/usr/bin/env bash
set -e
docker exec -i supabase-db psql -U postgres -d postgres -v ON_ERROR_STOP=1 <<'SQL'
SET search_path = neura, public;
SET default_transaction_read_only = on;

\echo '=== Conteo total clientes (no eliminados) ==='
SELECT count(*) AS total_no_eliminados,
       count(*) FILTER (WHERE estado='activo') AS activos
FROM neura.clientes
WHERE deleted_at IS NULL;

\echo ''
\echo '=== A) DUPLICADOS POR DOCUMENTO normalizado (no eliminados, doc no vacio) ==='
WITH norm AS (
  SELECT id, empresa_id, estado,
         upper(regexp_replace(coalesce(nullif(btrim(ruc),''), nullif(btrim(documento),'')), '[^A-Za-z0-9]', '', 'g')) AS doc_n
  FROM neura.clientes
  WHERE deleted_at IS NULL
)
SELECT empresa_id, doc_n, count(*) AS n,
       array_agg(id::text) AS ids,
       array_agg(estado) AS estados
FROM norm
WHERE doc_n IS NOT NULL AND doc_n <> ''
GROUP BY empresa_id, doc_n
HAVING count(*) > 1
ORDER BY n DESC;

\echo ''
\echo '=== A.2) Cantidad de grupos duplicados por DOCUMENTO ==='
WITH norm AS (
  SELECT empresa_id,
         upper(regexp_replace(coalesce(nullif(btrim(ruc),''), nullif(btrim(documento),'')), '[^A-Za-z0-9]', '', 'g')) AS doc_n
  FROM neura.clientes
  WHERE deleted_at IS NULL
)
SELECT count(*) AS grupos_dup_documento
FROM (
  SELECT empresa_id, doc_n
  FROM norm
  WHERE doc_n IS NOT NULL AND doc_n <> ''
  GROUP BY empresa_id, doc_n
  HAVING count(*) > 1
) g;

\echo ''
\echo '=== B) DUPLICADOS POR NOMBRE principal normalizado (no eliminados, nombre no vacio) ==='
WITH norm AS (
  SELECT id, empresa_id, estado,
         upper(
           regexp_replace(
             btrim(
               translate(
                 coalesce(nullif(btrim(empresa),''), nombre),
                 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
                 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'
               )
             ),
           '\s+', ' ', 'g')
         ) AS name_n
  FROM neura.clientes
  WHERE deleted_at IS NULL
)
SELECT empresa_id, name_n, count(*) AS n,
       array_agg(id::text) AS ids,
       array_agg(estado) AS estados
FROM norm
WHERE name_n IS NOT NULL AND name_n <> ''
GROUP BY empresa_id, name_n
HAVING count(*) > 1
ORDER BY n DESC;

\echo ''
\echo '=== B.2) Cantidad de grupos duplicados por NOMBRE ==='
WITH norm AS (
  SELECT empresa_id,
         upper(
           regexp_replace(
             btrim(
               translate(
                 coalesce(nullif(btrim(empresa),''), nombre),
                 'áàäâãéèëêíìïîóòöôõúùüûñçÁÀÄÂÃÉÈËÊÍÌÏÎÓÒÖÔÕÚÙÜÛÑÇ',
                 'aaaaaeeeeiiiiooooouuuuncAAAAAEEEEIIIIOOOOOUUUUNC'
               )
             ),
           '\s+', ' ', 'g')
         ) AS name_n
  FROM neura.clientes
  WHERE deleted_at IS NULL
)
SELECT count(*) AS grupos_dup_nombre
FROM (
  SELECT empresa_id, name_n
  FROM norm
  WHERE name_n IS NOT NULL AND name_n <> ''
  GROUP BY empresa_id, name_n
  HAVING count(*) > 1
) g;
SQL
