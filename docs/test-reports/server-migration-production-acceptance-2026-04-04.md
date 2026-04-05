# 服务器迁移批次 Production Acceptance 2026-04-04

> 状态：**PARTIAL（复验后 5/6 通过）**
> 环境：GCP 新服务器 `34.180.93.185` / 生产域名 `https://aigc.guangai.ai`
> 触发：`progress.json status=verifying`，对服务器迁移批次做首轮生产验收

## 测试目标

验证生产环境是否已从旧 VPS `154.40.40.116` 成功迁移到 GCP 新服务器 `34.180.93.185`，并满足以下 6 个功能点：

- `F-MIGRATE-01` 新服务器环境安装
- `F-MIGRATE-02` 配置文件迁移
- `F-MIGRATE-03` PostgreSQL 数据迁移
- `F-MIGRATE-04` 应用构建与 PM2 启动
- `F-MIGRATE-05` Nginx 配置 + IP 验证 + SSL 证书签发
- `F-MIGRATE-06` deploy.yml 更新 + GitHub Actions 密钥切换

## 测试环境

- 新服务器 SSH：`tripplezhou@34.180.93.185`
- 新服务器部署目录：`/opt/aigc-gateway`
- 生产域名：`https://aigc.guangai.ai`
- 旧服务器 SSH：`root@154.40.40.116`
- 仓库：`tripplemay/aigcgateway`

## 执行步骤概述

1. 读取状态机、规格和项目记忆
2. SSH 登录新服务器，检查基础环境、部署目录、配置文件、PM2、Nginx、数据库
3. 读取新服务器本机 `localhost:3000` 接口
4. 读取公网域名和新 IP 的 `/v1/models`
5. 读取新旧服务器数据库主表行数
6. 检查仓库 `deploy.yml` 与服务器当前部署 commit

## 通过项

### F-MIGRATE-01 — PASS

- 新服务器基础环境已安装并可用：
  - `node -v` -> `v22.22.2`
  - `psql --version` -> `PostgreSQL 17.9`
  - `redis-cli ping` -> `PONG`
  - `nginx -v` 成功
  - `pm2 -v` -> `6.0.14`
- `/opt/aigc-gateway` 存在，且当前为 Git 仓库 `main` 分支

### F-MIGRATE-02 — PASS

- 新服务器 `/opt/aigc-gateway/.env.production` 存在
- 新服务器 `/opt/aigc-gateway/ecosystem.config.cjs` 存在，`node` 解析成功
- `DATABASE_URL` 已包含 `connection_limit=20`
- `JWT_SECRET` / `ENCRYPTION_KEY` 已存在
- `ecosystem.config.cjs` 已不再携带旧 VPS 的 `NODE_OPTIONS=--max-old-space-size=768` 限制

### F-MIGRATE-03 — PASS

- 新服务器数据库读数：
  - `callLogs = 30`
  - `channels = 200`
  - `models = 557`
- 旧服务器数据库读数：
  - `callLogs = 30`
  - `channels = 200`
  - `models = 557`
- 三张主表行数一致，数据迁移可判通过

### F-MIGRATE-04 — PASS

- `pm2 list` 显示 `aigc-gateway` 两个 cluster 实例均为 `online`
- 新服务器本机 `curl http://localhost:3000/v1/models` 返回 `200`
- `.next/standalone/server.js` 存在
- `.next/standalone/.next/static` 存在
- `pm2-tripplezhou.service` 已 `enabled`

## 未通过项

### F-MIGRATE-05 — PASS

已通过：
- `nginx -t` 成功
- Nginx 配置文件存在，`proxy_pass` 已指向 `127.0.0.1:3000`
- `curl https://aigc.guangai.ai/v1/models` 返回 `200`
- 复验确认：
  - 新服务器本机 `curl http://localhost/v1/models` 返回 `200`
  - 新服务器本机 `curl http://34.180.93.185/v1/models` 返回 `200`
  - 外部 `curl http://34.180.93.185/v1/models` 返回 `200`
- SSL 证书有效：
  - `subject=CN=aigc.guangai.ai`
  - `issuer=Let's Encrypt R13`
  - `notBefore=2026-04-04`
  - `notAfter=2026-07-03`

结论：
- 规格中的 IP 直连验证现已满足，可判 `PASS`

### F-MIGRATE-06 — PARTIAL

已确认：
- [deploy.yml](/Users/yixingzhou/project/aigcgateway/.github/workflows/deploy.yml) 已改为使用
  - `VPS_HOST`
  - `VPS_SSH_PORT`
  - `VPS_USERNAME`
  - `VPS_SSH_KEY`
- 不再硬编码 `root`
- 当前仓库 `HEAD` 为 `c74026c`
- 新服务器部署目录当前 `HEAD` 也是 `c74026c`
- 最新部署相关 commit message 为：`ci: deploy.yml 迁移至 GCP 新服务器`

未确认：
- GitHub Secrets 当前值是否已切到 `34.180.93.185`
- GitHub Actions 最近一次部署流水线是否成功

原因：
- 公开 GitHub API 对该仓库 Actions runs 返回 `404`
- 当前未拿到可直接读取仓库私有 Actions 运行记录和 Secrets 的能力

结论：
- `deploy.yml` 变更本身已落地，新服务器也已部署到对应 commit
- 但“Secrets 已更新 + Actions 跑通”缺少直接证据，因此只能判 `PARTIAL`

## 风险项

- `pm2-tripplezhou.service` 处于 `enabled` 但 `inactive (dead)`；当前 PM2 进程本身在线，所以不构成启动失败，但建议后续单独确认宿主机重启后的恢复行为
- Nginx 当前 HTTP 80 对域名会跳 HTTPS，但对裸 IP 不提供 `/v1/models` 成功响应

## 证据

- 新服务器：
  - `hostname` -> `instance-20260403-154049`
  - `node -v` -> `v22.22.2`
  - `psql --version` -> `17.9`
  - `redis-cli ping` -> `PONG`
  - `pm2 list` -> `aigc-gateway` 两实例 `online`
  - `curl http://localhost:3000/v1/models` -> `count = 191`
- Nginx：
  - `/etc/nginx/conf.d/aigc-gateway.conf` 中 `proxy_pass http://127.0.0.1:3000`
  - `nginx -t` 成功
  - 复验后 `curl http://34.180.93.185/v1/models` -> `200`
  - 新服务器本机 `curl http://localhost/v1/models` -> `200`
  - `curl https://aigc.guangai.ai/v1/models` -> `count = 191`
- SSL：
  - `CN=aigc.guangai.ai`
  - `Let's Encrypt R13`
- 数据对比：
  - 新旧服务器 `call_logs/channels/models` 均为 `30 / 200 / 557`
- 部署：
  - 本地 `HEAD = c74026c`
  - 新服务器 `HEAD = c74026c`

## 最终结论

本轮复验后的生产验收结果为：

- `PASS`：`F-MIGRATE-01`、`F-MIGRATE-02`、`F-MIGRATE-03`、`F-MIGRATE-04`、`F-MIGRATE-05`
- `PARTIAL`：`F-MIGRATE-06`
- `FAIL`：无

因此整批状态不能进入 `done`，应回到 `fixing`，待以下两点闭环后再复验：

1. 补充 GitHub Actions 部署成功与 Secrets 切换完成的直接证据
