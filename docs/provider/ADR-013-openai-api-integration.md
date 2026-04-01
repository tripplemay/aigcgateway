# ADR-013: OpenAI API 集成指南

> 记录时间：2026-03-19
> 适用范围：所有涉及 OpenAI API 调用的功能
> 来源：官方文档研究 + API 能力分析
> 官方文档：https://platform.openai.com/docs/api-reference

---

## 一、概述

OpenAI 是行业标准 API 提供商，其 API 格式被几乎所有其他提供商兼容。AI Dash 系统的整个 AI 服务层就是基于 OpenAI 格式构建的。

**对 AI Dash 系统的意义**：这是系统兼容层的**参照标准**。所有其他提供商的"OpenAI 兼容"程度都是相对于这个标准来衡量的。

---

## 二、认证

### API Key

- 格式：`sk-xxxxx`（标准）/ `sk-proj-xxxxx`（项目级）
- 获取地址：https://platform.openai.com/api-keys

### 请求头

```
Authorization: Bearer sk-xxxxx
Content-Type: application/json
OpenAI-Organization: org-xxxxx    # 可选，多组织账号
OpenAI-Project: proj-xxxxx        # 可选，项目级
```

### Base URL

```
https://api.openai.com/v1
```

> 从国内服务器访问 OpenAI 需要代理。管理面板需配置 `proxyUrl`（如 `socks5://127.0.0.1:1080`）。

---

## 三、可用模型与价格

### 文本模型（USD/百万 token）

| 模型 | 上下文 | 最大输出 | 输入 | 缓存输入 | 输出 | 视觉 | 函数调用 | 推理 |
|------|--------|---------|------|---------|------|------|---------|------|
| **gpt-4o** | 128K | 16,384 | $2.50 | $1.25 | $10.00 | 是 | 是 | 否 |
| **gpt-4o-mini** | 128K | 16,384 | $0.15 | $0.075 | $0.60 | 是 | 是 | 否 |
| **gpt-4.1** | 1M | 32,768 | $2.00 | $0.50 | $8.00 | 是 | 是 | 否 |
| **gpt-4.1-mini** | 1M | 32,768 | $0.40 | $0.10 | $1.60 | 是 | 是 | 否 |
| **gpt-4.1-nano** | 1M | 32,768 | $0.10 | $0.025 | $0.40 | 是 | 是 | 否 |
| **o4-mini** | 200K | 100,000 | $1.10 | $0.275 | $4.40 | 是 | 是 | 是 |
| **o3** | 200K | 100,000 | $10.00 | $2.50 | $40.00 | 是 | 是 | 是 |
| **o3-mini** | 200K | 100,000 | $1.10 | $0.55 | $4.40 | 否 | 是 | 是 |
| **o1** | 200K | 100,000 | $15.00 | $7.50 | $60.00 | 是 | 是 | 是 |
| **gpt-4-turbo** | 128K | 4,096 | $10.00 | — | $30.00 | 是 | 是 | 否 |
| **gpt-3.5-turbo** | 16K | 4,096 | $0.50 | — | $1.50 | 否 | 是 | 否 |

> **批处理 API**（异步，最长 24 小时）：所有文本模型 **5 折**。

### 推理模型注意事项

o 系列模型（o1/o3/o3-mini/o4-mini）有特殊限制：
- 使用 `"developer"` 角色替代 `"system"` 角色
- `temperature`、`top_p`、`presence_penalty`、`frequency_penalty` 不可设置
- 使用 `max_completion_tokens`（非 `max_tokens`），预算包含推理 token
- `reasoning_effort`：`"low"` / `"medium"` / `"high"` 控制推理深度

---

## 四、Chat Completions

### 端点

```
POST https://api.openai.com/v1/chat/completions
```

### 请求参数

| 参数 | 类型 | 默认值 | 说明 |
|------|------|--------|------|
| `model` | string | 必填 | 模型 ID |
| `messages` | array | 必填 | 消息数组 |
| `temperature` | float | 1.0 | [0, 2]，越低越确定 |
| `top_p` | float | 1.0 | 核采样 |
| `max_tokens` | integer | — | 最大输出（已弃用，用 `max_completion_tokens`） |
| `max_completion_tokens` | integer | — | 最大输出（推理模型必用） |
| `stream` | boolean | false | 流式输出 |
| `stream_options` | object | — | `{"include_usage": true}` |
| `stop` | string/array | — | 最多 4 个停止序列 |
| `presence_penalty` | float | 0 | [-2, 2] |
| `frequency_penalty` | float | 0 | [-2, 2] |
| `tools` | array | — | 函数定义 |
| `tool_choice` | string/object | auto | none/auto/required/指定函数 |
| `response_format` | object | text | JSON 模式或结构化输出 |
| `seed` | integer | — | 可复现性 |
| `n` | integer | 1 | 候选数 |
| `logprobs` | boolean | false | 返回 log 概率 |
| `reasoning_effort` | string | medium | o 系列专用 |

### 消息格式

**文本消息**：
```json
{"role": "user", "content": "你好"}
```

**视觉输入（图片）**：
```json
{
  "role": "user",
  "content": [
    {"type": "text", "text": "描述这张图片"},
    {"type": "image_url", "image_url": {"url": "https://...", "detail": "auto"}}
  ]
}
```

**函数调用结果**：
```json
{"role": "tool", "tool_call_id": "call_abc123", "content": "{\"result\": 42}"}
```

### 响应格式

```json
{
  "id": "chatcmpl-abc123",
  "model": "gpt-4o",
  "choices": [{
    "index": 0,
    "message": {"role": "assistant", "content": "你好！"},
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 12,
    "completion_tokens": 8,
    "total_tokens": 20,
    "prompt_tokens_details": {"cached_tokens": 0},
    "completion_tokens_details": {"reasoning_tokens": 0}
  }
}
```

`finish_reason` 值：`stop` / `length` / `tool_calls` / `content_filter`

### 流式输出（SSE）

```
data: {"id":"...","choices":[{"delta":{"role":"assistant","content":""},"finish_reason":null}]}

data: {"id":"...","choices":[{"delta":{"content":"你好"},"finish_reason":null}]}

data: {"id":"...","choices":[{"delta":{},"finish_reason":"stop"}]}

data: [DONE]
```

- 每个事件以 `data: ` 开头，双换行分隔
- `delta` 对象包含增量内容
- `stream_options: {"include_usage": true}` 时最后一个 chunk 含 `usage`
- 函数调用通过 `delta.tool_calls[i].function.arguments` 流式传输片段

---

## 五、图片生成

### DALL-E 3

```
POST https://api.openai.com/v1/images/generations
```

```json
{
  "model": "dall-e-3",
  "prompt": "一个可爱的卡通机器人教小朋友画画",
  "n": 1,
  "size": "1024x1024",
  "quality": "standard",
  "style": "vivid"
}
```

| 参数 | DALL-E 3 值 |
|------|------------|
| size | `1024x1024` / `1792x1024` / `1024x1792` |
| quality | `standard` / `hd` |
| style | `vivid`（默认）/ `natural` |
| n | 仅 1 |

**响应**（URL 1 小时有效）：
```json
{
  "data": [{"url": "https://...", "revised_prompt": "实际使用的 prompt..."}]
}
```

### DALL-E 3 价格

| 尺寸 | standard | hd |
|------|----------|-----|
| 1024x1024 | $0.040 | $0.080 |
| 1792x1024 / 1024x1792 | $0.080 | $0.120 |

### gpt-image-1

支持两种调用方式：

**方式 A：`/images/generations` 端点**
```json
{
  "model": "gpt-image-1",
  "prompt": "儿童绘本风格的友好机器人",
  "size": "1536x1024",
  "quality": "medium",
  "output_format": "png"
}
```

| quality | 1024x1024 | 1536x1024 / 1024x1536 |
|---------|----------|---------------------|
| low | $0.011 | $0.016 |
| medium | $0.042 | $0.063 |
| high | $0.167 | $0.250 |

**方式 B：Chat Completions**（图片在 `content` 数组中返回）
```json
{
  "model": "gpt-4o",
  "messages": [{"role": "user", "content": "生成一张日落图片"}],
  "modalities": ["text", "image"]
}
```

系统 `provider.ts` 中的 `generateImage` 已支持这两种方式。

---

## 六、`/models` 端点

```
GET https://api.openai.com/v1/models
```

**响应**（不含价格信息）：
```json
{
  "object": "list",
  "data": [
    {"id": "gpt-4o", "object": "model", "created": 1715367049, "owned_by": "system"}
  ]
}
```

> `/models` 不返回价格、上下文窗口或能力信息。管理面板「刷新定价」对 OpenAI **无效**，需手动输入价格。

---

## 七、嵌入（Embeddings）

```
POST https://api.openai.com/v1/embeddings
```

| 模型 | 维度 | 价格（USD/百万 token） |
|------|------|---------------------|
| text-embedding-3-small | 1536（可调） | $0.020 |
| text-embedding-3-large | 3072（可调） | $0.130 |

---

## 八、错误码与限流

### 错误码

| HTTP 状态码 | 说明 |
|------------|------|
| 400 | 请求参数错误 |
| 401 | API Key 无效 |
| 403 | 权限不足 |
| 404 | 端点或模型不存在 |
| 429 | 限流 |
| 500 | 内部错误 |
| 503 | 服务过载 |

### 限流

按等级（Tier 1-5）分级，基于付费历史自动升级。限流返回 429 + `Retry-After` 头。

---

## 九、AI Dash 系统接入指南

### 管理面板配置

| 字段 | 值 |
|------|-----|
| 名称 | OpenAI |
| API 地址 | `https://api.openai.com/v1` |
| API Key | `sk-xxxxx` |
| 协议 | openai |
| 支持文本 | 是 |
| 支持图片 | 是 |
| 代理地址 | `socks5://127.0.0.1:1080`（国内必须配代理） |

### 推荐动作→模型映射

| 动作 | 推荐模型 | 价格（输入/输出） | 理由 |
|------|---------|----------------|------|
| 生成课程框架 | `gpt-4o` | $2.50 / $10.00 | 质量最佳 |
| 调整框架 | `gpt-4o-mini` | $0.15 / $0.60 | 性价比高 |
| 生成/重新生成课次 | `gpt-4o` | $2.50 / $10.00 | 需要高质量 |
| 按意见修改课次 | `gpt-4o-mini` | $0.15 / $0.60 | 简单任务 |
| 单字段改写 | `gpt-4o-mini` | $0.15 / $0.60 | 快速响应 |
| 课次审核 | `gpt-4o` | $2.50 / $10.00 | 需要准确判断 |
| AI 对话 | `gpt-4o-mini` | $0.15 / $0.60 | 对话重速度 |
| 课次封面/插图 | `dall-e-3` | $0.04~0.12/张 | — |
| 课程包封面 | `gpt-image-1` | $0.042~0.25/张 | 更高质量 |

### 与系统的兼容性

OpenAI 是系统的参照标准，**完全兼容**。所有系统功能（Chat、Stream、图片生成、函数调用）均为 OpenAI 格式设计。

唯一注意：**需要代理**才能从国内服务器访问。

---

## 十、OpenAI API 作为兼容性标准

以下是其他提供商实现"OpenAI 兼容"时遵循的核心约定：

1. `Authorization: Bearer <key>` 认证
2. `/v1/chat/completions` 端点格式
3. `messages` 数组 `role`/`content` 结构
4. SSE 流式 `data: {...}\n\n` + `data: [DONE]` 终止
5. `usage` 对象含 `prompt_tokens` / `completion_tokens`
6. `choices[0].message.content` 取回复文本
7. `choices[0].delta.content` 取流式增量
8. `finish_reason` 枚举值
9. `tools` / `tool_calls` / `tool` 角色的函数调用链
10. `/v1/models` 返回 `{data: [{id, object, created, owned_by}]}`
11. `/v1/images/generations` 图片生成
12. `stream_options: {"include_usage": true}` 流式 token 统计

**常见偏差**：
- 部分提供商 `/models` 不返回价格（百炼、DeepSeek、火山引擎）
- 图片生成格式差异大（百炼异步、火山引擎走 chat、OpenRouter 透传）
- 结构化输出 `json_schema` 仅少数提供商支持
- 部分提供商返回的 `model` 字段与请求不一致
