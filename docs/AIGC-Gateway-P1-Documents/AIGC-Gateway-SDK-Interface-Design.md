# AIGC Gateway — SDK 接口设计文档

> 版本 1.0 · 2026年3月29日
> 配套文档：AIGC-Gateway-P1-PRD · AIGC-Gateway-API-Specification
> 包名：`@guangai/aigc-sdk`
> 语言：TypeScript（P1）
> 目标：500行以内，开发者5分钟跑通

**关于占位符：** `https://aigc.guangai.ai/v1` 代表 API 网关地址，`@guangai/aigc-sdk` 代表 npm 包名，均通过环境变量或配置注入，不硬编码。详见 API 接口文档的占位符说明。

---

## 1. 安装与初始化

### 1.1 安装

```bash
npm install @guangai/aigc-sdk
# or
yarn add @guangai/aigc-sdk
# or
pnpm add @guangai/aigc-sdk
```

### 1.2 初始化

```typescript
import { Gateway } from '@guangai/aigc-sdk'

const gw = new Gateway({
  apiKey: 'pk_a1b2c3d4...',
})
```

---

## 2. 完整类型定义

### 2.1 配置类型

```typescript
interface GatewayConfig {
  /** API Key，必填。格式 pk_xxx */
  apiKey: string

  /** Base URL，默认 https://aigc.guangai.ai/v1 */
  baseUrl?: string

  /** 请求超时（毫秒），默认 30000 */
  timeout?: number

  /** 重试配置 */
  retry?: RetryConfig

  /** 自定义 fetch 实现（用于 Node 18 以下或测试环境） */
  fetch?: typeof fetch

  /** 自定义 Header，每个请求都会携带 */
  defaultHeaders?: Record<string, string>
}

interface RetryConfig {
  /** 最大重试次数，默认 2 */
  maxRetries?: number

  /** 触发重试的 HTTP 状态码，默认 [429, 500, 502, 503] */
  retryOn?: number[]

  /** 初始退避间隔（毫秒），默认 1000 */
  initialDelay?: number

  /** 退避倍数，默认 2（指数退避） */
  backoffMultiplier?: number

  /** 最大退避间隔（毫秒），默认 30000 */
  maxDelay?: number
}
```

### 2.2 消息类型

```typescript
/** 消息角色 */
type MessageRole = 'system' | 'user' | 'assistant' | 'tool'

/** 文本消息 */
interface TextMessage {
  role: MessageRole
  content: string
  name?: string
}

/** 多模态消息（含图片） */
interface MultimodalMessage {
  role: 'user'
  content: ContentPart[]
}

type ContentPart = TextPart | ImagePart

interface TextPart {
  type: 'text'
  text: string
}

interface ImagePart {
  type: 'image_url'
  image_url: {
    url: string    // https:// 或 data:image/xxx;base64,...
    detail?: 'auto' | 'low' | 'high'
  }
}

/** 函数调用结果消息 */
interface ToolMessage {
  role: 'tool'
  tool_call_id: string
  content: string
}

type Message = TextMessage | MultimodalMessage | ToolMessage
```

### 2.3 请求类型

```typescript
/** 文本生成请求参数（非流式） */
interface ChatParams {
  /** 模型名，平台统一格式，如 openai/gpt-4o */
  model: string

  /** 消息数组 */
  messages: Message[]

  /** 非流式 */
  stream?: false

  /** 采样温度。平台自动 clamp 到服务商有效范围 */
  temperature?: number

  /** 核采样 */
  top_p?: number

  /** 最大输出 token */
  max_tokens?: number

  /** 停止序列 */
  stop?: string | string[]

  /** 存在惩罚 [-2, 2] */
  presence_penalty?: number

  /** 频率惩罚 [-2, 2] */
  frequency_penalty?: number

  /** JSON 模式 */
  response_format?: { type: 'json_object' | 'text' }

  /** 函数定义 */
  tools?: ToolDefinition[]

  /** 函数调用策略 */
  tool_choice?: 'auto' | 'none' | 'required' | { type: 'function', function: { name: string } }

  /** 可复现性种子 */
  seed?: number

  /** P2 预留：模板 ID */
  template_id?: string
}

/** 文本生成请求参数（流式） */
interface ChatStreamParams extends Omit<ChatParams, 'stream'> {
  stream: true
}

/** 图片生成请求参数 */
interface ImageParams {
  /** 图片模型名，如 zhipu/cogview-4 */
  model: string

  /** 图片描述 */
  prompt: string

  /** 生成数量，默认 1 */
  n?: number

  /** 尺寸，默认 1024x1024 */
  size?: string

  /** 质量 */
  quality?: 'standard' | 'hd'

  /** 风格 */
  style?: 'vivid' | 'natural'

  /** 返回格式 */
  response_format?: 'url' | 'b64_json'
}

/** 模型列表查询参数 */
interface ModelsParams {
  /** 按模态筛选 */
  modality?: 'text' | 'image'
}

/** 函数定义 */
interface ToolDefinition {
  type: 'function'
  function: {
    name: string
    description?: string
    parameters?: Record<string, unknown>  // JSON Schema
  }
}
```

### 2.4 响应类型

```typescript
/** 文本生成响应（非流式） */
interface ChatResponse {
  /** 模型输出文本 */
  content: string

  /** 追踪ID，可在审计日志中查询 */
  traceId: string

  /** 终止原因 */
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter'

  /** Token 用量 */
  usage: Usage

  /** 函数调用（如有） */
  toolCalls?: ToolCall[]

  /** 原始响应（供高级用户访问） */
  raw: RawChatResponse
}

/** 流式 chunk */
interface StreamChunk {
  /** 增量文本 */
  content: string

  /** 终止原因（流结束时非 null） */
  finishReason: string | null

  /** 函数调用增量（如有） */
  toolCalls?: ToolCallDelta[]
}

/** 流式响应（AsyncIterable） */
interface ChatStream extends AsyncIterable<StreamChunk> {
  /** 流结束后可用：追踪ID */
  traceId: string

  /** 流结束后可用：Token 用量 */
  usage: Usage | null

  /** 中止流 */
  abort(): void

  /** 收集所有 chunk 为完整文本 */
  collect(): Promise<ChatResponse>
}

/** Token 用量 */
interface Usage {
  promptTokens: number
  completionTokens: number
  totalTokens: number
}

/** 图片生成响应 */
interface ImageResponse {
  /** 图片 URL（有效期 1 小时） */
  url?: string

  /** Base64 编码（当 response_format = b64_json） */
  b64Json?: string

  /** 实际使用的 prompt（部分模型返回） */
  revisedPrompt?: string

  /** 追踪ID */
  traceId: string
}

/** 模型信息 */
interface ModelInfo {
  /** 模型 ID（平台统一命名） */
  id: string

  /** 展示名 */
  displayName: string

  /** 模态 */
  modality: 'text' | 'image'

  /** 上下文窗口 */
  contextWindow?: number

  /** 最大输出 token */
  maxOutputTokens?: number

  /** 定价（sellPrice） */
  pricing: TokenPricing | CallPricing

  /** 能力 */
  capabilities?: {
    vision?: boolean
    tools?: boolean
    streaming?: boolean
    jsonMode?: boolean
  }
}

interface TokenPricing {
  unit: 'token'
  inputPer1M: number
  outputPer1M: number
  currency: 'USD'
}

interface CallPricing {
  unit: 'call'
  perCall: number
  currency: 'USD'
}

/** 函数调用 */
interface ToolCall {
  id: string
  type: 'function'
  function: {
    name: string
    arguments: string  // JSON string
  }
}

interface ToolCallDelta {
  index: number
  id?: string
  type?: 'function'
  function?: {
    name?: string
    arguments?: string
  }
}

/** 原始响应（OpenAI 兼容格式） */
interface RawChatResponse {
  id: string
  object: string
  model: string
  created: number
  choices: Array<{
    index: number
    message: {
      role: string
      content: string | null
      tool_calls?: ToolCall[]
    }
    finish_reason: string
  }>
  usage: {
    prompt_tokens: number
    completion_tokens: number
    total_tokens: number
  }
}
```

---

## 3. 公开方法

### 3.1 Gateway 类

```typescript
class Gateway {
  constructor(config: GatewayConfig)

  /**
   * 文本生成（非流式）
   * 对应 POST /v1/chat/completions
   */
  chat(params: ChatParams): Promise<ChatResponse>

  /**
   * 文本生成（流式）
   * 对应 POST /v1/chat/completions { stream: true }
   */
  chat(params: ChatStreamParams): Promise<ChatStream>

  /**
   * 图片生成
   * 对应 POST /v1/images/generations
   */
  image(params: ImageParams): Promise<ImageResponse>

  /**
   * 获取可用模型列表
   * 对应 GET /v1/models
   */
  models(params?: ModelsParams): Promise<ModelInfo[]>
}
```

### 3.2 方法重载说明

`chat` 方法通过 `stream` 参数区分返回类型：

```typescript
// stream 未设置或 false → 返回 ChatResponse
const res = await gw.chat({ model: '...', messages: [...] })
// typeof res === ChatResponse

// stream: true → 返回 ChatStream
const stream = await gw.chat({ model: '...', messages: [...], stream: true })
// typeof stream === ChatStream
```

---

## 4. 错误类型层级

```typescript
/**
 * 所有 SDK 错误的基类
 */
class GatewayError extends Error {
  /** HTTP 状态码 */
  status: number

  /** 业务错误码 */
  code: string

  /** 错误类型 */
  type: string

  /** 涉及的参数（如有） */
  param?: string

  /** 原始错误响应 */
  raw?: unknown
}

/**
 * 401 — API Key 无效或已吊销
 */
class AuthError extends GatewayError {
  status: 401
  code: 'invalid_api_key'
}

/**
 * 402 — 余额不足
 */
class InsufficientBalanceError extends GatewayError {
  status: 402
  code: 'insufficient_balance'

  /** 当前余额 */
  balance: number
}

/**
 * 404 — 模型不存在
 */
class ModelNotFoundError extends GatewayError {
  status: 404
  code: 'model_not_found'

  /** 请求的模型名 */
  model: string
}

/**
 * 422 — 参数值不合法
 */
class InvalidParameterError extends GatewayError {
  status: 422
  code: 'invalid_parameter'

  /** 无效的参数名 */
  param: string
}

/**
 * 429 — 超过限流
 */
class RateLimitError extends GatewayError {
  status: 429
  code: 'rate_limit_exceeded'

  /** 建议重试间隔（秒） */
  retryAfter: number
}

/**
 * 502 — 服务商错误
 */
class ProviderError extends GatewayError {
  status: 502
  code: 'provider_error' | 'provider_timeout'
}

/**
 * 503 — 无可用通道
 */
class NoChannelError extends GatewayError {
  status: 503
  code: 'no_available_channel'

  /** 请求的模型名 */
  model: string
}

/**
 * 400 — 内容安全审核
 */
class ContentFilteredError extends GatewayError {
  status: 400
  code: 'content_filtered'
}

/**
 * 网络/超时错误（非 HTTP 错误）
 */
class ConnectionError extends GatewayError {
  /** 'timeout' | 'network' | 'abort' */
  cause: string
}
```

**错误处理示例：**

```typescript
import {
  Gateway,
  GatewayError,
  AuthError,
  InsufficientBalanceError,
  RateLimitError,
  ProviderError,
  ModelNotFoundError,
  NoChannelError,
  ContentFilteredError,
  ConnectionError,
} from '@guangai/aigc-sdk'

try {
  const res = await gw.chat({ model: 'openai/gpt-4o', messages: [...] })
} catch (e) {
  if (e instanceof InsufficientBalanceError) {
    console.error(`余额不足，当前: $${e.balance}`)
    // → 引导用户充值
  } else if (e instanceof RateLimitError) {
    console.error(`限流，${e.retryAfter}秒后重试`)
    // → SDK 已自动重试过 maxRetries 次，仍然限流
  } else if (e instanceof ModelNotFoundError) {
    console.error(`模型不存在: ${e.model}`)
  } else if (e instanceof NoChannelError) {
    console.error(`模型 ${e.model} 暂无可用通道`)
  } else if (e instanceof ProviderError) {
    console.error(`服务商错误: ${e.message}`)
    // → SDK 已自动重试过
  } else if (e instanceof ContentFilteredError) {
    console.error('内容被安全审核拦截')
  } else if (e instanceof AuthError) {
    console.error('API Key 无效')
  } else if (e instanceof ConnectionError) {
    console.error(`连接错误: ${e.cause}`)  // timeout / network / abort
  } else if (e instanceof GatewayError) {
    console.error(`其他错误: ${e.code} - ${e.message}`)
  }
}
```

---

## 5. 重试策略

### 5.1 默认行为

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| maxRetries | 2 | 最多重试2次（总共3次请求） |
| retryOn | [429, 500, 502, 503] | 这些状态码触发重试 |
| initialDelay | 1000ms | 第一次重试前等待 |
| backoffMultiplier | 2 | 指数退避：1s → 2s → 4s |
| maxDelay | 30000ms | 退避上限 |

### 5.2 429 特殊处理

收到 429 时，优先使用响应 Header 中的 `Retry-After` 值：

```
第1次请求 → 429, Retry-After: 5
  等待 5 秒
第2次请求 → 429, Retry-After: 10
  等待 10 秒
第3次请求 → 429
  抛出 RateLimitError（retryAfter = 响应中的值）
```

### 5.3 不重试的场景

| 状态码 | 原因 |
|--------|------|
| 400 | 请求参数错误，重试无意义 |
| 401 | 认证失败，重试无意义 |
| 402 | 余额不足，重试无意义 |
| 403 | 权限不足 |
| 404 | 资源不存在 |
| 422 | 参数值无效 |

### 5.4 流式请求重试

流式请求仅在**连接建立前**重试。一旦开始接收 SSE 事件，中断后不重试（因为部分数据已发送给调用方，重试会导致内容重复）。

### 5.5 覆盖默认配置

```typescript
// 全局配置
const gw = new Gateway({
  apiKey: 'pk_...',
  retry: {
    maxRetries: 3,
    initialDelay: 500,
    retryOn: [429, 502, 503],  // 移除 500
  }
})

// 禁用重试
const gw = new Gateway({
  apiKey: 'pk_...',
  retry: { maxRetries: 0 }
})
```

---

## 6. SSE 流式解析规格

SDK 内部的 SSE 解析器需要处理以下情况：

### 6.1 标准事件

```
data: {"id":"...","choices":[{"delta":{"content":"你好"},"finish_reason":null}]}\n\n
```

- 以 `data: ` 开头，双换行 `\n\n` 分隔
- 解析 JSON，提取 `choices[0].delta.content`

### 6.2 终止信号

```
data: [DONE]\n\n
```

- 停止迭代，触发 stream 的完成回调

### 6.3 SSE 注释（需忽略）

```
: keep-alive\n\n
: OPENROUTER PROCESSING\n\n
```

- 以 `:` 开头的行是 SSE 注释，直接跳过
- DeepSeek 发送 `: keep-alive`，OpenRouter 发送 `": OPENROUTER PROCESSING"`

### 6.4 最后一个 chunk 含 usage

当请求中设置了 `stream_options: { include_usage: true }` 时（SDK 默认开启），最后一个有效 chunk 包含完整的 usage：

```
data: {"choices":[{"delta":{},"finish_reason":"stop"}],"usage":{"prompt_tokens":156,"completion_tokens":2048,"total_tokens":2204}}\n\n
data: [DONE]\n\n
```

SDK 自动从此 chunk 提取 usage，赋值给 `stream.usage`。

### 6.5 Buffer 拼接

SSE 事件可能跨越多个 TCP 数据包到达，解析器需要维护 buffer：

```typescript
// 伪代码
let buffer = ''
for await (const chunk of response.body) {
  buffer += decoder.decode(chunk, { stream: true })
  const lines = buffer.split('\n')
  buffer = lines.pop() || ''  // 最后一行可能不完整，保留

  for (const line of lines) {
    if (line === '') continue           // 空行（事件分隔）
    if (line.startsWith(':')) continue  // SSE 注释
    if (!line.startsWith('data: ')) continue
    const data = line.slice(6)
    if (data === '[DONE]') return
    yield JSON.parse(data)
  }
}
```

---

## 7. traceId 透传机制

### 7.1 非流式

traceId 从两个来源获取（取先到达的）：

1. 响应 Header `X-Trace-Id`
2. 响应 Body `id` 字段

```typescript
const traceId = response.headers.get('x-trace-id')
  || body.id?.replace('chatcmpl-', '')
```

### 7.2 流式

- 连接建立时从 Header 获取 `X-Trace-Id`
- 或从第一个 SSE chunk 的 `id` 字段提取
- 赋值给 `stream.traceId`，流结束前即可访问

---

## 8. 包发布规范

### 8.1 包信息

```json
{
  "name": "@guangai/aigc-sdk",
  "version": "0.1.0",
  "description": "Official TypeScript SDK for AIGC Gateway",
  "main": "dist/index.js",
  "module": "dist/index.mjs",
  "types": "dist/index.d.ts",
  "exports": {
    ".": {
      "import": "./dist/index.mjs",
      "require": "./dist/index.js",
      "types": "./dist/index.d.ts"
    }
  },
  "files": ["dist"],
  "engines": { "node": ">=18" },
  "license": "MIT"
}
```

### 8.2 导出清单

```typescript
// @guangai/aigc-sdk 的公开导出

// 主类
export { Gateway } from './gateway'

// 配置类型
export type { GatewayConfig, RetryConfig } from './types/config'

// 请求类型
export type {
  ChatParams, ChatStreamParams, ImageParams, ModelsParams,
  Message, TextMessage, MultimodalMessage, ToolMessage,
  ContentPart, TextPart, ImagePart,
  ToolDefinition,
} from './types/request'

// 响应类型
export type {
  ChatResponse, ChatStream, StreamChunk,
  ImageResponse, ModelInfo,
  Usage, ToolCall, ToolCallDelta,
  TokenPricing, CallPricing,
  RawChatResponse,
} from './types/response'

// 错误类型
export {
  GatewayError,
  AuthError,
  InsufficientBalanceError,
  ModelNotFoundError,
  InvalidParameterError,
  RateLimitError,
  ProviderError,
  NoChannelError,
  ContentFilteredError,
  ConnectionError,
} from './errors'
```

### 8.3 版本策略

| 变更类型 | 版本号 | 示例 |
|---------|--------|------|
| Bug 修复 | patch | 0.1.0 → 0.1.1 |
| 新增方法/参数（向后兼容） | minor | 0.1.0 → 0.2.0 |
| 破坏性变更 | major | 0.x → 1.0.0 |

P1 阶段版本号为 `0.x.x`，表示 API 尚未稳定。1.0.0 在 P2 模板系统上线后发布。

### 8.4 零依赖

SDK 不引入任何第三方依赖，仅使用 Node.js 内置的 `fetch`（Node 18+）和 `TextDecoder`。这保证了最小包体积和零供应链风险。

---

## 9. 使用示例汇总

### 9.1 基础对话

```typescript
const res = await gw.chat({
  model: 'deepseek/v3',
  messages: [
    { role: 'system', content: '你是一个课程设计专家。' },
    { role: 'user', content: '设计一个12周的机器人课程框架' },
  ],
  temperature: 0.7,
  max_tokens: 4096,
})

console.log(res.content)          // 模型输出
console.log(res.traceId)          // 审计追踪
console.log(res.usage.totalTokens) // token 用量
```

### 9.2 流式输出

```typescript
const stream = await gw.chat({
  model: 'openai/gpt-4o',
  messages: [{ role: 'user', content: '写一篇关于AI教育的文章' }],
  stream: true,
})

for await (const chunk of stream) {
  process.stdout.write(chunk.content)
}

console.log('\n---')
console.log('TraceId:', stream.traceId)
console.log('Tokens:', stream.usage?.totalTokens)
```

### 9.3 流式收集为完整响应

```typescript
const stream = await gw.chat({
  model: 'openai/gpt-4o',
  messages: [{ role: 'user', content: '...' }],
  stream: true,
})

// 不逐 chunk 处理，直接收集为 ChatResponse
const res = await stream.collect()
console.log(res.content)   // 完整文本
console.log(res.traceId)
```

### 9.4 图片生成

```typescript
const img = await gw.image({
  model: 'zhipu/cogview-4',
  prompt: '一个友好的卡通机器人老师在教小朋友画水彩画',
  size: '1024x1024',
})

console.log(img.url)       // 图片 URL（1小时有效）
console.log(img.traceId)   // 审计追踪
```

### 9.5 JSON 模式

```typescript
const res = await gw.chat({
  model: 'deepseek/v3',
  messages: [
    { role: 'system', content: '以 JSON 格式返回课程大纲。' },
    { role: 'user', content: '12周机器人课程' },
  ],
  response_format: { type: 'json_object' },
})

const outline = JSON.parse(res.content)
```

### 9.6 函数调用

```typescript
const res = await gw.chat({
  model: 'openai/gpt-4o',
  messages: [{ role: 'user', content: '北京今天天气怎么样？' }],
  tools: [{
    type: 'function',
    function: {
      name: 'get_weather',
      description: '获取指定城市的天气',
      parameters: {
        type: 'object',
        properties: {
          city: { type: 'string', description: '城市名' }
        },
        required: ['city']
      }
    }
  }],
})

if (res.toolCalls) {
  for (const call of res.toolCalls) {
    const args = JSON.parse(call.function.arguments)
    console.log(`调用 ${call.function.name}(${JSON.stringify(args)})`)
  }
}
```

### 9.7 视觉输入

```typescript
const res = await gw.chat({
  model: 'openai/gpt-4o',
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: '这张图片里有什么？' },
      { type: 'image_url', image_url: { url: 'https://example.com/photo.jpg' } },
    ]
  }],
})
```

### 9.8 查看可用模型

```typescript
// 所有模型
const all = await gw.models()

// 仅文本模型
const text = await gw.models({ modality: 'text' })

// 仅图片模型
const image = await gw.models({ modality: 'image' })

for (const m of text) {
  console.log(`${m.id} — ${m.displayName} — $${m.pricing.inputPer1M}/M input`)
}
```

### 9.9 中止流式请求

```typescript
const stream = await gw.chat({
  model: 'openai/gpt-4o',
  messages: [{ role: 'user', content: '...' }],
  stream: true,
})

setTimeout(() => stream.abort(), 5000)  // 5秒后中止

try {
  for await (const chunk of stream) {
    process.stdout.write(chunk.content)
  }
} catch (e) {
  if (e instanceof ConnectionError && e.cause === 'abort') {
    console.log('\n已中止')
  }
}
```

### 9.10 P2 预留：模板 ID

```typescript
// P2 上线后，开发者可以指定模板
const res = await gw.chat({
  model: 'deepseek/v3',
  messages: [{ role: 'user', content: '设计一个课程' }],
  template_id: 'tmpl_curriculum_v2',  // P2 模板系统
})
// 审计日志会记录使用了哪个模板，支持模板效果追踪
```
