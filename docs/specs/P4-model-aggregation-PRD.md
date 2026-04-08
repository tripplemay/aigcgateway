# P4 — 跨服务商模型聚合 PRD

> Version 1.0 | 2026-04-08
> 状态：待用户确认

---

## 1. 背景与动机

### 1.1 问题陈述

AIGC Gateway 的 PRD 核心设计原则第一条：

> **服务商对开发者完全透明** — 开发者指定模型，平台内部选通道，Provider/Channel 不暴露

但当前实现违背了这一原则：

1. **模型名暴露渠道信息** — 用户看到的是 `openai/gpt-4o`、`openrouter/anthropic/claude-sonnet-4`，前缀泄露了内部服务商配置
2. **同一模型多条记录** — `gpt-4o` 通过 chatanywhere 和 OpenRouter 接入后，在系统中是两个独立的 Model（`openai/gpt-4o` 和 `openrouter/openai/gpt-4o-2024-11-20`），用户看到重复条目
3. **路由不跨服务商** — 用户传 `openai/gpt-4o` 只会路由到 chatanywhere 的通道，不会自动 failover 到 OpenRouter 的同模型通道
4. **能力标注重复维护** — 管理员需要为同一个底层模型在不同服务商下分别设置 capabilities
5. **管理员改服务商名后模型名不变** — displayName 改了但 Model.name 中的前缀是 Provider.name，造成混淆

### 1.2 目标

| 目标 | 说明 |
|------|------|
| 用户只看到模型本名 | `gpt-4o` 而非 `openai/gpt-4o` |
| 自动跨服务商选优 | 同一模型多个渠道按优先级/健康状态自动选择 |
| 能力标注一次生效 | 一个模型一份 capabilities，所有渠道共享 |
| 向后兼容 | 旧的带前缀名（`openai/gpt-4o`）仍可调用 |
| 管理员视角清晰 | 白名单管"模型"，通道管理管"渠道" |

---

## 2. 当前架构 vs 目标架构

### 2.1 当前架构

```
用户传 "openai/gpt-4o"
  → Model.findUnique(name="openai/gpt-4o")     ← 精确匹配一条 Model
  → Channel.findFirst(modelId=xxx, ACTIVE)       ← 该 Model 下的通道
  → Provider → Adapter → 调用
```

数据模型：
```
Model: openai/gpt-4o          ──→ Channel(chatanywhere, priority=1)
Model: openrouter/openai/gpt-4o-2024-11-20 ──→ Channel(openrouter, priority=1)
```
两条独立的 Model，各自有独立的 Channel、capabilities、enabled 状态。

### 2.2 目标架构

```
用户传 "gpt-4o"
  → Model.find(canonicalName="gpt-4o")           ← 可能匹配多条 Model
  → 合并所有 Model 下的 ACTIVE Channel           ← 跨服务商
  → 按优先级排序，选最优                          ← 自动选优
  → Provider → Adapter → 调用
```

数据模型：
```
Model: openai/gpt-4o          ──→ Channel(chatanywhere, priority=1)
Model: openrouter/openai/gpt-4o ──→ Channel(openrouter, priority=2)
                ↑
          canonicalName = "gpt-4o"（共享）
          capabilities = {vision, json_mode, streaming, function_calling}（共享）
          用户只看到 "gpt-4o"
```

---

## 3. 数据模型变更

### 3.1 Model 表

| 字段 | 当前 | 变更 |
|------|------|------|
| name | `openai/gpt-4o`（含 provider 前缀，唯一标识） | 保持不变（内部标识） |
| canonicalName | 存在但未充分使用 | **升级为用户侧唯一标识**，建立唯一索引（同 canonicalName 的多条 Model 共享对外身份） |
| displayName | `gpt-4o` | 作为用户展示名（从 canonicalName 派生或手动设置） |
| capabilities | 每条 Model 独立 | **改为按 canonicalName 共享**（任意一条 Model 的修改同步到所有同名 Model） |
| supportedSizes | 每条 Model 独立 | 同上 |
| enabled | 每条 Model 独立 | **改为：任意一条同 canonicalName 的 Model 启用 → 该模型对用户可见** |

### 3.2 新增：CanonicalModel 视图或表（可选方案）

**方案 A：虚拟聚合（推荐）**
不新增表，在查询层按 canonicalName 聚合。简单，不改 schema。

**方案 B：物化聚合**
新增 `CanonicalModel` 表，存储聚合后的模型信息。Model 表增加 `canonicalModelId` 外键。数据一致性更强，但 schema 变更大。

**建议采用方案 A**，在路由层和输出层做聚合查询，避免 schema 大改。

---

## 4. 路由层改造

### 4.1 新路由逻辑

```typescript
async function routeByModelName(userInput: string): Promise<RouteResult> {
  // 1. 先尝试精确匹配（向后兼容旧的带前缀名）
  let model = await prisma.model.findUnique({ where: { name: userInput } });
  
  // 2. 精确匹配失败，按 canonicalName 查找
  if (!model) {
    const models = await prisma.model.findMany({
      where: { canonicalName: userInput, enabled: true },
    });
    if (models.length === 0) throw MODEL_NOT_FOUND;
    // 取任意一条（它们共享 canonicalName）
    model = models[0];
  }

  // 3. 查找所有同 canonicalName 的 Model 下的 ACTIVE Channel
  const channels = await prisma.channel.findMany({
    where: {
      model: { canonicalName: model.canonicalName, enabled: true },
      status: "ACTIVE",
    },
    orderBy: { priority: "asc" },
    include: { provider: { include: { config: true } }, model: true },
  });

  if (channels.length === 0) throw CHANNEL_UNAVAILABLE;

  // 4. 取优先级最高的通道
  const channel = channels[0];
  return { channel, provider: channel.provider, config: channel.provider.config, model: channel.model };
}
```

### 4.2 向后兼容

| 用户传入 | 行为 |
|---------|------|
| `gpt-4o`（新格式） | canonicalName 查找 → 跨服务商选优 |
| `openai/gpt-4o`（旧格式） | 精确匹配 → 只用该 Model 的 Channel（兼容） |
| `openrouter/anthropic/claude-sonnet-4`（旧格式） | 精确匹配 → 兼容 |

### 4.3 Failover 增强（可选，P4+）

当最优通道调用失败时，自动尝试下一个通道（跨服务商 failover）。P4 先做选优，failover 留后续。

---

## 5. list_models / /v1/models 输出变更

### 5.1 去重逻辑

```
当前：返回所有 enabled=true 且有 ACTIVE channel 的 Model（可能有重复的底层模型）
目标：按 canonicalName 去重，每个底层模型只展示一条
```

### 5.2 返回格式变更

```json
// 当前
{ "id": "openai/gpt-4o", "display_name": "gpt-4o", ... }

// P4 目标
{ "id": "gpt-4o", "display_name": "GPT-4o", "providers": ["chatanywhere", "OpenRouter"], ... }
```

`id` 变为 canonicalName，新增 `providers` 字段列出可用渠道（可选，仅管理员 API 展示）。

### 5.3 向后兼容

`/v1/models` 增加 `?format=legacy` 参数，返回旧格式（带 provider 前缀）。默认返回新格式。

---

## 6. capabilities 共享

### 6.1 当前问题

管理员在模型能力管理页面为 `openai/gpt-4o` 设置了 capabilities，但 `openrouter/openai/gpt-4o-2024-11-20` 需要单独再设一次。

### 6.2 目标

按 canonicalName 共享 capabilities：
- 管理员设置 `gpt-4o` 的 capabilities → 所有 canonicalName=`gpt-4o` 的 Model 记录同步更新
- 模型能力管理页面按 canonicalName 展示，不再按 Model.name 分行

### 6.3 实现

Admin API `PATCH /api/admin/models/:id/capabilities` 改为：
1. 更新目标 Model 的 capabilities
2. 同步更新所有 canonicalName 相同的 Model 的 capabilities

---

## 7. canonicalName 计算规则

### 7.1 当前规则

```typescript
function computeCanonicalName(modelName: string): string {
  if (modelName.startsWith("openrouter/")) return modelName.slice(11);
  return modelName;
}
// "openai/gpt-4o" → "openai/gpt-4o"（没去掉 openai/ 前缀！）
// "openrouter/anthropic/claude-sonnet-4" → "anthropic/claude-sonnet-4"
```

当前规则**只去掉了 openrouter/ 前缀**，没有去掉 openai/、deepseek/ 等直连服务商前缀。

### 7.2 P4 规则

```typescript
function computeCanonicalName(modelName: string): string {
  // 去掉所有 provider 路由前缀
  // openai/gpt-4o → gpt-4o
  // openrouter/anthropic/claude-sonnet-4 → anthropic/claude-sonnet-4
  // deepseek/v3 → deepseek-chat（或保留 v3，需要映射表）
  // volcengine/doubao-pro-32k → doubao-pro-32k
  
  // 首先查已知映射（处理别名）
  if (CANONICAL_MAP[modelName]) return CANONICAL_MAP[modelName];
  
  // 去掉第一层 provider 前缀
  const parts = modelName.split("/");
  if (parts.length > 1) {
    return parts.slice(1).join("/");
  }
  return modelName;
}
```

### 7.3 已知别名映射

| 服务商返回的 modelId | canonicalName |
|-------------------|---------------|
| `deepseek-chat` | `deepseek/v3` |
| `deepseek-reasoner` | `deepseek/reasoner` |
| `gpt-4o` | `gpt-4o` |
| `gpt-4o-2024-11-20` | `gpt-4o`（版本变体合并到同一模型） |
| `anthropic/claude-sonnet-4` | `claude-sonnet-4` |
| `google/gemini-2.5-pro` | `gemini-2.5-pro` |

需要维护一份**别名映射表**，处理不同服务商对同一模型的不同命名。

---

## 8. 管理员视角变更

### 8.1 白名单管理页

| 当前 | P4 |
|------|-----|
| 按 Model.name 列出（`openai/gpt-4o`） | 按 canonicalName 列出（`gpt-4o`），展开可看到各服务商的通道 |
| 启用/禁用单个 Model | 启用/禁用 canonicalName（影响所有同名 Model） |

### 8.2 模型能力管理页

| 当前 | P4 |
|------|-----|
| 每个 Model.name 独立设置 | 按 canonicalName 设置一次，所有渠道共享 |

### 8.3 模型与通道页（新增视角）

| 当前 | P4 |
|------|-----|
| 按服务商分组展示 | 增加"按模型分组"视角：每个 canonicalName 下展开显示各服务商的通道，含优先级、价格、健康状态 |

---

## 9. 影响范围

### 9.1 需要改动的文件

| 模块 | 改动 | 复杂度 |
|------|------|--------|
| `src/lib/engine/router.ts` | 路由逻辑改为 canonicalName 查找 + 跨 Model 合并 Channel | 高 |
| `src/lib/sync/model-sync.ts` | canonicalName 计算规则更新 + sync 前去重 | 中 |
| `src/lib/mcp/tools/list-models.ts` | 按 canonicalName 去重输出 | 中 |
| `src/app/api/v1/models/route.ts` | 同上 | 中 |
| `src/app/api/v1/chat/completions/route.ts` | model 参数解析兼容新旧格式 | 低 |
| `src/app/api/admin/models/` | capabilities 按 canonicalName 同步 | 中 |
| `src/app/(console)/admin/model-whitelist/` | 按 canonicalName 展示 | 中 |
| `src/app/(console)/admin/model-capabilities/` | 按 canonicalName 展示 | 中 |
| Action 绑定的 model 字段 | 兼容旧名 + 支持新名 | 低 |
| SDK | 文档更新（model 参数不再需要前缀） | 低 |

### 9.2 不需要改动的

- CallLog 历史记录（保留原始 modelName，不回溯修改）
- Transaction 历史记录
- 健康检查逻辑（仍按 Channel 粒度检查）

---

## 10. 数据迁移

### 10.1 canonicalName 重新计算

对 DB 中所有 Model 重新计算 canonicalName（按新规则去掉 provider 前缀）：

```sql
-- 示例
UPDATE models SET "canonicalName" = 
  CASE 
    WHEN name LIKE 'openrouter/%' THEN substring(name from 'openrouter/(.*)')
    WHEN name LIKE 'openai/%' THEN substring(name from 'openai/(.*)')
    WHEN name LIKE 'deepseek/%' THEN substring(name from 'deepseek/(.*)')
    WHEN name LIKE 'volcengine/%' THEN substring(name from 'volcengine/(.*)')
    WHEN name LIKE 'zhipu/%' THEN substring(name from 'zhipu/(.*)')
    ELSE name
  END;
```

### 10.2 capabilities 合并

同一 canonicalName 的多条 Model，以最完整的 capabilities 为准合并：

```sql
-- 对每个 canonicalName，取所有 Model 的 capabilities 并集
```

---

## 11. 分期实施建议

### P4-1：路由层 + 输出层（核心）

- canonicalName 重新计算 + migration
- 路由层改为 canonicalName 查找 + 跨 Model Channel 合并
- list_models / /v1/models 按 canonicalName 去重
- 向后兼容旧的带前缀名
- sync 前去重（BL-066）

### P4-2：管理员视角

- 白名单页按 canonicalName 展示
- 模型能力页按 canonicalName 共享编辑
- 模型与通道页增加"按模型分组"视角

### P4-3：API 契约 + 文档

- SDK 文档更新
- MCP SERVER_INSTRUCTIONS 更新
- API 文档迁移指南

---

## 12. 风险与决策点

### 12.1 需要确认的设计决策

| # | 决策点 | 选项 | 建议 |
|---|--------|------|------|
| 1 | 版本变体是否合并 | A: `gpt-4o` 和 `gpt-4o-2024-11-20` 合并为一个模型 / B: 保持独立 | A — 用户不关心版本后缀 |
| 2 | canonicalName 中是否保留厂商前缀 | A: `gpt-4o`（纯模型名）/ B: `openai/gpt-4o`（保留厂商） | 看情况：OpenAI 的 `gpt-4o` 不需要前缀，但 `claude-sonnet-4` 需要保留 `anthropic/` 吗？ |
| 3 | 旧格式兼容多久 | A: 永久兼容 / B: 6 个月后废弃 | A |
| 4 | 模型与通道页是否增加"按模型分组"视角 | A: 增加 / B: 不增加 | A |

### 12.2 风险

| 风险 | 缓解 |
|------|------|
| 别名映射不完整导致同模型未聚合 | 初期人工维护映射表 + Admin UI 提供手动合并功能 |
| 旧 Action 绑定的 model 名带前缀 | 路由层先精确匹配再 canonicalName 匹配，兼容旧名 |
| 多服务商价格不同，用户不知道用的是哪个渠道的价格 | list_models 返回的 price 取最优渠道的价格 |

---

## 附录

### A. 相关 Backlog

| ID | 标题 | 与 P4 关系 |
|---|------|----------|
| BL-066 | Sync 重复模型 ID 去重 | P4-1 前置依赖 |
| BL-067 | 跨服务商模型聚合 | P4 主体 |

### B. 参考

- PRD §1.3 核心设计原则："服务商对开发者完全透明"
- PRD §2.3 路由策略："开发者指定模型 → 查 Model → 查 Channel → 调用"
- 当前 `computeCanonicalName()` 实现：`src/lib/sync/model-sync.ts:180`
- 当前路由实现：`src/lib/engine/router.ts:42`
