#!/usr/bin/env bash
# Codex 测试环境：前台启动服务
# 用法：bash scripts/test/codex-start.sh
#
# 此脚本用 exec 替换当前 shell 进程为 node 服务，
# 确保在任何执行环境（包括沙箱）中进程都不会因父 shell 退出而被杀。
# Codex 应在后台调用此脚本，然后用轮询等待 3099 就绪。
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
source "$SCRIPT_DIR/codex-env.sh"

# 清理旧进程
lsof -ti:3099 | xargs kill -9 2>/dev/null || true
sleep 1

# standalone 模式需要手动复制静态资源和 public 目录
cp -r .next/static .next/standalone/.next/static 2>/dev/null || true
cp -r public .next/standalone/public 2>/dev/null || true

# exec 替换 — 当前进程变为 node，不再是 bash 子进程
exec node .next/standalone/server.js
