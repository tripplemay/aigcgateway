# ADR-012: MiniMax API 集成指南

> 记录时间：2026-03-19
> 适用范围：所有涉及 MiniMax API 调用的功能
> 来源：官方文档研究 + API 能力分析
> 官方文档：https://platform.minimax.io/docs

---

## 一、概述

MiniMax 提供 M 系列大语言模型和 image-01 图片生成模型。Chat Completions **完全兼容 OpenAI SDK**，但图片生成使用自定义端点（不兼容 `/images/generations`）。

**对 AI Dash 系统的意义**：文本对话零代码接入。所有模型统一 204K 上下文。图片生成 $0.0035/张（最便宜之一），但需单独适配端点。

---

## 二、认证

### Base URL

```
https://api.minimax.io/v1
```

### 请求头

```
Authorization: Bearer {MINIMAX_API_KEY}
Content-Type: application/json
```

API Key 从 https://platform.minimax.io 获取。

---

## 三、可用模型与价格（USD/百万 token）

所有模型统一 **204,800 token** 上下文窗口。

### 文本模型

| 模型 ID | 速度 | 输入 | 输出 | 说明 |
|---------|------|------|------|------|
| `MiniMax-M2.7` | ~60 tps | $0.30 | $1.20 | 最新旗舰 |
| `MiniMax-M2.7-highspeed` | ~100 tps | $0.60 | $2.40 | 高速版 |
| `MiniMax-M2.5` | ~60 tps | $0.30 | $1.20 | **推荐** |
| `MiniMax-M2.5-highspeed` | ~100 tps | $0.60 | $2.40 | 高速版 |
| `MiniMax-M2.1` | ~60 tps | $0.30 | $1.20 | — |
| `MiniMax-M2` | — | $0.30 | $1.20 | — |

> 旧版 abab 系列已下线，当前为 M 系列。

### 图片生成

| 模型 | 价格 |
|------|------|
| `image-01` | **$0.0035/张** |

---

## 四、Chat Completions

### 端点

```
POST https://api.minimax.io/v1/chat/completions
```

### 请求格式（与 OpenAI 一致）

```json
{
  "model": "MiniMax-M2.5",
  "messages": [
    {"role": "system", "content": "你是一个课程设计专家。"},
    {"role": "user", "content": "请设计课程框架。"}
  ],
  "temperature": 1.0,
  "max_tokens": 4096,
  "stream": false
}
```

### 支持的参数

| 参数 | 范围 | 说明 |
|------|------|------|
| `temperature` | **(0, 1]** | 不支持 0，最大 1（推荐 1.0） |
| `top_p` | — | 支持 |
| `max_tokens` | — | 支持 |
| `stream` | — | 支持 |
| `stop` | — | 支持 |
| `tools` | — | 支持函数调用 |

### 不支持/静默忽略的参数

- `presence_penalty` / `frequency_penalty` / `logit_bias`
- `n` > 1
- 视觉/图片输入（无多模态）

### 推理分离

通过 `extra_body: { reasoning_split: true }` 可将思维链和最终回答分开：

```json
{
  "model": "MiniMax-M2.5",
  "messages": [...],
  "extra_body": {"reasoning_split": true}
}
```

响应中 `reasoning_details` 字段包含推理过程。

### 流式输出

标准 OpenAI SSE 格式。

---

## 五、图片生成

### 端点（非标准）

```
POST https://api.minimax.io/v1/image_generation
```

> **注意**：不是 `/images/generations`，系统 `generateImage` 的回退逻辑不适用。

### 请求

```json
{
  "model": "image-01",
  "prompt": "儿童绘本风格的机器人",
  "aspect_ratio": "16:9",
  "response_format": "url",
  "n": 1,
  "prompt_optimizer": true
}
```

| 参数 | 说明 |
|------|------|
| `aspect_ratio` | `1:1`/`16:9`/`4:3`/`3:2`/`9:16` 等 |
| `width`/`height` | 512-2048px，8 的倍数（覆盖 aspect_ratio） |
| `response_format` | `url`（24h 有效）或 `base64` |
| `n` | 1-9 张 |
| `prompt_optimizer` | 自动优化 prompt |

---

## 六、错误码与限流

### 限流

| 服务 | RPM | TPM |
|------|-----|-----|
| 文本模型 | 500 | 20,000,000 |
| 图片生成 | 10 | 60 |

### 常见错误码

| 代码 | 说明 |
|------|------|
| 1002 | 限流 |
| 1004 | 认证失败 |
| 1008 | 余额不足 |
| 1026 | 输入内容敏感 |
| 1027 | 输出内容敏感 |
| 1039 | Token 超限 |

---

## 七、AI Dash 系统接入指南

### 管理面板配置

| 字段 | 值 |
|------|-----|
| 名称 | MiniMax |
| API 地址 | `https://api.minimax.io/v1` |
| API Key | Bearer Token |
| 协议 | openai |
| 支持文本 | 是 |
| 支持图片 | 否（端点不兼容，需单独适配） |
| 代理地址 | 留空（可直连） |

### 推荐映射

| 动作 | 模型 | 价格 |
|------|------|------|
| 生成课程框架 | `MiniMax-M2.5` | $0.30 / $1.20 |
| 简单改写 | `MiniMax-M2.5` | $0.30 / $1.20 |
| AI 对话 | `MiniMax-M2.5` | $0.30 / $1.20 |

### 关键差异

| 差异项 | 说明 |
|--------|------|
| **temperature (0,1]** | 不支持 0，最大 1 |
| **图片端点不兼容** | `/v1/image_generation` 非 `/images/generations` |
| **无视觉输入** | 不支持多模态 |
| **统一上下文** | 所有模型 204K |
| **`/models` 未文档化** | 手动配置价格 |

---

## 八、与其他提供商的对比

| 特性 | MiniMax | DeepSeek | 智谱 AI | 百炼 |
|------|---------|----------|--------|------|
| OpenAI 兼容 | 是（文本） | 是 | 是 | 是 |
| 图片生成兼容 | **否**（自定义端点） | 不支持 | **是** | 否 |
| 视觉输入 | 不支持 | 不支持 | 支持 | 支持 |
| 上下文窗口 | 204K（统一） | 128K | 200K | 10M |
| 图片价格 | **$0.0035/张** | — | $0.01/张 | — |
| 价格单位 | USD | USD | USD | RMB |
| 国内直连 | 是 | 是 | 是 | 是 |
| temperature | (0,1] | [0,2] | (0,1) | [0,2) |
