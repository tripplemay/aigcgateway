# ADR-017: 硅基流动（SiliconFlow）API 集成指南

> 记录时间：2026-03-19
> 适用范围：所有涉及 SiliconFlow API 调用的功能
> 来源：官方文档研究 + API 能力分析
> 官方文档：https://docs.siliconflow.com/

---

## 一、概述

硅基流动是**国内版 OpenRouter**——AI 模型推理聚合平台，托管 200+ 模型（DeepSeek、Qwen、GLM、Kimi、MiniMax 等）。API **兼容 OpenAI SDK**。核心优势：一个 Key 访问多家国产模型、有免费模型、超低价格、国内直连。

**对 AI Dash 系统的意义**：零代码改动接入。可替代为国产模型配置多个单独提供商的方案——一个 SiliconFlow Key 即可访问 DeepSeek + Qwen + GLM + Kimi。有 8 个永久免费模型。

---

## 二、认证

### Base URL

| 区域 | URL |
|------|-----|
| **中国大陆** | `https://api.siliconflow.cn/v1` |
| 国际 | `https://api.siliconflow.com/v1` |

### 请求头

```
Authorization: Bearer {SILICONFLOW_API_KEY}
Content-Type: application/json
```

> 国内直连，无需代理。

---

## 三、可用模型（部分）

### 永久免费模型

| 模型 ID | 类型 |
|---------|------|
| `Qwen/Qwen3.5-4B` | 对话 |
| `Qwen/Qwen3-8B` | 对话 |
| `Qwen/Qwen2.5-7B-Instruct` | 对话 |
| `deepseek-ai/DeepSeek-R1-Distill-Qwen-7B` | 推理 |
| `THUDM/GLM-4.1V-9B-Thinking` | 视觉+推理 |
| `deepseek-ai/DeepSeek-OCR` | OCR |

### 付费模型（RMB/百万 token）

| 模型 ID | 输入 | 输出 |
|---------|------|------|
| `deepseek-ai/DeepSeek-V3` | ¥2.00 | ¥8.00 |
| `deepseek-ai/DeepSeek-V3.2` | ¥2.00 | ¥3.00 |
| `Pro/moonshotai/Kimi-K2.5` | ¥4.00 | ¥21.00 |
| `Pro/zai-org/GLM-5` | ¥4.00 | ¥22.00 |
| `Qwen/Qwen2.5-14B-Instruct` | ¥0.70 | ¥0.70 |
| `Pro/Qwen/Qwen2.5-7B-Instruct` | ¥0.35 | ¥0.35 |

### 图片生成模型

| 模型 ID | 价格 |
|---------|------|
| `Qwen/Qwen-Image` | ¥0.30/张 |
| `black-forest-labs/FLUX.2-pro` | — |
| `black-forest-labs/FLUX.1-schnell` | — |

> 模型 ID 格式为 `组织/模型名`。

---

## 四、Chat Completions

### 端点

```
POST https://api.siliconflow.cn/v1/chat/completions
```

与 OpenAI 一致。支持 `messages`、`temperature`（0-1）、`max_tokens`、`stream`、`tools` 等。

### 推理模式

```json
{
  "model": "Qwen/Qwen3-32B",
  "messages": [...],
  "enable_thinking": true,
  "thinking_budget": 4096
}
```

推理内容通过 `reasoning_content` 字段返回。

### 流式输出

标准 SSE 格式。

---

## 五、图片生成

### 端点

```
POST https://api.siliconflow.cn/v1/images/generations
```

### 响应格式（与 OpenAI 不同！）

```json
{
  "images": [{"url": "https://..."}],
  "timings": {"inference": 1.23},
  "seed": 12345
}
```

> **注意**：返回 `images[0].url` 而非 OpenAI 的 `data[0].url`。系统 `generateImage` 需适配此差异。URL 有效期 **1 小时**。

---

## 六、`/models` 端点

```
GET https://api.siliconflow.cn/v1/models?type=text&sub_type=chat
```

返回模型列表，支持 `type` 和 `sub_type` 过滤。**不含价格**。

---

## 七、免费额度

- 注册赠 ¥7 左右
- 8 个永久免费模型
- 免费模型限流：未购买额度 50 RPD，购买 ≥10 额度后 1000 RPD

---

## 八、AI Dash 系统接入指南

### 管理面板配置

| 字段 | 值 |
|------|-----|
| 名称 | 硅基流动（SiliconFlow） |
| API 地址 | `https://api.siliconflow.cn/v1` |
| API Key | Bearer Token |
| 协议 | openai |
| 支持文本 | 是 |
| 支持图片 | 否（响应格式不兼容，需适配） |
| 代理地址 | 留空（国内直连） |

### 推荐映射

| 动作 | 模型 | 说明 |
|------|------|------|
| 生成课程框架 | `deepseek-ai/DeepSeek-V3.2` | ¥2/¥3 |
| 简单修改 | `Qwen/Qwen3-8B` | **免费** |
| AI 对话 | `Qwen/Qwen2.5-7B-Instruct` | **免费** |
| 课次审核 | `deepseek-ai/DeepSeek-R1-Distill-Qwen-7B` | **免费**推理模型 |

### 关键差异

| 差异项 | 说明 |
|--------|------|
| **图片响应格式不同** | `images[0].url` 非 `data[0].url` |
| **模型 ID 含组织名** | `deepseek-ai/DeepSeek-V3` |
| **免费模型** | 8 个永久免费 |
| **价格为 RMB** | 配置时除以汇率 |
| **`/models` 不含价格** | 手动配置 |
| **`reasoning_content`** | 推理模型额外字段 |
| **国内直连** | 无需代理 |

---

## 九、与其他提供商的对比

| 特性 | SiliconFlow | OpenRouter | 百炼 | 智谱 AI |
|------|-----------|-----------|------|--------|
| 定位 | 国内聚合平台 | 国际聚合平台 | 单厂商 | 单厂商 |
| 模型数 | 200+ | 400+ | Qwen 系列 | GLM 系列 |
| 国内直连 | **是** | 否 | 是 | 是 |
| `/models` 含价格 | 否 | **是** | 否 | 否 |
| 免费模型 | **8 个永久免费** | 有限 | 100万/90天 | glm-4.7-flash |
| 图片生成 | 有（格式不同） | 有 | 异步 | 兼容 |
| 价格单位 | RMB | USD | RMB | USD |
