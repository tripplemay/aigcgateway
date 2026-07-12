# BL-PROD-MIGRATE-DEPLOYSVR — 生产环境迁移到 deploysvr

- **批次类型：** 混合批次（generator 代码交付 + codex 验收）
- **状态：** planning → building
- **创建：** 2026-07-11（Planner: Kimi）
- **role_assignments：** generator=Kimi(cli) / evaluator=Reviewer(codex)

---

## 1. 背景与目标

旧生产 VPS（GCP e2-highmem-2，`34.180.93.185`，东京）即将下线。将 **AIGC Gateway** 生产环境迁移到本机已知的新 VPS `deploysvr`（`194.238.26.173`，Ubuntu 24.04，4 vCPU / 7.8 GB / 145 GB）。

**本批次范围仅 AIGC Gateway。** 旧机上还运行 kolmatrix + kolmatrix-staging（PM2 id 4/5/7），旧 VPS 真正退役需 kolmatrix 也迁走——属本批次之外的依赖，见 §8。

## 2. 现状调查（2026-07-11 已核实）

### 2.1 旧生产（源）
- 运行方式：**原生 PM2** cluster×2，`aigc-gateway`，port 3000，Node v22.22.2，`/opt/aigc-gateway`，用户 `tripplezhou`。
- 启动配置：`/opt/aigc-gateway/ecosystem.config.cjs`（env 内联，含全部 secrets）；另有 `/opt/aigc-gateway/.env.production`。
- 数据库：原生 PostgreSQL 17.9，库 `aigc_gateway`，owner `aigc`，**272 MB**（体量小，dump/restore 秒级）。
- Redis：原生。
- 反代/TLS：自带 nginx + Certbot，直接持有公网 443；域名 `aigc.guangai.ai` + `cdn.aigc.guangai.ai`。
- 图片持久化：GCS 桶 `aigc-gateway-images`，**GCP ADC 元数据免密**（服务账号 `1044753973286-compute@developer.gserviceaccount.com`）。
- **需原样迁移的 secrets（键名，值从旧机 ecosystem.config.cjs / .env.production 读取，禁止写入仓库）：**
  `ENCRYPTION_KEY`（解密 `Provider.authConfig`，最高优先级——不一致则全站 provider 凭据瘫痪）、`JWT_SECRET`、`IMAGE_PROXY_SECRET`、`AUTH_SECRET`、`NEXTAUTH_SECRET`、DB 密码。

### 2.2 新目标 deploysvr（目标）
- Docker 化主机，已有成熟迁移范式：grandtianfu、invoce 两项目已按同一模式迁移完成（GHCR 预构建镜像 + 容器绑 127.0.0.1 loopback + host nginx 反代）。范式剧本参考 `/root/migration/grandtianfu/MIGRATION_STATE.md`（服务器上）与 `/opt/apps/invoce/docker-compose.prod.yml`（最接近本项目技术栈的参照）。
- 端口 3000 空闲；ufw inactive；host nginx include `conf.d/*` + `sites-enabled/*`，已有 `map $http_upgrade $proxy_connection_upgrade`（`conf.d/00-http-upgrade-map.conf`，可复用）。
- **certbot 未安装、无 Let's Encrypt 证书**（需本批次安装+签发）。
- GHCR owner 惯例：`ghcr.io/tripplemay/...`（本仓库 remote 为 github.com/tripplemay/aigcgateway）。

### 2.3 拓扑决策（用户 2026-07-11 裁决）
**AIGC 不复用 grandtianfu 的 dmitsvr/WireGuard 中转链路，用户直连 deploysvr，与旧机直连方式一致。**

```
用户 → DNS aigc.guangai.ai / cdn.aigc.guangai.ai → 194.238.26.173(deploysvr 公网)
     → deploysvr host nginx :80/:443 (Certbot TLS，新 server 块)
     → 127.0.0.1:3000 (aigc app 容器)
     → postgres:17 + redis:7 容器（compose 内网）
```

新增的公网 80/443 server 块与既有 `10.77.0.2:8080` origin 块（grandtianfu/invoce 走 WireGuard 那套）**监听地址不同，互不冲突**。

## 3. 硬约束（必须专门处理）

- **H1 ENCRYPTION_KEY 一致性（红线）：** 新栈必须逐字沿用旧机 `ENCRYPTION_KEY`，否则数据库内加密的 provider 凭据无法解密 = 全站调用瘫痪。JWT/IMAGE_PROXY/AUTH/NEXTAUTH 同理。
- **H2 GCS 跨云凭据：** 桶留在 GCP 不动。新机非 GCP，ADC 元数据失效 → 用户导出一个对 `aigc-gateway-images` 桶有 objectAdmin 的**服务账号 key JSON**，挂进容器 + `GOOGLE_APPLICATION_CREDENTIALS` 指向挂载路径。存量图片代理读 + 新图写都依赖此凭据。（用户已选此方案，Planner 提供导出步骤，见 runbook。）
- **H3 SSE / MCP 流式：** origin nginx 对 `/v1/` 与 `/mcp` 必须 `proxy_buffering off`，保证流式不被缓冲截断。
- **H4 直连入口不破坏既有服务：** 新增公网 80/443 块不得影响 grandtianfu/invoce 的 `10.77.0.2:8080` origin 服务。
- **H5 不可逆步骤门禁：** 数据终态同步、DNS 切换、旧机停写为不可逆操作，执行时需用户显式 go/no-go。

## 4. 设计决策

- **D1 部署模型：** 容器化 GHCR-pull（用户裁决）。复用仓库 `Dockerfile`（standalone `runner` 阶段）。**弃用仓库现有 `docker-compose.production.yml`**（其自带 nginx/certbot 抢 80/443，与本机共享模型冲突），新写 deploysvr 专用 compose。
- **D2 compose 结构（对标 invoce）：** 服务 `app` + `postgres:17-alpine` + `redis:7-alpine`；`app` 绑 `127.0.0.1:3000:3000`；GHCR 镜像 `ghcr.io/tripplemay/aigcgateway:${IMAGE_TAG}`；pg/redis 用命名卷持久化；env 从服务器 `.env`（不入仓，权限 600）注入。
- **D3 GCS 凭据接线：** compose 挂载宿主 key 文件（如 `/opt/apps/aigc-gateway/secrets/gcs-sa.json:ro`）到容器，设 `GOOGLE_APPLICATION_CREDENTIALS=/app/secrets/gcs-sa.json`；`IMAGE_PERSIST_ENABLED=true`、`GCS_IMAGE_BUCKET=aigc-gateway-images` 保持。
- **D4 Prisma 迁移路径（容器模型）：** standalone runner 镜像不含 prisma CLI/全量 node_modules，无法直接 `prisma migrate deploy`。方案：新增一个含全量依赖 + prisma schema 的 **migrate 镜像阶段**（或 compose 内 `migrate` 一次性服务），部署流程「先迁移后重启 app」（对标 invoce alembic 独立步骤）。Generator 择优实现，acceptance 校验迁移可在容器内成功执行。
- **D5 CI/CD 改造：** 新增「构建镜像 + 推 GHCR」workflow（按 git sha 打不可变 tag，`main` push 触发）；`deploy.yml` 从 git-pull-build 改写为 **SSH → `docker compose pull` → migrate → `docker compose up -d` → 健康检查**。GitHub secrets 更新清单：`VPS_HOST=194.238.26.173`、`VPS_USERNAME`、`VPS_SSH_KEY`（deploysvr 对应私钥）、`VPS_SSH_PORT`。回滚 = 换 `IMAGE_TAG`。
- **D6 入口 nginx：** 仓库内维护 `deploy/nginx/aigc.conf` 模板（host nginx `sites-available/aigc.conf` → `sites-enabled` 软链），公网 `listen 80` + `listen 443 ssl http2`，`server_name aigc.guangai.ai cdn.aigc.guangai.ai`，`proxy_pass http://127.0.0.1:3000`。**复刻旧机 `nginx/conf.d/default.conf` 全部 location：** `/v1/models`（缓存 60s + gzip）、`/v1/`（`proxy_buffering off` SSE）、`/mcp`（流式）、`/api/webhooks/`、`/`（websocket upgrade）、`cdn.` 子域静态缓存；安全头对齐 `ssl-params.conf`。
- **D7 TLS：** deploysvr 装 certbot；域名在 Cloudflare → 用 **DNS-01（Cloudflare API token）预签发** `aigc.guangai.ai` + `cdn.aigc.guangai.ai` 证书，DNS 切换零 TLS 空窗（HTTP-01 需先切 DNS，有短暂空窗，作为备选）。
- **D8 Redis 弃旧起新：** Redis 内容为缓存/限流/健康态，非持久业务数据。新栈起空 Redis。Generator 在割接前 `redis-cli --scan` 确认旧机无持久业务 key（如有则评估迁移），否则弃旧。
- **D9 回滚控制（对标 grandtianfu 剧本）：** 旧机 API 停写但保留数据冻结 + PM2 进程可快速拉起；旧 nginx/DNS 配置留存；GitHub `VPS_HOST` 回退值记录；镜像 TAG 回滚命令记录。观察期内不退旧机。

## 5. Feature 分解

### F-MIG-01（generator）— 容器化部署基座 + 入口配置（代码）
所有进仓库的部署/入口配置文件。
- 新增 `docker-compose.prod.yml`（deploysvr 专用，D2/D3）：app(127.0.0.1:3000) + postgres:17 + redis:7；GHCR 镜像；GCS key 卷挂 + `GOOGLE_APPLICATION_CREDENTIALS`；命名卷；`env_file: .env`。
- 新增 `.env.production.example`（deploysvr 版，仅键名占位，**禁真值**）：DATABASE_URL(容器内 `postgres:5432`)、REDIS_URL(`redis:6379`)、ENCRYPTION_KEY/JWT_SECRET/IMAGE_PROXY_SECRET/AUTH_SECRET/NEXTAUTH_SECRET、GCS_*、GOOGLE_APPLICATION_CREDENTIALS、EXCHANGE_RATE/LOG_* 等。
- Prisma 容器迁移路径（D4）：migrate 镜像阶段 or compose 一次性 `migrate` 服务。
- 新增 `deploy/nginx/aigc.conf`（D6，H3/H4）：公网 80/443 直连反代，复刻全部 location + SSE 不缓冲 + cdn 子域 + 安全头。
- `Dockerfile` 如需为 migrate 阶段微调则改（不破坏 runner 阶段）。
- **不改** 任何 `src/**` 产品代码、不改现有 `docker-compose.production.yml`（保留但标注弃用）。
- `npx tsc --noEmit` + `npm run build` PASS；独立 commit。

### F-MIG-02（generator）— CI/CD 管道改造
- 新增镜像构建 workflow：`main` push → build → 推 `ghcr.io/tripplemay/aigcgateway:<git-sha>` + `:latest`（`packages: write`）。
- 改写 `.github/workflows/deploy.yml`：`workflow_dispatch`（保留手动）→ SSH deploysvr → `cd /opt/apps/aigc-gateway` → 设 `IMAGE_TAG` → `docker compose pull` → 迁移 → `docker compose up -d` → 健康检查 `curl -sf http://127.0.0.1:3000/v1/models`。
- 文档化 GitHub secrets 更新清单（D5），标注 `VPS_HOST` 旧值 `34.180.93.185` 作回滚。
- `ci.yml`（lint+tsc+vitest+build）保持不变或按需微调，不回归。
- 独立 commit。

### F-MIG-03（generator）— 迁移 runbook + 生产割接实操
- 新增 `docs/ops/deploysvr-migration-runbook.md`（对标 grandtianfu MIGRATION_STATE.md），含：
  1. **P0 准备**：新机建 `/opt/apps/aigc-gateway`（compose+.env 600+secrets/）；用户导出 GCS SA key 步骤；装 certbot；Cloudflare DNS-01 token。
  2. **P2 起新栈**：`docker compose up -d` pg/redis/app（先灌旧库快照）；loopback 冒烟 `/v1/models` + `/mcp` + 真实 chat + 图片生成→GCS 回读。
  3. **P3 数据终态同步**：停旧机写入 → `pg_dump aigc_gateway` → restore 新库 → 校验行数 + 关键表**双哈希 parity**（content + metadata，对标 grandtianfu）；Redis 弃旧起新确认（D8）。
  4. **P4 边缘割接**：Certbot 预签发 → 装 `sites-enabled/aigc.conf` + reload → DNS `aigc`+`cdn` A 记录指向 `194.238.26.173` → 更新 GitHub secrets。
  5. **P5 观察期 + 回滚就绪**（D9）：旧机 API 停、数据冻结、旧 nginx/DNS/`VPS_HOST` 回滚点留存；用户验收（含直连可达性）前不退旧机。
  6. **P6 退役门禁**：用户明确验收后才退；含 kolmatrix 依赖说明。
- **按 runbook 执行 P0–P5 受监督实操**。**H5 三个不可逆门禁（数据终态同步 / DNS 切换 / 旧机停写）执行前必须取得用户显式 go/no-go。**
- 割接完成后回写 runbook「Current live state / Verified parity / Rollback controls」实测值。

### F-MIG-04（codex/evaluator）— 验收 signoff
前置：F-MIG-01~03 完成、新栈已割接。
- 冒烟：`/v1/models`（缓存头）、真实 `chat`（非流 + 流式 SSE 不被缓冲）、`generate_image` → GCS 持久化 → 代理 URL 回读 200、`/mcp` 全流程（list_models→chat→get_balance 等）。
- 数据 parity 复核：新库关键表行数 + 双哈希与旧库一致；抽查若干 provider `authConfig` 解密成功（验证 ENCRYPTION_KEY 正确）。
- 直连可达性：公网 `https://aigc.guangai.ai` 证书有效、TLS 链正常、直连 deploysvr。
- 回滚演练可行性：验证旧机可快速拉起 + 旧 DNS/`VPS_HOST` 回退路径成立（不真正回滚）。
- 输出 `docs/test-reports/BL-PROD-MIGRATE-DEPLOYSVR-signoff-YYYY-MM-DD.md`，含命令/日志证据 + PASS/FAIL。

## 6. 验收标准（总）
1. `https://aigc.guangai.ai` 直连 deploysvr，证书有效，控制台 + API + MCP 全可用。
2. provider 凭据解密正常（ENCRYPTION_KEY 迁移正确），真实 chat / 图片调用成功。
3. 图片 GCS 持久化写入 + 存量图片代理回读均正常（GCS SA key 生效）。
4. SSE 流式与 `/mcp` 过反代不被缓冲。
5. 数据 parity 校验通过（新旧库一致）。
6. push-to-deploy 管道可用（GHCR 构建 → 部署 → 健康检查绿）。
7. 回滚控制齐备，旧机在观察期保持可回退。

## 7. 回滚方案
- **流量回滚：** DNS `aigc`+`cdn` A 记录改回 `34.180.93.185`；GitHub `VPS_HOST` 改回 `34.180.93.185`；旧机 `pm2 start aigc-gateway`（若已停）。
- **镜像回滚（新机内）：** `IMAGE_TAG=<上个 good sha> docker compose up -d`。
- 旧机数据在观察期冻结不写，作为一致性回退点。

## 8. 风险与门禁
- **R1** ENCRYPTION_KEY 不一致 → 全站瘫痪。缓解：H1 红线，割接后 evaluator 抽查解密。
- **R2** GCS 凭据未配好 → 图片挂。缓解：P0 前置导出 key + P2 冒烟回读验证。
- **R3** SSE/MCP 被缓冲 → 流式中断。缓解：D6 显式 `proxy_buffering off` + evaluator 流式验收。
- **R4** DNS/割接不可逆。缓解：H5 门禁 + D9 回滚控制 + 观察期。
- **R5** 旧 VPS 承载 kolmatrix + kolmatrix-staging → **旧机真正下线受制于 kolmatrix 迁移，非本批次范围**。本批次只做到 AIGC「新机上线 + 旧机 AIGC 冻结可回滚」，旧机整机退役单列。
- **R6** 公网 80/443 provider 层防火墙可能未放通（ufw 虽 inactive）。缓解：P0 验证 80/443 inbound 可达。
