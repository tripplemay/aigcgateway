# ADR-019: 阶跃星辰（StepFun）API 集成指南

> 记录时间：2026-03-19
> 适用范围：所有涉及 StepFun API 调用的功能
> 来源：官方文档研究 + API 能力分析
> 官方文档：https://platform.stepfun.com/docs

---

## 一、概述

阶跃星辰提供 Step 系列模型，其开源 Step-3 在多模态基准测试中表现领先。API **完全兼容 OpenAI SDK**，且**图片生成也走 `/images/generations` 标准端点**。

**对 AI Dash 系统的意义**：文本和图片均零代码接入。Step-3.5-flash 推理模型价格极低（¥0.7/M 输入）。图片生成 ¥0.1/张。有免费额度。

---

## 二、认证

### Base URL

```
https://api.stepfun.com/v1
```

### 请求头

```
Authorization: Bearer {STEP_API_KEY}
Content-Type: application/json
```

API Key 从 https://platform.stepfun.com 控制台获取。

---

## 三、可用模型与价格（RMB/百万 token）

### 推理模型（Step-3 系列）

| 模型 ID | 上下文 | 输入 | 缓存输入 | 输出 | 说明 |
|---------|--------|------|---------|------|------|
| `step-3.5-flash` | 256K | **0.7** | 0.14 | 2.1 | **推荐**，旗舰推理 |
| `step-3` | 64K | 1.5~4 | — | 4~10 | 阶梯定价 |
| `step-r1-v-mini` | 100K | 2.5 | 0.5 | 8 | 视觉推理 |

### 文本模型（Step-2/1 系列）

| 模型 ID | 上下文 | 输入 | 输出 | 说明 |
|---------|--------|------|------|------|
| `step-2-mini` | 32K | **1** | **2** | **最便宜**文本模型 |
| `step-1-8k` | 8K | 5 | 20 | — |
| `step-1-256k` | 256K | 95 | 300 | 长上下文 |

### 视觉模型

| 模型 ID | 上下文 | 输入 | 输出 |
|---------|--------|------|------|
| `step-1o-turbo-vision` | 32K | 2.5 | 8 |

### 图片生成模型

| 模型 ID | 价格 | 说明 |
|---------|------|------|
| `step-1x-medium` | ¥0.1/张 | — |
| `step-1x-edit` | **免费**（限时） | 图片编辑 |
| `step-2x-large` | **免费**（限时） | — |

### 缓存折扣

所有模型自动缓存，命中价格约为正常价格的 **20%**。

---

## 四、Chat Completions

### 端点

```
POST https://api.stepfun.com/v1/chat/completions
```

与 OpenAI 完全一致。支持函数调用。

### 推理模式

推理模型返回额外 `reasoning` 字段：
- 流式：`delta.reasoning`
- 非流式：`message.reasoning`

兼容 DeepSeek 格式：`extra_body: { reasoning_format: "deepseek-style" }` 返回 `reasoning_content`。

> **注意**：step-3 不要设置 `max_tokens`，会截断推理过程。

### 流式输出

标准 SSE 格式。

---

## 五、图片生成（兼容 `/images/generations`）

```
POST https://api.stepfun.com/v1/images/generations
```

```json
{
  "model": "step-1x-medium",
  "prompt": "儿童绘本风格的机器人",
  "size": "1024x1024",
  "n": 1,
  "response_format": "url"
}
```

支持的尺寸：`256x256` / `512x512` / `768x768` / `1024x1024` / `1280x800` / `800x1280`

额外参数（通过 `extra_body`）：`steps`（1-100）、`cfg_scale`（1-10）、`style_reference`（风格迁移）。

> 系统 `generateImage` 的 `/images/generations` 回退逻辑**可直接使用**。

---

## 六、视觉/多模态

标准 OpenAI vision 格式。支持 JPG/PNG/WebP/GIF，最大 20MB，最多 50 张/请求。

> 图片 URL 必须从中国大陆可访问。

---

## 七、`/models` 端点

返回模型列表，**不含价格**。

---

## 八、限流（按充值等级）

| 等级 | 累计充值 | 并发 | RPM | TPM |
|------|---------|------|-----|-----|
| V0 | ¥0 | 5 | 10 | 5M |
| V1 | ¥100 | 100 | 1,000 | 20M |
| V3 | ¥2,000 | 400 | 10,000 | 40M |
| V5 | ¥10,000 | 10,000 | 200,000 | 100M |

---

## 九、错误码

| HTTP | 说明 |
|------|------|
| 400 | 参数错误 |
| 401 | 认证失败 |
| 402 | 余额不足 |
| 429 | 限流 |
| 451 | **内容违规** |
| 500 | 服务器错误 |

---

## 十、AI Dash 系统接入指南

### 管理面板配置

| 字段 | 值 |
|------|-----|
| 名称 | 阶跃星辰（StepFun） |
| API 地址 | `https://api.stepfun.com/v1` |
| API Key | Bearer Token |
| 协议 | openai |
| 支持文本 | 是 |
| 支持图片 | **是** |
| 代理地址 | 留空（国内直连） |

### 推荐映射

| 动作 | 模型 | 价格（RMB/M） | 理由 |
|------|------|-------------|------|
| 生成课程框架 | `step-3.5-flash` | 0.7 / 2.1 | 推理能力强，极低价 |
| 简单修改 | `step-2-mini` | 1 / 2 | 最便宜 |
| 课次审核 | `step-3.5-flash` | 0.7 / 2.1 | 推理 |
| AI 对话 | `step-2-mini` | 1 / 2 | 低成本 |
| 课次封面 | `step-1x-medium` | ¥0.1/张 | — |

### 关键差异

| 差异项 | 说明 |
|--------|------|
| **图片生成兼容** | `/images/generations` 可用 |
| **推理返回 `reasoning`** | 非 OpenAI 标准字段（可用 deepseek-style 兼容） |
| **step-3 不要设 max_tokens** | 会截断推理 |
| **阶梯定价** | step-3 按输入/输出长度分档 |
| **价格为 RMB** | 配置时除以汇率 |
| **自动缓存 80% 折扣** | — |
| **`/models` 不含价格** | 手动配置 |
| **内容违规返回 451** | 非标准（OpenAI 用 400） |

---

## 十一、与其他提供商的对比

| 特性 | StepFun | 智谱 AI | DeepSeek | 百炼 |
|------|---------|--------|---------|------|
| 图片生成兼容 | **是** | **是** | 否 | 否 |
| 推理模型 | step-3.5-flash | thinking | reasoner | — |
| 最低文本价 | ¥1/M | 免费 | $0.28/M | ¥0.15/M |
| 图片价格 | ¥0.1/张 | $0.01/张 | — | — |
| 缓存折扣 | 80% | — | 90% | — |
| 国内直连 | 是 | 是 | 是 | 是 |
| 价格单位 | RMB | USD | USD | RMB |
