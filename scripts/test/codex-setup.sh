#!/usr/bin/env bash
# Codex 测试环境：首次初始化（重置 DB + 迁移 + 种子 + 构建 + 启动）
# 前提：本地 PostgreSQL 和 Redis 已在运行（brew services）
set -euo pipefail

# ── 定位 psql ──
if command -v psql > /dev/null 2>&1; then
  PSQL="psql"
elif [ -x "$(brew --prefix postgresql@16 2>/dev/null)/bin/psql" ]; then
  PSQL="$(brew --prefix postgresql@16)/bin/psql"
elif [ -x "$(brew --prefix postgresql 2>/dev/null)/bin/psql" ]; then
  PSQL="$(brew --prefix postgresql)/bin/psql"
else
  echo "ERROR: psql not found" >&2
  exit 1
fi

DB_NAME="aigc_gateway_test"
DB_URL="postgresql://test:test@localhost:5432/$DB_NAME"

# ── 0. 清理上次残留的测试进程 ──
lsof -ti:3099 | xargs kill -9 2>/dev/null || true

# ── 1. 重置测试数据库 ──
echo "=== [1/4] Resetting test database ==="
"$PSQL" postgres -c "CREATE USER test WITH PASSWORD 'test' SUPERUSER;" 2>/dev/null || true
"$PSQL" postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
"$PSQL" postgres -c "CREATE DATABASE $DB_NAME OWNER test;"

# ── 2. 迁移 + 种子 ──
echo "=== [2/4] Migrate + seed ==="
export DATABASE_URL="$DB_URL"
export REDIS_URL="redis://localhost:6379/0"
export JWT_SECRET="test-jwt-secret"
export JWT_EXPIRES_IN="7d"
export EXCHANGE_RATE_CNY_TO_USD="0.137"
export DEFAULT_MARKUP_RATIO="1.2"
export HEALTH_CHECK_ACTIVE_INTERVAL_MS="600000"
export HEALTH_CHECK_STANDBY_INTERVAL_MS="1800000"
export HEALTH_CHECK_COLD_INTERVAL_MS="7200000"
export HEALTH_CHECK_FAIL_THRESHOLD="3"
export DEFAULT_RPM="60"
export DEFAULT_TPM="100000"
export DEFAULT_IMAGE_RPM="10"
export NODE_ENV="test"
export PORT="3099"

npx prisma generate
npx prisma migrate deploy
npx prisma db seed

# ── 3. 构建 ──
echo "=== [3/4] Build ==="
rm -rf .next
npm run build

# ── 4. 启动 + 就绪探针 ──
echo "=== [4/4] Start on :3099 ==="
nohup node .next/standalone/server.js > /tmp/aigc-test-server.log 2>&1 &
APP_PID=$!
disown $APP_PID

for i in $(seq 1 30); do
  if curl -sf --noproxy '*' http://localhost:3099/v1/models > /dev/null 2>&1; then
    echo "=== Test environment ready at http://localhost:3099 (PID: $APP_PID) ==="
    echo "=== Server log: /tmp/aigc-test-server.log ==="
    exit 0
  fi
  if ! kill -0 $APP_PID 2>/dev/null; then
    echo "ERROR: Server process exited unexpectedly. Check /tmp/aigc-test-server.log" >&2
    exit 1
  fi
  sleep 2
done

echo "ERROR: App failed to start within 60 seconds. Check /tmp/aigc-test-server.log" >&2
kill $APP_PID 2>/dev/null || true
exit 1
