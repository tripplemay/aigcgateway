#!/usr/bin/env bash
# 等待本地测试服务就绪
#
# 用法：bash scripts/test/codex-wait.sh
#
# 在另一个 shell 中运行此脚本，等待 codex-setup.sh 启动的服务响应。
# 最多等待 120 秒（40 次 × 3 秒），超时后以非零退出码退出。
set -euo pipefail

TARGET="http://localhost:3099/v1/models"
MAX=40
INTERVAL=3

echo "Waiting for $TARGET ..."
for i in $(seq 1 $MAX); do
  if curl -sf --noproxy '*' "$TARGET" > /dev/null 2>&1; then
    echo "✅ Ready (${i}x${INTERVAL}s elapsed)"
    exit 0
  fi
  echo "  [${i}/${MAX}] not ready, retrying in ${INTERVAL}s..."
  sleep $INTERVAL
done

echo "❌ Timeout: service did not become ready within $((MAX * INTERVAL))s" >&2
exit 1
