# P4 跨服务商模型聚合 — 实现规格文档

> 基于 P4-model-aggregation-PRD.md v2.1
> 本文档供 Generator 开发时参考，覆盖 P4-1 全部功能点

---

## 1. Schema 变更

### 1.1 Model 表修改

**删除字段：**
- `canonicalName` — 与 name 合并，不再需要
- `isVariant` — 不再有变体概念

**保留字段（语义变化）：**
- `name` — 从 `provider/modelId`（如 `openai/gpt-4o`）变为 canonical name（如 `gpt-4o`），仍为唯一标识
- `displayName` — 用户友好名称，可手动设置
- `capabilities` — 一个模型一份，所有渠道共享
- `supportedSizes` — 同上
- `enabled` — 管理员控制是否对用户可见

### 1.2 新增 ModelAlias 表

```prisma
model ModelAlias {
  id        String   @id @default(cuid())
  alias     String   @unique  // Provider 返回的 modelId
  modelName String              // 对应的 canonical Model.name
  createdAt DateTime @default(now())

  @@index([modelName])
}
```

### 1.3 Channel 表修改

**唯一约束变更：**
- 当前：`@@unique([providerId, modelId, realModelId])`
- P4：`@@unique([providerId, modelId])`（一个 Provider 对一个 Model 只有一个 Channel）

`realModelId` 保留（Provider 真实模型 ID），但不再参与唯一约束。

### 1.4 Migration SQL

```sql
-- Step 1: 备份（部署前手动执行）
-- pg_dump -t models -t channels > backup_models_channels.sql

-- Step 2: 清空
TRUNCATE channels CASCADE;
TRUNCATE models CASCADE;

-- Step 3: 删除废弃字段
ALTER TABLE models DROP COLUMN IF EXISTS "canonicalName";
ALTER TABLE models DROP COLUMN IF EXISTS "isVariant";

-- Step 4: 创建 ModelAlias 表
CREATE TABLE model_aliases (
  id TEXT NOT NULL DEFAULT gen_random_uuid()::TEXT,
  alias TEXT NOT NULL,
  "modelName" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id)
);
CREATE UNIQUE INDEX model_aliases_alias_key ON model_aliases(alias);
CREATE INDEX model_aliases_model_name_idx ON model_aliases("modelName");

-- Step 5: 修改 Channel 唯一约束
-- 先删旧约束（名称可能不同，查 pg_constraint 确认）
-- ALTER TABLE channels DROP CONSTRAINT IF EXISTS "channels_providerId_modelId_realModelId_key";
-- ALTER TABLE channels ADD CONSTRAINT "channels_providerId_modelId_key" UNIQUE ("providerId", "modelId");

-- Step 6: 写入初始别名
INSERT INTO model_aliases (id, alias, "modelName") VALUES
  (gen_random_uuid()::TEXT, 'deepseek-chat', 'deepseek/v3'),
  (gen_random_uuid()::TEXT, 'deepseek-reasoner', 'deepseek/reasoner'),
  (gen_random_uuid()::TEXT, 'deepseek/deepseek-chat', 'deepseek/v3'),
  (gen_random_uuid()::TEXT, 'deepseek/deepseek-r1', 'deepseek/reasoner'),
  (gen_random_uuid()::TEXT, 'anthropic/claude-sonnet-4', 'claude-sonnet-4'),
  (gen_random_uuid()::TEXT, 'anthropic/claude-3.5-haiku', 'claude-3.5-haiku'),
  (gen_random_uuid()::TEXT, 'anthropic/claude-3-5-haiku-20241022', 'claude-3.5-haiku'),
  (gen_random_uuid()::TEXT, 'google/gemini-2.5-pro', 'gemini-2.5-pro'),
  (gen_random_uuid()::TEXT, 'google/gemini-2.5-flash', 'gemini-2.5-flash'),
  (gen_random_uuid()::TEXT, 'google/gemini-2.0-flash-001', 'gemini-2.0-flash'),
  (gen_random_uuid()::TEXT, 'x-ai/grok-3', 'grok-3'),
  (gen_random_uuid()::TEXT, 'x-ai/grok-3-mini', 'grok-3-mini'),
  (gen_random_uuid()::TEXT, 'qwen/qwen-max', 'qwen-max'),
  (gen_random_uuid()::TEXT, 'qwen/qwen-plus', 'qwen-plus'),
  (gen_random_uuid()::TEXT, 'minimax/minimax-01', 'minimax-01'),
  (gen_random_uuid()::TEXT, 'moonshotai/kimi-k2', 'kimi-k2'),
  (gen_random_uuid()::TEXT, 'perplexity/sonar', 'perplexity-sonar'),
  (gen_random_uuid()::TEXT, 'perplexity/sonar-pro', 'perplexity-sonar-pro'),
  -- 版本变体 → 合并到主模型
  (gen_random_uuid()::TEXT, 'gpt-4o-2024-11-20', 'gpt-4o'),
  (gen_random_uuid()::TEXT, 'gpt-4o-2024-08-06', 'gpt-4o'),
  (gen_random_uuid()::TEXT, 'gpt-4o-2024-05-13', 'gpt-4o'),
  (gen_random_uuid()::TEXT, 'gpt-4o-mini-2024-07-18', 'gpt-4o-mini'),
  (gen_random_uuid()::TEXT, 'o1-2024-12-17', 'o1'),
  (gen_random_uuid()::TEXT, 'o3-mini-2025-01-31', 'o3-mini'),
  (gen_random_uuid()::TEXT, 'o4-mini-2025-04-16', 'o4-mini')
;
```

---

## 2. Sync 改造

### 2.1 核心变更：resolveCanonicalName

替代原来的 `resolveModelName` + `computeCanonicalName`。

```typescript
// src/lib/sync/model-sync.ts

/**
 * 通过 ModelAlias 表 + 默认规则，将 provider 返回的 modelId 映射到 canonical name。
 * 
 * 优先级：
 * 1. ModelAlias 表精确匹配
 * 2. 默认规则（modelId 本身，去掉已知厂商前缀）
 */
async function resolveCanonicalName(modelId: string): Promise<string> {
  // 1. 查别名表
  const alias = await prisma.modelAlias.findUnique({
    where: { alias: modelId },
  });
  if (alias) return alias.modelName;

  // 2. 默认规则：modelId 就是 canonical name
  return modelId;
}
```

### 2.2 去重

在 `reconcile` 函数入口处，对 Provider 返回的模型列表按 modelId 去重：

```typescript
// reconcile 函数开头
const seen = new Set<string>();
const dedupedModels = models.filter((m) => {
  if (seen.has(m.modelId)) return false;
  seen.add(m.modelId);
  return true;
});
if (dedupedModels.length < models.length) {
  console.log(`[model-sync] ${provider.name}: deduped ${models.length - dedupedModels.length} duplicate modelIds`);
}
```

### 2.3 reconcile 核心逻辑变更

```typescript
for (const remoteModel of dedupedModels) {
  const canonicalName = await resolveCanonicalName(remoteModel.modelId);
  
  // Model upsert — 按 canonical name
  const model = await prisma.model.upsert({
    where: { name: canonicalName },
    update: {
      // 只更新 contextWindow（如果 provider 返回了更好的值）
      ...(remoteModel.contextWindow ? { contextWindow: remoteModel.contextWindow } : {}),
    },
    create: {
      name: canonicalName,
      displayName: remoteModel.displayName ?? canonicalName,
      modality: remoteModel.modality as ModelModality,
      contextWindow: remoteModel.contextWindow ?? null,
      maxTokens: remoteModel.maxOutputTokens ?? null,
      capabilities: {},  // 由管理员在 Admin UI 设置
      enabled: false,     // 默认不启用，管理员手动启用
    },
  });

  // Channel upsert — 一个 Provider 对一个 Model 只有一个 Channel
  const existingChannel = await prisma.channel.findUnique({
    where: { providerId_modelId: { providerId: provider.id, modelId: model.id } },
  });

  const costPrice = buildCostPrice(remoteModel);
  const sellPrice = applySellMarkup(costPrice, markupRatio);

  if (existingChannel) {
    const updateData: Record<string, unknown> = {
      realModelId: remoteModel.modelId,
    };
    if (existingChannel.status !== "ACTIVE") updateData.status = "ACTIVE";
    if (!existingChannel.sellPriceLocked) {
      updateData.costPrice = costPrice;
      updateData.sellPrice = sellPrice;
    }
    if (Object.keys(updateData).length > 0) {
      await prisma.channel.update({ where: { id: existingChannel.id }, data: updateData });
    }
  } else {
    await prisma.channel.create({
      data: {
        modelId: model.id,
        providerId: provider.id,
        realModelId: remoteModel.modelId,
        status: "ACTIVE",
        priority: 10,  // 默认优先级，管理员可调
        costPrice: costPrice as unknown as Prisma.InputJsonValue,
        sellPrice: sellPrice as unknown as Prisma.InputJsonValue,
      },
    });
    newChannels.push(`${provider.name}/${remoteModel.modelId} → ${canonicalName}`);
  }
}
```

### 2.4 capabilities 不在 sync 中设置

与当前不同，P4 的 sync **不再写入 capabilities 和 supportedSizes**。这些由管理员在 Admin 模型能力管理页面手动设置。sync 创建的新 Model 的 capabilities 默认为 `{}`。

---

## 3. 路由层

### 3.1 routeByModelName

**几乎不改**。因为 Model.name 现在就是 canonical name，`findUnique` 直接匹配。

唯一变化：同一 Model 下可能有来自多个 Provider 的 Channel，`findFirst(orderBy: priority ASC)` 自动选最优——**这个逻辑已经存在**，无需改动。

### 3.2 无需添加的

- 不需要 canonicalName 回退查询
- 不需要旧名兼容
- 不需要跨 Model 合并 Channel

---

## 4. list_models / /v1/models 输出

### 4.1 简化

当前有一层 fallback 逻辑（DB capabilities 为空时用 resolveCapabilities 补全）。P4 后直接读 DB，**去掉所有 fallback**。

```typescript
// 简化后
const capabilities = (model.capabilities as ModelCapabilities | null) ?? {};
const sizes = (model.supportedSizes as string[] | null);
```

不再需要 `resolveCapabilities(model.name.split("/").pop() || model.name)` 这样的代码。

### 4.2 返回格式

```json
{
  "id": "gpt-4o",
  "object": "model",
  "display_name": "GPT-4o",
  "modality": "text",
  "context_window": 128000,
  "capabilities": { "vision": true, "json_mode": true, "streaming": true, "function_calling": true },
  "pricing": { "input_per_1m": 0.18, "output_per_1m": 0.72, "unit": "token", "currency": "USD" }
}
```

`id` 现在是 `gpt-4o` 而非 `openai/gpt-4o`。

### 4.3 价格来源

同一 Model 可能有多个 Channel 价格不同。list_models 取**优先级最高（priority 最低）的 ACTIVE Channel** 的 sellPrice 展示。

---

## 5. Admin API — 模型别名

### 5.1 路由

```
GET    /api/admin/model-aliases          — 列出所有别名（按 modelName 分组）
POST   /api/admin/model-aliases          — 创建别名 { alias, modelName }
DELETE /api/admin/model-aliases/:id      — 删除别名
POST   /api/admin/model-aliases/merge    — 归入已有模型 { sourceModelId, targetModelName }
```

### 5.2 归入已有模型（merge）

当管理员把"未归类模型"归入已有模型时：

```typescript
// POST /api/admin/model-aliases/merge
// body: { sourceModelId: "xxx", targetModelName: "gpt-4o" }

// 1. 创建别名记录
await prisma.modelAlias.create({
  data: { alias: sourceModel.name, modelName: targetModelName },
});

// 2. 迁移 Channel：把 sourceModel 的 Channel 改为指向 targetModel
await prisma.channel.updateMany({
  where: { modelId: sourceModelId },
  data: { modelId: targetModel.id },
});

// 3. 删除临时 Model
await prisma.model.delete({ where: { id: sourceModelId } });
```

---

## 6. Admin UI — 模型别名管理页

### 6.1 页面路由

`/admin/model-aliases`，Sidebar Admin 导航新增"模型别名"入口。

### 6.2 页面结构

**上半部分：已归类模型**

按 canonical model 分组，每组展示所有别名。每个别名可删除。每组底部有"添加别名"输入框。

**下半部分：未归类模型**

列出所有 `enabled=false` 且没有被其他 Model 的 Channel 引用的 Model（即 sync 创建的临时 Model）。每条提供两个操作：
- "归入已有模型"下拉选择 → 调 merge API
- "保留为新模型"→ 无操作（管理员去白名单页面启用）

### 6.3 API 调用

```
页面加载 → GET /api/admin/model-aliases（分组数据）
        → GET /api/admin/models?unclassified=true（未归类模型列表）
添加别名 → POST /api/admin/model-aliases { alias, modelName }
删除别名 → DELETE /api/admin/model-aliases/:id
归入模型 → POST /api/admin/model-aliases/merge { sourceModelId, targetModelName }
```

---

## 7. Admin UI — 白名单页面改造

### 7.1 展示变更

当前按 Model.name 平铺列表。P4 后每个 Model 可展开显示多个 Channel：

```
□ gpt-4o                    TEXT    128K    ● 2 通道活跃
  ├── chatanywhere  priority=1  $0.18 in / $0.72 out  ● ACTIVE  [编辑优先级] [编辑价格]
  └── OpenRouter    priority=2  $3.00 in / $12.0 out  ● ACTIVE  [编辑优先级] [编辑价格]

□ claude-sonnet-4            TEXT    200K    ● 1 通道活跃
  └── OpenRouter    priority=1  $3.60 in / $18.0 out  ● ACTIVE
```

### 7.2 操作

- **启用/禁用模型**（Model.enabled）— 控制用户是否可见
- **编辑通道优先级**（Channel.priority）— 决定跨服务商选优顺序
- **编辑通道价格**（Channel.sellPrice）— 每个通道独立定价

---

## 8. 废弃的文件/逻辑

| 文件 | 废弃内容 |
|------|---------|
| `src/lib/sync/model-capabilities-fallback.ts` | `CAPABILITIES_MAP`、`CONTEXT_WINDOW_MAP`、`SUPPORTED_SIZES_MAP`、`resolveCapabilities()`、`resolveContextWindow()`、`resolveSupportedSizes()` — 全部废弃，capabilities 由 Admin UI 管理 |
| `src/lib/sync/model-sync.ts` | `resolveModelName()`、`computeCanonicalName()`、`CROSS_PROVIDER_MAP` — 替换为 `resolveCanonicalName()` 查 ModelAlias |
| `src/lib/mcp/tools/list-models.ts` | fallback 到 `resolveCapabilities` 的逻辑 — 直接读 DB |
| `src/app/api/v1/models/route.ts` | 同上 |

---

## 9. 部署检查清单

```
□ 1. 备份生产 Model + Channel 数据
□ 2. 执行 Prisma migration（清空表 + 新增 ModelAlias + 删除废弃字段）
□ 3. 写入 ModelAlias 初始数据
□ 4. 部署新代码
□ 5. PM2 restart → 触发 startup sync
□ 6. 检查 sync 日志：各 Provider 模型是否正确聚合
□ 7. 管理员：模型别名页检查未归类模型，手动归入
□ 8. 管理员：白名单页启用需要的模型 + 设置通道优先级/价格
□ 9. 管理员：模型能力页设置 capabilities + supportedSizes
□ 10. 验证：list_models 返回正确的 canonical name + capabilities
□ 11. 验证：API 调用 model="gpt-4o" 正确路由
□ 12. 重建 Action/Template（如有需要）
```

---

## 10. 功能拆解（features.json 参考）

建议拆为 12-15 条功能，按以下顺序实现：

1. Schema migration（清空 + 删除字段 + 新增 ModelAlias）
2. ModelAlias 初始数据写入
3. sync 去重逻辑
4. resolveCanonicalName（查 ModelAlias 表）
5. sync reconcile 改造（canonical Model + 多 Channel upsert）
6. 路由层确认（几乎不改，验证即可）
7. list_models MCP Tool 简化（去掉 fallback）
8. /v1/models REST API 简化（去掉 fallback）
9. Admin API — model-aliases CRUD + merge
10. Admin UI — 模型别名管理页
11. Admin UI — 白名单页面改造（展开多通道）
12. 废弃旧的 capabilities fallback 代码
13. i18n 补全
14. SERVER_INSTRUCTIONS 更新
15. E2E 验证
