# ADR-010: 百度文心（ERNIE / 千帆）API 集成指南

> 记录时间：2026-03-19
> 适用范围：所有涉及百度文心 API 调用的功能
> 来源：官方文档研究 + API 能力分析
> 官方文档：https://cloud.baidu.com/doc/WENXINWORKSHOP

---

## 一、概述

百度文心通过**千帆平台**提供 ERNIE 系列模型。平台有两套 API：

| 版本 | 格式 | 认证方式 | 推荐 |
|------|------|---------|------|
| V1（旧版） | 百度自定义格式 | OAuth access_token 查询参数 | 否 |
| **V2（新版）** | **OpenAI 兼容** | **Bearer Token** | **是** |

**对 AI Dash 系统的意义**：V2 API 兼容 OpenAI SDK，`createOpenAICompatProvider()` 可对接。但认证流程可能需要 IAM Token 交换（视 Key 类型），图片生成不兼容。

---

## 二、认证

### Base URL（V2 OpenAI 兼容）

```
https://qianfan.baidubce.com/v2
```

### 请求头

```
Authorization: Bearer {bearer_token}
Content-Type: application/json
```

### 获取 Token 的两种方式

**方式 A：永久 API Key（推荐）**
- 从千帆控制台获取永久 API Key
- 直接作为 Bearer Token 使用
- 与系统现有的 `Authorization: Bearer {apiKey}` 模式一致

**方式 B：Access Key + Secret Key 交换**
- 从百度云控制台获取 Access Key 和 Secret Key
- 调用 IAM 服务交换为 Bearer Token（有过期时间）
- 需要 Token 刷新机制，系统暂不支持

> 推荐方式 A，零代码改动。

---

## 三、可用模型

### 旗舰模型

| 模型（V2 名称） | 上下文 | 说明 |
|----------------|--------|------|
| `ernie-4.0-8k` | 8K | ERNIE 4.0 旗舰 |
| `ernie-4.0-8k-latest` | 8K | 最新版 |
| `ernie-4.0-turbo-8k` | 8K | 加速版 |
| `ernie-4.0-turbo-8k-latest` | 8K | 加速最新版 |
| `ernie-3.5-8k` | 8K | 标准版 |
| `ernie-3.5-128k` | 128K | 长上下文版 |

### 经济型模型

| 模型 | 上下文 | 说明 |
|------|--------|------|
| `ernie-speed-8k` | 8K | 高速低成本 |
| `ernie-speed-128k` | 128K | 高速长上下文 |
| `ernie-speed-pro-8k` | 8K | 高速增强 |
| `ernie-lite-8k` | 8K | 轻量 |
| `ernie-lite-pro-8k` | 8K | 轻量增强 |
| `ernie-tiny-8k` | 8K | 最轻量 |

### 专用模型

| 模型 | 说明 |
|------|------|
| `ernie-func-8k` | 函数调用优化 |
| `ernie-novel-8k` | 创意写作 |
| `ernie-char-8k` | 角色扮演 |
| `qianfan-dynamic-8k` | 自动路由 |

---

## 四、价格（RMB/百万 token，参考值）

| 模型 | 约价格 | 说明 |
|------|--------|------|
| `ernie-4.0-8k` | ~120 | 旗舰，较贵 |
| `ernie-3.5-8k` | ~12 | 标准 |
| `ernie-speed-8k` | ~4 | 高性价比 |
| `ernie-lite-8k` | ~3-8 | 经济 |
| `ernie-tiny-8k` | ~1 | 最便宜 |

> Speed 和 Lite 模型可能有免费额度促销。具体价格以千帆控制台为准。
> `/models` 端点**不返回价格**，需手动配置。

---

## 五、Chat Completions（V2）

### 端点

```
POST https://qianfan.baidubce.com/v2/chat/completions
```

### 请求格式（与 OpenAI 一致）

```json
{
  "model": "ernie-3.5-8k",
  "messages": [
    {"role": "system", "content": "你是一个课程设计专家。"},
    {"role": "user", "content": "请设计课程框架。"}
  ],
  "temperature": 0.7,
  "max_tokens": 4096,
  "stream": false
}
```

### 流式输出

标准 SSE 格式：`data: {...}` + `data: [DONE]`。系统 `parseSSEStream` 可直接使用。

---

## 六、图片生成

**不通过 OpenAI 兼容端点提供**。使用 V1 专用端点，基于 Stable Diffusion XL：

- 端点：`/text2image/{model_endpoint}`
- 返回 base64 图片
- 请求格式不同（含 `negative_prompt`、`steps`、`cfg_scale` 等参数）

系统 `generateImage` 的 `/images/generations` 回退**不适用**。

---

## 七、视觉/多模态

**有限支持**。通过 V1 Image2Text 端点，使用 Fuyu-8B 模型，不兼容 OpenAI vision 格式。ERNIE 系列目前不支持 chat completions 内联图片输入。

---

## 八、错误码

| 错误码 | 说明 |
|--------|------|
| `QPSLimitReached` | QPS 限流 |
| `RPMLimitReached` | RPM 限流 |
| `TPMLimitReached` | TPM 限流 |
| `DailyLimitReached` | 日配额耗尽 |
| `IAMCertificationFailed` | 认证失败 |
| `APITokenInvalid` | Token 无效 |
| `APITokenExpired` | Token 过期 |
| `ServerHighLoad` | 服务器过载 |
| `InvalidRequest` | 请求格式错误 |

V2 错误格式：`{"error": {"code": "...", "message": "..."}}`

---

## 九、AI Dash 系统接入指南

### 管理面板配置

| 字段 | 值 |
|------|-----|
| 名称 | 百度文心 |
| API 地址 | `https://qianfan.baidubce.com/v2` |
| API Key | 千帆控制台永久 API Key |
| 协议 | openai |
| 支持文本 | 是 |
| 支持图片 | 否 |
| 代理地址 | 留空（国内直连） |

### 推荐映射

| 动作 | 模型 | 约价格（RMB/百万） |
|------|------|-----------------|
| 生成课程框架 | `ernie-3.5-8k` | ~12 |
| 简单修改 | `ernie-speed-8k` | ~4 |
| 单字段改写 | `ernie-tiny-8k` | ~1 |
| 课次审核 | `ernie-4.0-turbo-8k` | ~120 |
| AI 对话 | `ernie-speed-8k` | ~4 |

### 关键差异

| 差异项 | 说明 |
|--------|------|
| **认证可能需要 Token 交换** | 如永久 Key 不可用，需 IAM Token 刷新机制 |
| **价格为 RMB** | 配置时除以汇率转 USD |
| **图片不兼容** | V1 专用端点 |
| **视觉不兼容** | 不支持 OpenAI vision 格式 |
| **`/models` 不含价格** | 手动配置 |
| **上下文窗口较小** | 旗舰模型仅 8K（3.5 有 128K 版） |
| **国内直连** | 无需代理 |

---

## 十、与其他提供商的对比

| 特性 | 百度文心 | 百炼 | 智谱 AI | DeepSeek |
|------|---------|------|--------|---------|
| OpenAI 兼容 | V2 兼容 | 完全兼容 | 完全兼容 | 完全兼容 |
| 图片生成兼容 | **否** | 否（异步） | **是** | 否 |
| 免费模型 | Speed/Lite 促销 | 100万/90天 | glm-4.7-flash | 无 |
| 最大上下文 | 128K | 10M | 200K | 128K |
| 认证复杂度 | 较高（可能需 Token 交换） | 简单 | 简单 | 简单 |
| 价格单位 | RMB | RMB | USD | USD |
| 国内直连 | 是 | 是 | 是 | 是 |
