# BL-EMBEDDING-MVP — Embedding modality 接入（KOLMatrix dogfood）

**批次类型：** 新功能（modality 扩展）
**创建：** 2026-04-28
**预计工时：** ~3.5 day（6 features × 0.5 day + 0.5 day Codex 验收）
**来源：** KOLMatrix customer request — `/Users/yixingzhou/project/joyce/docs/external-asks/aigcgateway-embedding-request.md`

---

## 背景

KOLMatrix 是 aigcgateway 第一个内部生产客户（dogfood），月消耗 ~$5-10。其 B7 Smart Match 即将上线，需 embedding modality：
- **业务诉求：** KOL × Product semantic match（成本 28x↓ + latency 50-150x↓）+ KOL 相似推荐 + 多语言匹配
- **平台战略：** RAG / 推荐 / 搜索场景标配，aigcgateway 缺此 modality 难做对外推广
- **时机：** KOLMatrix MVP 2026-05-22 上线；本批次目标在 5-22 前完成，留 KOLMatrix BL-014 升级时间

KOLMatrix 文档（external-asks/aigcgateway-embedding-request.md）详列 9 个受益场景 + 完整 API 设计建议 + ROI 量化。本 spec 为 aigcgateway 侧 MVP 实现。

## MVP scope（KOLMatrix § 3.1 必做 + § 3.2 批量 + 部分应做）

### IN SCOPE
- ModelModality enum 加 `EMBEDDING` + migration
- POST `/v1/embeddings` OpenAI 兼容（单条 + 批量数组）
- Engine adapter `embeddings()` 方法（openai-compat 实现 → SiliconFlow / OpenAI 复用）
- Action 系统支持 embedding modality（modality 字段 + runner 分支）
- 计费：input tokens 单边（output=0）
- 模型 seed：`bge-m3`（SiliconFlow channel）+ `text-embedding-3-small`（OpenAI channel）
- admin/models 创建表单加 EMBEDDING 选项 + list 显示
- list_models?modality=embedding API 过滤
- MCP tool `embed_text`
- SDK `gateway.embed(params)`
- 文档：CLAUDE.md / API spec 加 embedding 章节

### OUT SCOPE（Phase 2 留观察）
- ❌ dimensions 可选参数（OpenAI text-embedding-3 系列支持，但 bge-m3 不支持；KOLMatrix § 3.2.3 应做 → MVP 后再加）
- ❌ encoding_format=base64（KOLMatrix 用 float 数组即可）
- ❌ /v1/embeddings/similarity cosine 内置 endpoint（KOLMatrix § 3.3.1，自己用 pgvector 不需要）
- ❌ 持久化向量存储（KOLMatrix § 3.3.2，自己有 pgvector）
- ❌ Action embedding 批量（template 渲染单次只产单 input；批量走原始 /v1/embeddings 即可）
- ❌ Volcengine / Zhipu / DeepSeek 等其他 provider embedding 适配（先验证 OpenAI + SiliconFlow 路径，其他下一批）
- ❌ Template 编排支持 embedding step（chat 链路里嵌 embedding step，Phase 2 视客户需求）

---

## 架构设计

### 数据流

```
Client (KOLMatrix / SDK / curl)
  ↓ POST /v1/embeddings  {model, input}
src/app/api/v1/embeddings/route.ts
  ├── authenticateApiKey
  ├── checkBalance
  ├── checkRateLimit (text 维度复用，rpm 已有)
  ├── resolveEngine(model) → route.adapter (OpenAICompatEngine)
  ├── modality validation → 必须 model.modality === 'EMBEDDING'
  ├── adapter.embeddings(request, route)
  │     └── POST upstream /v1/embeddings (siliconflow.cn / api.openai.com)
  ├── normalizeEmbeddingResponse → { data: [{embedding, index}], model, usage }
  └── post-process.processEmbeddingResult → CallLog (source='api', input tokens 计费)
```

### Engine adapter — `embeddings()` 方法

新增 `src/lib/engine/types.ts`：

```ts
export interface EmbeddingRequest {
  model: string;
  input: string | string[];           // 单条或批量
  encoding_format?: "float";          // MVP 仅支持 float
  // dimensions?: number;             // Phase 2
}

export interface EmbeddingData {
  object: "embedding";
  index: number;
  embedding: number[];
}

export interface EmbeddingResponse {
  object: "list";
  data: EmbeddingData[];
  model: string;
  usage: {
    prompt_tokens: number;
    total_tokens: number;             // 与 prompt_tokens 相同（无 completion）
  };
}

export interface EngineAdapter {
  // ... existing
  embeddings?(request: EmbeddingRequest, route: RouteResult): Promise<EmbeddingResponse>;
}
```

`src/lib/engine/openai-compat.ts` 加：

```ts
async embeddings(request: EmbeddingRequest, route: RouteResult): Promise<EmbeddingResponse> {
  const upstreamReq = {
    model: this.resolveModelId(route),
    input: request.input,
    ...(request.encoding_format ? { encoding_format: request.encoding_format } : {}),
  };
  const url = this.buildUrl(route, "embedding");      // 新加 "embedding" type
  const headers = this.buildHeaders(route);
  const res = await this.fetchWithProxy(url, headers, JSON.stringify(upstreamReq), route);
  const json = await res.json();
  this.throwIfBodyError(json);
  return this.normalizeEmbeddingResponse(json);
}

protected buildUrl(route: RouteResult, type: "chat" | "image" | "embedding"): string {
  // 现有 chat → /chat/completions，image → /images/generations
  // 新增 embedding → /embeddings
}

protected normalizeEmbeddingResponse(json): EmbeddingResponse {
  // 适配 SiliconFlow / OpenAI 两家返回结构差异（一般都是 OpenAI 兼容）
}
```

### API endpoint `src/app/api/v1/embeddings/route.ts`

镜像 chat/completions 结构，删除 stream 逻辑（embedding 无 stream）。校验：

- `body.model` 必填
- `body.input` 必填（string 或 string[]）
- input 数组长度 ≤ 100（防滥用，与 OpenAI 一致）
- 单条 input 长度 ≤ model.maxTokens（如 bge-m3 8192）
- 批量时每条 input 单独 token-count 后求和

modality 校验：`route.alias?.modality === 'EMBEDDING'` 必需，否则 400 `invalid_model_modality`。

### 计费

`calculateEmbeddingCost(usage, route)` in `src/lib/api/post-process.ts`：

```ts
// embedding：input tokens × inputPer1M / 1M（output=0）
// 既有 calculateTokenCost 已支持 outputPer1M=0；可考虑直接复用
//   入参：usage.completion_tokens=0
```

**优先复用 `calculateTokenCost`**，把 `usage.completion_tokens` 设为 0 即可（output 单价乘 0 = 0）。新增 helper `processEmbeddingResult` 写 CallLog（source='api', modality='EMBEDDING' 在 metadata）。

### Action 系统改造

**Schema：** `prisma/schema.prisma` Action 加 `modality` 字段，默认 `TEXT`：

```prisma
model Action {
  // ... existing
  modality ModelModality @default(TEXT)   // 新增；与所选 model.modality 一致
  // ...
}
```

migration: `prisma/migrations/20260428_action_modality/migration.sql`：
```sql
ALTER TABLE "actions" ADD COLUMN "modality" "ModelModality" NOT NULL DEFAULT 'TEXT';
```

**ActionVersion.messages 兼容：** 不改 schema，embedding action 约定 `messages = [{role:'user', content:'template-string'}]`（单条），runner 提取 `messages[0].content` 作为 input；多条时 join "\n"（保守兼容）。

**runner 分支：** `src/lib/action/runner.ts`：

```ts
const action = await prisma.action.findFirst(...);
const route = await resolveEngine(action.model);

if (action.modality === 'EMBEDDING') {
  if (!adapter.embeddings) throw new EngineError(...);
  const inputText = injectedMessages.map(m => m.content).join("\n");
  const result = await adapter.embeddings({ model: action.model, input: inputText }, route);
  // 写 CallLog
  return {
    modality: 'EMBEDDING',
    embedding: result.data[0].embedding,
    dimensions: result.data[0].embedding.length,
    usage: result.usage,
    // 兼容 chat 字段：text=null
  };
}
// 既有 chat 路径
```

**ActionRunResult 类型扩展：** 加 `modality: 'TEXT' | 'EMBEDDING'` + 可选 `embedding` / `dimensions` 字段。

### MCP tool — `embed_text`

新建 `src/lib/mcp/tools/embed-text.ts`：

```ts
server.tool(
  "embed_text",
  "Generate vector embeddings from text. Pass model name + input (string or array). Returns embedding(s) + token usage. Use list_models with modality='embedding' to discover available embedding models.",
  {
    model: z.string().describe("Embedding model name (e.g. 'bge-m3' / 'text-embedding-3-small')"),
    input: z.union([z.string(), z.array(z.string()).max(100)]).describe("Text to embed (single or batch up to 100)"),
  },
  async ({ model, input }) => {
    // 调用 internal /v1/embeddings 或直接走 adapter
    // 鉴权 / 计费同 chat MCP tool
  },
);
```

注册：`src/lib/mcp/server.ts` 加 `registerEmbedText(server, opts);`

### SDK

`sdk/src/gateway.ts` 加：

```ts
async embed(params: EmbedParams): Promise<EmbedResponse> {
  const res = await this.fetch("/v1/embeddings", {
    method: "POST",
    body: JSON.stringify({ model: params.model, input: params.input }),
  });
  return res.json();
}
```

类型 `sdk/src/types/request.ts` + `response.ts`：

```ts
export interface EmbedParams {
  model: string;
  input: string | string[];
}
export interface EmbedResponse {
  object: "list";
  data: { embedding: number[]; index: number }[];
  model: string;
  usage: { prompt_tokens: number; total_tokens: number };
}
```

### 模型 + Channel seed

`prisma/seed.ts` 或新建 `scripts/seed-embedding-models.ts`（idempotent upsert）：

| Model | Provider | realModelId | costPrice (per 1M tokens) | sellPrice |
|---|---|---|---|---|
| `bge-m3` | siliconflow | `BAAI/bge-m3` | `{unit:'token', inputPer1M:0.07, outputPer1M:0}` | `{unit:'token', inputPer1M:0.084, outputPer1M:0}` (markup 1.2x) |
| `text-embedding-3-small` | openai | `text-embedding-3-small` | `{unit:'token', inputPer1M:0.02, outputPer1M:0}` | `{unit:'token', inputPer1M:0.024, outputPer1M:0}` |

价格说明：
- bge-m3 SiliconFlow 官价 ¥0.5/M tokens ≈ $0.07/M（按 EXCHANGE_RATE_CNY_TO_USD=0.137）
- text-embedding-3-small OpenAI 官价 $0.02/M tokens
- markup ratio 与现有文本模型一致（1.2x）

Generator 实施前需查 SiliconFlow / OpenAI 最新价格 confirm（预留 generator preflight 步骤）。

---

## Feature 拆解

### F-EM-01（generator, ~0.5d）：Schema + Engine adapter

- Schema migration:
  - `ModelModality` enum 加 `EMBEDDING`
  - `Action.modality` 字段（default TEXT）
  - migration `prisma/migrations/20260428_embedding_modality/migration.sql`（含 enum ALTER + Action 字段）
- `src/lib/engine/types.ts`：EmbeddingRequest / EmbeddingData / EmbeddingResponse interfaces，EngineAdapter.embeddings? 可选方法
- `src/lib/engine/openai-compat.ts`：embeddings() 实现 + buildUrl 加 "embedding" 类型 + normalizeEmbeddingResponse
- 单测：`src/lib/engine/openai-compat.test.ts` 加 embeddings happy / batch / error cases

**Acceptance：** tsc + build + vitest 全过；embeddings() mock fetch 单条 / 批量 / 错误响应；prisma generate 通过

### F-EM-02（generator, ~0.5d）：API endpoint /v1/embeddings + 计费

- `src/app/api/v1/embeddings/route.ts`（参考 chat/completions 结构去掉 stream）
- 校验：model 必填 / input 必填 / 数组长度 ≤ 100
- 路由后 modality === 'EMBEDDING' 校验
- `src/lib/api/post-process.ts`：processEmbeddingResult 复用 calculateTokenCost（output=0）+ 写 CallLog
- 单测：`src/app/api/v1/embeddings/__tests__/route.test.ts`：单条 / 批量 / 非 embedding 模型 400 / 缺字段 400 / 鉴权失败 401

**Acceptance：** API 单测全过；mock adapter 返合理向量；CallLog 写入正确 usage + costPrice

### F-EM-03（generator, ~0.5d）：Action embedding 支持

- `src/lib/action/runner.ts` 加 modality 分支：embedding action 走 adapter.embeddings()
- ActionRunResult 类型扩展 modality / embedding / dimensions（chat 路径兼容）
- create_action MCP tool 接受 modality 参数（默认 TEXT）
- 单测：`src/lib/action/__tests__/runner.test.ts` 加 embedding action case

**Acceptance：** runner.test.ts 加 embedding action 跑通 mock adapter；现有 chat action 单测不破

### F-EM-04（generator, ~0.5d）：Provider seed + admin UI

- 查 SiliconFlow + OpenAI 当前 embedding 定价（preflight web check）
- `prisma/seed.ts` 加 bge-m3 + text-embedding-3-small upsert（含 channel + costPrice + sellPrice）
- `admin/models` 创建表单加 EMBEDDING modality 选项
- list_models?modality=embedding 过滤（API 应已支持，需测试）
- 生产部署后跑 `npx prisma db seed` 生效

**Acceptance：** seed 后 SELECT modality='EMBEDDING' models 至少 2 条；admin UI 可创建 EMBEDDING modality 模型；list_models filter 工作

### F-EM-05（generator, ~0.5d）：MCP tool + SDK

- `src/lib/mcp/tools/embed-text.ts`（新建）+ server.ts 注册
- 单测：`src/lib/mcp/tools/__tests__/embed-text.test.ts`
- SDK：`sdk/src/gateway.ts` embed() 方法 + types/request.ts + response.ts
- SDK 单测（如 sdk/test/ 已有 chat.test.ts 模式则同步加 embed.test.ts）

**Acceptance：** MCP tool 单测 PASS；SDK typecheck + build；npm pack 后 import 可用

### F-EM-06（codex, ~0.5d）：验收

**静态（3）：**
1. tsc / build / vitest 全过（≥ 471 + F-EM-01/02/03/05 新增）
2. prisma migrate dev 本地通；prisma generate 无 lint 错
3. SDK build 通过

**API 行为（4）：**
4. POST /v1/embeddings {model:bge-m3, input:"hello"} → 200 + data[0].embedding 长度 1024 + usage.prompt_tokens > 0
5. POST 批量 input:["a","b","c"] → data 3 条 + usage 含全部
6. POST 用 chat 模型（如 gpt-4o）→ 400 invalid_model_modality
7. CallLog 行写入：modality='EMBEDDING'（metadata） + costPrice ≈ usage.prompt_tokens × 0.07/M（bge-m3）

**Action（2）：**
8. create_action {modality:'EMBEDDING', model:'bge-m3', messages:[{role:'user', content:'{{text}}'}]} → 创建成功
9. run_action {action_id, variables:{text:"hello world"}} → 返回 { modality:'EMBEDDING', embedding: number[1024], dimensions:1024, usage }

**MCP（1）：**
10. MCP client 调 embed_text {model:bge-m3, input:"hello"} → embedding 返回正常

**SDK（1）：**
11. SDK gateway.embed({model:bge-m3, input:"hello"}) → response.data[0].embedding 正确

**生产实证（2）：**
12. 部署后跑 `npx prisma db seed` → 生产 DB 含 bge-m3 + text-embedding-3-small
13. 生产 API 调 1 次 bge-m3 embedding（admin API key）→ 200 + costPrice 合理（< $0.001 单条）

**报告（1）：**
14. `docs/test-reports/BL-EMBEDDING-MVP-signoff-2026-04-2X.md`，含 13 项证据 + 真实 traceId + 截图

---

## 非目标 / Phase 2 留观察

- dimensions 可选参数（OpenAI text-embedding-3 支持，bge-m3 不支持；MVP 跳过）
- encoding_format=base64
- /v1/embeddings/similarity cosine endpoint
- 持久化向量存储
- Volcengine / Zhipu / DeepSeek 等其他 provider embedding 适配
- Template 多步编排里嵌 embedding step
- Action embedding 批量（template 渲染产出多 input → 批量调用）

---

## Risks

| 风险 | 缓解 |
|---|---|
| SiliconFlow embedding API 与 OpenAI 不完全兼容（response.data 字段差异） | normalizeEmbeddingResponse 兼容两家；F-EM-01 单测覆盖两家 mock 响应 |
| OpenRouter 暂无 bge-m3 渠道 | 直接用 SiliconFlow（已配置 provider auth）；OpenRouter 留 Phase 2 视客户需求 |
| Action.modality 字段变更影响现有 actions | migration default='TEXT'，所有存量 action 自动 TEXT；前端 list 默认不展示 modality 字段不破 |
| 计费 outputPer1M=0 path 测试不充分（潜在 NaN/0 division） | F-EM-01 单测覆盖 outputPer1M=0 边界 |
| Action embedding result shape 与 chat 不兼容破坏现有客户端 | ActionRunResult 加 modality 区分字段，chat 客户端读 result.text 仍正常；新 embedding 客户端读 result.embedding |
| KOLMatrix 上线前 5-22 时间紧 | 3.5 day 工时含 buffer；可分 fix-round 应对；最坏情况 KOLMatrix BL-014 推迟 1 周不阻塞 MVP |

---

## 部署

- F-EM-01 prisma migrate（含 enum 变更 + Action 字段）→ 生产 `npx prisma migrate deploy`
- F-EM-04 seed → `npx prisma db seed`（idempotent）
- F-EM-06 部署后 traceId 实证调用 ~$0.0001（~$0.001/k tokens × 50 tokens）
- 回滚：revert migration（Postgres enum 删除值需手动；保留 EMBEDDING 不影响功能）

---

## 验收标准

- [ ] F-EM-06 的 14 项全 PASS
- [ ] tsc / build / vitest（≥ 471 + F-EM-01/02/03/05 新增）
- [ ] prisma migrate deploy + db seed 生产部署通过
- [ ] 1 次真实 bge-m3 embedding 调用 → 200 + 1024 维向量
- [ ] 1 次 embedding action 创建 + run → 返回 embedding[]
- [ ] MCP client embed_text 工作
- [ ] SDK gateway.embed() 工作
- [ ] signoff 报告归档
- [ ] KOLMatrix 收到通知（external-asks 文档更新或回邮）
