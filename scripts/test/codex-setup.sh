#!/usr/bin/env bash
# Codex 测试环境：首次初始化（重置 DB + 迁移 + 种子 + 构建 + 启动）
# 前提：本地 PostgreSQL 和 Redis 已在运行
#
# 用法：bash scripts/test/codex-setup.sh
# 脚本末尾用 exec 切到前台 node 进程，Codex 应在后台运行本脚本，
# 然后轮询 http://localhost:3099/v1/models 等待就绪。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/codex-env.sh"

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

# ── 0. 清理上次残留的测试进程 ──
lsof -ti:3099 | xargs kill -9 2>/dev/null || true

# ── 1. 重置测试数据库 ──
echo "=== [1/4] Resetting test database ==="
"$PSQL" postgres -c "CREATE USER test WITH PASSWORD 'test' SUPERUSER;" 2>/dev/null || true
"$PSQL" postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
"$PSQL" postgres -c "CREATE DATABASE $DB_NAME OWNER test;"

# ── 2. 依赖 + 迁移 + 种子 ──
echo "=== [2/4] Install + Migrate + seed ==="
npm ci --ignore-scripts
npx prisma generate
npx prisma migrate deploy
npx prisma db seed

# ── 3. 构建 ──
echo "=== [3/4] Build ==="
rm -rf .next
npm run build

# ── 4. 复制静态资源 + 前台启动 ──
echo "=== [4/4] Start on :3099 (foreground via exec) ==="
cp -r .next/static .next/standalone/.next/static 2>/dev/null || true
cp -r public .next/standalone/public 2>/dev/null || true
exec node .next/standalone/server.js
