# 生产服务器迁移规格

**批次：** 服务器迁移批次
**日期：** 2026-04-04
**优先级：** High

---

## 背景

旧服务器（154.40.40.116）内存 1GB，已严重不足。
新服务器为 GCP e2-highmem-2（16GB RAM，50GB SSD，东京 asia-northeast1-b，Ubuntu 22.04），外网 IP `34.180.93.185`。

**迁移策略：** 停机迁移（不要求零停机），旧服务器不保留，DNS 由用户同步切换。

## 当前生产技术栈

```
旧 VPS (154.40.40.116)
├── nginx          — 反向代理，HTTP→HTTPS 跳转，SSL 终止
│   └── proxy_pass http://localhost:3000
├── PM2            — 进程守护，执行 .next/standalone/server.js
├── Node.js        — 应用运行时
├── PostgreSQL     — 本地数据库（aigc_gateway 库）
├── Redis          — 缓存 / 限流
└── Certbot        — Let's Encrypt SSL（aigc.guangai.ai）

部署路径：/opt/aigc-gateway
配置文件：/opt/aigc-gateway/.env.production（不在仓库）
PM2 配置：/opt/aigc-gateway/ecosystem.config.cjs（不在仓库）
构建约束：NODE_OPTIONS="--max-old-space-size=768"（因 1GB 内存）
GitHub CI：密钥 VPS_HOST / VPS_SSH_PORT / VPS_PASSWORD → 旧服务器 root
```

---

## 功能点

### F-MIGRATE-01 — 新服务器环境安装

**在新服务器（tripplezhou@34.180.93.185）上执行，Generator 通过 SSH 完成。**

1. 系统更新：`apt update && apt upgrade -y`
2. 安装 Node.js 22（与当前版本一致）：
   ```bash
   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
   sudo apt install -y nodejs
   ```
3. 安装 PostgreSQL 17：
   ```bash
   sudo apt install -y postgresql postgresql-contrib
   ```
4. 安装 Redis：
   ```bash
   sudo apt install -y redis-server
   # 配置 Redis 只监听 localhost
   ```
5. 安装 Nginx：
   ```bash
   sudo apt install -y nginx
   ```
6. 安装 PM2：`sudo npm install -g pm2`
7. 安装 Certbot：`sudo apt install -y certbot python3-certbot-nginx`
8. 克隆仓库到 `/opt/aigc-gateway`

**验收：**
- `node -v` 输出 v22.x
- `psql --version` 输出 PostgreSQL 17.x
- `redis-cli ping` 返回 PONG
- `nginx -v` 成功
- `pm2 -v` 成功
- `/opt/aigc-gateway` 目录存在且为 git 仓库

---

### F-MIGRATE-02 — 配置文件迁移

从旧服务器复制不在仓库中的配置文件。

**需要迁移的文件：**
1. `/opt/aigc-gateway/.env.production` → 新服务器同路径
2. `/opt/aigc-gateway/ecosystem.config.cjs` → 新服务器同路径

**`.env.production` 中需要调整的值：**
- `DATABASE_URL`：若用户名/密码不变，路径保持 `postgresql://aigc:xxx@localhost:5432/aigc_gateway`
- `connection_limit` 可从 5 调高（新服务器 16GB，建议 20）
- 其他变量保持不变

**`ecosystem.config.cjs` 需要调整：**
- 去掉或调高 `NODE_OPTIONS="--max-old-space-size=768"`（新服务器不再受内存限制）
- `cwd` 路径确认为 `/opt/aigc-gateway/.next/standalone`

**验收：**
- `.env.production` 存在且包含 `JWT_SECRET`、`ENCRYPTION_KEY`、`DATABASE_URL`
- `ecosystem.config.cjs` 存在且语法正确（`node ecosystem.config.cjs` 不报错）

---

### F-MIGRATE-03 — PostgreSQL 数据迁移

**步骤：**
1. 在旧服务器执行 pg_dump：
   ```bash
   sudo -u postgres pg_dump aigc_gateway > /tmp/aigc_gateway_backup.sql
   ```
2. 将 dump 文件传输到新服务器（scp）
3. 在新服务器创建数据库用户和库：
   ```bash
   sudo -u postgres psql -c "CREATE USER aigc WITH PASSWORD 'xxx';"
   sudo -u postgres psql -c "CREATE DATABASE aigc_gateway OWNER aigc;"
   ```
4. 导入数据：
   ```bash
   sudo -u postgres psql -d aigc_gateway < /tmp/aigc_gateway_backup.sql
   ```
5. 验证行数（CallLog、Channel、Model 等主要表）

**验收：**
- `SELECT COUNT(*) FROM call_logs;` 新旧服务器结果一致
- `SELECT COUNT(*) FROM channels;` 新旧服务器结果一致
- `SELECT COUNT(*) FROM models;` 新旧服务器结果一致

---

### F-MIGRATE-04 — 应用构建与启动

1. 在新服务器安装依赖并构建：
   ```bash
   cd /opt/aigc-gateway
   npm ci
   npx prisma generate
   set -a && source .env.production && set +a
   npx prisma migrate deploy      # 应用所有 migration（含最新性能优化批次的索引）
   npm run build                  # 16GB 内存，无需 NODE_OPTIONS 限制
   cp -r .next/static .next/standalone/.next/static
   mkdir -p .next/standalone/public
   ```
2. 启动 PM2：
   ```bash
   pm2 start ecosystem.config.cjs
   pm2 save
   pm2 startup                    # 设置开机自启
   ```
3. 验证本地响应：
   ```bash
   curl -sf http://localhost:3000/v1/models
   ```

**验收：**
- `pm2 list` 显示 `aigc-gateway` 状态为 `online`
- `curl http://localhost:3000/v1/models` 返回 200
- `curl http://localhost:3000/api/admin/health`（需 JWT）正常响应

---

### F-MIGRATE-05 — Nginx + SSL 配置

1. 配置 Nginx（使用 `localhost:3000` 而非 Docker 的 `app:3000`）：
   - 将仓库 `nginx/conf.d/` 的配置复制到 `/etc/nginx/conf.d/`
   - **将所有 `proxy_pass http://app:3000` 替换为 `proxy_pass http://localhost:3000`**
2. 先以 HTTP only 测试（临时跳过 SSL）：
   ```bash
   nginx -t && systemctl reload nginx
   curl -sf http://34.180.93.185/v1/models  # 通过 IP 验证
   ```
3. 签发 SSL 证书（DNS 切换后执行）：
   ```bash
   certbot --nginx -d aigc.guangai.ai -d cdn.aigc.guangai.ai
   ```

**验收：**
- `nginx -t` 无报错
- `curl http://34.180.93.185/v1/models` 返回 200（DNS 切换前通过 IP 验证）
- DNS 切换后 `curl https://aigc.guangai.ai/v1/models` 返回 200
- SSL 证书有效（浏览器无安全警告）

---

### F-MIGRATE-06 — GitHub Actions 密钥更新

将 CI/CD 自动部署指向新服务器。

**需要更新的 GitHub Secrets（仓库 Settings → Secrets → Actions）：**
- `VPS_HOST` → `34.180.93.185`
- `VPS_SSH_PORT` → `22`（GCP 默认）
- `VPS_PASSWORD` → 新服务器密码（或改为 SSH Key 认证）

**注意：** deploy.yml 使用 `username: root`，GCP Ubuntu 默认禁用 root SSH。
需在新服务器开启 root SSH 或将 deploy.yml 的 `username` 改为 `tripplezhou`，并配置 `tripplezhou` 有 `/opt/aigc-gateway` 的写权限和 PM2 权限。

**推荐方式：改 deploy.yml，使用 tripplezhou + sudo**

**验收：**
- 向 main 推送一个 commit，GitHub Actions 部署流水线成功执行
- `VPS_HOST` 等 secrets 已更新（无法直接验证内容，但 CI 跑通即为确认）

---

## 迁移顺序

```
F-MIGRATE-01（环境安装）
    ↓
F-MIGRATE-02（配置文件）
    ↓
F-MIGRATE-03（数据库迁移）
    ↓
F-MIGRATE-04（应用启动）
    ↓
F-MIGRATE-05（Nginx + 通过 IP 验证）
    ↓
用户同步修改 DNS → aigc.guangai.ai A 记录 → 34.180.93.185
    ↓
F-MIGRATE-05 续（Certbot 签发 SSL）
    ↓
F-MIGRATE-06（GitHub Actions 密钥更新）
```

## 注意事项

- **ENCRYPTION_KEY 必须与旧服务器完全一致**，否则已加密的 Provider.authConfig 无法解密
- **JWT_SECRET 必须与旧服务器完全一致**，否则现有用户 JWT 全部失效
- Redis 数据（缓存/限流）无需迁移，启动后自动重建
- 旧服务器在 DNS 切换并验证 HTTPS 正常后即可关闭
- `npm run build` 在 16GB 服务器上可去掉 `NODE_OPTIONS` 限制，但保留无害
