# ADR-008: DeepSeek API 集成指南

> 记录时间：2026-03-19
> 适用范围：所有涉及 DeepSeek API 调用的功能
> 来源：官方文档研究 + API 能力分析
> 官方文档：https://api-docs.deepseek.com/

---

## 一、概述

DeepSeek 提供 DeepSeek-V3.2 系列模型，以**极高性价比**著称。API **完全兼容 OpenAI SDK 格式**，支持标准 Chat Completions 和推理模式（Chain-of-Thought）。

**对 AI Dash 系统的意义**：系统现有的 `createOpenAICompatProvider()` 可直接对接，零代码改动。DeepSeek 价格是主流模型中最低档，适合高频调用场景。

---

## 二、认证

### API Key

- 获取地址：https://platform.deepseek.com/api_keys
- 格式：`sk-xxxxx`
- 请求头：`Authorization: Bearer sk-xxxxx`

### Base URL

| 用途 | URL |
|------|-----|
| 标准 API | `https://api.deepseek.com` |
| OpenAI 兼容（等效） | `https://api.deepseek.com/v1` |
| Beta 功能（前缀补全） | `https://api.deepseek.com/beta` |

> `/v1` 后缀与模型版本无关，两个地址等效。管理面板配置用 `https://api.deepseek.com` 即可。

---

## 三、可用模型与价格

| 模型 ID | 模式 | 上下文窗口 | 默认输出 | 最大输出 |
|---------|------|----------|---------|---------|
| `deepseek-chat` | 标准对话 | 128K | 4K | 8K |
| `deepseek-reasoner` | 思维链推理 | 128K | 32K | 64K |

### 价格（USD/百万 token）

| 项目 | deepseek-chat | deepseek-reasoner |
|------|--------------|-------------------|
| 输入（缓存未命中） | $0.28 | $0.28 |
| 输入（缓存命中） | $0.028 | $0.028 |
| 输出 | $0.42 | $0.42 |

> 缓存命中价格为未命中的 **1/10**。系统可通过 `usage.prompt_cache_hit_tokens` 字段追踪缓存命中情况。

---

## 四、Chat Completions

### 端点

```
POST https://api.deepseek.com/chat/completions
```

### 请求格式（与 OpenAI 完全一致）

```json
{
  "model": "deepseek-chat",
  "messages": [
    {"role": "system", "content": "你是一个课程设计专家。"},
    {"role": "user", "content": "请设计一个课程框架。"}
  ],
  "temperature": 0.7,
  "max_tokens": 4096,
  "stream": false
}
```

### 支持的参数

| 参数 | 类型 | 范围 | 默认值 | 说明 |
|------|------|------|--------|------|
| `model` | string | — | 必填 | `deepseek-chat` 或 `deepseek-reasoner` |
| `messages` | array | — | 必填 | 消息数组 |
| `temperature` | float | [0, 2] | 1 | reasoner 模式下无效 |
| `top_p` | float | [0, 1] | 1 | reasoner 模式下无效 |
| `max_tokens` | integer | — | 模型默认 | 最大输出 token |
| `stream` | boolean | — | false | 流式输出 |
| `stream_options` | object | `{"include_usage": true}` | — | 流式模式下返回 token 统计 |
| `frequency_penalty` | float | [-2, 2] | 0 | reasoner 模式下无效 |
| `presence_penalty` | float | [-2, 2] | 0 | reasoner 模式下无效 |
| `response_format` | object | `{"type": "json_object"}` | text | JSON 模式 |
| `stop` | string/array | 最多 16 个 | — | 停止序列 |
| `tools` | array | 最多 128 个 | — | 函数调用（仅 chat） |
| `tool_choice` | string/object | auto/none/required | auto | — |
| `logprobs` | boolean | — | false | 仅 chat 支持 |

### 响应格式

```json
{
  "id": "chatcmpl-xxx",
  "model": "deepseek-chat",
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "回答内容...",
      "reasoning_content": null
    },
    "finish_reason": "stop"
  }],
  "usage": {
    "prompt_tokens": 10,
    "prompt_cache_hit_tokens": 5,
    "prompt_cache_miss_tokens": 5,
    "completion_tokens": 20,
    "total_tokens": 30,
    "completion_tokens_details": {
      "reasoning_tokens": 0
    }
  }
}
```

### 流式输出（SSE）

格式与 OpenAI 一致：

```
data: {"id":"...","choices":[{"delta":{"content":"你好"},"index":0}]}

data: {"id":"...","choices":[{"delta":{},"finish_reason":"stop"}],"usage":{...}}

data: [DONE]
```

> 高负载时会发送 `: keep-alive` 注释保持连接。如果 10 分钟内推理未开始，连接会被终止。

---

## 五、推理模型（deepseek-reasoner）

### 思维链输出

使用 `deepseek-reasoner` 时，模型先生成思维链（Chain-of-Thought），再输出最终答案：

- 思维链内容在 `message.reasoning_content` 字段
- 最终答案在 `message.content` 字段
- 流式模式下先通过 `delta.reasoning_content` 流式输出思维过程，再通过 `delta.content` 输出答案

### 关键限制

| 限制 | 说明 |
|------|------|
| 采样参数无效 | `temperature`、`top_p`、`frequency_penalty`、`presence_penalty` 被静默忽略 |
| logprobs 会报错 | 请求 `logprobs` 或 `top_logprobs` 会返回错误 |
| 不支持函数调用 | `tools` 参数不可用 |
| 多轮对话限制 | **必须**从历史消息中删除 `reasoning_content` 字段，否则返回 400 错误 |

### thinking 参数

```json
{
  "model": "deepseek-chat",
  "thinking": {"type": "enabled"},
  "messages": [...]
}
```

`deepseek-chat` 也可通过 `thinking` 参数启用思维链模式。

---

## 六、`/models` 端点

```
GET https://api.deepseek.com/models
```

**响应**（不含价格信息）：

```json
{
  "object": "list",
  "data": [
    {"id": "deepseek-chat", "object": "model", "owned_by": "deepseek"},
    {"id": "deepseek-reasoner", "object": "model", "owned_by": "deepseek"}
  ]
}
```

> 无 `created` 时间戳、无价格、无上下文窗口信息。管理面板「刷新定价」对 DeepSeek **无效**，需手动输入价格。

---

## 七、不支持的功能

| 功能 | 状态 |
|------|------|
| 图片生成 | 不支持 |
| 视觉/多模态输入 | 不支持 |
| 嵌入（Embeddings） | 未文档化 |
| 文件上传 | 不支持 |

---

## 八、错误码

| HTTP 状态码 | 错误 | 说明 |
|------------|------|------|
| 400 | Invalid Format | 请求体格式错误 |
| 401 | Authentication Fails | API Key 无效 |
| 402 | Insufficient Balance | 余额不足 |
| 422 | Invalid Parameters | 参数值无效 |
| 429 | Rate Limit Reached | 请求过于频繁 |
| 500 | Server Error | 内部错误，建议重试 |
| 503 | Server Overloaded | 高负载，建议退避重试 |

### 特殊 finish_reason

- `insufficient_system_resource`：DeepSeek 特有，系统资源不足导致生成中断

### 限流策略

DeepSeek 官方声明：**不主动限制用户请求频率**，尽力服务每个请求。高流量时通过 keep-alive 保持连接。

---

## 九、AI Dash 系统接入指南

### 管理面板配置

| 字段 | 值 |
|------|-----|
| 名称 | DeepSeek |
| API 地址 | `https://api.deepseek.com` |
| API Key | `sk-xxxxx` |
| 协议 | openai |
| 支持文本 | 是 |
| 支持图片 | 否 |
| 代理地址 | 视网络情况（国内服务器通常可直连） |

### 推荐动作→模型映射

| 动作 | 推荐模型 | 价格（USD/百万 token） | 理由 |
|------|---------|---------------------|------|
| 生成课程框架 | `deepseek-chat` | 0.28 / 0.42 | 性价比极高 |
| 调整框架 | `deepseek-chat` | 0.28 / 0.42 | 同上 |
| 生成/重新生成课次 | `deepseek-chat` | 0.28 / 0.42 | 同上 |
| 按意见修改课次 | `deepseek-chat` | 0.28 / 0.42 | 同上 |
| 单字段改写 | `deepseek-chat` | 0.28 / 0.42 | 快速响应 |
| 课次审核 | `deepseek-reasoner` | 0.28 / 0.42 | 审核需要推理能力 |
| AI 对话 | `deepseek-chat` | 0.28 / 0.42 | 对话场景 |

### 与系统的关键差异

| 差异项 | 说明 | 影响 |
|--------|------|------|
| **价格单位为 USD** | 与 OpenRouter 一致 | 直接填入，系统自动汇率转换 |
| **`/models` 不含价格** | 需手动配置 | 「刷新定价」无效 |
| **`reasoning_content` 字段** | 响应中多一个字段 | 系统 `parseSSEStream` 应忽略该字段，不影响 `content` 提取 |
| **无图片生成** | 无 `/images/generations` | 图片动作不可映射到 DeepSeek |
| **缓存命中统计** | `usage` 中含 `prompt_cache_hit_tokens` | 可用于费用优化分析 |
| **高负载 keep-alive** | 流式模式下可能收到 `: keep-alive` 注释 | SSE 解析器需忽略以 `:` 开头的行（系统已支持） |
| **reasoner 不支持 tools** | 函数调用仅 chat 模型 | 当前系统未使用 tools，无影响 |

---

## 十、与其他提供商的对比

| 特性 | DeepSeek | 百炼 | 火山引擎 | OpenRouter |
|------|----------|------|---------|-----------|
| OpenAI 兼容 | 完全兼容 | 完全兼容 | 部分兼容 | 完全兼容 |
| `/models` 接口 | 有（无价格） | 有（无价格） | 不支持 | 有（含价格） |
| 图片生成 | 不支持 | 异步任务 API | chat 接口 | 兼容 |
| 推理模式 | `reasoning_content` | — | — | 透传 |
| 价格单位 | USD | RMB | RMB | USD |
| 国内直连 | 是 | 是 | 是 | 否（需代理） |
| 输入价格（对标） | $0.28/M | ¥0.15~2.5/M | — | 因模型而异 |
| 缓存折扣 | 10x（自动） | — | — | — |
