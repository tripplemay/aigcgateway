#!/usr/bin/env bash
# Codex 测试环境：快速重启（重新构建 + 启动，不重置数据库）
# 用于代码更新后，只需要重新构建和启动
set -euo pipefail

# ── 0. 清理旧进程 ──
lsof -ti:3099 | xargs kill -9 2>/dev/null || true

# ── 1. 环境变量 ──
export DATABASE_URL="postgresql://test:test@localhost:5432/aigc_gateway_test"
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

# ── 2. 重新生成 Prisma Client + 构建 ──
echo "=== [1/2] Prisma generate + build ==="
npx prisma generate
rm -rf .next
npm run build

# ── 3. 启动 + 就绪探针 ──
echo "=== [2/2] Start on :3099 ==="
node .next/standalone/server.js &
APP_PID=$!

for i in $(seq 1 30); do
  if curl -sf http://localhost:3099/v1/models > /dev/null 2>&1; then
    echo "=== Test environment ready at http://localhost:3099 (PID: $APP_PID) ==="
    exit 0
  fi
  sleep 2
done

echo "ERROR: App failed to start within 60 seconds" >&2
kill $APP_PID 2>/dev/null || true
exit 1
