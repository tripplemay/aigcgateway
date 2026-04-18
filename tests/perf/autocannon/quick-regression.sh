#!/usr/bin/env bash

set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:3099}"
DEV_EMAIL="${DEV_EMAIL:-dev@example.com}"
DEV_PASSWORD="${DEV_PASSWORD:?DEV_PASSWORD is required}"
ADMIN_TOKEN="${ADMIN_TOKEN:-}"

echo "== public models smoke =="
autocannon -c 2 -a 20 "${BASE_URL}/api/v1/models"

echo
echo "== public models load =="
autocannon -c 10 -a 100 "${BASE_URL}/api/v1/models"

echo
echo "== developer login =="
autocannon \
  -c 5 \
  -a 50 \
  -m POST \
  -H "Content-Type: application/json" \
  -b "{\"email\":\"${DEV_EMAIL}\",\"password\":\"${DEV_PASSWORD}\"}" \
  "${BASE_URL}/api/auth/login"

if [[ -n "${ADMIN_TOKEN}" ]]; then
  echo
  echo "== admin sync-status =="
  autocannon \
    -c 5 \
    -a 50 \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    "${BASE_URL}/api/admin/sync-status"

  echo
  echo "== admin channels =="
  autocannon \
    -c 5 \
    -a 50 \
    -H "Authorization: Bearer ${ADMIN_TOKEN}" \
    "${BASE_URL}/api/admin/channels"
fi
