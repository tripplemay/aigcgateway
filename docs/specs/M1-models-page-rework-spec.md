# M1 — 模型别名架构升级（别名一等公民 + 品牌分组）规格文档

> 批次名：M1-model-alias-architecture
> 创建日期：2026-04-09
> 状态：planning

---

## 1. 目标

将"别名"从管理台标签升级为用户侧一等公民。用户只看到别名、只用别名调用，底层模型和渠道完全不可见。

## 2. 架构对比

### 2.1 现在

```
用户传 model: "openai/gpt-4o-2024-08-06"
  → router.routeByModelName("openai/gpt-4o-2024-08-06")
    → Model.findUnique({ name })
      → Channel(ACTIVE, priority ASC)
        → Provider → Adapter
```

问题：
- 用户必须知道底层 model name（含服务商前缀 + 日期版本号）
- Models 页面按渠道分组，暴露后端拓扑
- ModelAlias 表有写入无消费，别名形同虚设

### 2.2 改造后

```
用户传 model: "gpt-4o"
  → router.routeByAlias("gpt-4o")
    → ModelAlias → 关联的 Model(s)
      → 所有关联 Model 的 Channel(ACTIVE, priority ASC)
        → 选最优 Channel → Provider → Adapter
```

核心变化：
- 别名是用户唯一接触的标识
- 一个别名下可挂多个底层 Model（同一模型在不同服务商的不同 name）
- 路由引擎跨模型选最优渠道
- 用户永远不知道底层走的是哪个服务商

### 2.3 数据关系示例

```
别名 "gpt-4o"
  ├── Model "openai/gpt-4o-2024-08-06"
  │     └── Channel (OpenRouter, priority=2)
  ├── Model "gpt-4o"
  │     └── Channel (OpenAI 直连, priority=1)
  └── Model "gpt-4o-2024-08-06"
        └── Channel (SiliconFlow, priority=3)

用户调 "gpt-4o" → 路由引擎汇总 3 个 Channel → 选 priority=1 且健康的
```

## 3. Schema 变更

### 3.1 ModelAlias 表升级

```prisma
model ModelAlias {
  id            String        @id @default(cuid())
  alias         String        @unique          // 用户侧标识，如 "gpt-4o"
  brand         String?                        // 品牌，如 "OpenAI"
  modality      ModelModality @default(TEXT)    // TEXT / IMAGE / VIDEO / AUDIO
  enabled       Boolean       @default(false)  // 是否对用户可见
  contextWindow Int?
  maxTokens     Int?
  capabilities  Json?
  description   String?
  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  models        AliasModelLink[]               // 关联的底层模型

  @@index([enabled])
  @@index([brand])
  @@map("model_aliases")
}
```

### 3.2 新增关联表

```prisma
model AliasModelLink {
  id       String     @id @default(cuid())
  aliasId  String
  modelId  String
  
  alias    ModelAlias @relation(fields: [aliasId], references: [id], onDelete: Cascade)
  model    Model      @relation(fields: [modelId], references: [id], onDelete: Cascade)

  @@unique([aliasId, modelId])
  @@map("alias_model_links")
}
```

### 3.3 Model 表变更

```prisma
model Model {
  // ... existing fields ...
  aliasLinks  AliasModelLink[]   // 新增反向关联
}
```

### 3.4 Migration 计划

需要 2 个 migration：

**Migration 1：** `upgrade_model_alias_schema`
- ModelAlias 表新增列：brand, modality, enabled, contextWindow, maxTokens, capabilities, description, updatedAt
- 创建 alias_model_links 表
- 创建索引

**Migration 2：** `seed_aliases`（部署后执行）
- 清空旧 ModelAlias 数据（开发阶段，不保留）
- 删除旧 modelName 列
- 执行一次完整 sync
- 触发自动别名创建 + LLM brand 推断
- Admin 审核并启用别名

## 4. Brand 推断

### 4.1 时机

在 Admin 创建别名时或 sync 自动创建别名后，对 brand 为空的别名执行推断。

### 4.2 LLM 批量推断

```
Prompt：以下是 AI 模型的别名列表，请判断每个模型属于哪个厂商。
返回 JSON：{ "alias": "brand" }
品牌名使用官方名称（OpenAI、Anthropic、Google、Meta、Mistral、DeepSeek、智谱 AI 等）。
无法确定则返回 null。

别名列表：
- gpt-4o
- claude-3-opus
- gemini-1.5-pro
- llama-3.1-70b
- glm-4-flash
```

### 4.3 容错

- LLM 调用失败 → brand 留空，不阻塞
- Admin 可在别名管理页手动设置/修正 brand
- brand 为空的别名在用户侧归入"其他"分组

## 5. 别名自动创建与模型自动挂载

### 5.1 整体流程

Sync 完成后，对所有未挂载到任何别名的 Model，执行一次 LLM 批量推断：

```
┌─────────┐     ┌──────────────┐     ┌─────────────┐     ┌──────────────┐
│  Sync   │ ──→ │ 收集未挂载   │ ──→ │ LLM 分类    │ ──→ │ 写入 DB      │
│ 入库模型 │     │ 的新 Model   │     │ + 推断 brand │     │ 创建/挂载    │
└─────────┘     └──────────────┘     └─────────────┘     └──────────────┘
```

### 5.2 LLM 分类推断（锚定已有别名）

**关键设计：LLM 做的是"分类"而非"生成"。** 把已有别名列表作为锚定上下文，避免非确定性导致同一模型被拆成多个别名。

```typescript
async function classifyNewModels(unlinkedModels: Model[]): Promise<void> {
  if (unlinkedModels.length === 0) return;

  // 1. 获取已有别名列表作为锚定
  const existingAliases = await prisma.modelAlias.findMany({
    select: { id: true, alias: true },
  });
  const aliasNames = existingAliases.map(a => a.alias);

  // 2. 调用 LLM 分类
  const result = await callLLM(buildClassificationPrompt(
    aliasNames,
    unlinkedModels.map(m => m.name),
  ));

  // 3. 处理结果
  for (const [modelName, inference] of Object.entries(result)) {
    const model = unlinkedModels.find(m => m.name === modelName);
    if (!model) continue;

    if (inference.existingAlias) {
      // 归入已有别名 → 自动挂载
      const alias = existingAliases.find(a => a.alias === inference.existingAlias);
      if (alias) await linkModelToAlias(alias.id, model.id);
    } else if (inference.newAlias) {
      // 建议新别名 → 创建（enabled=false，需 admin 审核）
      await createAliasWithModel(inference.newAlias, inference.brand, model);
    }
  }
}
```

### 5.3 Prompt 设计

```
你是 AI 模型分类专家。

## 任务
将新入库的底层模型 ID 归类到已有别名，或建议新别名。

## 已有别名列表（已确认，优先归入这些）
["gpt-4o", "gpt-4o-mini", "claude-3-opus", "claude-3.5-sonnet", "llama-3.1-70b", "deepseek-chat", "glm-4-flash"]

## 待分类的新模型 ID
- openai/gpt-4o-2024-08-06
- gpt-4o
- openai/chatgpt-4o-latest
- anthropic/claude-3.5-sonnet-20241022
- meta-llama/llama-3.1-70b-instruct

## 规则
1. 如果模型明显属于某个已有别名（同一模型的不同版本/服务商命名），归入该别名
2. 如果没有匹配的已有别名，建议一个新别名（简短、用户友好、去掉服务商前缀和日期版本号）
3. 同时推断品牌（OpenAI、Anthropic、Meta、DeepSeek、智谱 AI 等）

## 返回 JSON
{
  "openai/gpt-4o-2024-08-06": { "existing_alias": "gpt-4o", "brand": "OpenAI" },
  "gpt-4o": { "existing_alias": "gpt-4o", "brand": "OpenAI" },
  "openai/chatgpt-4o-latest": { "existing_alias": "gpt-4o", "brand": "OpenAI" },
  "anthropic/claude-3.5-sonnet-20241022": { "existing_alias": "claude-3.5-sonnet", "brand": "Anthropic" },
  "meta-llama/llama-3.1-70b-instruct": { "existing_alias": "llama-3.1-70b", "brand": "Meta" }
}

如果建议新别名：
{
  "mistralai/mistral-large-2411": { "new_alias": "mistral-large", "brand": "Mistral" }
}
```

### 5.4 首次部署（冷启动）

首次部署时没有已有别名，LLM 的角色从"分类"变为"生成"：

```
## 已有别名列表
（空，首次初始化）

## 待分类的新模型 ID
（所有 enabled=true 的 Model）

## 额外规则
- 所有别名需要从零创建
- 同一模型在不同服务商的不同命名应归入同一个别名
- 例如 "openai/gpt-4o-2024-08-06" 和 "gpt-4o" 应共用别名 "gpt-4o"
```

冷启动后所有别名 `enabled=false`，admin 审核后批量启用。后续增量 sync 则走锚定分类模式。

### 5.5 容错

- LLM 调用失败 → 不阻塞 sync，未分类模型在 admin 页面"未归类"区域展示，可手动处理
- LLM 返回无法解析 → 同上
- Admin 始终可手动创建别名、挂载/移除模型、修正 brand

## 6. 路由引擎变更

### 6.1 新增别名解析

```typescript
// src/lib/engine/router.ts

export async function routeByAlias(aliasName: string): Promise<RouteResult> {
  // 1. 查别名
  const alias = await prisma.modelAlias.findUnique({
    where: { alias: aliasName, enabled: true },
    include: {
      models: {
        include: {
          model: {
            include: {
              channels: {
                where: { status: "ACTIVE" },
                orderBy: { priority: "asc" },
                include: {
                  provider: true,
                  healthChecks: { orderBy: { createdAt: "desc" }, take: 1 },
                },
              },
            },
          },
        },
      },
    },
  });

  if (!alias) {
    // 兼容：尝试用旧的 routeByModelName 作为 fallback
    return routeByModelName(aliasName);
  }

  // 2. 汇总所有关联 Model 的 Channel，统一排序
  const allChannels = alias.models
    .flatMap(link => link.model.channels)
    .filter(ch => {
      const lastCheck = ch.healthChecks[0];
      return !lastCheck || lastCheck.result !== "FAIL";
    })
    .sort((a, b) => a.priority - b.priority);

  if (allChannels.length === 0) {
    throw new EngineError(`No available channel for "${aliasName}"`, ...);
  }

  const channel = allChannels[0];
  // 3. 返回路由结果（同现有格式）
  return { channel, provider: channel.provider, model: ... };
}
```

### 6.2 不兼容旧模式（Breaking Change）

项目处于开发阶段，不做向后兼容：
- 路由 **只** 查 ModelAlias，不 fallback 到 Model.name
- 用户传底层 model name（如 `openai/gpt-4o-2024-08-06`）直接返回 404
- 现有 ModelAlias 数据清空重建
- 部署后需执行一次完整 sync + 自动别名创建 + admin 审核启用

## 7. API 变更

### 7.1 GET /v1/models

**改为返回别名列表**，不再返回底层 Model：

```json
{
  "object": "list",
  "data": [
    {
      "id": "gpt-4o",
      "object": "model",
      "brand": "OpenAI",
      "modality": "text",
      "context_window": 128000,
      "max_output_tokens": 16384,
      "pricing": { "input_per_1m": 2.5, "output_per_1m": 10, "unit": "token", "currency": "USD" },
      "capabilities": { "function_calling": true, "vision": true },
      "description": "Most capable GPT-4 model"
    }
  ]
}
```

- `id` = 别名（用户调用时用的名字）
- `brand` = 品牌
- **不再返回** `provider_name`
- pricing 取关联 Channel 中 priority 最高的售价

### 7.2 POST /v1/chat/completions

现有逻辑调用 `routeByModelName(body.model)`，改为 `routeByAlias(body.model)`。
不做 fallback，别名不存在即 404。

### 7.3 Admin API 补充

**GET /api/admin/model-aliases** — 返回别名列表（含关联模型数、渠道数）

**POST /api/admin/model-aliases** — 创建别名

**PATCH /api/admin/model-aliases/:id** — 编辑别名元数据（brand、enabled、description 等）

**POST /api/admin/model-aliases/:id/link** — 挂载底层模型到别名
```json
{ "modelId": "cuid..." }
```

**DELETE /api/admin/model-aliases/:id/link/:modelId** — 移除底层模型

**POST /api/admin/model-aliases/infer-brands** — 触发 LLM 批量推断 brand

## 8. 前端变更

### 8.1 用户侧 Models 页面（/models）

- 按 `brand` 分组展示别名列表
- 每行展示：别名名称、品牌、模态、Context Window、价格
- brand 为空的归入"其他"组
- 不再显示任何渠道/服务商信息

### 8.2 Admin 别名管理页面（/admin/model-aliases）

重做为清晰的两步流程：

**左侧/主区域 — 别名列表：**
- 每张别名卡片展示：别名名称、brand、modality、enabled 开关
- 关联模型数量和渠道数量
- 点击进入详情

**别名详情（展开或抽屉）：**
- 元数据编辑（brand、description、contextWindow 等）
- 已挂载模型列表（显示：模型名、所属 Provider、Channel 状态、优先级）
- "添加模型"按钮 → 弹出列表，展示所有未挂载的底层模型（按推断匹配度排序），admin 勾选添加
- 移除模型按钮

**底部 — 未归类模型（现有"未分类"区域优化）：**
- 列出有 Channel 但未挂载到任何别名的 Model
- 快捷操作：创建新别名 / 挂载到已有别名

### 8.3 白名单页面删除

`/admin/model-whitelist` 页面删除。Model.enabled 变为派生状态：

- 模型被挂载到任意别名 → 自动 `enabled=true`（Channel 保持活跃、参与健康检查和价格同步）
- 模型从所有别名移除 → 自动 `enabled=false`（Channel 停止维护）

**用户可见性唯一由 ModelAlias.enabled 控制。** Admin 在别名管理页一站完成所有操作。

侧边栏导航中移除 "Model Whitelist" 入口。

## 9. MCP 影响

MCP Tools 调用 `/v1/models` 和 `/v1/chat/completions`，自动获得别名体验：
- `list_models` 返回别名 + brand
- `chat` 使用别名调用
- 无需修改 MCP Tool 代码

## 10. i18n

新增翻译 key（~15 个）：
- 用户侧：`models.brand`、`models.otherModels`
- Admin 侧：`modelAliases.linkedModels`、`modelAliases.addModel`、`modelAliases.removeModel`、`modelAliases.inferBrands`、`modelAliases.unlinkedModels`、`modelAliases.enabledToggle` 等

## 11. 验收标准

### F-M1-01 Schema 迁移
1. ModelAlias 表升级成功（新增 brand/modality/enabled 等列）
2. alias_model_links 表创建成功
3. 现有别名数据迁移完整
4. prisma generate + migrate dev 通过
5. tsc 通过

### F-M1-02 别名自动创建与挂载
1. Sync 后新模型自动推断别名并创建（enabled=false）
2. 已有别名的自动挂载新模型
3. 别名推断规则正确（去前缀、去日期后缀）
4. tsc 通过

### F-M1-03 LLM Brand 推断
1. 对 brand 为空的别名批量推断
2. 推断结果持久化
3. LLM 失败不阻塞
4. Admin 可手动修正
5. tsc 通过

### F-M1-04 路由引擎升级
1. routeByAlias 正确解析别名 → 跨模型选最优 Channel
2. 别名不存在直接 404（不 fallback）
3. 健康检查 FAIL 的 Channel 被跳过
4. tsc 通过

### F-M1-05 API 变更 + Model.enabled 派生
1. GET /v1/models 返回别名列表（含 brand），不返回 provider_name
2. POST /v1/chat/completions 只接受别名
3. Model.enabled 随挂载/移除自动更新
4. tsc 通过

### F-M1-06 用户侧 Models 页面
1. 按 brand 分组
2. 展示别名而非底层 model name
3. 不显示渠道信息
4. 布局与设计稿一致

### F-M1-07 Admin 别名管理页面 + 白名单删除
1. 别名列表 + 详情展开
2. 可挂载/移除底层模型（挂载自动启用 Model，移除自动禁用）
3. 可编辑 alias 名称、brand、enabled 等元数据
4. 未归类模型区域
5. /admin/model-whitelist 页面已删除
6. 侧边栏导航移除 "Model Whitelist" 入口

### F-M1-08 i18n
1. en.json + zh-CN.json 同步更新
2. 无硬编码字符串

### F-M1-09 全量验收（executor: codex）
1. 用户用别名调用 chat → 成功路由
2. Models 页面按品牌分组，无渠道信息泄露
3. MCP list_models 返回别名 + brand
4. Sync 后自动创建别名并挂载
5. Admin 可管理别名与模型关联
6. 现有功能不回退（Templates/Actions/MCP 正常工作）
7. 签收报告生成
