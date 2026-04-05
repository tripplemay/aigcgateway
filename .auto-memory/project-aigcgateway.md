---
name: project-aigcgateway
description: AIGC Gateway 项目当前阶段、技术架构和开发状态
type: project
---

## 项目概况

AIGC Gateway — AI 服务商管理中台。统一 API 调用抽象（兼容 OpenAI 格式）、7 家服务商适配、全链路审计、预充值计费、健康检查自动降级、MCP 服务器、控制台中英文双语。

**Tech Stack:** Next.js 14 (App Router) + TypeScript + PostgreSQL + Prisma + Redis + shadcn/ui + @modelcontextprotocol/sdk + next-intl

**仓库目录:** aigcgateway（已连接为 Cowork 工作目录）

## 当前开发状态（截至 2026-04-05）

- P1 完成：项目骨架 + 7 家服务商 + API 网关 + 健康检查 + SDK + 认证计费支付 + 控制台 17 页
- P1 优化补丁完成：模型自动同步引擎 + 模型/通道 UI 重构 + API Keys 权限扩展 + 全站性能优化（14项）+ 全站 UI 重构（Stitch 设计稿，16/18 页已完成，Login/Register 待办）
- P2 完成：MCP 服务器 (7 Tools) + 控制台国际化 (20页 + 259 key) + 集成测试
- 性能优化：Redis 缓存迁移 + PM2 cluster 已签收 PASS
- MCP L2 集成：读类 Tools + 错误场景 PASS，写类链路（chat/image 计费）已修复并通过生产验收
- **P3-1 完成（2026-04-03）：** Prompt 模板治理 25/25 功能全部 PASS（数据模型、注入引擎、16 API 路由、MCP 5 新工具、控制台 3 页面、侧边栏、i18n）
- **成本优化 + Bug 修复批次完成（2026-04-04）：** 7/7 PASS，OpenRouter 成本 ~$482/周 → ~$9/周
- **健康检查与同步优化批次完成（2026-04-04）：** 4/4 PASS，图片通道改轻量探测、白名单清理 Bug 修复、SiliconFlow/Zhipu 过滤只保留 TEXT/IMAGE
- **白名单硬删除批次完成（2026-04-04）：** 1/1 PASS，白名单外通道改为 deleteMany 物理删除，不再出现在 Disabled Nodes
- **性能优化批次完成（2026-04-04）：** 3/3 PASS，Prisma 连接池保活、模型页 Redis 缓存、用量页全表扫描修复
- **服务器迁移批次完成（2026-04-04）：** 6/6 PASS，生产环境迁移至 GCP 新服务器（34.180.93.185，16GB RAM），旧 VPS 废弃
- **压力测试批次完成（2026-04-05）：** 2/2 PASS，新服务器生产压测通过；发现 nginx 缺少 gzip，大 JSON 响应是 A/B 场景 P99 偏高根因
- **nginx-gzip 批次完成（2026-04-05）：** 2/2 PASS，nginx 启用 gzip + /v1/models 精确 location 拆分，A/B P99 降至目标范围
- **dev-infra 批次完成（2026-04-05）：** 6/6 PASS，鉴权脚本 + debug 接口 + 诊断日志 + 接口响应文档 + sync/health 时间字段；Codex 测试脚本简化为单一入口

## 最近批次（2026-04-05）— error-handling-fix 批次

- 目标：修复三个页面无错误处理导致 App Router 导航状态污染（BL-008）
- 根因：`apiFetch` 抛错时无 try/catch → unhandled promise rejection → App Router 客户端导航状态损坏，全站后续导航全部失败；无 `error.tsx` 兜底
- 交付：
  - `admin/health/page.tsx`：load() 加 try/catch，catch 里 setSummary 重置 + setChannels([])
  - `admin/models/page.tsx`：load() 加 try/catch，catch 里 setData([]) + setLoading(false)
  - `models/page.tsx`：fetch 链末加 .catch(() => setModels([]))
  - `src/app/(console)/error.tsx`：新增全局 Error Boundary（'use client' + reset()）

**签收文档：** `docs/test-reports/error-handling-fix-signoff-2026-04-05.md`
**Harness 状态：** status=done, 4/4 PASS, fix_rounds=1

## 前置批次（2026-04-05）— dev-infra 批次

- 目标：降低 Codex 每轮验收的前置准备成本，提升生产侧可观测性
- 交付：
  - `scripts/admin-auth.ts` — 统一鉴权入口（getAdminToken / getAdminHeaders）
  - `GET /api/admin/debug/sync` — sync 差异 + 通道 disable 原因
  - `GET /api/admin/debug/enrichment` — enrichment 命中率统计
  - `src/lib/engine/openai-compat.ts` imageViaChat 四级提取链诊断日志
  - `docs/specs/admin-api-response-samples.md` — 5 个高频管理接口真实响应文档（Codex 执行）
  - sync-status 接口新增 lastSyncAt / lastSyncDuration / lastSyncResult
  - health 接口每条 channel 新增 lastCheckedAt / consecutiveFailures
- 同期：Codex 本地测试环境简化——三个脚本合并为一个 `codex-setup.sh`，新增 `codex-wait.sh`，AGENTS.md 第 4 节更新

**签收文档：** `docs/test-reports/dev-infra-signoff-2026-04-05.md`
**Harness 状态：** status=done, 6/6 PASS, fix_rounds=1

## 前置批次（2026-04-05）— nginx-gzip 批次

- 目标：启用 nginx gzip 压缩，拆分 `/v1/models` location，将 A/B Warm P99 从 ~1600ms 降至 <800ms
- 变更：`nginx/conf.d/default.conf` — 新增 gzip 配置（comp_level 4，min_length 1024）；新增 `location = /v1/models` 精确匹配块（支持 buffering + gzip）；保留 `location /v1/` 的 `proxy_buffering off`（SSE 流式需要）；所有 proxy_pass 修正为 `http://localhost:3000`
- 验证：Codex 生产侧确认 `curl` 返回 `content-encoding: gzip`，localhost 压测 A/B P99 降至目标范围内
- 批次类型：混合批次（F-GZIP-01 generator + F-GZIP-02 codex）

**签收文档：** `docs/test-reports/nginx-gzip-signoff-2026-04-05.md`
**Harness 状态：** status=done, 2/2 PASS, fix_rounds=0

## 前置批次（2026-04-05）— 压力测试批次

- 目标：在新生产服务器验证吞吐量、Redis 缓存效果和并发稳定性
- 脚本：`scripts/stress-test.ts`（autocannon，5 场景，自动 JWT 登录）
- 结论：系统稳定（0% 错误率，PM2 无重启），Redis 缓存生效（B 场景冷热 6x 差距）
- 阈值：原 200ms P99 为本地网络假设，不适用外网 HTTPS，已按两轮实测数据修订（A/B <2000ms、C/D <800ms）
- **关键发现：nginx 无 gzip 配置**，大 JSON 响应（100-300KB）是 A/B P50≈900ms 的根本原因；已作为 BL-007 完成
- 同期：框架升级至 v0.3.0，引入 `executor:codex` 字段，测试域完整归属 Codex

**签收文档：** `docs/test-reports/stress-test-signoff-2026-04-05.md`
**Harness 状态：** status=done, 2/2 PASS, fix_rounds=1

## 前前置批次（2026-04-04）— 服务器迁移批次

- 新服务器：GCP e2-highmem-2，16GB RAM，东京，Ubuntu 22.04，外网 IP `34.180.93.185`
- 环境安装：Node.js 22 / PostgreSQL 17 / Redis / Nginx / PM2
- 数据迁移：pg_dump → scp → pg_restore，行数一致验证通过
- 应用构建：npm ci / prisma migrate deploy / npm run build（无 NODE_OPTIONS 限制）/ pm2 start
- Nginx：proxy_pass 改为 `localhost:3000`（非 Docker），SSL 证书通过 certbot 签发
- CI/CD：deploy.yml 和 GitHub Secrets 更新为新服务器，Actions 自动部署验证通过
- 旧服务器（154.40.40.116，1GB VPS）已废弃

**签收文档：** `docs/test-reports/server-migration-signoff-2026-04-04.md`
**Harness 状态：** status=done, 6/6 PASS, fix_rounds=2

## 前前置批次（2026-04-04）— 性能优化批次

- `src/lib/prisma.ts`：生产和开发都挂 globalThis，防止重复创建连接池
- `src/app/api/admin/models-channels/route.ts`：加 Redis 缓存（TTL 300s）
- `src/app/api/admin/usage/` 三个接口：加时间过滤 + Redis 缓存（TTL 600s），修复全表扫描
- `prisma/schema.prisma`：CallLog 补 `@@index([status, createdAt(sort: Desc)])`

**签收文档：** `docs/test-reports/perf-optimization-local-signoff-2026-04-04.md`
**Harness 状态：** status=done, 3/3 PASS

## 需求池（backlog.json，截至 2026-04-05）

当前需求池为空，详见 `backlog.json`

## 最近修复（2026-04-04）— 成本优化 + Bug 修复批次

- `openrouter-whitelist.ts`（新增）：30 个主流模型白名单，OpenRouter 同步范围 310 → 30
- `openrouter.ts`：同步前先过白名单 filter
- `checker.ts runImageCheck()`：图片通道封顶 L2，不执行 L3 真实图片生成探针（原根因：每 12 分钟单次 $0.04–$0.19）
- `doc-enricher.ts`：跳过图片模型 AI 丰富化（modality=IMAGE 直接透传）
- `list-logs.ts`：MCP search SQL 改为 promptSnapshot / responseContent ILIKE（原错误：traceId/modelName）
- `openai-compat.ts imageViaChat`：四级提取链（multimodal parts → base64 → 带扩展名 URL → 任意 HTTPS URL）
- `generate-image.ts`：MCP 错误响应结构化为 JSON `{code, message}`

**签收文档：** `docs/test-reports/cost-optimization-bugfix-signoff-2026-04-04.md`
**Harness 状态：** `progress.json` status=done, 7/7 PASS

## 历史批次交付记录

### P3-1（2026-04-03）

- 规格文档：`docs/specs/AIGC-Gateway-Template-Governance-P3-1-Spec.md`
- 后端提交：`ea01617` feat: P3-1 Prompt 模板治理后端基建（F001-F017）
- 前端提交：`edbc55d` feat: P3-1 控制台模板治理前端（F018-F025）

## 已知遗留问题

1. SiliconFlow 价格补全未生效（aiEnriched=0）
2. Anthropic 直连 401
3. 同步耗时偏高（~264s）
4. Chat 计费 $0 — Channel sellPrice 为 {} 或 0，根因与 #1 同源（定价数据缺失），需管理员手动补充
5. ~~图片生成 inline_data~~ — 已修复（2026-04-04，F-BUG-02 增加 inline_data 支持）
6. ~~dall-e-3 + IMAGE 定价~~ — 已修复（2026-04-04，OpenAI 付费 Key + 16 Channel sellPriceLocked + 生产验收 PASS）

## 已知限制（决定不修复）

- API Keys 搜索框：Chrome MCP 程序化设值 `input.value=""` 不触发浏览器事件，导致自动化测试中清空搜索后列表不恢复。普通用户（键盘、鼠标、浏览器原生×按钮、close 按钮）不受影响。标记为"仅影响自动化测试工具"。

## 生产环境

- 控制台：`https://aigc.guangai.ai`
- API：`https://aigc.guangai.ai/v1/`
- MCP：`https://aigc.guangai.ai/mcp`
- Stitch 设计稿项目 ID: 13523510089051052358

### 生产服务器（2026-04-04 迁移至 GCP）

| 项目 | 值 |
|---|---|
| 服务商 | Google Cloud Platform |
| 实例名 | instance-20260403-154049 |
| 地区 | asia-northeast1-b（东京） |
| 机型 | e2-highmem-2（2 vCPU，16GB RAM） |
| 系统 | Ubuntu 22.04 LTS (x86_64) |
| 外网 IP | `34.180.93.185` |
| SSH 用户 | `tripplezhou` |
| 部署路径 | `/opt/aigc-gateway` |
| 启动方式 | PM2（`ecosystem.config.cjs`） |
| 反向代理 | Nginx → `localhost:3000` |
| 配置文件 | `/opt/aigc-gateway/.env.production`（不在仓库） |
| CI/CD | GitHub Actions → SSH → `git pull + npm ci + build + pm2 restart` |

**Claude CLI / Codex 在生产环境操作时：**
- SSH 登录：`ssh tripplezhou@34.180.93.185`
- 切换到部署目录：`cd /opt/aigc-gateway`
- 加载环境变量：`set -a && source .env.production && set +a`
- 查看日志：`pm2 logs aigc-gateway`
- 重启应用：`pm2 restart aigc-gateway`
- 构建时无需 NODE_OPTIONS 内存限制（16GB，旧 VPS 的 768MB 限制已废弃）

### Codex 测试账号（2026-04-03 创建，无需重复创建）

**Admin:** `codex-admin@aigc-gateway.local` / `Codex@2026!`
- API Key: `pk_aa6b13e75918e44a1b7247bb91b01777ac0446b7a5e8eaa2dedbfa0d6a5aaa03`

**Developer:** `codex-dev@aigc-gateway.local` / `Codex@2026!`
- Project ID: `codex-dev-project-001`
- API Key: `pk_1ec762a2f01e514a9880e45708a962b9434d804b4c5c1629939d93a3e40414e9`

两账号初始余额各 $6.85（≈50 CNY）

## Harness 框架版本（v0.3.0，2026-04-05）

- **executor 字段**：每条 feature 必须声明 `executor: "generator"` 或 `executor: "codex"`
- **批次类型**：普通（全 generator）/ 混合（部分 codex）/ Codex-only（全 codex，跳过 building）
- **测试域归属**：单元测试、E2E 脚本、压测脚本全部由 Codex 编写和执行，Generator 不写任何测试
- framework/ 目录已更新至 v0.3.0，CHANGELOG 有完整记录

## 关键开发规则

- Schema 变更 + migration + 引用代码必须同一 commit，否则 CI tsc 会死锁
- git pull 后 schema 变了必须 `npx prisma generate`
- 设计稿从 Stitch MCP 下载后存到 `design-draft/{屏幕名}/code.html + screen.png`
- 前端页面重构必须按原型 code.html 1:1 复刻 DOM 结构和 class
- 生产构建无需 `NODE_OPTIONS="--max-old-space-size=768"`（新服务器 16GB，旧 VPS 限制已废弃）
- 生产部署不使用 Docker，使用 PM2 直接运行 `.next/standalone/server.js`

**Why:** 以上状态供下次会话快速定位当前进度，避免重新梳理
**How to apply:** 开始新任务前先对照此文件确认当前阶段，继续未完成的工作
