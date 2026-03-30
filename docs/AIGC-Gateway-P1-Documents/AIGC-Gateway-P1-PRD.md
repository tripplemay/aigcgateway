# AIGC Gateway — P1 PRD

> AIGC 全链路质量审计与管理平台
> Version 1.0 | 2026-03-29

---

## 1. 项目概述

### 1.1 产品定位

AIGC Gateway 是一个面向中小开发者的 AIGC 基础设施中台。业务应用通过简单接入，即可获得服务商统一管理、全链路质量审计、成本监控等能力。

核心价值：让开发者专注于"AI 做什么"，平台负责"AI 怎么调、怎么管、怎么审"。转售只是商业模式，平台的真正价值在于 AIGC 全链路的质量可观测性。

### 1.2 商业模式与基本信息

| 维度 | 决策 |
|------|------|
| 商业模式 | 转售（统一采购，开发者向平台付费） |
| 计费模式 | 预充值（先充钱后用） |
| 部署形态 | 云托管 SaaS |
| 目标用户 | 中小开发者 |
| 预估工期 | 6-8 周 |

### 1.3 核心设计原则

- **服务商对开发者完全透明** — 开发者指定模型，平台内部选通道，Provider / Channel 不暴露
- **Prompt 是产品不是代码** — P1 预留模板治理基建，P2 重点实现版本管理、变量注入、硬编码检测
- **看 AI 收到了什么** — 每次调用完整快照 prompt、输出、参数、成本、性能

---

## 2. 数据模型

### 2.1 实体关系

采用独立实体模式，Provider ↔ Channel ↔ Model 为多对多关系，通过 Channel 关联。

| 实体 | 职责 | 开发者可见 |
|------|------|----------|
| Provider | 服务商信息（端点、鉴权、速率限制） | 否 |
| Model | 模型信息（统一名称、模态、能力参数） | 是 |
| Channel | 通道（关联 Provider+Model，realModelId、priority、pricing、status） | 否 |
| Project | 开发者项目（API Key、配额、余额） | 是 |
| CallLog | 调用日志（prompt 快照、输出、成本、性能） | 是（部分字段） |

### 2.2 模型命名规范

开发者传入统一格式 `provider/model`，平台内部通过 `Channel.realModelId` 映射到服务商真实 ID。

| 开发者传入 | Channel A 真实 ID | Channel B 真实 ID |
|----------|-----------------|-----------------|
| `deepseek/v3` | `deepseek-chat`（直连） | `deepseek-ai/DeepSeek-V3`（SiliconFlow） |
| `openai/gpt-4o` | `gpt-4o`（OpenAI 官方） | `gpt-4o`（Azure） |
| `zhipu/glm-4.7` | `glm-4.7`（直连） | `Pro/zai-org/GLM-5`（SiliconFlow） |

### 2.3 路由策略

- 开发者指定模型，平台按 Channel.priority 自动选通道
- P1 手动切换（控制台调 priority / status），P2 自动 failover

---

## 3. 适配器架构

### 3.1 混合模式

三层混合架构：OpenAI 兼容引擎（基座）+ 专属 Adapter（复杂逻辑）+ 配置覆盖层（DB，运营可改）。

| 层次 | 职责 | 变更响应速度 |
|------|------|-----------|
| 配置覆盖层 | 端点路径、参数约束、鉴权格式、能力声明 | 分钟级（改 DB 即时生效） |
| 专属 Adapter | 复杂逻辑差异（图片走 chat 接口、响应格式不同等） | 小时级（改代码发版） |
| OpenAI 引擎 | 标准请求构建、SSE 解析、usage 提取、错误映射 | 很少变更 |

### 3.2 需专属 Adapter 的服务商

| 服务商 | 差异点 |
|--------|--------|
| 火山引擎 | 图片走 chat 接口 + 回退逻辑，/models 不支持 API Key 认证 |
| 硅基流动 | 图片响应体结构不同（images[0].url 而非 data[0].url） |
| MiniMax | 图片端点完全不同（/v1/image_generation） |
| 讯飞星火 | Lite/Pro 不支持 system 角色，默认 penalty 不同 |

---

## 4. API 网关 + SDK

### 4.1 API 设计

| 维度 | 决策 |
|------|------|
| 接口风格 | 兼容 OpenAI 格式 + 扩展 Header（X-Trace-Id） |
| 流式响应 | SSE（Server-Sent Events） |
| 路由 | `/v1/chat/completions`（文本）、`/v1/images/generations`（图片） |
| 中间件 | 鉴权 → 余额检查 → 限流 → 参数校验 → 日志初始化 |
| 前端接入 | P1 仅方案 A（后端代理），临时令牌放 P2 |
| 审计+成本 | 异步写入，不阻塞主链路 |

### 4.2 TypeScript SDK

封装范围：鉴权、SSE 流式解析、错误重试（指数退避）、traceId 透传、TS 类型定义。目标 500 行以内，开发者 5 分钟跑通。

```typescript
const res = await gateway.chat({
  model: 'openai/gpt-4o',
  messages: [{ role: 'user', content: '...' }],
})
console.log(res.content)
console.log(res.traceId)
```

P2 预留：`templateId` 可选参数已定义在接口中。

---

## 5. 计费系统

| 维度 | 决策 |
|------|------|
| 模式 | 预充值（先充钱后用，余额不足返回 402） |
| 定价 | 双层定价（Channel 上设 costPrice + sellPrice） |
| 扣费 | 每次调用完成后按 usage × sellPrice 实时扣除 |
| 充值 | 对接支付宝 / 微信支付 |
| 告警 | 余额低于阈值通知开发者 |

---

## 6. 审计日志

### 6.1 记录内容

| 字段组 | 内容 |
|--------|------|
| 标识 | id, traceId, projectId, channelId, modelName |
| Prompt 快照 | promptSnapshot（messages 数组结构化存储）, requestParams |
| 完整输出 | responseContent, finishReason |
| 用量与成本 | promptTokens, completionTokens, totalTokens, costPrice, sellPrice, currency |
| 性能指标 | latencyMs, ttftMs, tokensPerSecond |
| 状态 | status (success/error/timeout/filtered), errorMessage, createdAt |
| P2 预留 | templateId, templateVariables, qualityScore（P1 可为空） |

### 6.2 可见性控制

| 角色 | 可见字段 |
|------|---------|
| 开发者 | traceId, modelName, promptSnapshot, responseContent, token 用量, sellPrice, 性能指标, status |
| 运营 | 全部字段，含 channelId, costPrice, 真实模型 ID |

### 6.3 查询能力

- 按 traceId 精确查询
- 按项目 + 时间范围 + 模型 + 状态筛选
- prompt + 输出内容全文搜索

### 6.4 存储

- 主存储：PostgreSQL（结构化字段 + 关联查询 + 事务一致性）
- 全文搜索：PostgreSQL tsvector + GIN 索引（P1 够用，百万级以上考虑 ES）
- 永久保留，P2 做冷热分离

---

## 7. 健康检查

### 7.1 分级频率

| 通道类型 | 频率 | 定义 |
|---------|------|------|
| 活跃通道 | 每 10 分钟 | 过去 1 小时内有真实调用 |
| 备用通道 | 每 30 分钟 | priority > 1 且 status=active |
| 冷门通道 | 每 2 小时 | 过去 24h 无真实调用 |

### 7.2 三级验证

| 级别 | 验证内容 |
|------|---------|
| Level 1 连通性 | HTTP 200 + 鉴权通过 + 响应非空 |
| Level 2 格式一致性 | choices[0].message.content 存在、usage 字段完整、finish_reason 有效 |
| Level 3 响应质量 | 固定 prompt（如"1+1=?"）验证返回内容包含"2" |

### 7.3 异常响应

- 单次失败：立即重试一次，仍失败标记 degraded
- 连续 3 次失败：自动 disabled，停止路由流量
- disabled 通道：降频到每 30 分钟检查，恢复后自动设回 active
- 所有通知推送到运营控制台 + 消息通道

---

## 8. 服务商分批策略

### 8.1 第一批（7 家，随 P1 上线）

| 服务商 | 能力 | 接入方式 |
|--------|------|---------|
| OpenAI | 文本 + 图片 | 通用引擎（需代理） |
| Anthropic Claude | 文本 | 通用引擎（官方兼容层，需代理） |
| DeepSeek | 文本 | 通用引擎（国内直连） |
| 智谱 AI | 文本 + 图片 | 通用引擎（国内直连） |
| 火山引擎 | 文本 + 图片 | 专属 Adapter（国内直连） |
| 硅基流动 | 文本 + 图片 | 专属 Adapter（国内直连） |
| OpenRouter | 文本 + 图片 | 通用引擎（需代理） |

### 8.2 第二批（7 家，上线后 2-3 周）

Gemini、Moonshot (Kimi)、阶跃星辰、xAI Grok、Mistral AI、Groq。全部走通用引擎 + 配置覆盖，每家约半天接入。

### 8.3 第三批（5 家，按需接入）

百炼（阿里）、百度文心、腾讯混元、MiniMax、讯飞星火。兼容性问题较多或有特殊限制，按开发者需求驱动。

---

## 9. 运营控制台

### 9.1 架构

| 维度 | 决策 |
|------|------|
| 技术栈 | Next.js + shadcn/ui + Recharts + TanStack Table + Tailwind CSS |
| 角色模式 | 一套系统两个角色（admin / developer） |
| 开发者注册 | 自助注册 + 邮箱验证 |

### 9.2 页面清单

**运营专属（8 页）**：服务商管理、模型管理、通道管理、配置覆盖、健康监控、全局审计、全局用量、开发者管理

**开发者专属（7 页）**：项目列表、API Key 管理、模型列表、审计日志（含全文搜索）、用量与账单、余额与充值、快速开始

**共用（3 页）**：注册/登录（邮箱验证）、账号设置、API 文档

---

## 10. P2 基建预留

P2 核心能力为模板治理和质量诊断，P1 需预留以下基建：

| 预留项 | 用途 | P1 工作量 |
|--------|------|----------|
| CallLog.templateId | 追踪调用使用的模板 | 加一个可为空字段 |
| CallLog.templateVariables | 溯源变量替换问题 | 加一个可为空字段 |
| CallLog.qualityScore | 质量评分回填 | 加一个可为空字段 |
| SDK templateId 参数 | 开发者不需升级大版本 | 接口加可选参数 |
| promptSnapshot 结构化 | 模板 vs 实际 prompt diff | 存 messages 数组 |
| finishReason 规范化 | 异常率统计 | 统一枚举值 |
| 全文索引覆盖 prompt+输出 | 质量诊断搜索 | 已在审计设计中包含 |

以上预留工作量约半天，但能让 P2 无缝衔接。

---

## 11. 技术栈汇总

| 层次 | 技术选择 |
|------|---------|
| 后端 | Node.js / TypeScript |
| 数据库 | PostgreSQL（主存储 + tsvector 全文搜索） |
| 前端 | Next.js + shadcn/ui + Recharts + TanStack Table + Tailwind CSS |
| SDK | TypeScript（P1），Python（P2） |
| 支付 | 支付宝 + 微信支付 |
| 部署 | 云托管 SaaS |
