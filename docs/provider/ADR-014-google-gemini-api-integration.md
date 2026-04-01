# ADR-014: Google Gemini API 集成指南

> 记录时间：2026-03-19
> 适用范围：所有涉及 Google Gemini API 调用的功能
> 来源：官方文档研究 + API 能力分析
> 官方文档：https://ai.google.dev/docs

---

## 一、概述

Google Gemini 提供 **官方 OpenAI 兼容端点**，支持 Chat Completions、图片生成、嵌入。模型以超大上下文窗口（最高 1M token）和内置 Google 搜索能力著称。

**对 AI Dash 系统的意义**：OpenAI 兼容，零代码改动。图片生成通过 `/images/generations` 和 chat 两种方式均可工作。有免费额度。需要代理访问。

---

## 二、认证

### API Key

- 获取地址：https://aistudio.google.com/apikey
- 格式：普通字符串

### 请求头

```
Authorization: Bearer {GEMINI_API_KEY}
Content-Type: application/json
```

### Base URL（OpenAI 兼容）

```
https://generativelanguage.googleapis.com/v1beta/openai/
```

> 从国内访问需要代理。

---

## 三、可用模型与价格（USD/百万 token）

| 模型 ID | 上下文 | 最大输出 | 输入 | 输出 | 说明 |
|---------|--------|---------|------|------|------|
| `gemini-2.5-pro` | 1M | 65K | $1.25（≤200K）/ $2.50 | $10.00 / $15.00 | 复杂任务、深度推理 |
| `gemini-2.5-flash` | 1M | 65K | $0.30 | $2.50 | **推荐**，性价比最佳，有免费额度 |
| `gemini-2.5-flash-lite` | 1M | 65K | $0.10 | $0.40 | 最便宜，有免费额度 |
| `gemini-3-flash-preview` | 1M | 65K | $0.50 | $3.00 | 前沿级，预览 |
| `gemini-3.1-pro-preview` | — | — | $2.00 / $4.00 | $12.00 / $18.00 | 最强，预览 |
| `gemini-2.5-flash-image` | — | — | — | — | 图片生成 |
| `gemini-3.1-flash-image-preview` | — | — | $0.50 | $60.00 | 图片生成，预览 |

### 免费额度

`gemini-2.5-flash`、`gemini-2.5-flash-lite` 等模型有免费额度（无限 token，较低 RPM/RPD）。

### 批处理 & 缓存

- 批处理 API：**5 折**
- 上下文缓存：约输入价格的 10% + 存储费

---

## 四、Chat Completions

### 端点

```
POST https://generativelanguage.googleapis.com/v1beta/openai/chat/completions
```

### 请求格式（与 OpenAI 一致）

标准 OpenAI 格式，支持 `messages`、`temperature`、`max_tokens`、`stream`、`stream_options`、`tools`、`response_format`。

### 流式输出

标准 SSE 格式，`data: {...}` + `data: [DONE]`。

### 推理/思考模式

Gemini 2.5+ 模型默认启用思考，通过 `reasoning_effort` 控制：

| `reasoning_effort` | 效果 |
|-------------------|------|
| `"minimal"` / `"low"` | 最少推理 |
| `"medium"` | 中等 |
| `"high"` | 最大推理 |

> 思考 token 按输出价格计费。可通过 `extra_body.google.thinking_config` 精细控制。

---

## 五、图片生成

### 方式 A：`/images/generations`（推荐）

```json
{
  "model": "gemini-2.5-flash-image",
  "prompt": "儿童绘本风格的友好机器人",
  "response_format": "b64_json",
  "n": 1
}
```

返回 `data[0].b64_json`。系统 `generateImage` 的 `/images/generations` 回退逻辑可直接使用。

### 方式 B：Chat Completions（原生 API）

通过 `responseModalities: ["TEXT", "IMAGE"]` 返回内联 base64 图片。系统 `generateImage` 的 chat 优先逻辑也支持。

### 支持的宽高比

`1:1` / `2:3` / `3:2` / `3:4` / `4:3` / `9:16` / `16:9` / `21:9`

---

## 六、视觉/多模态

标准 OpenAI 格式：

```json
{
  "role": "user",
  "content": [
    {"type": "text", "text": "描述这张图片"},
    {"type": "image_url", "image_url": {"url": "data:image/png;base64,..."}}
  ]
}
```

支持图片和音频输入。

---

## 七、Google 搜索（Grounding）

Gemini 独有功能——允许模型搜索 Google 获取实时信息：
- Gemini 3 模型：5,000 次免费/月
- Gemini 2.5 模型：1,500 次免费/天

---

## 八、AI Dash 系统接入指南

### 管理面板配置

| 字段 | 值 |
|------|-----|
| 名称 | Google Gemini |
| API 地址 | `https://generativelanguage.googleapis.com/v1beta/openai` |
| API Key | Gemini API Key |
| 协议 | openai |
| 支持文本 | 是 |
| 支持图片 | **是** |
| 代理地址 | `socks5://127.0.0.1:1080`（国内必须） |

### 推荐映射

| 动作 | 模型 | 价格 |
|------|------|------|
| 生成课程框架 | `gemini-2.5-flash` | $0.30 / $2.50 |
| 复杂推理 | `gemini-2.5-pro` | $1.25 / $10.00 |
| 简单改写 | `gemini-2.5-flash-lite` | $0.10 / $0.40 |
| 课次封面/插图 | `gemini-2.5-flash-image` | — |

### 关键差异

| 差异项 | 说明 |
|--------|------|
| **需要代理** | 国内无法直连 |
| **图片生成兼容** | `/images/generations` 和 chat 两种方式均可 |
| **思考默认开启** | 增加延迟和成本，可通过 `reasoning_effort` 控制 |
| **`/models` 未文档化** | 手动配置价格 |
| **免费额度** | 多个模型有免费使用 |

---

## 九、与其他提供商的对比

| 特性 | Gemini | OpenAI | 百炼 | 智谱 AI |
|------|--------|--------|------|--------|
| OpenAI 兼容 | 是（官方） | 标准 | 是 | 是 |
| 图片生成兼容 | **是（两种方式）** | 是 | 否 | 是 |
| 最大上下文 | **1M** | 1M | 10M | 200K |
| 免费模型 | flash/flash-lite | 无 | 100万/90天 | glm-4.7-flash |
| 搜索能力 | Google Grounding | 无 | 无 | 无 |
| 国内直连 | **否** | 否 | 是 | 是 |
| 价格单位 | USD | USD | RMB | USD |
