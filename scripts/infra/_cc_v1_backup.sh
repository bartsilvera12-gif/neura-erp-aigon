#!/usr/bin/env bash
# =============================================================================
# Contact Center V1 — BACKUP de seguridad ANTES de aplicar la migración.
# Ejecutar en la VPS:  py scripts/infra/ssh-run-file.py scripts/infra/_cc_v1_backup.sh
#
# Las migraciones son ADITIVAS (ADD COLUMN IF NOT EXISTS + tablas nuevas). Las únicas
# tablas PREEXISTENTES afectadas son neura.chat_conversations y neura.chat_agents
# (solo ganan columnas nullables/con default → reversible). Respaldamos esquema+datos
# de esas dos y dejamos conteos de control para comparar antes/después.
#
# No imprime secretos. Solo toca el schema `neura`. No asume `public`.
# =============================================================================
set -euo pipefail

TS="$(date +%Y%m%d_%H%M%S)"
OUT="/tmp/cc_v1_backup_${TS}.sql"
CONTAINER="supabase-db"

echo "== Backup Contact Center V1  ->  ${OUT}  (en la VPS) =="

echo "-- Conteos de control (guardalos para comparar después del apply) --"
docker exec -i "${CONTAINER}" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -X -P pager=off <<'SQL'
SELECT 'chat_conversations' AS tabla, count(*) AS filas FROM neura.chat_conversations
UNION ALL
SELECT 'chat_agents' AS tabla, count(*) AS filas FROM neura.chat_agents
ORDER BY 1;
SQL

echo "-- pg_dump (esquema+datos) de las dos tablas afectadas, solo neura --"
docker exec "${CONTAINER}" pg_dump -U postgres -d postgres \
  --no-owner --no-privileges \
  -t 'neura.chat_conversations' \
  -t 'neura.chat_agents' \
  > "${OUT}"

echo "== Backup escrito en la VPS: =="
ls -lh "${OUT}"
echo "== Para descargarlo a tu máquina (desde tu PC):  scp root@VPS:${OUT} . =="
echo "== Restauración de emergencia (DB limpia):  docker exec -i ${CONTAINER} psql -U postgres -d postgres < ${OUT} =="
echo "== Nota: migración aditiva => el mejor chequeo de integridad es comparar los conteos de arriba antes vs después del apply (no deben cambiar). =="
