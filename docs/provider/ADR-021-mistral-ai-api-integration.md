# ADR-021: Mistral AI API 集成指南

> 记录时间：2026-03-19
> 适用范围：所有涉及 Mistral AI API 调用的功能
> 来源：官方文档研究 + API 能力分析
> 官方文档：https://docs.mistral.ai/

---

## 一、概述

Mistral AI 是欧洲头部 AI 公司，提供多款开源和商业模型。API **兼容 OpenAI SDK**。核心优势：**极低价格的 Nemo 模型**（$0.02/M 输入）、强代码模型（Codestral）、多模态视觉支持。

**对 AI Dash 系统的意义**：Chat Completions 完全兼容，零代码改动。Nemo 模型价格最低档之一。但无直接图片生成端点。需代理访问。

---

## 二、认证

### Base URL

```
https://api.mistral.ai/v1
```

### 请求头

```
Authorization: Bearer {MISTRAL_API_KEY}
Content-Type: application/json
```

API Key 从 https://console.mistral.ai 创建。

---

## 三、可用模型与价格（USD/百万 token）

### 旗舰模型

| 模型 ID | 上下文 | 输入 | 输出 | 说明 |
|---------|--------|------|------|------|
| `mistral-large-2512` | 262K | $0.50 | $1.50 | 开源，多模态视觉 |
| `mistral-medium-2508` | 131K | $0.40 | $2.00 | 前沿多模态 |
| `mistral-small-2506` | 131K | $0.06 | $0.18 | 开源，视觉 |
| `open-mistral-nemo` | 131K | **$0.02** | **$0.04** | **最便宜**，多语言 |

### 轻量模型

| 模型 ID | 上下文 | 输入 | 输出 |
|---------|--------|------|------|
| `ministral-14b-2512` | 262K | $0.20 | $0.20 |
| `ministral-8b-2512` | 262K | $0.15 | $0.15 |
| `ministral-3b-2512` | 131K | $0.10 | $0.10 |

### 代码模型

| 模型 ID | 上下文 | 输入 | 输出 |
|---------|--------|------|------|
| `codestral-2508` | 256K | $0.30 | $0.90 |
| `devstral-small-2505` | 128K | **免费** | **免费** |

### 推理模型

| 模型 ID | 上下文 | 输入 | 输出 |
|---------|--------|------|------|
| `magistral-medium-latest` | 40K | $2.00 | $5.00 |

### 嵌入

| 模型 ID | 价格 |
|---------|------|
| `mistral-embed` | $0.10/M |

---

## 四、Chat Completions

### 端点

```
POST https://api.mistral.ai/v1/chat/completions
```

与 OpenAI 完全一致。支持所有标准参数。

### 流式输出

标准 SSE 格式，`data: {...}` + `data: [DONE]`。

### 视觉输入

多款模型支持图片输入（Large 3、Medium 3、Small 3.2、Ministral 系列）：

```json
{
  "role": "user",
  "content": [
    {"type": "text", "text": "描述图片"},
    {"type": "image_url", "image_url": "https://..."}
  ]
}
```

### 函数调用

支持 `tools` + `tool_choice`（含 `auto`/`none`/`any`/`required`）。

---

## 五、图片生成

**无直接 `/images/generations` 端点**。图片生成仅通过 Agents API（需创建 Agent + 配置 `image_generation` 工具），流程与 OpenAI 格式不兼容。

系统 `generateImage` **不可用**于 Mistral。

---

## 六、`/models` 端点

```
GET https://api.mistral.ai/v1/models
```

返回模型列表。**不含价格**。

---

## 七、AI Dash 系统接入指南

### 管理面板配置

| 字段 | 值 |
|------|-----|
| 名称 | Mistral AI |
| API 地址 | `https://api.mistral.ai/v1` |
| API Key | Bearer Token |
| 协议 | openai |
| 支持文本 | 是 |
| 支持图片 | 否 |
| 代理地址 | `socks5://127.0.0.1:1080`（国内需代理） |

### 推荐映射

| 动作 | 模型 | 价格 | 理由 |
|------|------|------|------|
| 生成课程框架 | `mistral-large-2512` | $0.50 / $1.50 | 质量好 |
| 简单修改 | `open-mistral-nemo` | $0.02 / $0.04 | 极低成本 |
| AI 对话 | `mistral-small-2506` | $0.06 / $0.18 | 快速低价 |

### 关键差异

| 差异项 | 说明 |
|--------|------|
| 需要代理 | 国内无法直连 |
| 无图片生成 | 仅 Agents API 可用 |
| Nemo 极低价 | $0.02/M 输入，最便宜之一 |
| 视觉支持 | 多款模型支持 |
| `tool_choice` 多值 | 支持 `any`（OpenAI 不支持） |
| 免费代码模型 | `devstral-small-2505` 完全免费 |

---

## 八、与其他提供商的对比

| 特性 | Mistral | DeepSeek | Groq | OpenAI |
|------|---------|----------|------|--------|
| 最低输入价 | **$0.02/M** | $0.28/M | $0.05/M | $0.10/M |
| 图片生成 | 否 | 否 | 否 | 是 |
| 视觉输入 | 是 | 否 | 有限 | 是 |
| 推理模型 | Magistral | Reasoner | — | o 系列 |
| 国内直连 | 否 | 是 | 否 | 否 |
| 免费模型 | devstral | 无 | 有免费额度 | 无 |
