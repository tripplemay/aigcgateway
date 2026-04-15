#!/usr/bin/env bash

# F-RB-05: unified regression harness entry point.
#
# Runs the four L1 regression scripts in sequence against a single
# dev server and prints a pass/fail summary. Exit code is non-zero
# if any script failed so CI / Codex acceptance can trust the result.
#
# Usage:
#   BASE_URL=http://localhost:3099 API_KEY=pk_xxx scripts/test-all.sh
#
# Optional:
#   ZERO_BALANCE_API_KEY=pk_yyy  # enables the balance-exhausted MCP error case

set -u

BASE_URL="${BASE_URL:-http://localhost:3099}"
API_KEY="${API_KEY:-}"

if [ -z "$API_KEY" ]; then
  echo "ERROR: API_KEY env var is required (pk_... from a seeded project)." >&2
  exit 2
fi

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR/.."

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m'

SCRIPTS=(
  "e2e-test.ts"
  "e2e-errors.ts"
  "test-mcp.ts"
  "test-mcp-errors.ts"
)

OVERALL_FAIL=0
declare -a RESULT_NAMES=()
declare -a RESULT_CODES=()

for script in "${SCRIPTS[@]}"; do
  echo ""
  echo -e "${YELLOW}>> Running scripts/${script} ...${NC}"
  BASE_URL="$BASE_URL" API_KEY="$API_KEY" \
    ZERO_BALANCE_API_KEY="${ZERO_BALANCE_API_KEY:-}" \
    npx tsx "scripts/${script}"
  code=$?
  RESULT_NAMES+=("$script")
  RESULT_CODES+=("$code")
  if [ $code -ne 0 ]; then
    OVERALL_FAIL=1
  fi
done

echo ""
echo "=============================================="
echo "  test-all summary (BASE_URL=$BASE_URL)"
echo "=============================================="
for i in "${!RESULT_NAMES[@]}"; do
  name="${RESULT_NAMES[$i]}"
  code="${RESULT_CODES[$i]}"
  if [ "$code" = "0" ]; then
    echo -e "  ${GREEN}✓ PASS${NC} ${name}"
  else
    echo -e "  ${RED}✗ FAIL${NC} ${name} (exit=${code})"
  fi
done
echo "=============================================="

if [ $OVERALL_FAIL -ne 0 ]; then
  echo -e "${RED}Overall: FAIL${NC}"
  exit 1
fi
echo -e "${GREEN}Overall: PASS${NC}"
exit 0
