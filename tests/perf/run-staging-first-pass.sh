#!/usr/bin/env bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PERF_DIR="${ROOT_DIR}/tests/perf"
ENV_FILE="${PERF_DIR}/.env.local"

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Missing ${ENV_FILE}"
  echo "Copy tests/perf/.env.example to tests/perf/.env.local first."
  exit 1
fi

if ! command -v k6 >/dev/null 2>&1; then
  echo "k6 is not installed."
  exit 1
fi

if ! command -v autocannon >/dev/null 2>&1; then
  echo "autocannon is not installed."
  exit 1
fi

set -a
source "${ENV_FILE}"
set +a

echo "== Batch 1: quick regression =="
bash "${PERF_DIR}/autocannon/quick-regression.sh"

echo
echo "== Batch 2: public read baseline =="
k6 run "${PERF_DIR}/k6/public-read-baseline.js"

echo
echo "== Batch 3: developer paths =="
k6 run "${PERF_DIR}/k6/developer-paths.js"

echo
echo "== Batch 4: admin and jobs =="
k6 run "${PERF_DIR}/k6/admin-and-jobs.js"

echo
echo "First-pass staging performance run finished."
