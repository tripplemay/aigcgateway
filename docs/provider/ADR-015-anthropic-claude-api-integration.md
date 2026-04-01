# ADR-015: Anthropic Claude API 集成指南

> 记录时间：2026-03-19
> 适用范围：所有涉及 Anthropic Claude API 调用的功能
> 来源：官方文档研究 + API 能力分析
> 官方文档：https://platform.claude.com/docs/

---

## 一、概述

Anthropic 的 Claude 系列以长上下文（最高 1M）和强推理能力著称。**原生 API 格式与 OpenAI 不兼容**，但 Anthropic 提供了**官方 OpenAI 兼容层**（beta），也可通过 OpenRouter 等代理访问。

**对 AI Dash 系统的意义**：可通过官方兼容层或 OpenRouter 接入。直接调用原生 API 需要适配器（不同的认证、消息格式、流式格式）。从国内访问需要代理。

---

## 二、接入方式选择

| 方式 | 兼容性 | 生产就绪 | 功能完整度 |
|------|--------|---------|----------|
| **A. 官方 OpenAI 兼容层** | 高 | beta（官方不推荐生产用） | 基础 chat + tools 可用，缓存/思考输出不可用 |
| **B. 通过 OpenRouter** | 完全 | 是 | 完整，加价约 5% |
| **C. 原生 API** | 不兼容 | 是 | 完整 |

**推荐方式 A 或 B**，取决于功能需求。

---

## 三、方式 A：官方 OpenAI 兼容层

### Base URL

```
https://api.anthropic.com/v1/
```

> 注意末尾斜杠。

### 认证

```
Authorization: Bearer {ANTHROPIC_API_KEY}
```

> 兼容层使用 Bearer Token（与 OpenAI 一致），不需要 `x-api-key`。

### 支持的功能

| 功能 | 状态 |
|------|------|
| Chat Completions | ✅ |
| 流式 SSE | ✅（OpenAI 格式） |
| 函数调用 / Tools | ✅ |
| 视觉（图片输入） | ✅ |
| `stream_options` | ✅ |
| `temperature`（0-1） | ✅ |
| `max_tokens` | ✅ |
| `stop` | ✅ |

### 不支持的功能

| 功能 | 状态 |
|------|------|
| `response_format`（JSON 模式） | 静默忽略 |
| `presence_penalty` / `frequency_penalty` | 忽略 |
| `logprobs` / `logit_bias` / `seed` | 忽略 |
| `n` > 1 | 必须为 1 |
| Prompt 缓存 | 不可用 |
| 扩展思考输出 | 不返回思考内容 |
| 图片生成 | 不支持 |

### 管理面板配置（方式 A）

| 字段 | 值 |
|------|-----|
| 名称 | Anthropic Claude |
| API 地址 | `https://api.anthropic.com/v1/` |
| API Key | Anthropic API Key |
| 协议 | openai |
| 支持文本 | 是 |
| 支持图片 | 否 |
| 代理地址 | `socks5://127.0.0.1:1080`（国内必须） |

---

## 四、方式 B：通过 OpenRouter

管理面板配置 OpenRouter 提供商，使用 Claude 模型 ID（如 `anthropic/claude-sonnet-4-6`）。OpenRouter 完全兼容 OpenAI 格式，是最稳定的方案。

---

## 五、可用模型与价格（USD/百万 token）

### 当前一代

| 模型 | API ID | 上下文 | 最大输出 | 输入 | 输出 |
|------|--------|--------|---------|------|------|
| Claude Opus 4.6 | `claude-opus-4-6` | 1M | 128K | $5.00 | $25.00 |
| Claude Sonnet 4.6 | `claude-sonnet-4-6` | 1M | 64K | $3.00 | $15.00 |
| Claude Haiku 4.5 | `claude-haiku-4-5` | 200K | 64K | $1.00 | $5.00 |

### 上一代

| 模型 | API ID | 输入 | 输出 |
|------|--------|------|------|
| Claude Sonnet 4 | `claude-sonnet-4-20250514` | $3.00 | $15.00 |
| Claude Haiku 3.5 | `claude-3-5-haiku-20241022` | $0.80 | $4.00 |

### 缓存定价

| 操作 | 倍率 |
|------|------|
| 5 分钟缓存写入 | 1.25x |
| 1 小时缓存写入 | 2x |
| 缓存读取（命中） | 0.1x |

### 批处理：5 折

---

## 六、原生 API 格式差异（参考）

如果未来需要直接对接原生 API，以下是与 OpenAI 的关键差异：

| 方面 | OpenAI | Anthropic 原生 |
|------|--------|---------------|
| 认证头 | `Authorization: Bearer` | `x-api-key` |
| 端点 | `/v1/chat/completions` | `/v1/messages` |
| System prompt | 在 messages 数组中 | 顶级 `system` 参数 |
| 响应文本 | `choices[0].message.content`（字符串） | `content[]`（块数组） |
| 停止原因 | `finish_reason` in choices | `stop_reason` 顶级 |
| Token 统计 | `prompt_tokens` / `completion_tokens` | `input_tokens` / `output_tokens` |
| `max_tokens` | 可选 | **必填** |
| temperature | 0-2 | 0-1 |
| 函数调用 | `tools[].function.parameters` | `tools[].input_schema` |
| 流式终止 | `data: [DONE]` | `event: message_stop` |
| n 参数 | 支持 >1 | 必须为 1 |

---

## 七、`/models` 端点

原生 API 有 `/v1/models`，返回模型列表含 `max_input_tokens`、`max_tokens`、`capabilities`。**不含价格**。

兼容层未文档化此端点。

---

## 八、推荐动作→模型映射

| 动作 | 推荐模型 | 价格（输入/输出） | 理由 |
|------|---------|----------------|------|
| 生成课程框架 | `claude-sonnet-4-6` | $3.00 / $15.00 | 质量优秀 |
| 简单修改 | `claude-haiku-4-5` | $1.00 / $5.00 | 快速低成本 |
| 复杂推理 | `claude-opus-4-6` | $5.00 / $25.00 | 最强推理 |
| AI 对话 | `claude-haiku-4-5` | $1.00 / $5.00 | 对话重速度 |

---

## 九、与其他提供商的对比

| 特性 | Anthropic Claude | OpenAI | Gemini | DeepSeek |
|------|-----------------|--------|--------|---------|
| 原生 OpenAI 兼容 | **否**（需兼容层） | 标准 | 是 | 是 |
| 官方兼容层 | beta，基础功能可用 | — | 官方支持 | — |
| 图片生成 | 不支持 | 支持 | 支持 | 不支持 |
| 最大上下文 | 1M | 1M | 1M | 128K |
| 国内直连 | **否** | 否 | 否 | 是 |
| 价格单位 | USD | USD | USD | USD |
| 缓存折扣 | 0.1x 读取 | — | 0.1x | 0.1x |
| 推荐接入方式 | 兼容层或 OpenRouter | 直连 | 直连 | 直连 |
