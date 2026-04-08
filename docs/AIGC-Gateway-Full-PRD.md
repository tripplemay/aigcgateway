# AIGC Gateway — 完整产品 PRD

> AIGC 全链路质量审计与管理平台
> Version 4.0 | 2026-04-08
> 状态：P1 已完成，P1优化补丁已完成，P2 已完成（大幅超出），P3-1 已完成（架构重设计），P3-2/P3-3 规划中

---

## 1. 产品概述

### 1.1 产品定位

AIGC Gateway 是一个面向中小开发者的 AIGC 基础设施中台。业务应用通过简单接入，即可获得服务商统一管理、全链路质量审计、成本监控、模型自动发现等能力。

核心价值：让开发者专注于"AI 做什么"，平台负责"AI 怎么调、怎么管、怎么审"。

### 1.2 商业模式

| 维度 | 决策 |
|------|------|
| 商业模式 | 转售（统一采购，开发者向平台付费） |
| 计费模式 | 预充值（先充钱后用，余额不足返回 402） |
| 部署形态 | 云托管 SaaS |
| 目标用户 | 中小开发者 |
| 接入方式 | API（主线）+ SDK（推荐）+ MCP（AI 编辑器） |
| 支付渠道 | 支付宝 + 微信支付 |

### 1.3 核心设计原则

- **服务商对开发者完全透明** — 开发者指定模型，平台内部选通道，Provider/Channel 不暴露
- **AI 驱动运营自动化** — 模型发现、定价获取由 AI 自动从服务商文档提取，不依赖硬编码
- **全链路可观测** — 每次调用完整快照 prompt、输出、参数、成本、性能
- **Prompt 是产品不是代码** — 预留模板治理基建，P3 重点实现

### 1.4 域名与基础设施

| 配置项 | 值 |
|--------|-----|
| 控制台 + API 网关 | https://aigc.guangai.ai |
| API 路径 | /v1/* |
| MCP 端点 | /mcp |
| CDN | https://cdn.aigc.guangai.ai |
| npm SDK | @guangai/aigc-sdk |
| 服务器 | 2核 4GB Linux VPS，PM2 管理 |
| SSL | Nginx + Let's Encrypt |

---

## 2. 数据模型

### 2.1 核心实体关系

采用独立实体模式，Provider ↔ Channel ↔ Model 为多对多关系，通过 Channel 关联。

| 实体 | 职责 | 开发者可见 |
|------|------|----------|
| Provider | 服务商信息（端点、鉴权、代理配置） | 否 |
| ProviderConfig | 服务商配置覆盖层（参数约束、文档URL、价格兜底） | 否 |
| Model | 模型信息（统一名称、模态、能力参数） | 是 |
| Channel | 通道（关联 Provider+Model，realModelId、priority、pricing、status） | 否 |
| Project | 开发者项目（API Key、配额、余额） | 是 |
| CallLog | 调用日志（prompt 快照、输出、成本、性能） | 是（部分字段） |
| User | 用户账号（角色：admin / developer） | 是 |
| ApiKey | 项目 API Key（存 hash，权限控制、过期策略、IP白名单、Key级RPM） | 是 |
| Transaction | 交易记录（充值、扣费） | 是 |
| RechargeOrder | 充值订单（支付状态机） | 是 |
| HealthCheck | 通道健康检查记录 | 否 |
| SystemConfig | 系统级配置（加价比例等） | 否 |

### 2.2 模型命名规范（P4 更新）

开发者传入 **canonical name**（如 `gpt-4o`、`claude-sonnet-4`），不含服务商前缀。平台通过 `ModelAlias` 表 + `Channel.realModelId` 映射到服务商真实 ID。

| 开发者传入 | Model.name | Channel.realModelId |
|----------|------------|---------------------|
| gpt-4o | gpt-4o | gpt-4o |
| deepseek-v3 | deepseek-v3 | deepseek-chat |
| claude-sonnet-4 | claude-sonnet-4 | claude-sonnet-4 |

`ModelAlias` 表存储别名映射（如 `deepseek-chat` → `deepseek-v3`），sync 时自动查表归并。

### 2.3 路由策略（P4 更新：跨服务商选优）

开发者指定模型（canonical name）→ 查 Model → 查该 Model 下所有 ACTIVE Channel（可能来自多个 Provider）→ 按 priority ASC 排序 → 取优先级最高的 → 调用对应 Provider。

同一模型通过多个服务商（如 OpenAI 直连 + OpenRouter）提供时，管理员通过 Channel.priority 控制选优顺序。

### 2.4 账号结构

User → Project (1:N) → ApiKey (1:N)。余额挂在 User 上（所有项目共享），扣费记录通过 projectId 区分来源。

---

## 3. 适配器架构

### 3.1 三层混合模式

| 层次 | 职责 | 变更响应速度 |
|------|------|-----------|
| 配置覆盖层（DB） | 端点路径、参数约束、鉴权格式、能力声明 | 分钟级（改 DB 即时生效） |
| 专属 Adapter | 复杂逻辑差异（图片走 chat 接口、响应格式不同等） | 小时级（改代码发版） |
| OpenAI 兼容引擎（基座） | 标准请求构建、SSE 解析、usage 提取、错误映射 | 很少变更 |

### 3.2 首批 7 家服务商

| 服务商 | 能力 | 接入方式 | 代理 |
|--------|------|---------|------|
| OpenAI | 文本 + 图片 | 通用引擎 | 需代理 |
| Anthropic | 文本 | 通用引擎 | 需代理 |
| DeepSeek | 文本 | 通用引擎 | 直连 |
| 智谱 AI | 文本 + 图片 | 通用引擎 | 直连 |
| 火山引擎 | 文本 + 图片 | 专属 Adapter | 直连 |
| 硅基流动 | 文本 + 图片 | 专属 Adapter | 直连 |
| OpenRouter | 文本 + 图片 | 通用引擎 | 需代理 |

### 3.3 扩展性

新增服务商只需：一个请求 Adapter 文件 + 一个同步 Adapter 文件 + 种子数据。不改现有代码。

---

## 4. 模型自动同步引擎

### 4.1 设计目标

引擎自动探查每家服务商的完整模型列表和定价信息，不依赖硬编码数据。

### 4.2 两层同步架构

| 层 | 数据来源 | 成本 | 覆盖范围 |
|---|---------|------|---------|
| 第 1 层 | /models API | 免费 | 模型列表（部分服务商含价格） |
| 第 2 层 | Jina Reader 渲染文档 + DeepSeek AI 提取 | 低 | 补全价格、上下文窗口、发现新模型 |

### 4.3 数据合并优先级

1. 运营手动设置（sellPriceLocked=true）→ 最高
2. /models API 返回 → 高
3. AI 从文档提取 → 中（只补不覆盖）
4. pricingOverrides 兜底 → 低（正常为空）
5. 无数据 → costPrice=0，显示 "—"

### 4.4 7 家服务商同步策略

| 服务商 | 第 1 层（API） | 第 2 层（Jina + AI） |
|--------|-------------|---------------------|
| OpenAI | /models + 白名单过滤 | AI 提取价格+上下文 |
| Anthropic | /models（含 context） | AI 补充价格 |
| DeepSeek | /models（仅 2 个 ID） | AI 补充价格 |
| 智谱 | /models | AI 补充价格（CNY→USD） |
| 火山引擎 | 无 API | AI 从文档提取全部模型+价格 |
| 硅基流动 | /models（95+ 模型） | AI 补充价格 |
| OpenRouter | /models（含完整价格） | 不需要 |

### 4.5 同步触发方式

- 应用启动时自动同步
- 每天凌晨 4:00 定时同步（node-cron）
- 控制台手动触发（Admin → Sync models 按钮）

### 4.6 降级保护

- AI 提取返回 0 个模型（但数据库已有数据）→ 跳过更新
- AI 提取返回 < 50% 现有模型数 → 跳过更新
- Jina/AI 失败 → 仅使用第 1 层数据，现有数据不受影响

### 4.7 内部 AI 调用

使用平台内部 DeepSeek 通道。绕过鉴权、计费、限流。不写 CallLog，不扣费。

---

## 5. API 网关

### 5.1 API 设计

| 维度 | 决策 |
|------|------|
| 接口风格 | 兼容 OpenAI 格式 + 扩展 Header（X-Trace-Id） |
| 流式响应 | SSE（Server-Sent Events） |
| 核心端点 | POST /v1/chat/completions, POST /v1/images/generations, GET /v1/models |
| 中间件管道 | API Key 鉴权 → 余额检查 → 限流 → 参数校验 → 日志初始化 |
| 异步后处理 | 调用完成后异步写入 CallLog + 执行 deduct_balance |

**`/v1/models` 可选鉴权：** 无 Bearer token → 公开访问（开发者浏览模型列表）；有 token → 走完整鉴权链（permissions/expired/revoked/IP），`projectInfo=false` 时返回 403。

**API Key 鉴权增强：**
- 权限检查（permissions 字段，`=== false` 判断）
- 过期检查（expiresAt）
- IP 白名单检查（ipWhitelist，Nginx 代理下用 X-Forwarded-For）
- Key 级别 RPM 限制（取 min，不能绕过项目级限制）

### 5.2 错误处理

| HTTP 状态码 | 含义 |
|------------|------|
| 401 | API Key 无效或已吊销 |
| 402 | 余额不足 |
| 404 | 模型不存在 |
| 429 | 超过限流配额（含 Retry-After header） |
| 502 | 服务商调用失败 |

### 5.3 TypeScript SDK

@guangai/aigc-sdk@0.1.0，已发布到 npm。

封装：鉴权、SSE 流式解析、10 个错误类型、指数退避重试、traceId 透传。500 行以内，开发者 5 分钟跑通。

---

## 6. MCP 服务器（P2）

### 6.1 设计目标

让 AI 编辑器（Claude Code、Cursor、Windsurf 等）通过 MCP 协议直接使用平台全部能力。

### 6.2 技术方案

| 决策项 | 结论 |
|--------|------|
| 传输协议 | Streamable HTTP |
| 端点 | https://aigc.guangai.ai/mcp |
| 认证 | 复用 API Key（Bearer Token） |
| 部署 | 和 API 网关同一 Next.js 应用 |

### 6.3 MCP Tools（21 个）

**AI 调用类（产生费用）：**

| Tool | 说明 |
|------|------|
| chat | 文本生成，支持 streaming、Function Calling（tools/tool_choice）、top_p/frequency_penalty 采样控制 |
| generate_image | 图片生成，返回图片 URL + traceId + 费用 |

**Action 管理（原子执行单元 CRUD）：**

| Tool | 说明 |
|------|------|
| create_action | 创建 Action = 模型 + 提示词模板 + 变量定义，自动生成 v1 |
| get_action_detail | 查看 Action 详情（活跃版本 messages/variables、版本历史） |
| list_actions | 分页列出项目内所有 Action |
| update_action | 更新 Action 元数据（name/description/model） |
| delete_action | 删除 Action（被 Template 引用时阻止） |
| create_action_version | 创建新版本（版本号自增），可控是否设为活跃 |
| activate_version | 切换活跃版本（版本回滚/升级） |
| run_action | 执行 Action：注入变量渲染模板后调用模型；支持 dry_run 预览和指定 version_id |

**Template 管理（多步编排工作流 CRUD）：**

| Tool | 说明 |
|------|------|
| create_template | 创建 Template：由多个 Action 按串行或扇出模式组合 |
| get_template_detail | 查看 Template 详情（执行模式、步骤列表、保留变量） |
| list_templates | 分页列出所有 Template |
| update_template | 更新 Template（steps 全量替换） |
| delete_template | 删除 Template（级联删除步骤） |
| run_template | 执行 Template 工作流，返回每步的 output/usage/latency 明细 |

**查询类（不产生费用）：**

| Tool | 说明 |
|------|------|
| list_models | 查看可用模型、价格、能力（capabilities）、supportedSizes |
| list_logs | 查看最近调用记录，含 traceId + cost（8 位精度） |
| get_log_detail | 按 traceId 查看完整请求/响应/参数/错误详情 |
| get_balance | 查看用户余额和交易记录（含 traceId 追溯） |
| get_usage_summary | 按模型/天/来源/Action/Template 维度聚合统计 |

### 6.4 三种接入方式关系

| 方式 | 适用场景 | 说明 |
|------|---------|------|
| MCP | 开发阶段 | AI 编辑器中实验、调试、生成代码 |
| SDK | 运行时（推荐） | 生产环境后端服务 |
| HTTP API | 运行时（通用） | 任何语言 |

三种方式走同一条链路，审计日志和计费统一。

---

## 7. 计费系统

| 维度 | 决策 |
|------|------|
| 模式 | 预充值（先充钱后用，余额不足返回 402） |
| 余额归属 | **用户级**（User.balance，所有项目共享同一余额） |
| 定价 | 双层定价（Channel 上设 costPrice + sellPrice） |
| 加价 | 默认加价比例存 SystemConfig 表（DEFAULT_MARKUP_RATIO = 1.2） |
| 扣费 | 每次调用完成后按 usage × sellPrice 异步扣除（deduct_balance 从 User.balance 扣减，并发安全） |
| 最低扣费 | MIN_CHARGE = $0.00000001，防止极低价模型被精度截断为免费 |
| 精度 | 内部计费 Decimal(16,8)，展示 8 位小数 |
| 充值 | 充值到 User（不选项目），对接支付宝当面付/网站支付 + 微信 Native 支付 |
| 幂等 | 同一 paymentOrderId 只入账一次 |
| 追溯 | Transaction 记录含 traceId + projectId，可追溯到具体调用和来源项目 |
| 定时任务 | 过期订单关闭（每 5 分钟）+ 余额告警（每小时） |
| 价格保护 | sellPriceLocked 字段，运营手动改价后同步不覆盖 |

---

## 8. 审计日志

### 8.1 记录内容

| 字段组 | 内容 |
|--------|------|
| 标识 | id, traceId, projectId, channelId, modelName, source(api/sdk/mcp) |
| Prompt 快照 | promptSnapshot（messages 数组结构化存储）, requestParams |
| 完整输出 | responseContent, finishReason |
| 用量与成本 | promptTokens, completionTokens, totalTokens, costPrice, sellPrice |
| 性能指标 | latencyMs, ttftMs, tokensPerSecond |
| 状态 | status (success/error/timeout/filtered), errorMessage |
| P3 预留 | templateId, templateVariables, qualityScore |

### 8.2 可见性分层

| 角色 | 可见字段 |
|------|---------|
| 开发者 | traceId, modelName, promptSnapshot, responseContent, token 用量, sellPrice, 性能, status |
| 运营 | 全部字段，含 channelId, costPrice, 真实模型 ID |

### 8.3 查询能力

- 按 traceId 精确查询
- 按项目 + 时间范围 + 模型 + 状态筛选
- prompt + 输出内容全文搜索（PG tsvector + GIN 索引）
- 永久保留，P3 做冷热分离

---

## 9. 健康检查

### 9.1 分级频率

| 通道类型 | 频率 | 定义 |
|---------|------|------|
| 活跃通道 | 每 10 分钟 | 过去 1 小时内有真实调用 |
| 备用通道 | 每 30 分钟 | priority > 1 且 status=active |
| 冷门通道 | 每 2 小时 | 过去 24h 无真实调用 |

### 9.2 三级验证

| 级别 | 验证内容 |
|------|---------|
| Level 1 | HTTP 200 + 鉴权通过 + 响应非空 |
| Level 2 | choices[0].message.content 存在、usage 完整、finish_reason 有效 |
| Level 3 | 固定 prompt（"1+1=?"）验证返回内容包含 "2" |

### 9.3 自动降级与恢复

- 单次失败 → 重试 → 仍失败标记 DEGRADED
- 连续 3 次失败 → 自动 DISABLED
- DISABLED 通道降频检查，恢复后自动设回 ACTIVE

---

## 10. 控制台

### 10.1 技术栈

Next.js + shadcn/ui + Recharts + TanStack Table + Tailwind CSS。
一套系统两个角色（admin / developer），开发者自助注册。
中英文双语（P2 国际化）。

### 10.2 Admin 页面

| 页面 | 功能 |
|------|------|
| 服务商管理 | Provider CRUD + 配置覆盖编辑 |
| **模型与通道管理** | **三层折叠结构**（服务商→模型→通道卡片），健康状态色点汇总，priority/sellPrice 内联编辑，Sync models 按钮 |
| 健康监控 | 通道健康卡片（状态灯 + L1/L2/L3）+ 手动检查 |
| 全局审计日志 | 全项目日志 + channelId/costPrice 可见 + 全文搜索 |
| 全局用量 | 收入 vs 成本趋势 + 按服务商/模型分布 + 毛利 |
| 开发者管理 | 开发者列表 + 详情 + 手动充值 |

### 10.3 开发者页面

| 页面 | 功能 |
|------|------|
| Dashboard | 4 指标卡片 + Recharts 图表 + 最近调用 |
| API Key 管理 | 创建（仅展示一次）+ 吊销 |
| **模型列表** | **两层分组结构**（服务商→模型），无通道，无健康状态 |
| 审计日志 | 全文搜索 + 状态筛选 + 详情展开面板 |
| 用量统计 | 时间范围 + 图表 + 模型排行 |
| 余额与充值 | 余额卡片 + 充值对话框 + 交易记录 |
| 快速开始 | 4 步代码示例 + 复制按钮 |
| MCP 配置 | 10 种客户端一键复制（Claude Code CLI/Desktop/Cursor/Codex/VS Code/Windsurf/Cline/Roo Code/JetBrains/Generic） |
| 账号设置 | 个人信息 + 修改密码 |

---

## 11. 部署与运维

### 11.1 基础设施

| 组件 | 配置 |
|------|------|
| 应用服务器 | 2核 4GB Linux VPS，PM2 cluster 模式（2 worker） |
| 数据库 | PostgreSQL（本地安装） |
| 缓存 | Redis（本地安装） |
| 反向代理 | Nginx + Let's Encrypt SSL |
| 代理节点 | 香港/新加坡（访问 OpenAI/Claude/OpenRouter） |

### 11.2 CI/CD（半自动）

| 工作流 | 触发 | 操作 |
|--------|------|------|
| ci.yml | push 到 main（自动） | lint + typecheck |
| deploy.yml | CI 成功后（需手动审批） | SSH → git pull → npm ci → prisma migrate → build → pm2 restart |
| publish-sdk.yml | sdk/package.json version 变化（需手动审批） | npm publish |

### 11.3 定时任务

| 任务 | 频率 |
|------|------|
| 健康检查（活跃/备用/冷门） | 10min / 30min / 2h |
| 模型自动同步 | 每日 04:00 |
| 过期订单关闭 | 每 5 分钟 |
| HealthCheck 记录清理 | 每日 04:30 |
| 每日对账 | 每日 06:00 |
| 代理节点检测 | 每 5 分钟 |
| 余额告警检查 | 每小时 |

### 11.4 测试环境

Codex 测试 Agent 使用 docker-compose.test.yml 在独立 sandbox 中启动隔离的 app + PostgreSQL + Redis（端口 3099/5433/6380），不占 VPS 资源。按需手动触发。

### 11.5 PM2 Cluster 配置

应用以 PM2 cluster 模式运行，充分利用多核 CPU：

- **Worker 数量**：2（按 VPS 核心数自动分配）
- **执行模式**：`exec_mode: cluster`，配置文件 `ecosystem.config.cjs`
- **定时任务 Guard**：仅 worker 0（`NODE_APP_INSTANCE=0`）执行所有调度任务，防止健康检查、模型同步、对账等任务在多进程下重复执行
- **缓存策略**：所有缓存统一使用 Redis，不使用 in-process 内存缓存，保证多 worker 间缓存一致性和 invalidate 同步

---

## 12. 开发工具链

### 12.1 Agent 分工

| Agent | 职责 | 工具 |
|-------|------|------|
| Claude Code | 功能开发、Bug 修复 | Claude Code CLI |
| Codex | 测试、审查、验收 | OpenAI Codex |
| Claude（本对话） | 产品规划、架构决策、文档维护 | Claude.ai |

### 12.2 职责边界

- Claude Code 开发，Codex 测试，严格分离
- Codex 只允许修改 tests/、scripts/test/、docs/test-reports/、docs/reviews/、docs/audits/
- Codex 发现问题只输出缺陷报告，修复由 Claude Code 或人工完成
- AGENTS.md 定义完整的工作边界

---

## 13. 外部服务依赖

| 服务 | 用途 | SLA | 降级方案 |
|------|------|-----|---------|
| Jina Reader (r.jina.ai) | 渲染 SPA 文档页为 Markdown | 免费，无 SLA | 保留现有模型数据 |
| 7 家 AI 服务商 API | 模型调用 | 各家不同 | 健康检查自动降级 |
| 支付宝/微信支付 | 充值 | 商业 SLA | 订单超时关闭 |
| GitHub Actions | CI/CD | GitHub SLA | 手动 SSH 部署 |

---

## 14. 版本路线图

### P1（已完成）
- 项目骨架 + 数据库（12 表）
- 适配器引擎 + 7 家服务商对接
- API 网关核心端点
- 健康检查系统（三级验证 + 自动降级）
- TypeScript SDK（已发布 npm）
- 认证 + 计费 + 支付
- 运营控制台（8 页）+ 开发者控制台（9 页）
- 集成测试 + 部署配置
- 修复轮（9 项 UI/Bug 修复）

### P1 优化补丁（已完成）
- 模型自动同步引擎（两层同步 + Jina + AI 提取）— ✓ 已完成
- 模型/通道管理 UI 重构（三层折叠结构）— ✓ 已完成
- API Keys 功能扩展（粒度权限、过期策略、IP白名单、Key级RPM）— ✓ 已完成
- 全站性能优化（14项措施 + Redis cluster）— ✓ 已完成（2026-04-02/03）
- 全站 UI 重构（Stitch 设计稿 1:1 还原）— 部分完成
  - Phase 1: Dashboard + Logs + Audit Log Detail — ✓ 已完成
  - Action List / Detail / Editor — ✓ 已完成（设计稿更新 + 1:1 还原）
  - Phase 2-5: 其余页面 — 待办

### P2（已完成，大幅超出原计划）
- MCP 服务器 — ✓ 已完成，从计划的 12 Tools 扩展到 **21 Tools**
- 控制台中英文国际化 — ✓ 已完成（20 页 + 593 key）
- MCP 集成测试 — ✓ 已完成

**P2 超出原计划的功能（由 AI 审计驱动）：**
- chat 增强：Function Calling（tools/tool_choice）、top_p/frequency_penalty
- Action 完整 CRUD（7 Tools）+ Template 完整 CRUD（6 Tools）+ activate_version
- run_action dry_run 预览 + version_id 指定版本执行
- run_template 步骤明细（每步 output/usage/latencyMs）
- 错误码统一 `[error_code] message` 格式
- capabilities / contextWindow 补全（含 function_calling 标注）
- generate_image size supportedSizes 字段
- 上游错误全路径脱敏（sanitizeErrorMessage）
- 空 content 前置校验
- 交易 traceId 追溯
- 计费精度 Decimal(16,8) + MIN_CHARGE 保护
- MCP Setup 10 种客户端一键复制（参考 Stitch）
- SDK 类型补全（Action/Template/ChatParams 对齐）

### P3-1 Prompt 模板治理（已完成，架构重设计）

原 PRD 设计为 templates + template_versions 两表结构，实际重构为 **Action（原子单元）+ Template（编排层）两层架构**。

**实际数据模型：**
- `Action` 表（id / projectId / name / description / model / activeVersionId）
- `ActionVersion` 表（id / actionId / versionNumber / messages / variables / changelog）
- `Template` 表（id / projectId / name / description / isPublic）
- `TemplateStep` 表（id / templateId / actionId / order / role）

**已实现：**
- Action/Template 完整 CRUD API + MCP Tools（13 个） — ✓
- 版本管理：create_version + activate_version（回滚） — ✓
- 变量注入引擎（`{{变量名}}` 替换） — ✓
- run_action（含 dry_run + version_id） — ✓
- run_template（串行 + Fan-out，`{{previous_output}}` 自动注入） — ✓
- 控制台 Action List/Detail/Editor + Template 页面 — ✓
- Admin 模板管理页 — ✓

**与原 PRD 设计的差异：**
- 原 `templates` + `template_versions` → 重构为 `Action` + `ActionVersion` + `Template` + `TemplateStep`
- 原 `chat` 扩展支持 `templateId + variables` → 改为独立的 `run_action` / `run_template`
- 原 `confirm_template` → 不需要（直接 CRUD，无草稿确认流程）

### P3-1+ 余额与项目体验改造（已完成）

**余额用户级改造（2026-04-08）：**
- User.balance 字段 + migration（合并原 Project 余额） — ✓
- deduct_balance / check_balance SQL 函数重写（从 User 扣费） — ✓
- 充值 API 改为 User 级 — ✓
- get_balance MCP/REST 返回用户级余额 — ✓
- Sidebar/Dashboard/Admin 余额显示对齐 — ✓

**项目切换 UI（2026-04-07）：**
- ProjectProvider Context（全局项目状态） — ✓
- Sidebar 项目下拉选择器 — ✓
- 创建项目后自动切换 — ✓

**前端审查修复（2026-04-07）：**
- 未登录路由保护（middleware 级别） — ✓
- CreateProjectDialog 修复 — ✓
- Keys 页死链修复 — ✓
- i18n 硬编码残留修复 — ✓
- Hook 依赖修复 — ✓

### P4 跨服务商模型聚合（已完成，2026-04-08）

**核心改造：** 同一模型（如 gpt-4o）通过多个 Provider 同步后共享一条 Model 记录，各 Provider 作为 Channel 按优先级选优。

**Schema 变更：**
- Model 表：删除 `canonicalName`/`isVariant`，`name` 改为 canonical name（如 `gpt-4o` 而非 `openai/gpt-4o`）
- 新增 `ModelAlias` 表：别名 → canonical name 映射（28 条初始数据）
- Channel 唯一约束：从 `(providerId, modelId, realModelId)` 改为 `(providerId, modelId)`

**Sync 改造：**
- `resolveCanonicalName()` 查 ModelAlias 表替代旧的硬编码映射
- reconcile 按 canonical name upsert Model + 按 `(providerId, modelId)` upsert Channel
- 入口处 modelId 去重，防止唯一约束冲突
- sync 不再写入 capabilities（由 Admin UI 管理）

**Admin 功能：**
- 模型别名管理页（CRUD + merge 归入已有模型）— ✓
- 白名单页多通道展开（每 Channel 可编辑 priority/sellPrice）— ✓
- 废弃 `model-capabilities-fallback.ts` — ✓

**输出层简化：**
- `list_models` MCP / `/v1/models` REST 去掉 fallback，直接读 DB — ✓
- 路由层无需改动（`findUnique` + `priority ASC` 已满足）— ✓

### P3-2（效果追踪 + A/B 对比）— 待规划

- qualityScore 回传 API（`PATCH /api/projects/:id/logs/:traceId/quality`）
- A/B 效果对比 UI（activate_version 基础设施已就绪，缺对比 UI）
- 硬编码检测（CallLog 分析重复 prompt）+ 一键转模板

### P3-3（智能化）— 待规划

- AI 生成模板草稿 → 确认 → 保存
- Fork 公共模板 + 更新通知

### P3+（待规划）
- 自动 failover（服务商抖动无需人工介入）
- 日志冷热分离（大表查询性能维持）
- Python SDK
- 全站 UI 重构 Phase 2-5 剩余页面

---

## 15. 技术栈汇总

| 层次 | 技术选择 |
|------|---------|
| 后端框架 | Next.js（App Router + API Routes） |
| 语言 | TypeScript |
| ORM | Prisma |
| 数据库 | PostgreSQL（主存储 + tsvector 全文搜索） |
| 缓存 | Redis（限流 + 会话 + 缓存） |
| 前端 | Next.js + shadcn/ui + Recharts + TanStack Table + Tailwind CSS |
| SDK | TypeScript（@guangai/aigc-sdk） |
| MCP | @modelcontextprotocol/sdk（Streamable HTTP） |
| 支付 | 支付宝 + 微信支付 |
| 部署 | PM2 + Nginx + Let's Encrypt |
| CI/CD | GitHub Actions |
| 模型同步 | Jina Reader + DeepSeek AI 内部调用 |
| 测试 | Codex Agent + docker-compose.test.yml |

---

## 16. 性能优化记录

### 16.1 背景

2026-04-02 对 staging 环境执行首轮性能测试，6 个场景全部 Fail，在极低负载（c=2~5）下即暴露单请求处理成本过高问题。经过 4 轮迭代优化、5 轮压测，于 2026-04-03 完成收尾，验收结论 PASS。

### 16.2 优化措施（共 14 项）

| # | 措施 | 类型 | 涉及文件 |
|---|------|------|---------|
| 1 | `/v1/models` Redis 缓存（TTL 120s）+ 字段裁剪 | 缓存 | `api/v1/models/route.ts` |
| 2 | `/v1/models` Redis 分布式锁防缓存击穿 | 并发控制 | 同上 |
| 3 | 模型同步完成后主动 invalidate 缓存 | 缓存一致性 | `lib/sync/model-sync.ts` |
| 4 | bcrypt cost 12→10 + 登录时自动 rehash 存量用户 | CPU 降负 | `api/auth/login/route.ts` 等 3 文件 |
| 5 | `/admin/users` 真分页 skip/take + groupBy 批量聚合 | 查询优化 | `api/admin/users/route.ts` |
| 6 | `/admin/sync-status` 两次查询合并 + Redis 缓存 30s | 查询+缓存 | `api/admin/sync-status/route.ts` |
| 7 | `/admin/channels` DISTINCT ON 批量健康检查（替代 N+1） | 查询优化 | `api/admin/channels/route.ts` |
| 8 | `/admin/channels` SQL 列名 camelCase 修复（Bug） | Bug 修复 | 同上 |
| 9 | `/admin/channels` Redis 缓存 + 分布式锁（TTL 30s） | 缓存 | `api/admin/channels/_cache.ts` |
| 10 | `/admin/sync-models` 改为异步 fire-and-forget + 202 | 架构 | `api/admin/sync-models/route.ts` |
| 11 | Prisma 连接池 connection_limit=20, pool_timeout=10 | 基础设施 | `.env.production` |
| 12 | User + Model 补索引（role+createdAt, name） | 索引 | migration |
| 13 | 所有内存缓存迁移到 Redis（保障 cluster 一致性） | 架构 | 多文件 |
| 14 | PM2 cluster 模式（2 worker）+ 定时任务 guard | 基础设施 | `ecosystem.config.cjs` |

附带 CI/CD 修复：
- deploy 去掉 `--ignore-scripts`（修复 Prisma 7 npx 缓存污染）
- deploy 用 `set -a` 加载 `.env.production`（修复 `&` 被 shell 解析问题）
- migration 去掉 `CONCURRENTLY`（Prisma 事务内不支持）

### 16.3 优化前后性能对比

#### 低压（c=2~5）— 对应当前实际用户量级

| 接口 | 优化前 p50 | 优化后 p50 | 提升 |
|------|---:|---:|---:|
| `GET /v1/models` | 389ms | <20ms（缓存命中） | >19x |
| `POST /api/auth/login` | 2937ms | ~50ms | ~33x |
| `GET /api/admin/sync-status` | 2441ms | 48ms | ~50x |
| `GET /api/admin/channels` | 2474ms | 137ms（缓存命中 68ms） | ~36x |
| `GET /api/admin/users` | 1908ms | ~150ms | ~13x |
| `POST /api/admin/sync-models` | 504（120s 超时） | 202（<1s） | 从不可用到即时 |

低压下所有场景均 Pass。

#### 中压（c=10~20）

| 接口 | 负载 | 结果 | avg |
|------|------|------|---:|
| `GET /api/admin/sync-status` | c=10 / 100 req | Pass | 48ms |
| `GET /api/admin/users` | c=10 / 100 req | Pass | 488ms |
| 零余额 gate | c=10 / 100 req | Pass | 1464ms |
| 无聊天权限 gate | c=10 / 100 req | Pass | 1496ms |
| `GET /v1/models` | c=20 / 200 req | Fail（硬件瓶颈） | 1230ms（外部） |
| `POST /api/auth/login` | c=10 / 100 req | Fail（CPU bound） | ~1687ms |

#### 高压（c=15~30）

全接口退化，已达 2核共机 VPS 物理极限，非代码问题。

### 16.4 后续扩容路径

| 方向 | 预期效果 | 触发条件 |
|------|---------|---------|
| VPS 升级（4核8GB 独享）+ staging/production 分离 | 并发能力翻倍，消除共机噪声 | 上线即应做 |
| PostgreSQL 迁移到独立实例 | 解除 DB 与应用的 CPU 竞争 | 用户量 ×5 时 |
| `/v1/models` CDN 缓存 | 公开接口零应用负载 | 用户量增长时 |
| PM2 worker 数扩至 4（升级 VPS 后） | 吞吐量再翻倍 | 配合 VPS 升级 |
| CallLog 写入队列化（BullMQ） | 日志写入不影响主链路 | 用户量 ×10 时 |
| 自动 failover（P3+） | 服务商抖动无需人工介入 | 运维压力大时 |
| CallLog 冷热分离（P3+） | 大表查询性能维持 | 日志量 >千万行 |

> **注意**：PM2 cluster 扩至 4 worker 必须在 VPS 升级后进行，当前 2核 VPS 开 4 worker 会造成 CPU 过度竞争，性能反而下降。Redis 缓存已就绪，无需额外准备即可扩 worker 数。

### 16.5 相关报告文件
docs/test-reports/
perf-staging-first-pass-report-2026-04-02.md        # 首轮测试（全部 Fail）
perf-optimization-final-summary-2026-04-02.md       # 优化措施总结
redis-cluster-rerun-acceptance-report-2026-04-03.md
redis-cluster-final-recheck-report-2026-04-03.md
redis-cluster-final-signoff-report-2026-04-03.md    # 最终签收（PASS）
