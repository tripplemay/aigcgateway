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

# ── psql 连接参数（默认 Unix socket，远端/容器场景请预先 export） ──
# 默认假设本机 PostgreSQL 监听 Unix socket（macOS Homebrew / Linux 默认）。
# 远端或容器场景：在调用本脚本前先 export PGHOST/PGPORT/PGUSER/PGPASSWORD
# 即可（psql 会自动读取这些 env），无需改本脚本。
#
# 例（连本机 docker postgres :5433）：
#   export PGHOST=127.0.0.1 PGPORT=5433 PGUSER=postgres PGPASSWORD=postgres
#   bash scripts/test/codex-setup.sh

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
echo "=== [0/5] Killing old process on :3199 ==="
lsof -ti:3199 | xargs kill -9 2>/dev/null || true

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
echo "=== [5/5] Start on :3199 (foreground via exec) ==="
# Next.js standalone build does not bundle .next/static or public; manual copy is required.
# Pre-clean target dirs to avoid macOS/BSD `cp -r` nesting (`cp -r src dest/` -> `dest/src/` when dest exists).
rm -rf .next/standalone/.next/static .next/standalone/public
cp -r .next/static .next/standalone/.next/static
cp -r public .next/standalone/public
# Fail-fast verify: standalone must contain real chunks; otherwise every page chunk request 400/404s and pages NO_FCP.
if [ -z "$(ls -A .next/standalone/.next/static/chunks 2>/dev/null)" ]; then
  echo "ERROR: .next/standalone/.next/static/chunks empty after cp" >&2
  exit 1
fi
exec node .next/standalone/server.js
