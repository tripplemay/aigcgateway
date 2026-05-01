# BL-SYNC-INTEGRITY-PHASE1 Spec

**批次：** BL-SYNC-INTEGRITY-PHASE1（model sync 完整性修复一期）
**负责人：** Planner / Generator = 默认映射 / Evaluator = Reviewer
**创建：** 2026-05-01
**工时：** 1 day
**优先级：** medium-high（生产 sync 持续 partial，2 个 provider 失败）
**前置：** 无（独立后端 + maintenance 脚本）
**关联：**
- 生产 sync-status 实测：lastSyncResult=partial（2026-05-01T14:46Z）
- 失败 #1: siliconflow IMAGE channel createMany 触发 DB CHECK 约束
- 失败 #2: xiaomi-mimo provider 无 sync adapter
- 隐患：311 zero-price ACTIVE channel（与 BL-BILLING-AUDIT-EXT-P1 F-BAX-08 约束实施前的存量遗留）

## 背景

### 失败 #1：siliconflow sync 触发 DB CHECK 23514

`src/lib/sync/model-sync.ts:121-127` 的 `buildInitialCostPrice` 在新建 IMAGE channel 时返回 `{ perCall: 0, unit: "call" }` 作为占位，意图是依赖运营在 admin UI 手设真值后由 F-BIPOR-02 trigger 拦截。但 BL-BILLING-AUDIT-EXT-P1 F-BAX-08 加的 DB CHECK 约束 23514（`IMAGE channel costPrice must have call.perCall>0 OR token.inputPer1M>0 OR token.outputPer1M>0`）**禁止 perCall=0 出现**，INSERT 阶段就被拒，根本没机会到"运营手设"。每次 siliconflow 上游返回新 IMAGE 类 model，sync 就触发 createMany 失败 → 整个 siliconflow provider sync 事务回滚（含同批 TEXT model）。

### 失败 #2：xiaomi-mimo 无 sync adapter

`src/lib/sync/model-sync.ts:50-62` 的 `ADAPTERS` 字典注册了 11 家上游，**未含 xiaomi-mimo**。但 `providers` 表已含 xiaomi-mimo provider（用户接入 MiMo 时建的，channel 已 ACTIVE + health=PASS）。每次 sync 迭代到该 provider 即抛 "No sync adapter found"。这是 MiMo 接入只到数据层、缺 sync 层的遗留。

### 隐患：311 zero-price ACTIVE channel

`/api/admin/sync-status` 返回 `zeroPriceActiveChannels: 311`（**status=ACTIVE** 且 sellPrice 三类（inputPer1M / outputPer1M / perCall）全为 0 的 channel）。多半是 BL-BILLING-AUDIT-EXT-P1 F-BAX-08 加 CHECK 约束**之前**的存量数据。处置策略需先扫描分组才能定，不在本批次"清理"范围内（仅交付扫描脚本 + 报告）。

## 目标

1. 修复 siliconflow sync — IMAGE channel 创建跳过，让 TEXT 等其他 modality 不再被同批回滚
2. 注册 xiaomi-mimo sync adapter，使其后续 sync 进入正常流程
3. 交付 zero-price ACTIVE channel 扫描脚本（read-only），输出按 (provider, modality, alias.enabled) 三维分组的 311 channel 报告，供运维评审下一步处置

## 非目标

- 不弱化 BL-BILLING-AUDIT-EXT-P1 F-BAX-08 的 CHECK 约束
- 不动 `buildCostPrice` / `buildInitialCostPrice` 中 TEXT modality 的逻辑
- 不写库清理 311 zero-price channel（本批次只 deliver 扫描报告，逐组处置策略待运维评审后下批次执行）
- 不接入 MiMo 价格 enrichment（MiMo 当前仅 chat，无 IMAGE / EMBEDDING；adapter 仅完成 model list 拉取）
- 不动 sync 调度器 / leader-lock / scheduler.ts

## 关键设计决策

### D1：siliconflow IMAGE channel 走 "skip" 路径（用户已确认方案 B）

| 方案 | 改动 | 决策 |
|---|---|---|
| **B（选）** sync 阶段完全跳过 IMAGE channel 创建 | model-sync.ts L307-317 加 `if modality===IMAGE skip` | 选 |
| A 占位 perCall=0.001 | buildInitialCostPrice 一行改 | 不选 — 占位语义仍是 placeholder，运营误以为已设价 |
| C 弱化 CHECK 约束 | DB migration | 不选 — 倒退 F-BAX-08 安全 |
| D OpenRouter 价格拉取 | adapter enrich | 不选 — 0.5d 干不完 |

**实施细节：**

- 修改点：`src/lib/sync/model-sync.ts:306-317` 的 `else` 分支（新建 channel）
- 在 `channelsToCreate.push(...)` 之前加：
  ```ts
  if (remote.modality === "IMAGE") {
    skippedImageChannels.push(`${provider.name}/${remote.modelId} → ${canonical}`);
    continue;
  }
  ```
- `skippedImageChannels` 数组初始化在函数开头（与 `newChannels` 并列）
- sync result shape 增加 `skippedImageChannels: string[]` 字段（types.ts 同步）
- 行为：IMAGE model 仍然在 `models` 表创建（model 无 CHECK 约束），但**不创建对应 channel**。运营需在 admin UI 手动建 channel 并设有效 costPrice
- `buildInitialCostPrice` 函数本身**保留不动**（仅在 IMAGE skip 路径绕过它，未来可能其他场景仍需调用）

### D2：xiaomi-mimo sync adapter（OpenAI 兼容）

**已确认事实（生产 admin API 实测）：**
- providerName: `xiaomi-mimo`
- adapterType: `openai-compat`
- baseUrl: `https://token-plan-cn.xiaomimimo.com/v1`
- `/v1/models` 实测 HTTP 401（无 auth 时）→ 标准 OpenAI 行为，需 `Authorization: Bearer <key>`

**实施前必须完成 shape 验证（铁律 2.1：协议层断言）：**

Generator 在写 adapter 前先用项目内已有 channel 的 apiKey（dev / scratch DB 取一条 enabled 的 xiaomi-mimo channel 配置）curl 一次：

```bash
curl -sS https://token-plan-cn.xiaomimimo.com/v1/models \
  -H "Authorization: Bearer $MIMO_KEY" | jq .
```

期望返回标准 OpenAI shape：
```json
{ "object": "list", "data": [{ "id": "mimo-v2-pro", "object": "model", "created": ..., "owned_by": "xiaomi" }] }
```

**若 shape 不符（如缺 `data` 字段、用 `models` / `items` 字段名等），停下来更新本 spec 后再实施。** 这一步不可省。

**实施细节：**

- 新文件：`src/lib/sync/adapters/xiaomi-mimo.ts`
- 范式参考：`src/lib/sync/adapters/siliconflow.ts`
- 关键差异：
  - `providerName: "xiaomi-mimo"`
  - 模型 name 加前缀 `xiaomi/`（与现有生产 channel `xiaomi/mimo-v2-omni` / `xiaomi/mimo-v2-pro` 一致）
  - `filterModel: isChatModality(modelId)`（保守，与 siliconflow 一致；MiMo 当前仅 chat 模型）
- 注册：`src/lib/sync/model-sync.ts:31-41` 加 `import`，L50-62 ADAPTERS 加 `"xiaomi-mimo": xiaomiMimoAdapter`

**验证（spec acceptance 内）：** 在 dev DB 上跑一次 sync（仅 xiaomi-mimo provider，可用 admin debug endpoint 或 npm script）→ 验证 `mimo-v2-pro` 与 `mimo-v2-omni` 已存在（不会重新创建因 skipDuplicates）+ 不再报 "No sync adapter found"。

### D3：zero-price 扫描脚本（read-only）

**新文件：** `scripts/maintenance/scan-zero-price-channels.ts`

**职责：** 扫描所有 status=ACTIVE 但 sellPrice 三类（inputPer1M / outputPer1M / perCall）全为 0 的 channel；按 (provider, modality, 关联 alias.enabled 状态) 三维分组；输出 CSV + JSON 报告供运维评审。

**SQL（参考 sync-status/route.ts:50-56 已有的 zero-price 计数 SQL，扩展为详细 select）：**

```sql
SELECT
  c.id AS channel_id,
  c."realModelId",
  p.name AS provider_name,
  m.name AS model_name,
  m.modality,
  m.enabled AS model_enabled,
  c.status AS channel_status,
  c."sellPrice",
  c."costPrice",
  COALESCE(
    (SELECT json_agg(json_build_object('alias', ma.alias, 'enabled', ma.enabled))
     FROM alias_model_links aml
     JOIN model_aliases ma ON ma.id = aml."aliasId"
     WHERE aml."modelId" = m.id),
    '[]'::json
  ) AS associated_aliases
FROM channels c
JOIN providers p ON p.id = c."providerId"
JOIN models m ON m.id = c."modelId"
WHERE c.status = 'ACTIVE'
  AND COALESCE((c."sellPrice"::jsonb->>'inputPer1M')::float, 0) = 0
  AND COALESCE((c."sellPrice"::jsonb->>'outputPer1M')::float, 0) = 0
  AND COALESCE((c."sellPrice"::jsonb->>'perCall')::float, 0) = 0
ORDER BY p.name, m.modality, m.name;
```

**输出：**

- `docs/test-reports/_artifacts/BL-SYNC-INTEGRITY-PHASE1/zero-price-channels-YYYY-MM-DD.json`（完整 311 行）
- `docs/test-reports/_artifacts/BL-SYNC-INTEGRITY-PHASE1/zero-price-channels-YYYY-MM-DD-summary.csv`（按 provider × modality × any-enabled-alias 分组的 count + sample channel id）
- stdout 打印 summary 表（运维直接看终端即可）

**严格要求：**
- 脚本是 **pure read-only**：仅 `prisma.$queryRaw` + 文件写入；**不得**调用任何 prisma.update / delete / create
- 退出前 `prisma.$disconnect() + disconnectRedis()`（v0.9.5 铁律）
- 支持 `OUT_DIR=<path>` 环境变量自定义输出目录（默认 `docs/test-reports/_artifacts/BL-SYNC-INTEGRITY-PHASE1`）

**不在本批次范围：** 根据扫描结果决定逐组处置策略（DISABLED / 补价 / DELETE）— 留下批次 `BL-SYNC-INTEGRITY-PHASE2` 视情况启动。

### D4：sync result shape 加 `skippedImageChannels`（D1 配套）

`src/lib/sync/types.ts` 中 sync result 类型增加：

```ts
interface ProviderSyncResult {
  // ... existing fields ...
  skippedImageChannels: string[];  // ← new
}
```

`/api/admin/sync-status` 返回值不需要直接展示这个字段（admin 看 lastSyncResultDetail.providers[i].skippedImageChannels 即可）。**前端 admin/operations 页面无需改动。**

### D5：执行顺序与回滚

| Feature | 顺序 | 独立 commit | 回滚 |
|---|---|---|---|
| F-SI-01 siliconflow IMAGE skip | 1 | yes | git revert 单 commit |
| F-SI-02 xiaomi-mimo adapter | 2 | yes | git revert 单 commit（adapter 不引用即等价无效） |
| F-SI-03 zero-price 扫描脚本 | 3 | yes | 删脚本即可（无 DB 副作用） |
| F-SI-04 codex 验收 | 4 | — | — |

## 设计

### F-SI-01：siliconflow IMAGE channel sync 跳过（D1 + D4）

**文件：**
- `src/lib/sync/model-sync.ts`（修改 ~L286-321 channel 创建分支 + ~L65-95 sync result 类型扩展）
- `src/lib/sync/types.ts`（如有 ProviderSyncResult 类型，加字段）
- `src/lib/sync/__tests__/model-sync-image-skip.test.ts`（新增 — 但只**扩展现有 mock 测试文件**或在现有 `__tests__/build-cost-price-regression.test.ts` 加 case，遵循铁律 3）

**Generator 实施步骤：**

1. **铁律 1.5 全仓 grep（spec push 前 Planner 已做）：** `grep -rn "modality === \"IMAGE\"" src/` 命中清单：
   - `src/lib/sync/model-sync.ts:112` — buildCostPrice IMAGE 返回 null（保留不动）
   - `src/lib/sync/model-sync.ts:122` — buildInitialCostPrice IMAGE 返回 perCall:0（保留不动）
   - `src/lib/sync/model-sync.ts:165-166` — override.modality 转换（保留不动）
   - `src/lib/api/post-process.ts:212-214` — image params（与 sync 无关，跳过）
   - 路由层 `src/lib/engine/router.ts` 不依赖 channel 必存在，IMAGE alias 走独立 modality 分支（OK 跳过）
2. 添加 IMAGE skip 分支
3. 扩展 sync result shape 加 skippedImageChannels
4. 扩展现有单测 case 验证 IMAGE 不被 createMany

**Acceptance：** 见 features.json F-SI-01。

### F-SI-02：xiaomi-mimo sync adapter（D2）

**文件：**
- `src/lib/sync/adapters/xiaomi-mimo.ts`（新建）
- `src/lib/sync/model-sync.ts:31-41 + 50-62`（注册）
- `src/lib/sync/__tests__/model-sync.test.ts` 或 `xiaomi-mimo-adapter.test.ts`（按 v0.9.7 铁律 3，不强制新建 test file，可扩展现有 __tests__）

**Generator 实施步骤：**

1. **shape 验证：** 用 dev / scratch DB 上的 xiaomi-mimo channel apiKey 调一次 `/v1/models` 确认 OpenAI shape（如不符停下来更新 spec）
2. 写 `xiaomi-mimo.ts`（参考 siliconflow.ts 范式）
3. 注册 ADAPTERS
4. 在 dev DB 上跑一次 sync 验证

**Acceptance：** 见 features.json F-SI-02。

### F-SI-03：zero-price ACTIVE channel 扫描脚本（D3）

**文件：** `scripts/maintenance/scan-zero-price-channels.ts`（新建）

**Acceptance：** 见 features.json F-SI-03。

### F-SI-04：Codex 验收 + 签收报告

**Codex 跑：**

1. `bash scripts/test/codex-setup.sh` + `codex-wait.sh`
2. 代码层：grep 验证 IMAGE skip 分支存在 + xiaomi-mimo adapter 注册
3. 单测：模拟 IMAGE remote model 不进 channelsToCreate；模拟 xiaomi-mimo provider 进入 ADAPTERS
4. **生产软验收**（如有 admin 访问）：
   - 触发一次 sync（POST /api/admin/sync-models）
   - 验证 sync-status：siliconflow + xiaomi-mimo 不再失败（lastSyncResult=success）
   - 若 lastSyncResult 仍 partial，分析具体失败 provider
5. F-SI-03 验证：
   - 跑一次 `npx tsx scripts/maintenance/scan-zero-price-channels.ts`
   - 验证两个产物文件已生成（json + csv）
   - 总计 311（与 sync-status 报告一致）
   - 无任何 prisma.update / delete 调用（grep + Read 脚本源码）
6. 输出 `docs/test-reports/BL-SYNC-INTEGRITY-PHASE1-signoff-YYYY-MM-DD.md`

## 数据模型 / 接口

无 Prisma schema 改动。

API 改动：

```diff
GET /api/admin/sync-status (响应)
{
  data: {
    lastSyncResultDetail: {
      providers: [
        {
          providerName: "siliconflow",
          newModels: [...],
          newChannels: [...],
+         skippedImageChannels: [...]   // ← new (F-SI-01)
        },
        ...
      ]
    }
  }
}
```

向后兼容：新字段，旧前端忽略即可（admin/operations 当前不消费此字段）。

## 风险与回滚

| 风险 | 缓解 |
|---|---|
| F-SI-01 跳过 IMAGE channel 后，下次 sync 该 IMAGE model 永远没 channel | 设计意图。运营在 admin UI 手建 channel 后设 costPrice 走 createMany 之外的路径（admin/channels POST）。skippedImageChannels 字段让 admin 看见"哪些 IMAGE model 待手建" |
| F-SI-02 MiMo `/v1/models` shape 不符 OpenAI 标准 | 实施前 shape 验证步骤强制；不符则停下来更新 spec |
| F-SI-03 SQL 取错 / 误统计 | 与 sync-status:50-56 已有 SQL 一致；总数对齐 311 验证 |
| sync result 字段 shape breaking | 加字段不破坏旧消费方；admin/operations 无引用 skippedImageChannels |

**整体回滚：** 三个 feature 独立 commit，任何一步失败 git revert 单 commit。

## 验收摘要

见 `features.json` 中 4 条 features 的 `acceptance`。

## Planner 自检（铁律清单逐条）

- [x] 铁律 1：file:line 引用充分（model-sync.ts:50/121/306/527 等）
- [x] 铁律 1.1：实现形式锁死（具体行号 + 字段名 + commit 边界）
- [x] 铁律 1.2：证据来源限定 Generator 代码 + 单测 + dev DB 验证（无运维依赖）
- [x] 铁律 1.3：定量 acceptance 含零基线（zero-price 共 311，扫描后 ≤ 311 即可）
- [x] 铁律 1.4：周期性 sync 任务 — F-SI-01 实施后下次 sync 是回归保护点（codex 验收阶段触发一次 sync 验证）
- [x] 铁律 1.5：grep 全仓反向消费已展开（spec D1 实施步骤 1 列命中清单 + in/out scope）
- [x] 铁律 1.6：调研类不适用（本批次是修复类）
- [x] 铁律 1.7：sync 是周期任务但本批次只改创建逻辑，无 cron/T+N 时序口径需求
- [x] 铁律 1.8：本批次无复用 UI 组件，不适用
- [x] 铁律 2.1：MiMo `/v1/models` 协议层标明 HTTP / OpenAI shape
- [x] 铁律 3：所有单测通过扩展现有 __tests__ 完成，未要求 Generator 新建测试文件
