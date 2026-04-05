# Dev Infra 批次规格文档

**批次名称：** dev-infra
**创建日期：** 2026-04-05
**来源：** backlog BL-002 / BL-003 / BL-004 / BL-005 / BL-006

---

## 背景与目标

本批次为"开发/测试基础设施"改善批次，源于 Codex 在前几轮验收过程中积累的效率瓶颈反馈。核心问题有三类：

1. **鉴权初始化重复成本**（BL-002）：Codex 每轮验收前须手动处理两套鉴权（API Key + JWT），无可复用脚本。
2. **内部状态不透明**（BL-003 / BL-006）：sync 差异、通道 disable 原因、enrichment 命中率、health check 时间等关键状态只能推断，无法直接查询。
3. **失败诊断信息不足**（BL-004 / BL-005）：图片生成失败时错误信息过于笼统；管理接口文档与实际响应结构已有出入。

目标：让 Codex 每轮验收的前置准备时间从 ~15 分钟降至 ~3 分钟，同时提升根因定位效率。

---

## 功能范围

### F-INFRA-01：管理端统一鉴权测试脚本（BL-002）

**文件：** `scripts/admin-auth.ts`

**功能要求：**
- 导出 `getAdminToken(baseUrl?: string): Promise<string>` 函数
  - 内部 POST `/api/auth/login`，使用 Codex 测试账号（`codex-admin@aigc-gateway.local` / `Codex@2026!`）
  - 返回 JWT token 字符串
- 导出 `getAdminHeaders(baseUrl?: string): Promise<Record<string, string>>` 函数
  - 返回 `{ Authorization: "Bearer <token>", "Content-Type": "application/json" }`
- 支持 `BASE_URL` 环境变量，默认 `http://localhost:3099`
- 脚本可独立运行（`npx tsx scripts/admin-auth.ts`），运行时打印 token 前 20 个字符作为验证

**注释要求：**
在脚本顶部注释中列出以下高频管理接口的 curl 等价调用示例：
- GET `/api/admin/models-channels`（通道+模型列表）
- GET `/api/admin/sync-status`（同步状态）
- POST `/api/admin/sync`（触发同步）
- GET `/api/admin/health`（健康检查状态）
- GET `/api/admin/usage`（用量统计，需要 ?from=&to= 参数）

---

### F-INFRA-02：可观测 debug 接口——sync 差异 + 通道 disable 原因（BL-003 部分）

**路由：** `GET /api/admin/debug/sync`

**鉴权：** JWT Admin（复用 `adminGuard`）

**响应结构：**
```ts
{
  lastSyncAt: string | null,          // 最近一次 sync 完成时间（ISO 8601）
  lastSyncDuration: number | null,    // 耗时（秒）
  syncedModelCount: number,           // 本次同步写入/更新的模型数
  exposedModelCount: number,          // 当前通过路由可访问的模型数（ACTIVE Channel 下的）
  disabledChannels: Array<{
    id: string,
    name: string,
    provider: string,
    disabledReason: string | null,    // Channel.notes 或 healthCheck 最后失败消息
    disabledAt: string | null         // updatedAt（当 status 变为 DISABLED 时）
  }>
}
```

**实现说明：**
- `lastSyncAt` / `lastSyncDuration` / `syncedModelCount`：查询最近一条 SyncLog 记录（若 SyncLog 表不存在则返回 null，不报错）
- `exposedModelCount`：COUNT `ModelVersion` WHERE channel.status = 'ACTIVE'
- `disabledChannels`：查询 `Channel` WHERE status = 'DISABLED'，`disabledReason` 优先取 `Channel.notes`，无则取该通道最近一条失败 HealthCheck 的 `errorMessage`

---

### F-INFRA-03：可观测 debug 接口——enrichment 统计（BL-003 部分）

**路由：** `GET /api/admin/debug/enrichment`

**鉴权：** JWT Admin

**响应结构：**
```ts
{
  totalModels: number,
  enrichedModels: number,          // aiEnriched = true 的数量
  unenrichedModels: number,
  enrichmentRate: string,          // 如 "42.3%"
  byProvider: Array<{
    provider: string,
    total: number,
    enriched: number,
    rate: string
  }>
}
```

**实现说明：**
- 查询 `ModelVersion` 表，按 `channel.provider.name` 分组统计 `aiEnriched` 字段
- 不写缓存，直接查库（运维接口，调用频率极低）

---

### F-INFRA-04：图片生成失败链路诊断日志（BL-004）

**文件：** `src/lib/engine/openai-compat.ts`（`imageViaChat` 函数）

**改动要求：**

在 `imageViaChat` 提取链的每个关键节点补充 `console.error` / `console.warn` 诊断日志，格式统一为结构化对象：

```ts
console.error('[imageViaChat] extraction failed', {
  stage: 'multimodal-parts' | 'base64' | 'url-with-ext' | 'any-https',
  contentType: typeof content,         // 'string' | 'array' | 'null'
  partTypes: string[],                  // 每个 part 的 type 字段列表
  urlCandidateCount: number,
  dataUriFound: boolean,
  model: string,
  provider: string
})
```

具体节点：
1. `multimodal parts` 提取失败时（parts 存在但无 image_url）
2. `base64 / data URI` 提取失败时
3. `带扩展名 URL` 提取失败时
4. 四级全部失败、抛出最终错误前

---

### F-INFRA-05：管理端接口响应结构文档化（BL-005）

**executor: codex**

Codex 调用以下接口，记录真实响应 JSON 并写入文档。

**目标接口（5 个）：**
1. `GET /api/admin/models-channels`
2. `GET /api/admin/usage?from=2026-04-01T00:00:00Z&to=2026-04-06T00:00:00Z`
3. `GET /api/admin/usage/by-model?from=2026-04-01T00:00:00Z&to=2026-04-06T00:00:00Z`
4. `GET /api/admin/sync-status`
5. `GET /api/admin/health`

**输出文件：** `docs/specs/admin-api-response-samples.md`

**文档格式（每个接口）：**
```markdown
## GET /api/admin/xxx

**鉴权：** JWT Admin（Bearer token）

**响应示例：**
\`\`\`json
{ ...真实响应... }
\`\`\`

**关键字段说明：**
- `fieldName`：含义说明
```

---

### F-INFRA-06：sync-status + health 时间字段（BL-006）

**改动范围：** `src/app/api/admin/sync-status/route.ts` 和 `src/app/api/admin/health/route.ts`

**sync-status 接口新增字段：**
```ts
{
  // 现有字段保持不变，新增：
  lastSyncAt: string | null,       // 最近一次 sync 触发时间（ISO 8601）
  lastSyncDuration: number | null, // 最近一次 sync 耗时（秒）
  lastSyncResult: 'success' | 'partial' | 'failed' | null
}
```

**health 接口新增字段（每条 channel 结果）：**
```ts
{
  // 现有字段保持不变，新增：
  lastCheckedAt: string | null,    // 最近一次 health check 完成时间
  consecutiveFailures: number      // 连续失败次数（已有 downSince 相关逻辑，直接暴露）
}
```

**实现说明：**
- `sync-status`：从 SyncLog 表查最近一条记录（若表不存在或无记录则返回 null）
- `health`：`lastCheckedAt` 取该 Channel 最近一条 HealthCheckLog 的 `createdAt`；`consecutiveFailures` 取 Channel 上已有的 `consecutiveFailures` 字段（若存在）

---

## 接口命名空间约定

所有新增 debug 接口均挂在 `/api/admin/debug/` 下，遵守：
- 需要 JWT Admin 鉴权
- 只读，无任何写操作
- 不写 CallLog，不计费
- 响应加 `export const dynamic = "force-dynamic"`

---

## 批次类型

混合批次（F-INFRA-01 ～ F-INFRA-04, F-INFRA-06 为 generator；F-INFRA-05 为 codex）

状态流转：`planning → building → verifying → done`
