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

# ── psql 连接参数（自动探测，无可用 PG 时拉起 docker container） ──
# 优先级：
#   1. 调用方已 export PGHOST/PGPORT/PGUSER/PGPASSWORD 且能连 → 沿用
#   2. 本机默认 Unix socket 能连 (`psql postgres -c 'SELECT 1'`) → 沿用
#   3. docker 可用 → 启动/复用 container `aigc-gateway-test-pg`，
#      自动 export PGHOST=localhost PGPORT=5432 PGUSER=postgres PGPASSWORD=postgres
#   4. 都不行 → 清晰报错退出
#
# 这样 evaluator 默认环境（macOS+Colima、CI、纯 docker 沙箱）开箱即可跑，
# 不再需要手动 export PG*。

PG_CONTAINER_NAME="aigc-gateway-test-pg"

# ── 定位 psql ──
if command -v psql > /dev/null 2>&1; then
  PSQL="psql"
elif [ -x "$(brew --prefix postgresql@16 2>/dev/null)/bin/psql" ]; then
  PSQL="$(brew --prefix postgresql@16)/bin/psql"
elif [ -x "$(brew --prefix postgresql 2>/dev/null)/bin/psql" ]; then
  PSQL="$(brew --prefix postgresql)/bin/psql"
else
  echo "ERROR: psql not found (install postgresql-client or libpq)" >&2
  exit 1
fi

DB_NAME="aigc_gateway_test"

# ── PG bootstrap helpers ──

# 端口探测：bash 内建 /dev/tcp，TCP connect 成功 = 端口被占（有 server）
port_busy() {
  (exec 3<> "/dev/tcp/127.0.0.1/$1") 2> /dev/null
  local rc=$?
  exec 3<&- 3>&- 2> /dev/null || true
  return $rc
}

# 拿 OS 分配的空闲 host port（避开 5432 已被占用的场景）
find_free_port() {
  if command -v node > /dev/null 2>&1; then
    node -e 'const s=require("net").createServer().listen(0,"127.0.0.1",()=>{const p=s.address().port; s.close(()=>console.log(p));})' 2> /dev/null && return 0
  fi
  if command -v python3 > /dev/null 2>&1; then
    python3 -c 'import socket; s=socket.socket(); s.bind(("127.0.0.1",0)); print(s.getsockname()[1]); s.close()' 2> /dev/null && return 0
  fi
  echo 15432
}

# 把 export 的 PGHOST/PGPORT/PGUSER/PGPASSWORD 同步到 DATABASE_URL，
# 覆盖 codex-env.sh 里写死的 5432（让 prisma migrate / seed / next 都跟随）
sync_database_url() {
  export DATABASE_URL="postgresql://test:test@${PGHOST:-localhost}:${PGPORT:-5432}/aigc_gateway_test"
}

ensure_pg() {
  # 第 1+2 步：当前 PG* env / 默认 socket 能否连通
  if "$PSQL" postgres -c "SELECT 1" > /dev/null 2>&1; then
    echo "=== [PG] using existing PostgreSQL (PGHOST=${PGHOST:-socket} PGPORT=${PGPORT:-5432}) ==="
    return 0
  fi

  # 第 3 步：docker fallback
  if ! command -v docker > /dev/null 2>&1; then
    cat >&2 <<EOF
ERROR: 无法连接 PostgreSQL，且未发现 docker。
请安装本机 PostgreSQL（监听默认 socket 或预先 export PGHOST/PGPORT/PGUSER/PGPASSWORD），
或安装 Docker（codex-setup.sh 会自动起 ${PG_CONTAINER_NAME}）。
EOF
    return 1
  fi
  if ! docker info > /dev/null 2>&1; then
    cat >&2 <<EOF
ERROR: docker 命令存在但 daemon 未运行。
  - macOS/Colima：colima start
  - Linux：sudo systemctl start docker
  - Docker Desktop：启动 Docker.app
EOF
    return 1
  fi

  # 优先复用我们自己的 container（不碰别项目的 PG，不碰 socket）
  if docker ps -a --format '{{.Names}}' | grep -qx "${PG_CONTAINER_NAME}"; then
    if ! docker ps --format '{{.Names}}' | grep -qx "${PG_CONTAINER_NAME}"; then
      # 已存在但停了 — 试 start，fail 通常意味着旧容器 -p 5432:5432 撞当前已占用，rm 重建
      if ! docker start "${PG_CONTAINER_NAME}" > /dev/null 2>&1; then
        echo "=== [PG] existing container failed to start (port conflict?), recreating ==="
        docker rm -f "${PG_CONTAINER_NAME}" > /dev/null 2>&1 || true
      fi
    fi
  fi

  # 不存在或刚被 rm → 新建（5432 空闲就用 5432 维持向后兼容；被占就 OS 分配）
  if ! docker ps -a --format '{{.Names}}' | grep -qx "${PG_CONTAINER_NAME}"; then
    HOST_PORT=5432
    if port_busy "${HOST_PORT}"; then
      HOST_PORT=$(find_free_port)
      echo "=== [PG] :5432 occupied → starting ${PG_CONTAINER_NAME} on host :${HOST_PORT} ==="
    else
      echo "=== [PG] starting ${PG_CONTAINER_NAME} on host :${HOST_PORT} ==="
    fi
    docker run -d \
      --name "${PG_CONTAINER_NAME}" \
      -e POSTGRES_USER=postgres \
      -e POSTGRES_PASSWORD=postgres \
      -p "${HOST_PORT}:5432" \
      postgres:16-alpine > /dev/null
  fi

  # 等就绪 + 拿 docker 实际暴露的 host port + export PG* + sync DATABASE_URL
  for _ in $(seq 1 30); do
    if docker exec "${PG_CONTAINER_NAME}" pg_isready -U postgres > /dev/null 2>&1; then
      RESOLVED_PORT=$(docker port "${PG_CONTAINER_NAME}" 5432/tcp 2> /dev/null | sed -n 's/.*:\([0-9][0-9]*\)$/\1/p' | head -1)
      export PGHOST=localhost PGPORT="${RESOLVED_PORT:-5432}" PGUSER=postgres PGPASSWORD=postgres
      sync_database_url
      echo "=== [PG] container ready on :${PGPORT} (DATABASE_URL synced) ==="
      return 0
    fi
    sleep 1
  done

  echo "ERROR: docker container ${PG_CONTAINER_NAME} 30 秒内未就绪" >&2
  return 1
}

ensure_pg

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
