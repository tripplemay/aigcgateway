#!/usr/bin/env bash
# Codex 测试环境：唯一初始化脚本
# 每次使用前无需判断"应该用哪个脚本"——始终用这一个。
#
# 执行内容：清理旧进程 → 重置测试数据库 → 安装依赖 → 迁移 → 种子 → 构建 → 启动
#
# 用法（两步，分两个终端/PTY 会话）：
#   # 步骤 1：在持久 PTY 会话中前台运行（进程会阻塞在 node 上）
#   bash scripts/test/codex-setup.sh
#
#   # 步骤 2：在另一个 shell 中等待服务就绪
#   bash scripts/test/codex-wait.sh
#
# 注意：脚本末尾使用 exec 将当前 shell 替换为 node 进程。
# 在 Codex 沙箱中，不要用 & 后台运行本脚本——进程会立即消失。
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

# ── 0. 清理旧进程 ──
echo "=== [0/5] Killing old process on :3099 ==="
lsof -ti:3099 | xargs kill -9 2>/dev/null || true

# ── 1. 重置测试数据库 ──
echo "=== [1/5] Resetting test database ==="
"$PSQL" postgres -c "CREATE USER test WITH PASSWORD 'test' SUPERUSER;" 2>/dev/null || true
"$PSQL" postgres -c "DROP DATABASE IF EXISTS $DB_NAME;"
"$PSQL" postgres -c "CREATE DATABASE $DB_NAME OWNER test;"

# ── 2. 安装依赖 ──
echo "=== [2/5] Install dependencies ==="
npm ci --ignore-scripts

# ── 3. Prisma generate + migrate + seed ──
echo "=== [3/5] Prisma generate + migrate deploy + seed ==="
npx prisma generate
npx prisma migrate deploy
npx prisma db seed

# ── 4. 构建 ──
echo "=== [4/5] Build ==="
rm -rf .next
npm run build

# ── 5. 复制静态资源 + 前台启动 ──
echo "=== [5/5] Start on :3099 (foreground via exec) ==="
cp -r .next/static .next/standalone/.next/static 2>/dev/null || true
cp -r public .next/standalone/public 2>/dev/null || true
exec node .next/standalone/server.js
