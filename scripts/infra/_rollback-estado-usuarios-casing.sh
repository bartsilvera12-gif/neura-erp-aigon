#!/usr/bin/env bash
# ROLLBACK del fix de casing de estado (2026-06-18).
# Revierte estado "activo" -> "ACTIVO" SOLO en los 2 usuarios afectados.
# IDs: IVAN GUILLEN (de4c8df0...) y bartolome silvera (01f107cc...).
# Uso: bash scripts/infra/_rollback-estado-usuarios-casing.sh
set -euo pipefail

URL=$(grep "NEXT_PUBLIC_SUPABASE_URL" .env.local | cut -d= -f2- | tr -d '"' | tr -d '\r')
KEY=$(grep "SUPABASE_SERVICE_ROLE_KEY" .env.local | cut -d= -f2- | tr -d '"' | tr -d '\r')

curl -s -X PATCH \
  "$URL/rest/v1/usuarios?id=in.(de4c8df0-0347-4f0d-a78e-966f99e8e450,01f107cc-85c8-4988-b602-4ad6d64d5331)" \
  -H "apikey: $KEY" -H "Authorization: Bearer $KEY" \
  -H "Content-Profile: neura" -H "Content-Type: application/json" -H "Prefer: return=representation" \
  -d '{"estado":"ACTIVO"}'
echo
