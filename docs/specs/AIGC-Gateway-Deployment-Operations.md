# AIGC Gateway — 部署与运维方案

> 版本 1.0 · 2026年3月29日
> 配套文档：AIGC-Gateway-P1-PRD · AIGC-Gateway-Database-Design

**关于占位符：** `aigc.guangai.ai` 代表最终注册的域名，通过环境变量配置。

---

## 1. 基础设施概览

```
                         开发者请求
                            │
                     ┌──────▼──────┐
                     │  CDN / WAF   │ ← DDoS防护 + SSL终止
                     └──────┬──────┘
                            │
                     ┌──────▼──────┐
                     │  负载均衡器   │ ← 健康检查 + 自动摘除
                     └──┬───────┬──┘
                        │       │
                 ┌──────▼──┐ ┌──▼──────┐
                 │ API 实例1│ │API 实例2 │ ← 无状态，水平扩展
                 └──────┬──┘ └──┬──────┘
                        │       │
              ┌─────────▼───────▼─────────┐
              │      PostgreSQL 主库       │
              │   (RDS / 云数据库实例)      │
              └────────────┬──────────────┘
                           │ 异步复制
              ┌────────────▼──────────────┐
              │      PostgreSQL 只读副本    │ ← 审计日志查询 + 全文搜索
              └───────────────────────────┘

              ┌───────────────────────────┐
              │      Redis                │ ← 限流计数器 + 会话 + 缓存
              └───────────────────────────┘

              ┌───────────────────────────┐
              │    定时任务 (Cron Worker)   │ ← 健康检查 + 过期订单 + 对账
              └───────────────────────────┘

              ┌───────────────────────────┐
              │    代理集群 (Proxy)        │ ← 访问海外服务商
              └───────────────────────────┘
```

---

## 2. 云服务商选择

### 2.1 推荐方案

| 服务 | 推荐 | 理由 |
|------|------|------|
| 计算 | 腾讯云 CVM / 轻量应用服务器 | ADR 中 AI Dash 部署在腾讯云，团队熟悉 |
| 数据库 | 腾讯云 PostgreSQL (TDSQL-C) | 托管服务，自动备份，支持只读副本 |
| 缓存 | 腾讯云 Redis | 托管服务 |
| 对象存储 | 腾讯云 COS | 存储健康检查日志、对账文件等 |
| CDN | 腾讯云 CDN | 控制台静态资源加速 |
| 域名 / DNS | 腾讯云 DNSPod | — |
| SSL | Let's Encrypt / 腾讯云免费证书 | — |

### 2.2 P1 最小资源配置

| 资源 | 规格 | 数量 | 月费估算 |
|------|------|------|---------|
| API 服务器 | 4C8G | 2台 | ¥300×2 |
| 定时任务服务器 | 2C4G | 1台 | ¥150 |
| PostgreSQL | 4C8G, 100GB SSD | 1主1只读 | ¥800 |
| Redis | 2GB | 1实例 | ¥150 |
| 代理节点（海外） | 1C1G（香港/新加坡） | 1-2台 | ¥100×2 |

P1 月度基础设施成本估算：**¥1,900-2,500/月**

---

## 3. 代理架构

11家服务商中，3家需要代理（OpenAI、Claude、OpenRouter），8家国内直连。

### 3.1 代理方案

```
API 实例 ──→ 代理节点（香港） ──→ OpenAI / Claude / OpenRouter
         └─→ 直连 ────────────→ DeepSeek / 智谱 / 火山 / 硅基 / MiniMax / Moonshot / Qwen / StepFun
```

**代理实现方式：**

| 方案 | 说明 | 推荐 |
|------|------|------|
| SOCKS5 代理 | 通过 SSH 隧道或代理软件，API 实例配 `HTTPS_PROXY` | P1 推荐，简单 |
| HTTP 正向代理 | Squid / Nginx 正向代理 | 更灵活，可做日志 |
| 云厂商全球加速 | 腾讯云全球应用加速 (GAAP) | 稳定但贵 |

**P1 方案：** 在香港轻量服务器部署 SOCKS5 代理，API 实例通过环境变量 `PROXY_URL` 配置。每个 Provider 可单独配置是否走代理（`Provider.proxyUrl` 字段）。

### 3.2 代理高可用

- 部署 2 个代理节点（香港 + 新加坡），互为备份
- API 实例配置代理节点列表，第一个不通自动切第二个
- 健康检查包含对代理节点的连通性检测

---

## 4. CI/CD 流水线

### 4.1 分支策略

```
main ─────────────────────── 生产环境
  └── develop ────────────── 开发环境
        └── feature/xxx ──── 功能分支
```

### 4.2 流水线设计

```
代码推送 → Lint + Type Check → 单元测试 → 构建 → 部署
```

**详细步骤：**

| 阶段 | 触发条件 | 操作 |
|------|---------|------|
| Lint + Type Check | 所有推送 | ESLint + TypeScript 编译检查 |
| 单元测试 | 所有推送 | Jest / Vitest，覆盖适配器 + 计费逻辑 |
| 构建 | PR 合并到 develop/main | Docker 镜像构建 |
| 部署到开发环境 | 合并到 develop | 自动部署 |
| 部署到生产环境 | 合并到 main | 手动确认后部署 |
| 数据库迁移 | 包含 Prisma 迁移文件时 | 自动执行 `prisma migrate deploy` |

### 4.3 部署方式

**Docker 容器化部署：**

```dockerfile
# Dockerfile
FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci --production
COPY dist/ ./dist/
COPY prisma/ ./prisma/
RUN npx prisma generate
EXPOSE 3000
CMD ["node", "dist/server.js"]
```

**部署流程（零停机）：**

1. 构建新镜像并推送到容器仓库
2. 在第二台服务器拉取新镜像、启动新容器
3. 负载均衡器健康检查通过后，将流量切到新容器
4. 停止旧容器
5. 对第一台服务器重复以上步骤

**ADR 教训回顾：** 运行时生成的数据（图片、日志文件）绝不放在容器内。所有持久化数据存数据库或对象存储。

---

## 5. 环境变量清单

```bash
# ========== 核心配置 ==========
NODE_ENV=production
PORT=3000

# ========== 域名（占位符） ==========
API_BASE_URL=https://aigc.guangai.ai/v1
SITE_URL=https://aigc.guangai.ai
CDN_BASE_URL=https://cdn.aigc.guangai.ai

# ========== 数据库 ==========
DATABASE_URL=postgresql://user:pass@host:5432/aigc_gateway
DATABASE_READ_URL=postgresql://user:pass@read-host:5432/aigc_gateway

# ========== Redis ==========
REDIS_URL=redis://:pass@host:6379/0

# ========== 认证 ==========
JWT_SECRET=<random-64-chars>
JWT_EXPIRES_IN=7d

# ========== 代理 ==========
PROXY_URL_PRIMARY=socks5://proxy1-host:1080
PROXY_URL_SECONDARY=socks5://proxy2-host:1080

# ========== 支付 ==========
ALIPAY_APP_ID=<app_id>
ALIPAY_PRIVATE_KEY=<rsa_private_key>
ALIPAY_PUBLIC_KEY=<alipay_public_key>
ALIPAY_NOTIFY_URL=https://aigc.guangai.ai/api/webhooks/alipay

WECHAT_MCH_ID=<merchant_id>
WECHAT_API_KEY_V3=<api_key>
WECHAT_CERT_SERIAL=<cert_serial>
WECHAT_PRIVATE_KEY=<rsa_private_key>
WECHAT_NOTIFY_URL=https://aigc.guangai.ai/api/webhooks/wechat

# ========== 汇率 ==========
EXCHANGE_RATE_CNY_TO_USD=0.137

# ========== 健康检查 ==========
HEALTH_CHECK_ACTIVE_INTERVAL_MS=600000      # 10分钟
HEALTH_CHECK_STANDBY_INTERVAL_MS=1800000    # 30分钟
HEALTH_CHECK_COLD_INTERVAL_MS=7200000       # 2小时
HEALTH_CHECK_FAIL_THRESHOLD=3               # 连续失败N次后 disable

# ========== 限流（默认值） ==========
DEFAULT_RPM=60
DEFAULT_TPM=100000
DEFAULT_IMAGE_RPM=10

# ========== 告警 ==========
ALERT_WEBHOOK_URL=<企业微信/钉钉/Slack webhook>
ALERT_EMAIL=ops@company.com

# ========== 日志 ==========
LOG_LEVEL=info
LOG_FORMAT=json
```

**安全要求：**
- 所有密钥类环境变量通过云厂商的密钥管理服务（KMS）注入，不写入代码仓库或 `.env` 文件
- CI/CD 中通过 Secret 变量传递
- 服务商 API Key 加密存储在数据库 `Provider.authConfig` 中（AES-256-GCM），加密密钥通过 KMS 管理

---

## 6. 数据库管理

### 6.1 备份策略

| 类型 | 频率 | 保留 | 方式 |
|------|------|------|------|
| 全量备份 | 每日 03:00 | 30 天 | 云数据库自动备份 |
| 增量备份 | 实时 | 7 天 | WAL 日志归档 |
| 跨地域备份 | 每周 | 4 周 | 备份文件同步到异地对象存储 |

### 6.2 迁移管理

```bash
# 开发环境：创建迁移
npx prisma migrate dev --name add_recharge_orders

# 生产环境：执行迁移（CI/CD 自动）
npx prisma migrate deploy

# 迁移回滚（手动，通过反向 SQL）
# Prisma 不支持自动回滚，需预先准备回滚脚本
```

**迁移规范：**
- 每次迁移文件提交前，附带对应的回滚 SQL 脚本
- 涉及大表（call_logs）的 DDL 变更必须使用 `CONCURRENTLY`（如创建索引）
- 生产迁移前在开发环境验证

### 6.3 连接池

```
API 实例 ──→ PgBouncer ──→ PostgreSQL
```

- 使用连接池（PgBouncer 或 Prisma 内置），每个 API 实例最多 20 个连接
- 2 个 API 实例 × 20 连接 = 40 连接，PostgreSQL max_connections 设为 100（留余量给管理连接和定时任务）

---

## 7. 监控告警体系

### 7.1 监控指标

| 类别 | 指标 | 采集方式 | 告警阈值 |
|------|------|---------|---------|
| **服务可用性** | API 响应率 | 负载均衡器健康检查 | < 99% 持续 2 分钟 |
| **服务可用性** | 5xx 错误率 | 应用日志 | > 1% 持续 5 分钟 |
| **性能** | API P99 延迟 | 应用埋点 | > 10s 持续 5 分钟 |
| **性能** | 数据库查询 P99 | 慢查询日志 | > 1s |
| **资源** | CPU 使用率 | 系统监控 | > 80% 持续 10 分钟 |
| **资源** | 内存使用率 | 系统监控 | > 85% |
| **资源** | 磁盘使用率 | 系统监控 | > 80% |
| **资源** | 数据库连接数 | PG 监控 | > 80 |
| **业务** | 通道健康状态 | 健康检查系统 | 任何通道变为 DISABLED |
| **业务** | 调用成功率 | CallLog 统计 | < 95% 持续 10 分钟 |
| **业务** | 充值回调失败 | 支付回调日志 | 任何一次验签失败 |
| **代理** | 代理节点连通性 | 定时 ping | 不可达持续 2 分钟 |

### 7.2 告警通道

| 级别 | 通道 | 示例场景 |
|------|------|---------|
| P0 紧急 | 电话 + 短信 + IM | 服务不可用、数据库挂了、全部通道 DOWN |
| P1 严重 | IM + 邮件 | 错误率飙升、单通道持续失败、充值回调异常 |
| P2 警告 | IM | CPU/内存/磁盘告警、慢查询、代理切换 |
| P3 通知 | 邮件 | 每日对账差异、定时任务执行报告 |

### 7.3 日志规范

**结构化 JSON 日志：**

```json
{
  "timestamp": "2026-03-29T14:32:08.123Z",
  "level": "info",
  "service": "api-gateway",
  "traceId": "trc_8f3a2b7e",
  "projectId": "proj_xxx",
  "action": "chat_completion",
  "model": "openai/gpt-4o",
  "channelId": "ch_xxx",
  "latencyMs": 2100,
  "status": "success",
  "message": "Chat completion successful"
}
```

**日志级别使用规范：**

| 级别 | 使用场景 |
|------|---------|
| `error` | 需要人工介入的错误（数据库异常、支付回调验签失败） |
| `warn` | 可自动恢复的异常（通道降级、限流触发、重试成功） |
| `info` | 关键业务事件（调用完成、充值成功、通道状态变更） |
| `debug` | 调试信息（请求/响应详情），生产环境默认关闭 |

---

## 8. 密钥管理

### 8.1 分级管理

| 密钥类型 | 存储位置 | 访问控制 |
|---------|---------|---------|
| 服务商 API Key | 数据库 `Provider.authConfig`，AES-256-GCM 加密 | 仅 API 网关运行时解密 |
| 数据库密码 | 云 KMS | 仅应用服务器环境变量 |
| JWT Secret | 云 KMS | 仅应用服务器环境变量 |
| 支付密钥 | 云 KMS | 仅应用服务器环境变量 |
| 加密主密钥 (MEK) | 云 KMS | 仅用于加密/解密 Provider.authConfig |

### 8.2 加密方案

```
存储时：
  plaintext API Key → AES-256-GCM(MEK, plaintext) → encrypted blob → 存入 DB
  MEK 存储在云 KMS，不落盘

使用时：
  DB 读取 encrypted blob → KMS 解密 MEK → AES-256-GCM 解密 → plaintext API Key → 用于请求
  plaintext 仅在内存中，请求完成后丢弃
```

### 8.3 密钥轮换

| 密钥 | 轮换周期 | 方式 |
|------|---------|------|
| 服务商 API Key | 按服务商要求 | 控制台更新 Provider.authConfig |
| JWT Secret | 每 90 天 | 双 Secret 过渡期（旧 Secret 验证 7 天） |
| 加密主密钥 | 每年 | KMS 自动轮换，重新加密所有 authConfig |
| 开发者 API Key | 开发者自主吊销/重建 | — |

---

## 9. 定时任务清单

| 任务 | 频率 | 说明 |
|------|------|------|
| 健康检查 — 活跃通道 | 每 10 分钟 | 三级验证 |
| 健康检查 — 备用通道 | 每 30 分钟 | 三级验证 |
| 健康检查 — 冷门通道 | 每 2 小时 | 三级验证 |
| 过期订单关闭 | 每 5 分钟 | 关闭超过 30 分钟未支付的充值订单 |
| 健康检查记录清理 | 每日 04:00 | 删除 7 天前的 HealthCheck 记录 |
| 每日对账 | 每日 06:00 | 余额校验 + 支付渠道对账 |
| 代理节点检测 | 每 5 分钟 | ping 代理节点，不通则告警 |
| 余额告警检查 | 每小时 | 检查所有项目余额是否低于告警阈值 |
| 数据库表大小监控 | 每日 | 记录 call_logs 表大小增长，超过阈值告警 |

---

## 10. 上线检查清单

### 10.1 基础设施

- [ ] 服务器（2台API + 1台Cron）已部署并互通
- [ ] PostgreSQL 主库 + 只读副本已创建
- [ ] Redis 实例已创建
- [ ] 代理节点（2台）已部署并测试连通 OpenAI/Claude/OpenRouter
- [ ] 负载均衡器已配置，健康检查通过
- [ ] SSL 证书已安装
- [ ] 域名 DNS 已解析

### 10.2 应用

- [ ] 所有环境变量已配置
- [ ] Prisma 迁移已执行
- [ ] 全文搜索索引和触发器已创建
- [ ] deduct_balance 函数已部署
- [ ] 7 家首批服务商的 Provider 记录已创建
- [ ] 所有模型和通道已配置
- [ ] 健康检查全部通过（三级验证）
- [ ] 管理员账号已创建

### 10.3 支付

- [ ] 支付宝应用已创建，回调地址已配置
- [ ] 微信支付商户已开通，回调地址已配置
- [ ] 支付回调验签测试通过
- [ ] 充值 → 到账全流程测试通过

### 10.4 监控

- [ ] 告警通道已配置（IM + 邮件 + 电话）
- [ ] P0 告警触发测试通过（手动触发一次确认能收到）
- [ ] 日志采集已配置
- [ ] 定时任务已注册并执行过一次

### 10.5 安全

- [ ] 服务商 API Key 已加密存储
- [ ] JWT Secret 已通过 KMS 注入
- [ ] 支付密钥已通过 KMS 注入
- [ ] 服务器防火墙已配置（仅开放 80/443）
- [ ] 数据库仅内网可访问
