# 服务器迁移批次 Signoff 2026-04-04

> 状态：**PASS**
> 环境：GCP 新服务器 `34.180.93.185` / 生产域名 `https://aigc.guangai.ai`
> 触发：`progress.json status=reverifying`，对服务器迁移批次做复验并签收

## 测试目标

确认生产环境从旧 VPS `154.40.40.116` 迁移到 GCP 新服务器 `34.180.93.185` 已完整闭环，6 个功能点全部通过。

## 测试环境

- 新服务器 SSH：`tripplezhou@34.180.93.185`
- 新服务器部署目录：`/opt/aigc-gateway`
- 生产域名：`https://aigc.guangai.ai`
- 旧服务器 SSH：`root@154.40.40.116`

## 通过项

### F-MIGRATE-01 — PASS

- 新服务器基础环境已就绪：
  - `node -v` -> `v22.22.2`
  - `psql --version` -> `PostgreSQL 17.9`
  - `redis-cli ping` -> `PONG`
  - `nginx -v` 成功
  - `pm2 -v` -> `6.0.14`
- `/opt/aigc-gateway` 存在，且为 `main` 分支 Git 仓库

### F-MIGRATE-02 — PASS

- `.env.production` 与 `ecosystem.config.cjs` 已迁移到新服务器
- `DATABASE_URL` 已包含 `connection_limit=20`
- `JWT_SECRET` / `ENCRYPTION_KEY` 已存在
- `ecosystem.config.cjs` 可被 Node 正常解析
- 已去掉旧 VPS 的 `NODE_OPTIONS=--max-old-space-size=768` 限制

### F-MIGRATE-03 — PASS

- 新旧服务器主表读数一致：
  - `call_logs = 30`
  - `channels = 200`
  - `models = 557`

### F-MIGRATE-04 — PASS

- `pm2 list` 显示 `aigc-gateway` 两个 cluster 实例均为 `online`
- `curl http://localhost:3000/v1/models` 返回 `200`
- `.next/standalone/server.js` 与 `.next/standalone/.next/static` 存在
- `pm2-tripplezhou.service` 已 `enabled`

### F-MIGRATE-05 — PASS

- `nginx -t` 成功
- Nginx 配置已指向 `127.0.0.1:3000`
- 新服务器本机 `http://localhost/v1/models` 返回 `200`
- 新服务器本机 `http://34.180.93.185/v1/models` 返回 `200`
- 外部 `http://34.180.93.185/v1/models` 返回 `200`
- `https://aigc.guangai.ai/v1/models` 返回 `200`
- SSL 证书有效：
  - `subject=CN=aigc.guangai.ai`
  - `issuer=Let's Encrypt R13`
  - `notBefore=2026-04-04`
  - `notAfter=2026-07-03`

### F-MIGRATE-06 — PASS

- [deploy.yml](/Users/yixingzhou/project/aigcgateway/.github/workflows/deploy.yml) 已使用：
  - `VPS_HOST`
  - `VPS_SSH_PORT`
  - `VPS_USERNAME`
  - `VPS_SSH_KEY`
- 成功部署证据：
  - Run ID: `23981503068`
  - Workflow: `Deploy to VPS`
  - `conclusion = success`
  - `Deploy via SSH` / `Health Check` 步骤均为 `success`
- Secrets 更新时间证据已记录在 [server-migration-fix-evidence-2026-04-04.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/server-migration-fix-evidence-2026-04-04.md)
- 成功部署的 `headSha = 5cee3d21ce44a87d176d1bea32b5743740aa5578`
- 本地仓库 `HEAD` 与新服务器 `/opt/aigc-gateway` 当前 `HEAD` 均为同一提交 `5cee3d21ce44a87d176d1bea32b5743740aa5578`

## 风险项

- `pm2-tripplezhou.service` 当前显示为 `enabled` 但 `inactive (dead)`；因为 PM2 进程本身在线，所以不阻塞本批次签收，但建议后续单独验证宿主机重启后的自恢复行为。

## 证据

- 环境/部署证据：
  - 新服务器 `hostname = instance-20260403-154049`
  - 新服务器 `HEAD = 5cee3d21ce44a87d176d1bea32b5743740aa5578`
  - 本地仓库 `HEAD = 5cee3d21ce44a87d176d1bea32b5743740aa5578`
- 数据证据：
  - 新旧服务器 `call_logs/channels/models = 30 / 200 / 557`
- 网络证据：
  - `http://34.180.93.185/v1/models` -> `200`
  - `https://aigc.guangai.ai/v1/models` -> `200`
- CI/CD 证据：
  - [github-actions-deploy-run-23981503068.json](/Users/yixingzhou/project/aigcgateway/docs/test-reports/github-actions-deploy-run-23981503068.json)
  - [github-actions-deploy-log-23981503068.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/github-actions-deploy-log-23981503068.txt)

## 最终结论

服务器迁移批次复验结果为 `6 PASS / 0 PARTIAL / 0 FAIL`。

本批次已满足签收条件，可将 Harness 状态推进到 `done`。
