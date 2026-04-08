# P4 — 跨服务商模型聚合 PRD

> Version 2.0 | 2026-04-08
> 状态：待用户确认
> 
> v2.0 变更：用户决定不兼容旧数据，清空重建，大幅简化设计

---

## 1. 背景与动机

### 1.1 问题陈述

PRD 核心设计原则第一条：

> **服务商对开发者完全透明** — 开发者指定模型，平台内部选通道，Provider/Channel 不暴露

当前实现违背了这一原则：模型名暴露渠道信息（`openai/gpt-4o`）、同一模型多条记录、路由不跨服务商、能力标注重复维护。

### 1.2 目标

- 用户只看到模型本名（`gpt-4o`，不带 provider 前缀）
- 同一模型多个渠道自动选优
- capabilities 一个模型一份，所有渠道共享
- 管理员视角清晰

### 1.3 决策：不兼容旧数据

**重构后 Model 和 Channel 表清空重建。** 不做向后兼容、不做数据迁移。理由：
- 去除双路径路由等兼容复杂度
- 生产数据量小（Action/Template 少量，重建成本低）
- CallLog 历史保留旧 modelName，不影响查询

---

## 2. 目标架构

### 2.1 数据模型

```
Model: gpt-4o（唯一，用户看到的就是这个名字）
  ├── Channel(provider=chatanywhere, realModelId="gpt-4o", priority=1, sellPrice=...)
  ├── Channel(provider=openrouter, realModelId="openai/gpt-4o-2024-11-20", priority=2, sellPrice=...)
  capabilities: {vision, json_mode, streaming, function_calling}
  supportedSizes: null（文本模型）

Model: dall-e-3
  ├── Channel(provider=chatanywhere, realModelId="dall-e-3", priority=1)
  capabilities: {}
  supportedSizes: ["1024x1024", "1024x1792", "1792x1024"]

Model: claude-sonnet-4
  ├── Channel(provider=openrouter, realModelId="anthropic/claude-sonnet-4", priority=1)
  ├── Channel(provider=chatanywhere, realModelId="claude-sonnet-4", priority=2)
  capabilities: {json_mode, streaming, function_calling}
```

**核心变化：** Model.name 不再拼接 provider 前缀，直接就是模型的 canonical name。一个 Model 可以有来自多个 Provider 的 Channel。

### 2.2 路由逻辑

```
用户传 "gpt-4o"
  → Model.findUnique(name="gpt-4o")
  → Channel.findMany(modelId=xxx, status=ACTIVE, orderBy: priority ASC)
  → 取第一个（最优渠道）
  → Provider → Adapter → 调用
```

干净、单路径、无兼容分支。

### 2.3 用户侧 API

```
POST /v1/chat/completions
{ "model": "gpt-4o", ... }

GET /v1/models → [{ "id": "gpt-4o", ... }, { "id": "claude-sonnet-4", ... }]

MCP list_models → [{ "name": "gpt-4o", ... }]
```

---

## 3. Schema 变更

### 3.1 Model 表

| 字段 | 变化 |
|------|------|
| name | 改为 canonical name（如 `gpt-4o`），不含 provider 前缀 |
| canonicalName | **删除**（与 name 重复） |
| isVariant | **删除**（不再有变体概念） |
| displayName | 保留，可手动设置友好名称 |
| capabilities | 保留，一个模型一份 |
| supportedSizes | 保留 |
| enabled | 保留 |

### 3.2 Channel 表

| 字段 | 变化 |
|------|------|
| modelId | 不变，关联到 Model |
| realModelId | 保留（Provider 真实模型 ID，如 `openai/gpt-4o-2024-11-20`） |
| providerId | 不变 |
| priority | **重要性提升**：跨服务商选优的核心排序字段 |
| 唯一约束 | `(providerId, modelId)` 即可（一个 Provider 对一个 Model 只有一个 Channel） |

### 3.3 Migration

```sql
-- 1. 清空（生产部署前备份）
TRUNCATE channels CASCADE;
TRUNCATE models CASCADE;

-- 2. 删除废弃字段
ALTER TABLE models DROP COLUMN IF EXISTS "canonicalName";
ALTER TABLE models DROP COLUMN IF EXISTS "isVariant";

-- 3. 重建唯一约束
-- Channel: (providerId, modelId) 替代原来的 (providerId, modelId, realModelId)
```

---

## 4. Sync 改造

### 4.1 模型名计算规则

当前：`name = provider.name + "/" + modelId`（如 `openai/gpt-4o`）
P4：`name = computeCanonicalName(modelId, providerName)`

```typescript
// 别名映射表（处理不同服务商对同一模型的不同命名）
const CANONICAL_MAP: Record<string, string> = {
  "deepseek-chat": "deepseek/v3",
  "deepseek-reasoner": "deepseek/reasoner",
  "deepseek/deepseek-chat": "deepseek/v3",
  "deepseek/deepseek-r1": "deepseek/reasoner",
  // OpenRouter 格式
  "anthropic/claude-sonnet-4": "claude-sonnet-4",
  "anthropic/claude-3.5-haiku": "claude-3.5-haiku",
  "google/gemini-2.5-pro": "gemini-2.5-pro",
  "google/gemini-2.5-flash": "gemini-2.5-flash",
  "google/gemini-2.0-flash-001": "gemini-2.0-flash",
  "x-ai/grok-3": "grok-3",
  "x-ai/grok-3-mini": "grok-3-mini",
  "qwen/qwen-max": "qwen-max",
  "qwen/qwen-plus": "qwen-plus",
  "minimax/minimax-01": "minimax-01",
  "moonshotai/kimi-k2": "kimi-k2",
  "perplexity/sonar": "perplexity-sonar",
  "perplexity/sonar-pro": "perplexity-sonar-pro",
};

function computeCanonicalName(modelId: string, providerName: string): string {
  // 1. 先查映射表
  if (CANONICAL_MAP[modelId]) return CANONICAL_MAP[modelId];
  
  // 2. OpenRouter 的 modelId 自带厂商前缀（如 anthropic/claude-sonnet-4）
  //    去掉厂商前缀，保留模型名
  if (providerName === "openrouter" && modelId.includes("/")) {
    const modelPart = modelId.split("/").pop()!;
    return CANONICAL_MAP[modelId] ?? modelPart;
  }
  
  // 3. 直连服务商的 modelId 就是模型名
  return modelId;
}
```

### 4.2 Sync 流程变化

```
旧：每个 Provider sync → 创建 provider/modelId 的 Model + Channel
新：每个 Provider sync → 计算 canonicalName → Model.upsert(name=canonicalName) → Channel.upsert(modelId=model.id, providerId=provider.id)
```

关键变化：**多个 Provider 返回同一个底层模型时，它们共享一条 Model 记录，各自创建 Channel。**

### 4.3 去重

Provider 返回重复 modelId 时（如 chatanywhere 返回 4 个 `deepseek-r1-0528`），sync 前按 modelId 去重（BL-066）。

### 4.4 版本变体处理

| 策略 | 说明 |
|------|------|
| `gpt-4o` 和 `gpt-4o-2024-11-20` | 合并为同一个 Model `gpt-4o`，不同版本作为同一 Model 的不同 Channel |
| `gpt-4o` 和 `gpt-4o-mini` | 独立 Model（不同模型） |

判断规则：如果 modelId 是 `base-name-YYYYMMDD` 格式，去掉日期后缀后查找是否有已存在的 Model。

---

## 5. 路由层

### 5.1 实现

```typescript
export async function routeByModelName(modelName: string): Promise<RouteResult> {
  const model = await prisma.model.findUnique({
    where: { name: modelName },
  });

  if (!model) {
    throw new EngineError(`Model "${modelName}" not found`, ErrorCodes.MODEL_NOT_FOUND, 404);
  }

  if (!model.enabled) {
    throw new EngineError(
      `Model "${modelName}" is not available`,
      ErrorCodes.MODEL_NOT_AVAILABLE, 403,
    );
  }

  // 跨服务商选优：所有 ACTIVE Channel 按优先级排序
  const channel = await prisma.channel.findFirst({
    where: { modelId: model.id, status: "ACTIVE" },
    orderBy: { priority: "asc" },
    include: { provider: { include: { config: true } } },
  });

  if (!channel) {
    throw new EngineError(
      `No active channel for model "${modelName}"`,
      ErrorCodes.CHANNEL_UNAVAILABLE, 503,
    );
  }

  return { channel, provider: channel.provider, config: channel.provider.config!, model };
}
```

**与当前实现几乎相同**——因为 Model.name 现在就是 canonical name，`findUnique` 一步到位。跨服务商选优自然发生（同一 Model 下多个 Channel 来自不同 Provider）。

---

## 6. 管理员视角

### 6.1 白名单管理

按 Model.name（canonical name）展示。每个模型展开可看到来自哪些服务商的 Channel：

```
□ gpt-4o                    TEXT    128K    ● 2 通道
  ├── chatanywhere  priority=1  $0.18/$0.72 per 1M  ● ACTIVE
  └── openrouter    priority=2  $3.00/$12.0 per 1M  ● ACTIVE

□ claude-sonnet-4            TEXT    200K    ● 1 通道
  └── openrouter    priority=1  $3.60/$18.0 per 1M  ● ACTIVE
```

管理员在这里：
- 启用/禁用模型
- 调整各通道的优先级和价格
- 查看各通道的健康状态

### 6.2 模型能力管理

按 Model.name 展示（一个模型一行），与当前行为一致（因为不再有重复 Model）。

### 6.3 模型与通道页

保持按服务商分组（管理员视角看服务商），但增加注释说明该 Channel 对应的用户侧模型名。

---

## 7. 重建流程（部署步骤）

```
1. 备份现有 Model + Channel 数据
2. 执行 migration（清空表 + 删除废弃字段）
3. 部署新代码
4. PM2 restart → 触发 startup sync
5. 各 Provider 自动 sync → 创建 canonical Model + Channel
6. 管理员进入白名单页面 → 启用需要的模型 + 设置优先级/价格
7. 管理员进入模型能力页面 → 设置 capabilities + supportedSizes
8. 重建 Action/Template（如有需要）
```

---

## 8. 分期实施

### P4-1（核心重构）

| 功能 | 说明 |
|------|------|
| Schema migration | 清空 + 删除 canonicalName/isVariant |
| computeCanonicalName 新规则 | 别名映射 + 去掉 provider 前缀 |
| sync 去重 | BL-066 |
| sync 改为 canonical Model + 多 Channel | 核心改造 |
| router.ts 无需大改 | Model.name 已是 canonical，逻辑几乎不变 |
| list_models / /v1/models 去重 | 不再需要去重（Model 本身已唯一） |

### P4-2（管理员页面）

| 功能 | 说明 |
|------|------|
| 白名单页面改造 | 展开显示各通道，优先级/价格编辑 |
| 模型能力页面 | 无需大改（Model 已唯一） |

### P4-3（收尾）

| 功能 | 说明 |
|------|------|
| SDK 文档更新 | model 参数去掉前缀 |
| MCP SERVER_INSTRUCTIONS 更新 | 模型名格式变更说明 |
| Action/Template 重建指引 | 文档 |

---

## 9. 决策点

| # | 决策点 | 建议 | 状态 |
|---|--------|------|------|
| 1 | 版本变体合并（`gpt-4o` 和 `gpt-4o-2024-11-20`） | 合并，用户不关心版本后缀 | 待确认 |
| 2 | 模型名中是否保留厂商前缀 | 按厂商决定：OpenAI 的不加（`gpt-4o`），DeepSeek 的加（`deepseek/v3`），Anthropic 的加（`claude-sonnet-4` 不需要前缀因为名字自带品牌） | 待确认 |
| 3 | 清空重建时 Action/Template 怎么处理 | 手动重建（生产上数量少） | 待确认 |
| 4 | 模型别名映射表由谁维护 | 代码中静态维护，后续可迁移到 Admin UI | 待确认 |

---

## 10. 影响范围

### 需要改动

| 文件 | 改动 | 复杂度 |
|------|------|--------|
| `prisma/schema.prisma` | 删除 canonicalName/isVariant + migration | 低 |
| `src/lib/sync/model-sync.ts` | computeCanonicalName 新规则 + upsert 改为 canonical name | 中 |
| `src/lib/sync/adapters/*.ts` | sync 前去重 | 低 |
| `src/lib/engine/router.ts` | 几乎不改（Model.name 已是 canonical） | 低 |
| `src/lib/mcp/tools/list-models.ts` | 去掉去重逻辑（不再需要） | 低 |
| `src/app/api/v1/models/route.ts` | 同上 | 低 |
| `src/app/(console)/admin/model-whitelist/` | 展示改造（展开多通道） | 中 |
| `src/lib/sync/model-capabilities-fallback.ts` | 可能废弃（Admin UI 已管理） | 低 |

### 不需要改动

| 模块 | 原因 |
|------|------|
| CallLog 历史 | 保留旧 modelName |
| 健康检查 | 仍按 Channel 粒度 |
| 计费逻辑 | 不变（按 Channel sellPrice 扣费） |
| 认证/限流 | 不变 |
