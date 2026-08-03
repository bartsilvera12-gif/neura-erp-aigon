#!/usr/bin/env bash
# Poll endpoint /api/_diag/version hasta que responda 200 (deploy activo) o timeout.
set -e
URL="https://sistemas.neura.com.py/api/_diag/version"
for i in $(seq 1 30); do
  CODE=$(curl -s -m 12 -o /tmp/diag.json -w "%{http_code}" "$URL" 2>/dev/null)
  TS=$(date -u +%H:%M:%S)
  if [ "$CODE" = "200" ]; then
    echo "[$TS] intento $i — DEPLOY ACTIVO (200):"
    cat /tmp/diag.json
    echo
    exit 0
  fi
  echo "[$TS] intento $i: HTTP=$CODE (sigue sin deploy)"
  sleep 20
done
echo "TIMEOUT: 10 min sin que el endpoint responda 200."
echo "Conclusión: Coolify NO está auto-deployando los pushes recientes."
exit 1
