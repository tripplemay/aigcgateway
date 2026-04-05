# MCP 能力增强 — 规格文档

**批次名称：** mcp-capability-enhancement
**创建日期：** 2026-04-05
**来源：** MCP 能力审计后逐项讨论确认的 8 项改进（BL-011 ~ BL-018）

---

## 1. 背景与目标

经过一次全面的 MCP 能力审计（基于新开发者视角），发现 10 个待改进项。与用户逐项讨论后，确认 8 项纳入本批次（跳过 #3 价格歧义——上线后不存在此问题）。

**核心目标：** 增强 MCP 调用能力和开发者引导，让 AI 编辑器通过 MCP 能获得接近 REST API 的完整能力。

---

## 2. 功能范围

### 2.1 模型去重与白名单统一（BL-011 + BL-012）

**问题：**
- `resolveModelName()` 缺少 `toLowerCase()`，导致 `zhipu/GLM-4.7` 和 `zhipu/glm-4.7` 作为两个不同模型入库
- OpenRouter 有独立白名单（`openrouter-whitelist.ts`），其他服务商（如 SiliconFlow）没有白名单机制，导致大量 LoRA 微调模型涌入

**方案：**

#### 2.1.1 resolveModelName toLowerCase

在 `src/lib/sync/model-sync.ts` 的 `resolveModelName()` 函数返回值统一 `toLowerCase()`：

```typescript
function resolveModelName(syncedModel: SyncedModel, providerName: string): string {
  if (providerName === "openrouter") {
    const mapped = CROSS_PROVIDER_MAP[syncedModel.modelId];
    if (mapped) return mapped;
  }
  return syncedModel.name.toLowerCase();  // ← 加 toLowerCase
}
```

#### 2.1.2 统一模型白名单

**新文件：** `src/lib/sync/model-whitelist.ts`
- 单一 `Set<string>` 数组，约 30-50 个精选模型名（canonical name 格式：`provider/model-name`）
- 覆盖所有 7 家服务商的主流模型
- 替代现有 `openrouter-whitelist.ts`

**改动：**
- `model-sync.ts`：在 upsert 前增加白名单检查，不在白名单中的模型不入库（对所有 provider 生效）
- `openrouter.ts`：`filterModel()` 改为引用统一白名单
- `openrouter-whitelist.ts`：废弃删除

**白名单维护策略：**
- 每季度审查一次
- 新模型上线后管理员手动添加
- 白名单外的模型在同步时 deleteMany 物理删除（延续现有逻辑）

### 2.2 Model capabilities 填充（BL-011）

**问题：** `Model.capabilities` 字段（`Json?`）从未被 model-sync 填充，始终为 null。

**方案（三层 fallback）：**

1. **上游 API 提取**：部分 provider 的 `/models` 响应包含 capability 信息（如 OpenRouter 的 `architecture`、OpenAI 的 `capabilities`）。在各 adapter 的 `fetchModels()` 中提取并写入 `SyncedModel.capabilities`。

2. **静态 fallback 映射**：新建 `src/lib/sync/model-capabilities-fallback.ts`，包含已知模型的 capabilities 映射（如 vision、function_calling、json_mode 等）。当上游 API 无数据时使用。

3. **兜底值**：以上都无法确定时，写入 `{"unknown": true}` 而非 null。这让 `list_models` 能区分"未知"和"确认没有能力"。

**capabilities 字段结构：**
```json
{
  "vision": true,
  "function_calling": true,
  "json_mode": true,
  "streaming": true,
  "unknown": false
}
```

### 2.3 MCP chat 工具增强（BL-013）

**问题：** chat 工具只暴露 model/messages/temperature/max_tokens，缺少 stream 和 response_format。

#### 2.3.1 stream 参数

新增 `stream: z.boolean().optional()` 参数（默认 false）。

当 `stream: true` 时：
- 调用 `adapter.chatCompletions()` 时传入 `stream: true`
- 通过 MCP 的 SSE 机制将 streaming chunks 逐步返回
- 每个 chunk 作为独立的 MCP content item
- 最终返回包含完整 content + usage 的汇总

**注意：** MCP Streamable HTTP 本身支持 SSE，但 MCP SDK 的 tool response 是一次性返回的。stream 模式下需要使用 SDK 的 streaming response 机制（如果 SDK 支持），或者退而求其次：在服务端消费完整 stream 后一次性返回，但附带 `ttftMs` 性能指标。Generator 需调研 `@modelcontextprotocol/sdk` 是否支持 tool-level streaming，按实际情况选择方案。

#### 2.3.2 response_format 参数

新增 `response_format` 参数：

```typescript
response_format: z.object({
  type: z.enum(["text", "json_object"])
}).optional().describe("Response format. Use json_object for structured JSON output.")
```

传递给底层 `ChatCompletionRequest.response_format`。

### 2.4 SERVER_INSTRUCTIONS 全面重写（BL-014）

**问题：** 现有 SERVER_INSTRUCTIONS 只列工具功能，缺少 Quick Start、使用场景、控制台引导。

**重写要求（必须覆盖所有主要场景）：**

1. **Quick Start**：首次使用推荐流程（get_balance → list_models → chat）
2. **模型查询与选择**：如何找到合适模型、理解价格和 capabilities
3. **对话生成**：基础对话、流式输出、结构化 JSON 输出
4. **图片生成**：generate_image 使用方法
5. **Action 使用**：查看 → 运行 → 变量传递
6. **Template 使用**：查看 → 理解执行模式（single/sequential/fan-out）→ 运行
7. **日志与调试**：list_logs 搜索 + get_log_detail 查看完整 prompt/response/性能
8. **用量与成本**：get_usage_summary 查看花费，按模型/Action/Template 分组
9. **控制台操作引导**：告知 AI 编辑器哪些操作需要在控制台完成（创建 Action/Template、充值、管理 API Key）
10. **SDK 推荐**：代码生成场景推荐 @guangai/aigc-sdk

**约束：** SERVER_INSTRUCTIONS 是 AI 编辑器理解平台能力的唯一入口，质量至关重要。

### 2.5 空结果引导文案（BL-015）

**改动文件：** `src/lib/mcp/tools/list-actions.ts` 和 `list-templates.ts`

当返回 `data: []` 时，在响应中附带 `message` 字段：
- list_actions → `"No Actions found. Create your first Action in the console at {baseUrl}/actions"`
- list_templates → `"No Templates found. Create your first Template in the console at {baseUrl}/templates"`

`{baseUrl}` 取自环境变量 `NEXT_PUBLIC_BASE_URL` 或硬编码为生产 URL。

### 2.6 CallLog.source 清理（BL-016）

**决策：** 去掉从未使用的 `'sdk'` 值，source 只保留 `'api'` 和 `'mcp'`。

**改动：**
- 搜索代码和文档中所有提及 `'sdk'` 作为 source 值的地方，清理注释和文档
- CLAUDE.md 中的 `CallLog.source field: 'api' | 'sdk' | 'mcp'` 改为 `'api' | 'mcp'`
- 不需要 DB migration（source 是普通 String 字段，无 enum 约束）

### 2.7 get_log_detail 暴露 ttftMs（BL-017）

**现状确认：** 经代码审查，`get_log_detail` 已经在 select 中包含 `ttftMs`，并在返回结果中映射为 `ttft` 字段：
```typescript
ttft: log.ttftMs != null ? `${(log.ttftMs / 1000).toFixed(2)}s` : null,
```

**结论：** ttftMs 已暴露。但当前返回的是格式化字符串（如 `"0.85s"`），建议同时返回原始毫秒数以方便程序化处理：
```typescript
ttftMs: log.ttftMs,  // 原始毫秒数
ttft: log.ttftMs != null ? `${(log.ttftMs / 1000).toFixed(2)}s` : null,  // 可读格式
```

### 2.8 get_usage_summary 增强（BL-018）

**现有参数：** 只有 `period`（today/7d/30d）
**新增参数：**

```typescript
{
  period: z.enum(["today", "7d", "30d"]).optional(),
  model: z.string().optional().describe("Filter by model name"),
  source: z.enum(["api", "mcp"]).optional().describe("Filter by call source"),
  action_id: z.string().optional().describe("Filter by Action ID"),
  template_id: z.string().optional().describe("Filter by Template ID"),
  group_by: z.enum(["model", "day", "source", "action", "template"]).optional()
    .describe("Group results by dimension. Default: no grouping (aggregate only)")
}
```

**返回结构：**
- 无 group_by 时：与现有相同（totalCalls, totalCost, totalTokens, avgLatency, topModels）
- 有 group_by 时：返回 `groups[]` 数组，每组包含 key + totalCalls + totalCost + totalTokens

**实现要点：**
- 所有 filter 参数叠加到 Prisma `where` 条件
- group_by = "day" 时按 `createdAt` 日期分组
- group_by = "action" 时按 `actionId` 分组，附带 Action name
- group_by = "template" 时按 `templateId` 分组，附带 Template name
- CallLog 已有 `actionId` 和 `templateId` 字段（p4 批次添加）

### 2.9 list_models 返回 capabilities（关联 2.2）

`list_models` MCP 工具的返回中增加 `capabilities` 字段，直接从 Model 表读取。

---

## 3. 不在范围内

- chat 工具的 tools/function_calling 参数（暂不做）
- chat 工具的 vision/图片输入（暂不做）
- $0 价格歧义问题（上线后不存在）
- 新增 MCP 工具（本批次只增强现有工具）

---

## 4. i18n

本批次主要改动在 MCP 后端（英文），预计 i18n 影响较小。如有新增用户可见文案（如空结果引导），需同步更新 en.json 和 zh-CN.json。

---

## 5. 依赖关系

```
F-MCE-01 (toLowerCase) ──┐
                          ├── 可并行
F-MCE-02 (统一白名单)   ──┘

F-MCE-03 (capabilities 填充) → F-MCE-04 (list_models 返回 capabilities)

F-MCE-05 (stream) ──┐
                     ├── 可并行，均改 chat.ts
F-MCE-06 (response_format) ──┘

F-MCE-07 (SERVER_INSTRUCTIONS) — 独立，但需了解所有其他改动后最后写

F-MCE-08 ~ F-MCE-10 — 各自独立

F-MCE-11 (usage 基础筛选) → F-MCE-12 (Action/Template 维度)

F-MCE-13 (i18n) — 最后，依赖所有其他功能完成
```

**建议实现顺序：** 01 → 02 → 03 → 04 → 05 → 06 → 08 → 09 → 10 → 11 → 12 → 07 → 13 → 14(Codex)
