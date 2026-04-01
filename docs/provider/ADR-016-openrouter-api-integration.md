# ADR-016: OpenRouter 聚合网关 API 集成指南

> 记录时间：2026-03-19
> 适用范围：所有通过 OpenRouter 调用 AI 模型的功能
> 来源：官方文档研究 + API 能力分析
> 官方文档：https://openrouter.ai/docs

---

## 一、概述

OpenRouter 是 AI 模型聚合网关，**一个 API Key 访问 400+ 模型**（Anthropic、OpenAI、Google、Meta、DeepSeek 等）。**完全兼容 OpenAI SDK**，是系统当前的主要提供商之一。

**对 AI Dash 系统的意义**：系统已在使用 OpenRouter。它是唯一一个 `/models` 接口**返回实时价格**的提供商，管理面板的「刷新定价」功能对 OpenRouter 有效。

---

## 二、认证

### Base URL

```
https://openrouter.ai/api/v1
```

### 请求头

```
Authorization: Bearer {OPENROUTER_API_KEY}
Content-Type: application/json
HTTP-Referer: https://your-site.com       # 可选，用于排名归属
X-OpenRouter-Title: AI Dash               # 可选，显示在仪表板
```

API Key 从 https://openrouter.ai/settings/keys 获取。

---

## 三、模型命名

格式：`{提供商}/{模型名}`

| 示例 | 说明 |
|------|------|
| `anthropic/claude-sonnet-4-6` | Anthropic Claude Sonnet 4.6 |
| `openai/gpt-4o` | OpenAI GPT-4o |
| `google/gemini-2.5-flash` | Google Gemini 2.5 Flash |
| `deepseek/deepseek-chat` | DeepSeek Chat |
| `meta-llama/llama-4-maverick` | Meta Llama 4 |

---

## 四、Chat Completions

### 端点

```
POST https://openrouter.ai/api/v1/chat/completions
```

### 请求格式（与 OpenAI 完全一致）

```json
{
  "model": "anthropic/claude-sonnet-4-6",
  "messages": [
    {"role": "system", "content": "你是一个课程设计专家。"},
    {"role": "user", "content": "请设计课程框架。"}
  ],
  "temperature": 0.7,
  "max_tokens": 4096,
  "stream": true
}
```

所有 OpenAI 标准参数均支持：`temperature`、`top_p`、`max_tokens`、`stream`、`stream_options`、`tools`、`tool_choice`、`response_format` 等。

### 流式输出

标准 SSE 格式，`data: {...}` + `data: [DONE]`。

> OpenRouter 会发送 `": OPENROUTER PROCESSING"` 等 SSE 注释作为 keepalive，系统 SSE 解析器应忽略以 `:` 开头的行。

### 响应格式

与 OpenAI 一致，额外包含 `provider` 字段：

```json
{
  "id": "gen-...",
  "model": "anthropic/claude-sonnet-4-6",
  "provider": "Anthropic",
  "choices": [{"message": {"role": "assistant", "content": "..."}, "finish_reason": "stop"}],
  "usage": {"prompt_tokens": 10, "completion_tokens": 50, "total_tokens": 60}
}
```

---

## 五、`/models` 端点（唯一返回价格的提供商）

```
GET https://openrouter.ai/api/v1/models
```

### 筛选参数

- `?output_modalities=image` — 仅图片生成模型
- `?supported_parameters=tools` — 仅支持函数调用的模型

### 响应（含完整价格信息）

```json
{
  "id": "anthropic/claude-sonnet-4-6",
  "name": "Anthropic: Claude Sonnet 4.6",
  "context_length": 1000000,
  "architecture": {
    "input_modalities": ["text", "image"],
    "output_modalities": ["text"]
  },
  "pricing": {
    "prompt": "0.000003",       // USD/token（字符串）
    "completion": "0.000015"    // USD/token（字符串）
  },
  "top_provider": {
    "max_completion_tokens": 64000
  },
  "supported_parameters": ["temperature", "tools", ...]
}
```

> **这是系统「刷新定价」功能的唯一有效来源**。价格单位为 USD/token（字符串），需转换为 USD/百万 token 存入 `AiActionConfig`。

---

## 六、图片生成

通过 **Chat Completions** 端点（非 `/images/generations`）：

```json
{
  "model": "google/gemini-2.5-flash-image-preview",
  "modalities": ["image", "text"],
  "messages": [{"role": "user", "content": "生成一张课程封面图"}]
}
```

响应中图片在 `message.images` 数组（系统 `provider.ts` 已处理此格式）：

```json
"images": [{"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}]
```

可用图片模型：Gemini image 系列、FLUX 系列等。

---

## 七、提供商路由

OpenRouter 独有功能——控制请求路由到哪个底层提供商：

```json
{
  "model": "anthropic/claude-sonnet-4-6",
  "provider": {
    "order": ["anthropic", "aws-bedrock"],
    "allow_fallbacks": true,
    "sort": "price",
    "data_collection": "deny",
    "only": ["anthropic"],
    "ignore": ["azure"]
  }
}
```

| 字段 | 说明 |
|------|------|
| `order` | 提供商优先顺序 |
| `allow_fallbacks` | 允许使用 order 以外的提供商 |
| `sort` | 按 price/throughput/latency 排序 |
| `data_collection` | deny = 零数据保留 |
| `only` / `ignore` | 提供商白名单/黑名单 |

---

## 八、错误码

| HTTP 状态码 | 说明 |
|------------|------|
| 400 | 请求参数错误 |
| 401 | API Key 无效 |
| 402 | 余额不足 |
| 403 | 内容审核拦截 |
| 408 | 请求超时 |
| 429 | 限流 |
| 502 | 模型/提供商不可用 |
| 503 | 无提供商满足路由要求 |

---

## 九、AI Dash 系统接入指南

### 管理面板配置

| 字段 | 值 |
|------|-----|
| 名称 | OpenRouter |
| API 地址 | `https://openrouter.ai/api/v1` |
| API Key | OpenRouter API Key |
| 协议 | openai |
| 支持文本 | 是 |
| 支持图片 | 是（通过 chat） |
| 代理地址 | `socks5://127.0.0.1:1080`（国内需代理） |

### 核心优势

1. **一个 Key 访问所有模型** — 无需为每个提供商单独配置
2. **自动定价** — `/models` 返回实时价格，「刷新定价」有效
3. **自动故障转移** — 某个提供商不可用时自动切换
4. **统一格式** — 所有模型（含 Claude）都通过 OpenAI 格式访问

### 劣势

- **需要代理** — 从国内访问需代理
- **价格加成** — 相比直连各提供商有小幅加价
- **延迟** — 多一跳中转

---

## 十、与直连各提供商的对比

| 特性 | OpenRouter | 直连各提供商 |
|------|-----------|------------|
| API Key 数量 | 1 个 | 每家 1 个 |
| 模型数量 | 400+ | 逐家配置 |
| `/models` 含价格 | **是（唯一）** | 全部不含 |
| 自动故障转移 | 是 | 否 |
| 价格 | 有加成 | 直连价 |
| 延迟 | 多一跳 | 最低 |
| 国内直连 | 否 | 部分可以 |
| 配置复杂度 | 最低 | 逐家配置 |
