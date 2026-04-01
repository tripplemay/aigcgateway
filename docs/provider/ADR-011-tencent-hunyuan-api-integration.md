# ADR-011: 腾讯混元（Tencent Hunyuan）API 集成指南

> 记录时间：2026-03-19
> 适用范围：所有涉及腾讯混元 API 调用的功能
> 来源：官方文档研究 + API 能力分析

---

## 一、概述

腾讯混元是腾讯自研的大语言模型，提供 **OpenAI 兼容端点**（Bearer Token 认证），无需使用腾讯云 HMAC 签名。AI Dash 部署在腾讯云服务器上，天然亲和。

**对 AI Dash 系统的意义**：OpenAI 兼容，零代码改动。有免费模型（hunyuan-lite）。部署在腾讯云上延迟最低。但图片生成不兼容（使用腾讯云原生签名 API）。

---

## 二、认证

### Base URL

```
https://api.hunyuan.cloud.tencent.com/v1
```

> 这是 OpenAI 兼容端点，使用 Bearer Token，**不需要**腾讯云 TC3-HMAC-SHA256 签名。

### 请求头

```
Authorization: Bearer {HUNYUAN_API_KEY}
Content-Type: application/json
```

API Key 从腾讯云控制台获取：https://console.cloud.tencent.com/hunyuan/start

---

## 三、可用模型与价格（RMB/百万 token）

### 文本模型

| 模型 ID | 输入 | 输出 | 说明 |
|---------|------|------|------|
| `hunyuan-t1-latest` | 1.0 | 4.0 | 推理模型 |
| `hunyuan-turbos-latest` | 0.8 | 2.0 | **推荐**，最佳性价比 |
| `hunyuan-a13b` | 0.5 | 2.0 | 最便宜文本模型 |
| `hunyuan-large-role` | 2.4 | 9.6 | 角色扮演优化 |
| **`hunyuan-lite`** | **免费** | **免费** | 免费（不支持搜索） |

### 视觉模型

| 模型 ID | 输入 | 输出 |
|---------|------|------|
| `hunyuan-vision` | 3.0 | 9.0 |
| `hunyuan-turbos-vision` | 3.0 | 9.0 |
| `hunyuan-t1-vision` | 3.0 | 9.0 |

### 嵌入模型

| 模型 ID | 价格 |
|---------|------|
| `hunyuan-embedding` | 0.7 |

---

## 四、Chat Completions

### 端点

```
POST https://api.hunyuan.cloud.tencent.com/v1/chat/completions
```

### 请求格式（与 OpenAI 一致）

```json
{
  "model": "hunyuan-turbos-latest",
  "messages": [{"role": "user", "content": "你好"}],
  "temperature": 0.7,
  "max_tokens": 4096,
  "stream": true,
  "stream_options": {"include_usage": true}
}
```

### 混元特有参数（可选）

| 参数 | 说明 |
|------|------|
| `enable_enhancement` | 启用搜索/RAG |
| `citation` | 添加脚注引用 |
| `force_search_enhancement` | 强制搜索 |

### 流式输出

标准 OpenAI SSE 格式。

---

## 五、图片生成

**不通过 OpenAI 兼容端点提供**。图片生成使用腾讯云原生 API（`hunyuan.tencentcloudapi.com`），需要 TC3-HMAC-SHA256 签名认证，与系统现有的 `generateImage` 不兼容。

---

## 六、`/models` 端点

未文档化，可能不可用。

---

## 七、关键限制

| 限制 | 说明 |
|------|------|
| **默认并发 5 个** | 非常低，可能需要申请提升 |
| **messages 最多 40 条** | 长对话可能受限 |
| **`stop` 行为不同** | 混元在匹配停止序列**之后**停止，OpenAI 在**之前**停止 |

---

## 八、AI Dash 系统接入指南

### 管理面板配置

| 字段 | 值 |
|------|-----|
| 名称 | 腾讯混元 |
| API 地址 | `https://api.hunyuan.cloud.tencent.com/v1` |
| API Key | Bearer Token |
| 协议 | openai |
| 支持文本 | 是 |
| 支持图片 | 否 |
| 代理地址 | 留空（腾讯云内网） |

### 推荐映射

| 动作 | 模型 | 价格（RMB/百万） |
|------|------|----------------|
| 生成课程框架 | `hunyuan-turbos-latest` | 0.8 / 2.0 |
| 简单改写 | `hunyuan-lite` | 免费 |
| 课次审核 | `hunyuan-t1-latest` | 1.0 / 4.0 |
| AI 对话 | `hunyuan-lite` | 免费 |

### 关键差异

| 差异项 | 说明 |
|--------|------|
| **价格为 RMB** | 配置时除以汇率转 USD |
| **并发限制 5** | 生产环境需申请提升 |
| **stop 行为不同** | 停止序列会包含在输出中 |
| **图片不兼容** | 需用其他提供商 |
| **`/models` 未文档化** | 手动配置价格 |

---

## 九、与其他提供商的对比

| 特性 | 腾讯混元 | 百炼 | 智谱 AI | DeepSeek |
|------|---------|------|--------|---------|
| OpenAI 兼容 | 是 | 是 | 是 | 是 |
| 图片生成兼容 | **否** | 否（异步） | **是** | 否 |
| 免费模型 | hunyuan-lite | 100万/90天 | glm-4.7-flash | 无 |
| 价格单位 | RMB | RMB | USD | USD |
| 国内直连 | 是（腾讯云内网） | 是 | 是 | 是 |
| 默认并发 | **5**（低） | — | — | 无限制 |
