# AIGC Gateway — P2 设计文档：MCP 服务器 + 控制台国际化

> 版本 1.0 · 2026年3月30日
> 配套文档：AIGC-Gateway-P1-PRD · AIGC-Gateway-API-Specification
> P2 范围：MCP 服务器（核心）+ 控制台中英文双语

---

## 一、P2 目标与范围

### 1.1 核心目标

让 vibe coding 开发者在 AI 编辑器（Claude Code、Cursor、Windsurf 等）中顺畅使用 AIGC Gateway 平台的全部能力，无需查阅文档、无需手动复制配置。

### 1.2 范围

| 模块 | 说明 | 优先级 |
|------|------|--------|
| MCP 服务器 | 远程 Streamable HTTP 服务，暴露平台核心能力为 MCP Tools | 核心 |
| 控制台国际化 | 中英文双语切换 | 附加 |

### 1.3 不在范围内

- Prompt 模板治理（P3）
- 质量诊断 / 自动 failover / 日志冷热分离（P3+）
- AI 辅助创建模板（待独立讨论）

---

## 二、MCP 服务器设计

### 2.1 技术方案

| 决策项 | 结论 | 理由 |
|--------|------|------|
| 传输协议 | Streamable HTTP | MCP 2025-03-26 版本起的新标准，SSE 已废弃。单端点、无状态、基础设施友好 |
| 部署形态 | 远程服务，和 API 网关同一 Next.js 应用 | 零安装门槛，开发者配一个 URL 即可连接。共享数据库和认证链路 |
| 端点 | `https://aigc.guangai.ai/mcp` | POST + GET 统一端点 |
| 认证 | 复用 API Key（Bearer Token） | 开发者不需要额外管理 MCP 专用凭证 |
| 协议版本 | MCP 2025-03-26+ | 支持 Streamable HTTP + Session 管理 |
| SDK | @modelcontextprotocol/sdk (TypeScript) | 官方 SDK，提供 McpServer + StreamableHTTPServerTransport |

### 2.2 架构

```
AI 编辑器（Claude Code / Cursor / Windsurf）
    │
    │  MCP 协议（Streamable HTTP）
    │  Authorization: Bearer pk_xxxx
    │
    ▼
Nginx（aigc.guangai.ai）
    │
    ├── /mcp          → MCP 服务器（本文档）
    ├── /v1/*         → API 网关（P1 已有）
    ├── /api/*        → 控制台 API（P1 已有）
    └── /*            → 控制台前端（P1 已有）

MCP 服务器内部：
    │
    ├── 认证：sha256(API Key) → 查 Project
    ├── Tools 调用 → 内部调用 API 网关同一套业务逻辑
    ├── 审计日志 → 写入 CallLog（source = 'mcp'）
    └── 计费 → 同一套 deduct_balance
```

MCP 服务器不是独立服务，它是 Next.js 应用内的一个路由处理器（`app/api/mcp/route.ts`），复用全部现有基础设施。

### 2.3 开发者接入体验

**第一步：在控制台拿到 API Key**（和 P1 一样）

**第二步：在 AI 编辑器中配置 MCP 服务器**

Claude Code（`~/.claude/claude_code_config.json`）：
```json
{
  "mcpServers": {
    "aigc-gateway": {
      "type": "streamable-http",
      "url": "https://aigc.guangai.ai/mcp",
      "headers": {
        "Authorization": "Bearer pk_xxxx"
      }
    }
  }
}
```

Cursor（`.cursor/mcp.json`）：
```json
{
  "mcpServers": {
    "aigc-gateway": {
      "url": "https://aigc.guangai.ai/mcp",
      "headers": {
        "Authorization": "Bearer pk_xxxx"
      }
    }
  }
}
```

**第三步：直接使用**

开发者对 AI 编辑器说"帮我用 AIGC Gateway 调用 deepseek/v3 写一段代码"，AI 编辑器自动通过 MCP 完成。

### 2.4 Server Instructions

MCP 支持 Server Instructions——服务器向客户端声明一段指导文字，帮助 AI 编辑器更好地使用 Tools。

```
AIGC Gateway 是一个 AI 服务商聚合平台。你可以通过以下 Tools 帮助用户：

- 查看可用模型和价格：使用 list_models
- 生成文本内容：使用 chat（支持流式）
- 生成图片：使用 generate_image
- 查看调用记录和审计日志：使用 list_logs / get_log_detail
- 查看项目余额：使用 get_balance
- 生成对接代码时：先调用 list_models 了解可用模型，然后生成使用 @guangai/aigc-sdk 的代码

当用户要求生成使用本平台的代码时，推荐使用 @guangai/aigc-sdk SDK。
SDK 安装：npm install @guangai/aigc-sdk
SDK 的 baseUrl 默认为 https://aigc.guangai.ai/v1
```

---

## 三、MCP Tools 定义

### 3.1 设计原则

1. **面向目标而非 API 端点**——不要把每个 REST 端点 1:1 映射为 Tool，而是围绕开发者想做什么来设计
2. **减少往返次数**——一个 Tool 完成一件事，内部编排多个查询
3. **描述即文档**——Tool 的 description 是 AI 编辑器理解它的唯一途径，必须清晰准确
4. **返回精简数据**——不要把完整数据库记录扔给 AI，只返回有用的字段

### 3.2 Tools 清单

#### Tool 1: `list_models`

**用途：** 查看平台可用的 AI 模型、价格、能力

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| modality | string | 否 | 筛选模态：text / image，不传返回全部 |

**返回：** 模型列表（name / displayName / modality / contextWindow / price / capabilities）

**内部实现：** 查 Model 表 + 关联 Channel 的 sellPrice

**description：**
```
List available AI models on AIGC Gateway with pricing and capabilities. 
Use this to find the right model for a task, or to generate SDK code with correct model names.
Filter by modality (text/image) if needed.
```

---

#### Tool 2: `chat`

**用途：** 调用文本模型生成内容

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| model | string | 是 | 模型名，如 openai/gpt-4o |
| messages | array | 是 | 消息数组 [{role, content}] |
| temperature | number | 否 | 默认按模型推荐值 |
| max_tokens | number | 否 | 最大输出 token |

**返回：** AI 生成的文本内容 + traceId + usage（tokens / cost）

**内部实现：** 调用现有 chat/completions 逻辑（非流式），走通道路由 + 审计 + 扣费

**description：**
```
Send a chat completion request to an AI model via AIGC Gateway.
The platform handles provider routing, cost tracking, and audit logging.
Returns the generated text, trace ID for debugging, and token usage with cost.
Use list_models first to find available models and their pricing.
```

---

#### Tool 3: `generate_image`

**用途：** 调用图片模型生成图片

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| model | string | 是 | 图片模型名，如 openai/dall-e-3 |
| prompt | string | 是 | 图片描述 |
| size | string | 否 | 尺寸，如 1024x1024 |
| n | number | 否 | 图片数量，默认 1 |

**返回：** 图片 URL 列表 + traceId + cost

**内部实现：** 调用现有 images/generations 逻辑

**description：**
```
Generate images using an AI model via AIGC Gateway.
Returns image URLs, trace ID, and cost.
Use list_models with modality 'image' to find available image models.
```

---

#### Tool 4: `list_logs`

**用途：** 查看最近的 AI 调用记录

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| limit | number | 否 | 返回数量，默认 10，最大 50 |
| model | string | 否 | 按模型筛选 |
| status | string | 否 | 按状态筛选：success / error / filtered |
| search | string | 否 | 全文搜索 prompt 内容 |

**返回：** 调用记录列表（traceId / model / status / promptPreview / cost / latency / createdAt）

**内部实现：** 查 CallLog 表，仅返回当前项目的记录，sellPrice 可见，costPrice / channelId 不可见

**description：**
```
List recent AI call logs for your project. Shows trace ID, model, status, 
prompt preview, cost, and latency. Use 'search' to find calls by prompt content.
Use get_log_detail with a trace ID for the full prompt and response.
```

---

#### Tool 5: `get_log_detail`

**用途：** 查看单次调用的完整详情

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| trace_id | string | 是 | 调用的 traceId |

**返回：** 完整的 prompt（messages 数组）、AI 输出、模型、参数、usage、cost、latency、status

**内部实现：** 查 CallLog 表 by traceId，校验属于当前项目

**description：**
```
Get full details of a specific AI call by trace ID. 
Returns the complete prompt (messages array), AI response, model parameters, 
token usage, cost, and latency. Useful for debugging prompt quality issues.
```

---

#### Tool 6: `get_balance`

**用途：** 查看项目余额和最近交易

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| include_transactions | boolean | 否 | 是否包含最近 10 条交易记录，默认 false |

**返回：** 当前余额 + 可选的交易记录列表（type / amount / balanceAfter / description / createdAt）

**内部实现：** 查 Project.balance + Transaction 表

**description：**
```
Check your project's current balance and optionally view recent transactions.
Set include_transactions to true to see the last 10 charges, top-ups, and adjustments.
```

---

#### Tool 7: `get_usage_summary`

**用途：** 查看用量和费用汇总

**参数：**

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| period | string | 否 | 时间范围：today / 7d / 30d，默认 7d |

**返回：** 汇总数据（totalCalls / totalCost / totalTokens / avgLatency / topModels）

**内部实现：** 聚合查询 CallLog 表

**description：**
```
Get usage summary for your project over a time period.
Returns total calls, cost, tokens, average latency, and top models by usage.
Default period is last 7 days. Use 'today', '7d', or '30d'.
```

---

### 3.3 Tools 总览

| Tool | 类别 | 会产生费用 | 写入审计 |
|------|------|-----------|---------|
| list_models | 查询 | 否 | 否 |
| chat | AI 调用 | 是 | 是 |
| generate_image | AI 调用 | 是 | 是 |
| list_logs | 查询 | 否 | 否 |
| get_log_detail | 查询 | 否 | 否 |
| get_balance | 查询 | 否 | 否 |
| get_usage_summary | 查询 | 否 | 否 |

### 3.4 P3 模板上线后扩展的 Tools

以下 Tools 在 P3 模板治理完成后添加，P2 不实现但在架构上预留：

| Tool | 说明 |
|------|------|
| list_templates | 查看项目可用的模板及其变量定义 |
| get_template | 查看模板详情（system prompt / variables / 版本历史） |
| create_template | 用自然语言或结构化定义创建模板（直接生效 + 版本保护） |
| update_template | 修改模板（创建新版本） |
| chat_with_template | 使用模板调用 AI（传 templateId + variables） |

---

## 四、MCP 服务器实现细节

### 4.1 路由结构

```
app/api/mcp/route.ts    ← Streamable HTTP 端点（POST + GET + DELETE）
lib/mcp/server.ts       ← McpServer 实例 + Tools 注册
lib/mcp/tools/          ← 每个 Tool 的实现
  ├── list-models.ts
  ├── chat.ts
  ├── generate-image.ts
  ├── list-logs.ts
  ├── get-log-detail.ts
  ├── get-balance.ts
  └── get-usage-summary.ts
lib/mcp/auth.ts         ← API Key 认证（复用现有逻辑）
```

### 4.2 认证流程

```
1. 客户端发送请求到 /mcp，Header 携带 Authorization: Bearer pk_xxxx
2. MCP 路由处理器提取 API Key
3. sha256(key) → 查 api_keys 表 → 关联 Project
4. 将 project 信息注入到 MCP session context
5. 后续 Tool 调用均在该 Project 范围内执行
```

认证失败返回 HTTP 401，MCP 客户端会提示用户检查配置。

### 4.3 Session 管理

采用无状态模式：每个请求独立认证，不维护服务端 session。理由：

- 简化实现和部署（无需 session store）
- 和现有 API 网关的 API Key 认证模式一致
- Streamable HTTP 协议支持无状态服务器

如果未来需要有状态 session（如流式 Tool 调用），可以升级为 JWT session ID 模式。

### 4.4 审计日志

AI 调用类 Tool（chat / generate_image）的审计日志和 P1 API 调用写入同一张 CallLog 表，额外标记来源：

```
CallLog.source = 'api' | 'sdk' | 'mcp'
```

需要在 CallLog 表新增 `source` 字段（VARCHAR(10)，默认 'api'）。

查询类 Tool（list_models / list_logs 等）不写入审计日志。

### 4.5 限流

MCP 调用和 API 调用共享同一套限流配额（RPM / TPM）。不单独为 MCP 设限——从限流角度看，MCP 的 chat Tool 和 POST /v1/chat/completions 没有区别。

### 4.6 错误处理

| 场景 | MCP 返回 | 说明 |
|------|---------|------|
| API Key 无效 | HTTP 401 | 连接建立时失败 |
| 余额不足 | Tool 错误：isError=true + 余额信息 | 不阻断连接，只影响该次调用 |
| 模型不存在 | Tool 错误：isError=true + 可用模型提示 | AI 编辑器会据此纠正 |
| 服务商超时 | Tool 错误：isError=true + 超时详情 | 审计日志记录 TIMEOUT |
| 限流 | Tool 错误：isError=true + 重试建议 | 返回 retryAfter 时间 |

Tool 错误（而非协议错误）能让 AI 编辑器自我纠正——比如模型不存在时，AI 会自动换一个有效模型重试。

### 4.7 CORS 和安全

```
- 验证 Origin Header（防 DNS 重绑定攻击）
- 仅允许 HTTPS 连接（生产环境）
- API Key 在 Header 中传输，不出现在 URL 参数中
- 每个 Tool 调用都校验 Project 归属，不可跨项目访问
```

---

## 五、控制台国际化（i18n）

### 5.1 方案

| 决策项 | 结论 |
|--------|------|
| 支持语言 | 中文（zh-CN）+ 英文（en） |
| 默认语言 | 根据浏览器语言自动检测，可手动切换 |
| 实现方式 | next-intl（Next.js App Router 原生支持） |
| 切换入口 | 侧边栏底部或顶部栏的语言切换按钮 |
| 翻译文件 | messages/zh-CN.json + messages/en.json |

### 5.2 翻译范围

| 区域 | 说明 |
|------|------|
| 侧边栏导航 | 菜单项、分组标签 |
| 页面标题和描述 | 所有页面的 heading + 副标题 |
| 表单标签和提示 | 输入框 label / placeholder / 校验消息 |
| 按钮文案 | 所有操作按钮 |
| 空状态和引导 | 空状态文案 + 操作引导 |
| 表格列头 | 所有表格的 column header |
| 错误消息 | Toast / Alert 中的错误文案 |
| 时间格式 | 中文用"3分钟前"，英文用"3 minutes ago" |
| 金额格式 | 统一 USD，格式不变 |

### 5.3 不翻译的内容

- 模型名（如 openai/gpt-4o）
- API Key 值
- traceId
- 代码示例（Quick Start 页面）
- API 文档内容（保持英文，国际惯例）

---

## 六、数据库变更

### 6.1 CallLog 新增字段

```prisma
model CallLog {
  // ... 现有字段 ...
  source    String  @default("api")  // 'api' | 'sdk' | 'mcp'
}
```

迁移 SQL：
```sql
ALTER TABLE call_logs ADD COLUMN source VARCHAR(10) NOT NULL DEFAULT 'api';
CREATE INDEX idx_call_logs_source ON call_logs(source);
```

### 6.2 无其他表结构变更

MCP 服务器复用全部现有表（ApiKey / Project / Model / Channel / CallLog / Transaction 等），不新增表。

---

## 七、开发阶段计划

| 阶段 | 内容 | 预计工期 |
|------|------|---------|
| P2-1 | MCP 服务器基座 + 认证 + list_models | 2-3 天 |
| P2-2 | chat + generate_image Tools（含审计+计费） | 2-3 天 |
| P2-3 | 查询类 Tools（logs / balance / usage） | 1-2 天 |
| P2-4 | Server Instructions + 错误处理优化 + 安全加固 | 1-2 天 |
| P2-5 | 控制台国际化（i18n） | 2-3 天 |
| P2-6 | 集成测试 + 文档 | 1-2 天 |

**总计：9-15 天（约 2-3 周）**

### 7.1 各阶段验证清单

**P2-1：MCP 基座**
- [ ] AI 编辑器可通过 Streamable HTTP 连接 `aigc.guangai.ai/mcp`
- [ ] API Key 认证通过
- [ ] list_models Tool 返回正确的模型列表和价格
- [ ] 无效 Key 返回 401

**P2-2：AI 调用 Tools**
- [ ] chat Tool 非流式调用成功，返回文本 + traceId + usage
- [ ] generate_image Tool 调用成功，返回图片 URL
- [ ] CallLog 表记录 source='mcp'
- [ ] 余额正确扣减
- [ ] 余额不足时 Tool 返回 isError + 余额信息

**P2-3：查询类 Tools**
- [ ] list_logs 返回最近调用记录，支持筛选和搜索
- [ ] get_log_detail 返回完整 prompt 和 response
- [ ] get_balance 返回余额和交易记录
- [ ] get_usage_summary 返回用量汇总
- [ ] 所有查询限定在当前项目范围内

**P2-4：Instructions + 安全**
- [ ] AI 编辑器连接后收到 Server Instructions
- [ ] 开发者说"帮我生成使用 AIGC Gateway 的代码"，AI 编辑器能自动调用 list_models 然后生成 SDK 代码
- [ ] Origin Header 验证生效
- [ ] 跨项目访问被拒绝

**P2-5：国际化**
- [ ] 浏览器设为中文时，控制台自动显示中文
- [ ] 手动切换语言生效
- [ ] 所有页面（运营8页 + 开发者9页）翻译完整
- [ ] 模型名、Key 值、traceId 等不被翻译

**P2-6：集成测试**
- [ ] 在 Claude Code 中连接 MCP → list_models → chat → list_logs → get_balance 全链路通过
- [ ] 在 Cursor 中同样测试通过
- [ ] MCP 调用和 API 调用的审计日志在控制台统一展示
- [ ] 计费一致：MCP 调用和 API 调用同模型同 token 费用相同

---

## 八、控制台 MCP 配置页面

P2 在开发者控制台增加一个 MCP 配置帮助页面：

**路由：** `/mcp-setup`（侧边栏 HELP 分组下）

**内容：**
- 自动检测 API Key 并生成可复制的配置片段（Claude Code / Cursor / 通用格式）
- 连接状态检查按钮（调用 /mcp 的 initialize 端点验证）
- 可用 Tools 列表及说明
- 常见问题（FAQ）

---

## 九、后续扩展方向（P3+）

| 方向 | 说明 |
|------|------|
| 模板 Tools | P3 模板治理完成后添加 list_templates / create_template / chat_with_template |
| MCP Resources | 暴露模型列表、模板列表为 MCP Resources（只读数据） |
| MCP Prompts | 预定义常用 Prompt 模式为 MCP Prompts（如"代码审查""文案生成"） |
| 流式 chat Tool | 使用 SSE 升级实现流式文本生成 |
| OAuth 认证 | 替代 API Key，支持更精细的权限控制 |
