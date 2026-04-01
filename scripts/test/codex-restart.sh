#!/usr/bin/env bash
# Codex 测试环境：快速重启（重新构建 + 启动，不重置数据库）
# 用于代码更新后，只需要重新构建和启动
#
# 用法：bash scripts/test/codex-restart.sh
# 脚本末尾用 exec 切到前台 node 进程，Codex 应在后台运行本脚本，
# 然后轮询 http://localhost:3099/v1/models 等待就绪。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/codex-env.sh"

# ── 0. 清理旧进程 ──
lsof -ti:3099 | xargs kill -9 2>/dev/null || true

# ── 1. 依赖 + Prisma Client + 构建 ──
echo "=== [1/2] Install + Prisma generate + build ==="
npm ci --ignore-scripts
npx prisma generate
rm -rf .next
npm run build

# ── 2. 复制静态资源 + 前台启动 ──
echo "=== [2/2] Start on :3099 (foreground via exec) ==="
cp -r .next/static .next/standalone/.next/static 2>/dev/null || true
cp -r public .next/standalone/public 2>/dev/null || true
exec node .next/standalone/server.js
