# AIGC Gateway

[English](./README.en.md) · [中文](./README.md)

> 统一的 OpenAI 兼容 API 网关，聚合 10+ 国内外 AI 服务商 — 含可复用的 prompt 工作流（Action / Template）、质量监测、管理控制台、MCP 服务器与预充值计费。

[![CI](https://github.com/tripplemay/aigcgateway/actions/workflows/ci.yml/badge.svg)](https://github.com/tripplemay/aigcgateway/actions)

**生产环境：** [aigc.guangai.ai](https://aigc.guangai.ai) · **MCP 端点：** `https://aigc.guangai.ai/mcp`

---

## 为什么需要

调用 AI API 跨多个服务商意味着同时管理 10+ 个 key、不同 schema、不同计费模型；当 prompt 越来越复杂时，还需要一个**管理它们**的地方，而不是仅仅调用。AIGC Gateway 提供单一 OpenAI 兼容端点：

- 一次调用自动路由到合适的上游（含失败转移、健康检查、成本优化）
- 统一 USD 口径记录每次调用的用量与费用
- 28 个 MCP 工具同样能力（适配 Claude Code / Cursor / Codex / Cline / 等）
- 预充值余额 + 按 key 限流（无意外账单）
- **把 prompt 升级为一等公民资产** — 设计成 Action，组合成 Template，固定生产版本，逐步观测成本/质量，按真实用户评分迭代优化（不再让 prompt 字符串散落在客户端代码各处）

---

## 核心特性

- **OpenAI 兼容 API** — 直接替换 `openai` / `langchain` 客户端的 baseUrl 即可使用。支持 `chat/completions`（流式 + 非流式）/ `embeddings` / `images/generations` / `models`。
- **3 类模态** — 文本（chat）/ 图像（generation）/ **Embedding**（向量）。支持 function calling 与推理模型。
- **接入 10 家服务商** — Anthropic / DeepSeek / MiniMax / OpenAI / OpenRouter / 千问 / SiliconFlow / 火山引擎 / 小米 mimo / 智谱（适配层可扩展）。
- **MCP Streamable HTTP 服务器** — 注册 28 个 tool，可在任何 MCP 客户端使用 `chat` / `embed_text` / `generate_image` / `run_action` / `run_template` 等。
- **Action & Template** — 可复用的 prompt 模板（Action）+ 多步编排工作流（Template），支持版本固定、并行 fan-out 与 dry-run 预览。
- **健康探测 + 自动 failover** — 按 channel 维度跑 CONNECTIVITY / CALL_PROBE 检查；失败 channel 自动跳过；冷却 + 自动恢复。
- **对账系统** — 每日 cron 对比上游服务商账单与 gateway 日志，差异分级 `MATCH` / `MINOR_DIFF` / `BIG_DIFF`，在 `/admin/reconciliation` 面板可见。
- **预充值计费** — 原子性 `deduct_balance`（PostgreSQL `FOR UPDATE`）；逐次调用记 CallLog 含 USD 成本；admin 可充值/退款/查交易历史。
- **中英双语控制台** — keys / 项目 / 模型 / 通道 / 服务商 / 日志 / 健康 全套管理 UI。
- **官方 TypeScript SDK** — `@guangai/aigc-sdk` 提供类型化的 `chat()` / `embed()` / `image()` / `models()`，含可配置重试。

---

## 快速开始

### 方式一：REST API（curl，OpenAI 兼容）

```bash
# Chat
curl https://aigc.guangai.ai/v1/chat/completions \
  -H "Authorization: Bearer pk_your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5",
    "messages": [{"role": "user", "content": "你好"}]
  }'

# Embeddings
curl https://aigc.guangai.ai/v1/embeddings \
  -H "Authorization: Bearer pk_your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "bge-m3",
    "input": "向量化我"
  }'

# 图像生成
curl https://aigc.guangai.ai/v1/images/generations \
  -H "Authorization: Bearer pk_your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen-image",
    "prompt": "草地上一只可爱的猫",
    "size": "1024x1024"
  }'
```

### 方式二：TypeScript SDK

```bash
npm install @guangai/aigc-sdk
```

```typescript
import { Gateway } from '@guangai/aigc-sdk'

const gw = new Gateway({
  apiKey: 'pk_your_key',
  baseUrl: 'https://aigc.guangai.ai',
})

// Chat
const chat = await gw.chat({
  model: 'gpt-5',
  messages: [{ role: 'user', content: '你好' }],
})

// Embedding
const embed = await gw.embed({
  model: 'bge-m3',
  input: '向量化我',
})
console.log(embed.data[0].embedding.length)  // 1024
```

完整 SDK 参考见 [`sdk/README.md`](./sdk/README.md)。

### 方式三：MCP（Claude Code / Cursor 等 AI 编辑器）

获取 Bearer key 后，在 Claude Code 里：

```bash
claude mcp add aigc-gateway \
  --transport streamable-http \
  --url https://aigc.guangai.ai/mcp \
  --header "Authorization: Bearer pk_your_key"
```

其他客户端（Cursor / Codex / VS Code / Windsurf / Cline / Roo Code / JetBrains）请访问控制台的 `/mcp-setup` 页面，选择客户端类型，复制生成的配置。

28 个 MCP tool 可用，包括 `list_models` / `chat` / `embed_text` / `generate_image` / `run_action` / `run_template` / `get_balance` / `list_logs`，以及完整的 Action / Template / API key 管理。详见 [docs/AIGC-Gateway-MCP-Developer-Guide.md](./docs/AIGC-Gateway-MCP-Developer-Guide.md)。

---

## Action & Template — 编排能力与质量优化

除了无状态的 API 调用，AIGC Gateway 还提供两层可复用的 AI 工作流：

### Action — 单次调用的可复用 prompt

**Action** 绑定一个 *模型 + 提示词模板 + 变量定义*。调用时按 ID 传 `variables: {...}`，无需重复 prompt 字符串。

- **版本管理** — 每次修改 prompt 创建新 `ActionVersion`；`activeVersionId` 决定当前活跃版本；可即时切换以做 A/B 测试或回滚
- **变量注入** — `{{var_name}}` 占位符，支持类型（string / number / select）+ required / optional 标记
- **Dry-run** — 仅渲染变量不调模型（免费预览，校验渲染后的 prompt 是否正确）

### Template — 多步编排工作流

**Template** 把多个 Action 串成工作流：

- **Sequential（串行）** — 按 `order` 顺序执行，前一步输出自动注入下一步的 `{{previous_output}}`
- **Fan-out（并行分拆）** — `SPLITTER → BRANCH（并行） → MERGE`，用于批量处理（如：一段文字并行翻译成 5 种语言后合并）
- **版本固定** — 每个步骤可锁定具体 Action 版本（`lockedVersionId`），生产运行不受上游 Action 编辑影响

### Test Runner — 执行可观测性

每次测试运行记录为 `TemplateTestRun`：

- 逐步中间输出（每步变量、模型输出、状态）
- 跨步聚合的 `totalTokens` 和 `totalCostUsd`
- `mode='dry'` 免费变量预览 / `mode='execute'` 生产调用
- 管理后台 UI 展示完整步骤追踪 + 每次运行的成本拆解，便于优化 prompt 结构与成本

### 质量监测

Template 携带质量信号：

- **`qualityScore`** — 平台内部质量标记（admin 精选模板专用）
- **用户评分** — 1-5 星存储在 `TemplateRating`（DB 层 CHECK 约束 1-5）；聚合为 `ratingCount` / `ratingSum`
- **排序与排名** — 公开模板可按 `latest` / `popular` / `top_rated` / `recommended`（综合评分）排序

### 公共模板库

把 template 标记 `isPublic=true` 即可分享给所有用户：

- 其他用户可 **fork** 到自己项目（创建副本，`sourceTemplateId` 记录血缘）
- 通过 `list_public_templates` MCP tool 或 `/public-templates` UI 浏览
- 按分类（`category` 字段）便于发现

这套能力把 AIGC Gateway 从「裸 API 代理」升级为**带可观测性的 prompt 工程平台**：把 prompt 设计成 Action，组合成 Template，固定生产版本，通过测试运行 + 用户评分监测质量，把验证过的模板反哺给社区库。

---

## 架构

```
客户端（REST / SDK / MCP）
      ↓ Bearer pk_xxx
auth-middleware → balance-middleware → rate-limit
      ↓
resolveEngine(model)  →  alias → channel（按优先级 + 健康状态）
      ↓
adapter（openai-compat，含服务商特定 quirks）
      ↓
上游服务商 API
      ↓
post-process → CallLog（USD 成本，source=api/mcp/probe）
      ↓
deduct_balance() — PostgreSQL 原子性 FOR UPDATE
```

**技术栈：** Next.js 14 App Router · TypeScript（strict）· PostgreSQL · Prisma · Redis · shadcn/ui · `@modelcontextprotocol/sdk` · next-intl。

完整架构：[`docs/dev/architecture.md`](./docs/dev/architecture.md)。

---

## 接入的服务商

| 服务商 | 模型 | 备注 |
|---|---|---|
| **OpenAI** | gpt-5 / gpt-4o 系列 / text-embedding-3-small/large / dall-e-3 | 直连 + OpenRouter 中转 |
| **Anthropic** | claude-haiku-4.5 等 | 支持 `tool_use` + extended thinking |
| **DeepSeek** | deepseek-v3 / deepseek-r1 / deepseek-v4-flash | 推理模型，余额 API |
| **OpenRouter** | gemini / mistral / grok / glm 等 50+ 模型 | image 走 `usage.cost` per-call 计费 |
| **SiliconFlow** | bge-m3 / deepseek-r1 / qwen image / GLM | embedding + 余额 API |
| **火山引擎** | doubao-pro / doubao-seedream | 基于 endpoint-id 路由 |
| **智谱** | glm-4-plus / cogview | 余额 API |
| **千问** | qwen-plus / qwen-image / qwen3.5 系列 | – |
| **MiniMax** | minimax-m2 | – |
| **小米 mimo** | mimo-v2 系列 | – |

新增服务商：参考 [`docs/provider/`](./docs/provider/) 中的适配器规格与配置 schema。

---

## 本地开发

### 前置依赖

- Node.js 18+
- PostgreSQL 16+
- Redis 7+

### 初始化

```bash
git clone https://github.com/tripplemay/aigcgateway.git
cd aigcgateway

npm install

cp .env.example .env
# 编辑 .env：DATABASE_URL / REDIS_URL / JWT_SECRET / ENCRYPTION_KEY / IMAGE_PROXY_SECRET

npx prisma migrate dev
npx prisma db seed       # 加载默认服务商 + admin 用户

npm run dev              # 启动在 PORT（默认 3000）
```

### 常用命令

```bash
npm run build            # 生产构建（output: standalone）
npm run lint             # ESLint
npm run format           # Prettier
npx tsc --noEmit         # 全项目类型检查

cd sdk && npm run build  # 构建 SDK（CJS + ESM + .d.ts）

# E2E 回归（需先启动 server）
BASE_URL=http://localhost:3199 npx tsx scripts/e2e-test.ts
BASE_URL=http://localhost:3199 npx tsx scripts/test-mcp.ts
```

详见 [`CLAUDE.md`](./CLAUDE.md) 和 [`docs/dev/`](./docs/dev/)。

---

## 部署

生产环境部署在单台 GCP VM（e2-highmem-2）+ PM2 cluster + nginx 反向代理。CI 在 push 到 `main` 后自动部署。

```
GitHub Actions → SSH → /opt/aigc-gateway
  ├─ git pull
  ├─ npm ci
  ├─ npm run build  （Next.js standalone）
  ├─ npx prisma migrate deploy
  └─ pm2 restart ecosystem.config.cjs
```

---

## 文档

- [`docs/dev/architecture.md`](./docs/dev/architecture.md) — 分层架构、请求管道、MCP server、引擎、计费、i18n
- [`docs/dev/rules.md`](./docs/dev/rules.md) — Migration 规则、MCP 开发约定、设计决策
- [`docs/AIGC-Gateway-Full-PRD.md`](./docs/AIGC-Gateway-Full-PRD.md) — 产品需求文档
- [`docs/AIGC-Gateway-MCP-Developer-Guide.md`](./docs/AIGC-Gateway-MCP-Developer-Guide.md) — MCP 接入指南
- [`docs/specs/`](./docs/specs/) — 各批次功能规格
- [`docs/provider/`](./docs/provider/) — 服务商适配器规格
- [`sdk/README.md`](./sdk/README.md) — TypeScript SDK 完整参考

---

## 项目结构

```
src/
├── app/(console)/      管理控制台页面（Next.js App Router）
├── app/api/v1/         OpenAI 兼容 REST 端点
├── app/api/mcp/        MCP Streamable HTTP 端点
├── lib/engine/         引擎（router / adapters / openai-compat / failover）
├── lib/mcp/            MCP server + 28 tool 实现
├── lib/billing-audit/  对账 cron + 各服务商账单 fetcher
├── lib/health/         健康探测调度器 + 自动 failover
└── lib/api/            共享中间件（auth / balance / rate-limit / post-process）

prisma/
├── schema.prisma       数据库 schema
└── migrations/         迁移历史

sdk/
└── src/                @guangai/aigc-sdk 源码

docs/                   产品 + 开发文档（specs / 架构 / 审计）
scripts/                CLI 工具（seed / e2e / 审计）
tests/                  Vitest 单测 + Playwright E2E + k6 性能
```

---

## License

本项目目前为内部项目，license 未对外正式确定。如需在 dogfood 部署之外使用，请联系维护者。

---

## 联系方式

- 生产环境：[aigc.guangai.ai](https://aigc.guangai.ai)
- 维护者：tripplezhou
