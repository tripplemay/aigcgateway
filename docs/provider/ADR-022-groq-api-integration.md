# ADR-022: Groq API 集成指南

> 记录时间：2026-03-19
> 适用范围：所有涉及 Groq API 调用的功能
> 来源：官方文档研究 + API 能力分析
> 官方文档：https://console.groq.com/docs

---

## 一、概述

Groq 使用自研 **LPU（语言处理单元）** 硬件，提供**业界最快推理速度**（200-1000 tokens/秒）。托管 Llama、Qwen、GPT-OSS 等开源模型。API **完全兼容 OpenAI SDK**。

**对 AI Dash 系统的意义**：速度极快，适合需要低延迟的对话和简单生成场景。有免费额度。但模型选择有限（仅开源模型），无图片生成。需代理访问。

---

## 二、认证

### Base URL

```
https://api.groq.com/openai/v1
```

### 请求头

```
Authorization: Bearer gsk_xxxxxx
Content-Type: application/json
```

API Key 从 https://console.groq.com 创建，前缀为 `gsk_`。

---

## 三、可用模型与价格（USD/百万 token）

### 生产模型（稳定）

| 模型 ID | 来源 | 上下文 | 最大输出 | 速度 | 输入 | 输出 |
|---------|------|--------|---------|------|------|------|
| `llama-3.1-8b-instant` | Meta | 131K | 131K | 560 tps | $0.05 | $0.08 |
| `llama-3.3-70b-versatile` | Meta | 131K | 32K | 280 tps | $0.59 | $0.79 |
| `openai/gpt-oss-20b` | OpenAI | 131K | 65K | 1000 tps | $0.075 | $0.30 |
| `openai/gpt-oss-120b` | OpenAI | 131K | 65K | 500 tps | $0.15 | $0.60 |

### 预览模型

| 模型 ID | 来源 | 上下文 | 输入 | 输出 |
|---------|------|--------|------|------|
| `meta-llama/llama-4-scout-17b-16e-instruct` | Meta | 131K | $0.11 | $0.34 |
| `qwen/qwen3-32b` | Alibaba | 131K | $0.29 | $0.59 |
| `moonshotai/kimi-k2-instruct-0905` | Moonshot | 262K | $1.00 | $3.00 |

### 复合系统（内置工具）

| 系统 ID | 内置工具 |
|---------|---------|
| `groq/compound` | 搜索、网页浏览、代码执行 |
| `groq/compound-mini` | 同上，轻量版 |

内置工具费用：基础搜索 $5/千次、高级搜索 $8/千次、网页访问 $1/千次。

### 折扣

- **Prompt 缓存**：输入 token 5 折（自动）
- **批处理 API**：全部 5 折

---

## 四、Chat Completions

### 端点

```
POST https://api.groq.com/openai/v1/chat/completions
```

与 OpenAI 完全一致。标准 SSE 流式输出。

---

## 五、免费额度

免费计划（$0/月）可用全部模型，限流如下：

| 模型 | RPM | RPD | TPM |
|------|-----|-----|-----|
| `llama-3.1-8b-instant` | 30 | 14,400 | 6,000 |
| `llama-3.3-70b-versatile` | 30 | 1,000 | 12,000 |
| `qwen/qwen3-32b` | 60 | 1,000 | 6,000 |
| `groq/compound` | 30 | 250 | 70,000 |

> 免费额度适合开发测试。生产环境需付费升级。

---

## 六、不支持的功能

| 功能 | 状态 |
|------|------|
| 图片生成 | 不支持 |
| 嵌入 | 未文档化 |
| 微调 | 不支持 |
| 视觉输入 | 仅 llama-4-scout（预览） |

---

## 七、AI Dash 系统接入指南

### 管理面板配置

| 字段 | 值 |
|------|-----|
| 名称 | Groq |
| API 地址 | `https://api.groq.com/openai/v1` |
| API Key | `gsk_xxxxxx` |
| 协议 | openai |
| 支持文本 | 是 |
| 支持图片 | 否 |
| 代理地址 | `socks5://127.0.0.1:1080`（国内需代理） |

### 推荐映射

| 动作 | 模型 | 价格 | 理由 |
|------|------|------|------|
| 生成课程框架 | `llama-3.3-70b-versatile` | $0.59 / $0.79 | 质量较好 |
| 简单修改 | `llama-3.1-8b-instant` | $0.05 / $0.08 | 极快极便宜 |
| AI 对话 | `openai/gpt-oss-20b` | $0.075 / $0.30 | 1000 tps 极速 |

### 关键差异

| 差异项 | 说明 |
|--------|------|
| **LPU 极速推理** | 200-1000 tps，比 GPU 快 5-10x |
| 需要代理 | 国内无法直连 |
| 无图片生成 | — |
| 仅开源模型 | 无自研旗舰模型 |
| 免费额度 | 全模型可用，限流较低 |
| 预览模型不稳定 | 可能随时下线 |
| `gsk_` 前缀 Key | 与其他提供商不同 |

---

## 八、与其他提供商的对比

| 特性 | Groq | DeepSeek | Mistral | OpenAI |
|------|------|----------|---------|--------|
| 推理速度 | **最快（LPU）** | 标准 | 标准 | 标准 |
| 最低价 | $0.05/M | $0.28/M | $0.02/M | $0.10/M |
| 自研模型 | 无 | DeepSeek | Mistral 系列 | GPT 系列 |
| 图片生成 | 否 | 否 | 否 | 是 |
| 免费额度 | 有 | 无 | devstral 免费 | 无 |
| 国内直连 | 否 | 是 | 否 | 否 |
