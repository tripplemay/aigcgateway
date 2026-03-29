# AIGC Gateway — API 接口文档

> 版本 1.0 · 2026年3月29日
> 配套文档：AIGC-Gateway-P1-PRD · AIGC-Gateway-Database-Design

**关于占位符：** 本文档中所有域名、包名使用占位符，实际值通过环境变量或配置注入：

| 占位符 | 环境变量 | 说明 |
|--------|---------|------|
| `${API_BASE_URL}` | `AIGC_GATEWAY_BASE_URL` | API 网关地址，如 `https://api.your-domain.com/v1` |
| `${CDN_BASE_URL}` | `AIGC_GATEWAY_CDN_URL` | 静态资源/图片 CDN 地址 |
| `${SITE_URL}` | `AIGC_GATEWAY_SITE_URL` | 控制台/官网地址 |
| `${SDK_PACKAGE}` | — | npm 包名，待注册后确定 |

---

## 1. 概述

### 1.1 Base URL

```
${API_BASE_URL}
```

通过环境变量 `AIGC_GATEWAY_BASE_URL` 配置，不在代码中硬编码。

### 1.2 认证方式

所有 API 请求通过 `Authorization` Header 传递 API Key：

```
Authorization: Bearer pk_a1b2c3d4e5f6...
```

API Key 在开发者控制台创建，格式为 `pk_` 前缀 + 64位随机字符串。每个 Key 关联一个 Project，请求的所有数据操作在该 Project 范围内隔离。

### 1.3 通用响应 Header

| Header | 说明 | 示例 |
|--------|------|------|
| `X-Trace-Id` | 本次调用的唯一追踪ID，可在审计日志中查询 | `trc_8f3a2b7e...` |
| `X-Request-Id` | 请求ID | `req_c41d9e2f...` |
| `X-RateLimit-Limit` | 当前限流上限（RPM） | `100` |
| `X-RateLimit-Remaining` | 剩余可用次数 | `87` |
| `X-RateLimit-Reset` | 限流窗口重置时间（Unix 秒） | `1711700400` |

### 1.4 内容类型

- 请求：`Content-Type: application/json`
- 非流式响应：`Content-Type: application/json`
- 流式响应：`Content-Type: text/event-stream`

---

## 2. AI 调用接口

### 2.1 文本生成（Chat Completions）

```
POST /v1/chat/completions
```

兼容 OpenAI Chat Completions 格式。开发者指定模型名（平台统一命名），平台内部自动选择最优通道。

#### 请求体

```json
{
  "model": "openai/gpt-4o",
  "messages": [
    { "role": "system", "content": "你是一个课程设计专家。" },
    { "role": "user", "content": "请设计一个12周的机器人课程框架。" }
  ],
  "temperature": 0.7,
  "max_tokens": 4096,
  "stream": false,
  "stream_options": { "include_usage": true }
}
```

#### 请求参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `model` | string | 是 | — | 平台统一模型名，如 `openai/gpt-4o`、`deepseek/v3` |
| `messages` | array | 是 | — | 消息数组，见下方消息格式 |
| `temperature` | float | 否 | 模型默认 | 采样温度。平台自动 clamp 到目标服务商的有效范围 |
| `top_p` | float | 否 | 模型默认 | 核采样 |
| `max_tokens` | integer | 否 | 模型默认 | 最大输出 token 数 |
| `stream` | boolean | 否 | `false` | 是否流式输出 |
| `stream_options` | object | 否 | — | `{ "include_usage": true }` 流式模式下返回 token 统计 |
| `stop` | string \| array | 否 | — | 停止序列，最多4个 |
| `presence_penalty` | float | 否 | 0 | [-2, 2] |
| `frequency_penalty` | float | 否 | 0 | [-2, 2] |
| `response_format` | object | 否 | — | `{ "type": "json_object" }` JSON 模式 |
| `tools` | array | 否 | — | 函数调用定义 |
| `tool_choice` | string \| object | 否 | `auto` | `auto` / `none` / `required` / 指定函数 |
| `seed` | integer | 否 | — | 可复现性种子 |
| `n` | integer | 否 | 1 | 候选数（大部分服务商仅支持1） |
| `template_id` | string | 否 | — | **P2预留**：模板ID |

#### 消息格式

```json
// 文本消息
{ "role": "system", "content": "系统指令..." }
{ "role": "user", "content": "用户输入..." }
{ "role": "assistant", "content": "模型回复..." }

// 图片输入（视觉模型）
{
  "role": "user",
  "content": [
    { "type": "text", "text": "描述这张图片" },
    { "type": "image_url", "image_url": { "url": "data:image/jpeg;base64,..." } }
  ]
}

// 函数调用结果
{ "role": "tool", "tool_call_id": "call_abc123", "content": "{\"result\": 42}" }
```

#### 非流式响应（200 OK）

```json
{
  "id": "chatcmpl-trc_8f3a2b7e",
  "object": "chat.completion",
  "model": "openai/gpt-4o",
  "created": 1711699200,
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "# 12周机器人课程框架\n\n## 第1周：认识机器人..."
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 156,
    "completion_tokens": 2048,
    "total_tokens": 2204
  }
}
```

**响应字段说明：**

| 字段 | 说明 |
|------|------|
| `id` | 包含 traceId，同时通过 `X-Trace-Id` Header 返回 |
| `model` | 开发者传入的模型名（非服务商真实ID） |
| `choices[0].message.content` | 模型输出文本 |
| `choices[0].finish_reason` | `stop` / `length` / `tool_calls` / `content_filter` |
| `usage` | token 用量统计 |

#### 流式响应（200 OK, SSE）

```
data: {"id":"chatcmpl-trc_8f3a2b7e","object":"chat.completion.chunk","model":"openai/gpt-4o","created":1711699200,"choices":[{"index":0,"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"chatcmpl-trc_8f3a2b7e","object":"chat.completion.chunk","model":"openai/gpt-4o","created":1711699200,"choices":[{"index":0,"delta":{"content":"# 12周"},"finish_reason":null}]}

data: {"id":"chatcmpl-trc_8f3a2b7e","object":"chat.completion.chunk","model":"openai/gpt-4o","created":1711699200,"choices":[{"index":0,"delta":{"content":"机器人"},"finish_reason":null}]}

data: {"id":"chatcmpl-trc_8f3a2b7e","object":"chat.completion.chunk","model":"openai/gpt-4o","created":1711699200,"choices":[{"index":0,"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":156,"completion_tokens":2048,"total_tokens":2204}}

data: [DONE]
```

**SSE 格式规范：**

- 每个事件以 `data: ` 开头，双换行 `\n\n` 分隔
- `delta.content` 包含增量文本
- 最后一个 chunk 的 `finish_reason` 非 null，同时包含 `usage`（需 `stream_options.include_usage: true`）
- 以 `data: [DONE]` 结束
- 以 `:` 开头的行是 SSE 注释（如 `: keep-alive`），客户端应忽略

---

### 2.2 图片生成（Image Generations）

```
POST /v1/images/generations
```

兼容 OpenAI Image Generations 格式。

#### 请求体

```json
{
  "model": "zhipu/cogview-4",
  "prompt": "一个可爱的卡通机器人在教小朋友画画，儿童绘本风格",
  "n": 1,
  "size": "1024x1024",
  "quality": "standard",
  "response_format": "url"
}
```

#### 请求参数

| 参数 | 类型 | 必填 | 默认值 | 说明 |
|------|------|------|--------|------|
| `model` | string | 是 | — | 图片模型名，如 `zhipu/cogview-4`、`openai/dall-e-3` |
| `prompt` | string | 是 | — | 图片描述 |
| `n` | integer | 否 | 1 | 生成数量（大部分模型仅支持1） |
| `size` | string | 否 | `1024x1024` | 图片尺寸，支持的值因模型而异 |
| `quality` | string | 否 | `standard` | `standard` / `hd` |
| `style` | string | 否 | — | `vivid` / `natural`（仅部分模型支持） |
| `response_format` | string | 否 | `url` | `url` / `b64_json` |

#### 响应（200 OK）

```json
{
  "created": 1711699200,
  "data": [
    {
      "url": "${CDN_BASE_URL}/images/img_a1b2c3.png",
      "revised_prompt": "实际使用的 prompt（仅部分模型返回）"
    }
  ]
}
```

**注意：** `data[0].url` 有效期为 1 小时，开发者需及时下载或转存。

---

## 3. 模型列表接口

### 3.1 获取可用模型列表

```
GET /v1/models
```

返回当前平台上开发者可用的所有模型。

#### 请求参数（Query String）

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `modality` | string | 否 | 按模态筛选：`text` / `image` |

#### 响应（200 OK）

```json
{
  "object": "list",
  "data": [
    {
      "id": "openai/gpt-4o",
      "object": "model",
      "display_name": "GPT-4o",
      "modality": "text",
      "context_window": 128000,
      "max_output_tokens": 16384,
      "pricing": {
        "input_per_1m": 2.50,
        "output_per_1m": 10.00,
        "unit": "token",
        "currency": "USD"
      },
      "capabilities": {
        "vision": true,
        "tools": true,
        "streaming": true,
        "json_mode": true
      }
    },
    {
      "id": "zhipu/cogview-4",
      "object": "model",
      "display_name": "CogView-4",
      "modality": "image",
      "pricing": {
        "per_call": 0.01,
        "unit": "call",
        "currency": "USD"
      },
      "capabilities": {
        "sizes": ["1024x1024", "768x1344", "1344x768"]
      }
    }
  ]
}
```

**注意：** 返回的价格是 `sellPrice`（开发者购买价），不是平台成本价。

---

## 4. 项目管理接口（控制台内部 API）

以下接口供开发者控制台前端调用，通过 Session Cookie 或 JWT 鉴权（非 API Key）。

### 4.1 项目

```
GET    /api/projects                    # 我的项目列表
POST   /api/projects                    # 创建项目
GET    /api/projects/:id                # 项目详情
PATCH  /api/projects/:id                # 更新项目信息
```

**创建项目 — POST /api/projects**

```json
// Request
{ "name": "AI Dash", "description": "智能课程系统" }

// Response (201 Created)
{
  "id": "proj_a1b2c3",
  "name": "AI Dash",
  "description": "智能课程系统",
  "balance": 0,
  "createdAt": "2026-03-29T08:00:00Z"
}
```

### 4.2 API Key

```
GET    /api/projects/:projectId/keys           # Key 列表
POST   /api/projects/:projectId/keys           # 创建 Key
DELETE /api/projects/:projectId/keys/:keyId     # 吊销 Key
```

**创建 Key — POST /api/projects/:projectId/keys**

```json
// Request
{ "name": "production" }

// Response (201 Created) — rawKey 仅此一次展示
{
  "id": "key_x1y2z3",
  "name": "production",
  "key": "pk_a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6...",
  "prefix": "pk_a1b2c",
  "status": "active",
  "createdAt": "2026-03-29T08:00:00Z"
}
```

### 4.3 审计日志

```
GET    /api/projects/:projectId/logs            # 日志列表（分页）
GET    /api/projects/:projectId/logs/:traceId   # 单条日志详情
GET    /api/projects/:projectId/logs/search      # 全文搜索
```

**日志列表 — GET /api/projects/:projectId/logs**

| Query 参数 | 类型 | 说明 |
|-----------|------|------|
| `page` | int | 页码，默认 1 |
| `pageSize` | int | 每页条数，默认 20，最大 100 |
| `model` | string | 按模型筛选 |
| `status` | string | 按状态筛选：`success` / `error` / `timeout` / `filtered` |
| `startTime` | string | ISO 8601 起始时间 |
| `endTime` | string | ISO 8601 结束时间 |
| `sort` | string | 排序字段，默认 `createdAt:desc` |

```json
// Response
{
  "data": [
    {
      "traceId": "trc_8f3a2b7e",
      "modelName": "openai/gpt-4o",
      "status": "success",
      "finishReason": "stop",
      "promptTokens": 156,
      "completionTokens": 2048,
      "totalTokens": 2204,
      "sellPrice": 0.02298,
      "latencyMs": 2100,
      "ttftMs": 320,
      "tokensPerSecond": 45.2,
      "createdAt": "2026-03-29T14:32:08Z",
      "promptPreview": "请设计一个12周的机器人课程框架..."
    }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 2847,
    "totalPages": 143
  }
}
```

**单条详情 — GET /api/projects/:projectId/logs/:traceId**

```json
{
  "traceId": "trc_8f3a2b7e",
  "modelName": "openai/gpt-4o",
  "status": "success",
  "finishReason": "stop",
  "promptSnapshot": [
    { "role": "system", "content": "你是一个课程设计专家。" },
    { "role": "user", "content": "请设计一个12周的机器人课程框架..." }
  ],
  "requestParams": {
    "temperature": 0.7,
    "max_tokens": 4096
  },
  "responseContent": "# 12周机器人课程框架\n\n## 第1周：认识机器人...",
  "promptTokens": 156,
  "completionTokens": 2048,
  "totalTokens": 2204,
  "sellPrice": 0.02298,
  "latencyMs": 2100,
  "ttftMs": 320,
  "tokensPerSecond": 45.2,
  "createdAt": "2026-03-29T14:32:08Z"
}
```

**注意：** 不返回 `channelId`、`costPrice`——这些是运营专属字段。

**全文搜索 — GET /api/projects/:projectId/logs/search**

| Query 参数 | 类型 | 说明 |
|-----------|------|------|
| `q` | string | 搜索关键词（搜索 prompt + response 内容） |
| `page` | int | 页码 |
| `pageSize` | int | 每页条数 |

### 4.4 用量统计

```
GET    /api/projects/:projectId/usage           # 用量汇总
GET    /api/projects/:projectId/usage/daily      # 按天明细
GET    /api/projects/:projectId/usage/by-model   # 按模型分布
```

**用量汇总 — GET /api/projects/:projectId/usage**

| Query 参数 | 类型 | 说明 |
|-----------|------|------|
| `period` | string | `today` / `7d` / `30d` / `custom` |
| `startDate` | string | period=custom 时使用 |
| `endDate` | string | period=custom 时使用 |

```json
{
  "period": "7d",
  "totalCalls": 18429,
  "totalTokens": 45200000,
  "totalCost": 28.47,
  "successRate": 0.996,
  "avgLatencyMs": 1245,
  "avgTtftMs": 310
}
```

### 4.5 余额与充值

```
GET    /api/projects/:projectId/balance          # 余额信息
POST   /api/projects/:projectId/recharge         # 创建充值订单
GET    /api/projects/:projectId/transactions     # 交易记录
```

**创建充值订单 — POST /api/projects/:projectId/recharge**

```json
// Request
{
  "amount": 50.00,
  "paymentMethod": "alipay"
}

// Response (201 Created)
{
  "orderId": "ord_m1n2o3",
  "amount": 50.00,
  "paymentMethod": "alipay",
  "paymentUrl": "https://pay.alipay.com/...",
  "status": "pending",
  "expiresAt": "2026-03-29T09:00:00Z"
}
```

**支付回调（内部）— POST /api/webhooks/payment**

由支付宝/微信支付回调，验签后更新订单状态、增加余额。

---

## 5. 运营管理接口（Admin API）

仅 `role=ADMIN` 可访问。

### 5.1 服务商管理

```
GET    /api/admin/providers                     # 服务商列表
POST   /api/admin/providers                     # 创建服务商
PATCH  /api/admin/providers/:id                 # 更新服务商
GET    /api/admin/providers/:id/config           # 获取配置覆盖
PATCH  /api/admin/providers/:id/config           # 更新配置覆盖
```

### 5.2 模型管理

```
GET    /api/admin/models                        # 模型列表
POST   /api/admin/models                        # 创建模型
PATCH  /api/admin/models/:id                    # 更新模型
```

### 5.3 通道管理

```
GET    /api/admin/channels                      # 通道列表
POST   /api/admin/channels                      # 创建通道
PATCH  /api/admin/channels/:id                  # 更新通道（调 priority / status / 定价）
DELETE /api/admin/channels/:id                  # 删除通道
```

### 5.4 健康监控

```
GET    /api/admin/health                        # 所有通道健康状态
GET    /api/admin/health/:channelId              # 单通道检查历史
POST   /api/admin/health/:channelId/check        # 手动触发检查
```

### 5.5 全局审计

```
GET    /api/admin/logs                          # 跨项目日志（含 channelId / costPrice）
GET    /api/admin/logs/:traceId                 # 单条完整详情
GET    /api/admin/logs/search                   # 全文搜索
```

### 5.6 全局用量与财务

```
GET    /api/admin/usage                         # 平台整体用量
GET    /api/admin/usage/by-provider             # 按服务商分布
GET    /api/admin/usage/by-model                # 按模型分布
GET    /api/admin/finance                       # 毛利概览（sellPrice - costPrice 汇总）
```

### 5.7 开发者管理

```
GET    /api/admin/users                         # 开发者列表
GET    /api/admin/users/:id                     # 开发者详情（含项目和余额）
POST   /api/admin/users/:userId/projects/:projectId/recharge  # 手动充值
```

---

## 6. 认证接口

### 6.1 注册

```
POST /api/auth/register
```

```json
// Request
{
  "email": "dev@example.com",
  "password": "strongPassword123",
  "name": "开发者"
}

// Response (201 Created)
{
  "id": "usr_a1b2c3",
  "email": "dev@example.com",
  "name": "开发者",
  "emailVerified": false
}
```

### 6.2 登录

```
POST /api/auth/login
```

```json
// Request
{ "email": "dev@example.com", "password": "strongPassword123" }

// Response (200 OK)
{
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "user": {
    "id": "usr_a1b2c3",
    "email": "dev@example.com",
    "name": "开发者",
    "role": "DEVELOPER"
  }
}
```

### 6.3 邮箱验证

```
POST /api/auth/verify-email
```

```json
{ "token": "email-verification-token-..." }
```

---

## 7. 错误处理

### 7.1 错误响应格式

所有错误统一使用以下格式：

```json
{
  "error": {
    "type": "invalid_request_error",
    "code": "model_not_found",
    "message": "Model 'openai/gpt-5' is not available.",
    "param": "model"
  }
}
```

### 7.2 HTTP 状态码

| 状态码 | 含义 | 使用场景 |
|--------|------|---------|
| 200 | 成功 | 正常响应 |
| 201 | 创建成功 | 创建项目、Key、充值订单 |
| 400 | 请求参数错误 | 缺少必填字段、格式错误 |
| 401 | 未认证 | API Key 无效或缺失 |
| 402 | 余额不足 | 项目余额为零 |
| 403 | 权限不足 | 非 Admin 访问管理接口 |
| 404 | 资源不存在 | 模型不存在、项目不存在 |
| 409 | 冲突 | 邮箱已注册 |
| 422 | 参数值无效 | temperature 超出范围等 |
| 429 | 限流 | 超过 RPM/TPM 限制 |
| 500 | 服务器内部错误 | 平台异常 |
| 502 | 上游服务商错误 | 服务商返回异常 |
| 503 | 服务不可用 | 所有通道不可用 |

### 7.3 业务错误码

| error.code | HTTP | 说明 |
|------------|------|------|
| `invalid_api_key` | 401 | API Key 无效或已吊销 |
| `insufficient_balance` | 402 | 余额不足 |
| `model_not_found` | 404 | 模型不存在或未启用 |
| `no_available_channel` | 503 | 该模型没有可用通道 |
| `provider_error` | 502 | 服务商返回错误 |
| `provider_timeout` | 502 | 服务商请求超时 |
| `content_filtered` | 400 | 内容被安全审核拦截 |
| `rate_limit_exceeded` | 429 | 超过限流 |
| `invalid_parameter` | 422 | 参数值不合法 |
| `token_limit_exceeded` | 400 | 输出被 max_tokens 截断 |

### 7.4 限流响应

```
HTTP/1.1 429 Too Many Requests
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 0
X-RateLimit-Reset: 1711700460
Retry-After: 60

{
  "error": {
    "type": "rate_limit_error",
    "code": "rate_limit_exceeded",
    "message": "Rate limit exceeded. Please retry after 60 seconds."
  }
}
```

### 7.5 余额不足响应

```
HTTP/1.1 402 Payment Required

{
  "error": {
    "type": "billing_error",
    "code": "insufficient_balance",
    "message": "Insufficient balance. Current balance: $0.002. Please recharge.",
    "balance": 0.002
  }
}
```

---

## 8. 限流规则

### 8.1 API 调用限流

按 Project 维度限流，默认值：

| 指标 | 默认值 | 说明 |
|------|--------|------|
| RPM（请求/分钟） | 60 | 所有模型合计 |
| TPM（token/分钟） | 100,000 | 所有文本模型合计 |
| 图片 RPM | 10 | 图片生成单独限流 |

运营可在控制台按 Project 调整。

### 8.2 控制台 API 限流

| 接口类型 | 限制 |
|---------|------|
| 登录/注册 | 5次/分钟/IP |
| 通用 CRUD | 60次/分钟/用户 |
| 全文搜索 | 10次/分钟/用户 |

---

## 9. SDK 接口映射

TypeScript SDK 的方法与 API 端点的对应关系：

```typescript
import { Gateway } from ${SDK_PACKAGE}

const gw = new Gateway({
  apiKey: 'pk_...',
  baseUrl: '${API_BASE_URL}',  // 可选，默认值
  timeout: 30000,          // 超时（毫秒），默认 30s
  retry: {
    maxRetries: 2,         // 最大重试次数，默认 2
    retryOn: [429, 500, 502, 503],  // 重试的状态码
  }
})

// POST /v1/chat/completions（非流式）
const res = await gw.chat({
  model: 'openai/gpt-4o',
  messages: [{ role: 'user', content: '...' }],
  temperature: 0.7,
  max_tokens: 4096,
})
// res.content    → string
// res.traceId    → string
// res.usage      → { promptTokens, completionTokens, totalTokens }
// res.finishReason → string

// POST /v1/chat/completions（流式）
const stream = await gw.chat({
  model: 'openai/gpt-4o',
  messages: [{ role: 'user', content: '...' }],
  stream: true,
})
for await (const chunk of stream) {
  // chunk.content → string (增量)
  // chunk.finishReason → string | null
}
// stream.traceId → string (流结束后可用)
// stream.usage   → object (流结束后可用)

// POST /v1/images/generations
const img = await gw.image({
  model: 'zhipu/cogview-4',
  prompt: 'A friendly robot teacher',
  size: '1024x1024',
})
// img.url       → string
// img.traceId   → string

// GET /v1/models
const models = await gw.models()
// models → Model[]

// GET /v1/models?modality=image
const imageModels = await gw.models({ modality: 'image' })
```

**错误处理：**

```typescript
import { GatewayError, RateLimitError, InsufficientBalanceError,
         ProviderError, AuthError } from ${SDK_PACKAGE}

try {
  await gw.chat({ ... })
} catch (e) {
  if (e instanceof InsufficientBalanceError) {
    console.log('余额不足:', e.balance)
  } else if (e instanceof RateLimitError) {
    console.log('限流，重试间隔:', e.retryAfter)
  } else if (e instanceof ProviderError) {
    console.log('服务商错误:', e.code, e.message)
  } else if (e instanceof AuthError) {
    console.log('认证失败')
  }
}
```
