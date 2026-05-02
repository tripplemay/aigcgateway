# BL-SYNC-INTEGRITY-PHASE2 Spec

**批次：** BL-SYNC-INTEGRITY-PHASE2（zero-price ACTIVE channel 处置 + sync-status 度量重定义）
**负责人：** Planner / Generator = 默认映射 / Evaluator = Reviewer
**创建：** 2026-05-02
**工时：** 0.5 day
**优先级：** medium
**前置：** BL-SYNC-INTEGRITY-PHASE1（已部署生产）— PHASE1 scan 脚本提供生产真分组数据
**关联：**
- 上批次 PHASE1 scan 脚本生产真跑（2026-05-02）输出 310 zero-price ACTIVE channel
- `enabled-alias-UNPRICED` 分组 = 0 → 无计费 leak 风险
- 度量 `zeroPriceActiveChannels` 来自 channel.sellPrice，但用户面 / 计费实际消费 alias.sellPrice → 度量误报

## 背景

### PHASE1 scan 真实数据（精准 SQL 三维分组结果）

```
provider     modality  alias_status               count
deepseek     TEXT      enabled-alias-priced       2
minimax      TEXT      enabled-alias-priced       4
openrouter   TEXT      disabled-alias-only        18
openrouter   TEXT      enabled-alias-priced       10
qwen         TEXT      disabled-alias-only        174
qwen         TEXT      enabled-alias-priced       20
siliconflow  TEXT      disabled-alias-only        59
siliconflow  TEXT      enabled-alias-priced       13
volcengine   TEXT      disabled-alias-only        1
xiaomi-mimo  TEXT      disabled-alias-only        2
xiaomi-mimo  TEXT      enabled-alias-priced       2
zhipu        TEXT      disabled-alias-only        5

总计 310（disabled-alias-only 259 + enabled-alias-priced 51）
```

### 三个分组的处置

| 分组 | 数量 | 行为影响 | 处置 |
|---|---|---|---|
| **`enabled-alias-priced`** | 51 | **无影响** — `/v1/models` 与 post-process 计费均优先用 alias.sellPrice，channel.sellPrice 仅 fallback 不触发 | **不动** |
| **`disabled-alias-only`** | 259 | probe 浪费每天 ~37,300 次 + ~600K token/月 ≈ $2.7/月；admin/health 列表噪音 | **软停 status=DISABLED**（保留审计） |
| **`enabled-alias-UNPRICED`** | **0** | 计费 leak 真实风险（fallback 0 元免费） | 无目标 — 现状即合规 |

### 架构事实（已 grep 验证）

- `/v1/models` 用户面 pricing：仅用 alias.sellPrice，无 channel fallback（`src/app/api/v1/models/route.ts:73-74` 注释明确）
- 扣费 `post-process.ts:636`：`alias.sellPrice ?? channel.sellPrice ?? {}` — alias 优先
- 即 channel.sellPrice 字段事实上是历史遗留兼容字段，新业务流均不依赖

### 度量误报问题

`/api/admin/sync-status` 返回的 `zeroPriceActiveChannels` 基于 `channel.sellPrice`（参见 `route.ts:50-56` SQL），但**这个字段不再是消费源**。生产 310 中 `enabled-alias-priced=51` 都是"无害零价"，但旧度量把它们计入 warning，admin 面板显示 warning chip 误导运维。

## 目标

1. **软停 259 个 disabled-alias-only zero-price channel**（status=ACTIVE → DISABLED），节省 probe 成本与日志噪音
2. **重定义 sync-status 度量** — 暴露真正反映"用户感知价格空白"的 alias-level 度量；旧 channel-level 度量保留向后兼容
3. **PHASE1 scan 脚本扩展** 三维分组（与 PHASE2 SQL 等效），便于运维定期跑
4. **admin/operations UI 同步** — 加 alias-level warning chip（仅当 unpricedActiveAliases>0 才显示，预期生产为 0）

## 非目标

- 不补任何 alias.sellPrice（生产 enabled-alias-UNPRICED=0，无目标）
- 不删除任何 channel/model（保留审计与未来复活路径）
- 不改 channel.sellPrice 字段语义（历史兼容字段保留）
- 不动 admin/operations 页面整体布局（只加一个 warning chip）
- 不修复 PHASE1 sync-status 计数与 scan 计数的差 1（310 vs 311，30s 缓存抖动可接受）

## 关键设计决策

### D1：软停脚本 — disable-orphan-zero-price-channels.ts

**新文件：** `scripts/maintenance/disable-orphan-zero-price-channels.ts`

**范式：** 参考 `scripts/maintenance/disable-or-deprecated-models.ts`（PHASE1 同款 maintenance script）：
- DRY_RUN=1 模式默认推荐使用，幂等
- 退出前 `prisma.$disconnect() + disconnectRedis()`（v0.9.5 铁律）
- 软停 `status=ACTIVE → DISABLED`，不删除任何记录

**SQL（先 select 出目标 channel id 列表）：**

```sql
SELECT c.id, p.name AS provider, m.name AS model
FROM channels c
JOIN providers p ON p.id = c."providerId"
JOIN models m ON m.id = c."modelId"
WHERE c.status = 'ACTIVE'
  AND COALESCE((c."sellPrice"::jsonb->>'inputPer1M')::float, 0) = 0
  AND COALESCE((c."sellPrice"::jsonb->>'outputPer1M')::float, 0) = 0
  AND COALESCE((c."sellPrice"::jsonb->>'perCall')::float, 0) = 0
  -- alias_status = 'disabled-alias-only'：仅关联到 disabled alias，没有任何 enabled alias 引用
  AND EXISTS (SELECT 1 FROM alias_model_links aml WHERE aml."modelId" = m.id)
  AND NOT EXISTS (
    SELECT 1 FROM alias_model_links aml
    JOIN model_aliases ma ON ma.id = aml."aliasId"
    WHERE aml."modelId" = m.id AND ma.enabled = true
  );
```

**写动作：** `prisma.channel.updateMany({ where: { id: { in: ids } }, data: { status: 'DISABLED' } })`。

**幂等：** 第二次跑时 status=DISABLED 已不在 SELECT 范围（`c.status='ACTIVE'` 过滤），0 affected 退出 0。

**安全特征：**
- 严格条件：必须 `c.status='ACTIVE'` AND `channel.sellPrice 三类全 0` AND `alias_status=disabled-alias-only` 三重满足才动
- 任何一条违反（如 channel 有 enabled alias / channel 已 DISABLED）→ 不动
- 用 transaction 包住 select + updateMany，一致性保证

### D2：sync-status 度量重定义

**保留旧字段（向后兼容）：**
- `zeroPriceActiveChannels`（数 channel.sellPrice 全 0 的 ACTIVE channel）— 维持现状

**新增字段：**
- `unpricedActiveAliases: number` — `model_aliases.enabled=true AND (sellPrice IS NULL OR sellPrice::text='{}')` 计数。**这才是真正反映用户面价格空白的指标。**
- `zeroPriceChannelsByAliasStatus: { enabledAliasPriced: number; enabledAliasUnpriced: number; disabledAliasOnly: number; noAlias: number }` — PHASE1 scan 的等效结构化分组

**新 SQL：**

```sql
-- unpricedActiveAliases
SELECT COUNT(*)::int FROM model_aliases
WHERE enabled = true
  AND (sellPrice IS NULL OR sellPrice::text = '{}');

-- zeroPriceChannelsByAliasStatus（4 行 GROUP BY result，整理为对象返回）
SELECT
  CASE ... END AS bucket,  -- 与 PHASE2 SQL 同款 CASE
  COUNT(*) AS count
FROM channels c
JOIN models m ON m.id = c."modelId"
WHERE c.status='ACTIVE' AND <三类零价>
GROUP BY bucket;
```

**响应 shape diff：**

```diff
GET /api/admin/sync-status (响应)
{
  data: {
    lastSyncTime, lastSyncResultDetail,
    zeroPriceActiveChannels,                   // 保留
+   unpricedActiveAliases,                     // 新（alias 层真度量）
+   zeroPriceChannelsByAliasStatus: {          // 新（4 类分布）
+     enabledAliasPriced, enabledAliasUnpriced,
+     disabledAliasOnly, noAlias,
+   },
    lastSyncAt, lastSyncDuration, lastSyncResult, lastInferenceResult
  }
}
```

**前端 admin/operations 页面（page.tsx）：**

- `SyncStatusResponse.data` 类型扩展（同步加 2 字段）
- 既有 zero-price warning chip（基于 zeroPriceActiveChannels）保留
- 新加一个 alias-level warning chip：当 `unpricedActiveAliases > 0` 时显示。文案 i18n key `unpricedAliasWarning`，含 `{ count }` 占位。zh-CN：`{count} 个已启用 alias 未设售价（用户面价格空白）` / en：`{count} enabled alias(es) without sellPrice (price field blank in /v1/models)`

注意：spec push 时生产 `unpricedActiveAliases` 预期为 0（PHASE1 scan SQL 中 `enabled-alias-UNPRICED=0`），所以新 chip 实际不会渲染，只作为防御信号。

### D3：scan 脚本扩展三维分组

**修改：** `scripts/maintenance/scan-zero-price-channels.ts`

- `aliasStatus` 字段加入每行 result（与 D2 SQL 同款 CASE）
- summary 表分组键从 `(provider, modality, anyEnabledAlias)` 升为 `(provider, modality, aliasStatus)`
- CSV header 同步更新

**保留兼容：** JSON full 输出仍含 `associated_aliases` 数组（旧消费方可继续用）；新增 `alias_status` 字段挨着。

### D4：执行顺序

| Feature | 顺序 | 独立 commit | 依赖 |
|---|---|---|---|
| F-SI2-01 软停脚本 | 1 | yes | 独立 |
| F-SI2-02 sync-status 度量 + UI chip | 2 | yes | 独立 |
| F-SI2-03 scan 扩展三维 | 3 | yes | 与 D2 SQL 共享 CASE 表达式（建议合一个 helper） |
| F-SI2-04 codex 验收 | 4 | — | 依赖 1-3 |

## 设计

### F-SI2-01：disable-orphan-zero-price-channels.ts（D1）

**文件：** `scripts/maintenance/disable-orphan-zero-price-channels.ts`（新建）

**Generator 实施步骤：**
1. 顶部 banner 注释：DRY_RUN 默认 + 严格三重条件 + 软停 + 幂等 + 退出 disconnect
2. SELECT 出 disabled-alias-only zero-price ACTIVE channel id（D1 SQL）
3. 输出 stdout：找到 N 条；按 (provider, modality) 分组列每条 channel id + model name
4. DRY_RUN=1 仅打印不写库；DRY_RUN 未设时 prompt"REAL APPLY (set DRY_RUN=1 to dry-run)"提示后跑 updateMany
5. updateMany 后输出"Disabled N channels (status=DISABLED)"
6. 单测：`scripts/maintenance/__tests__/disable-orphan-zero-price-channels.test.ts`（新增）— 通过纯函数 helper 拆分（buildDisableTargetIds(rows) 返回过滤后的 ids），单测覆盖 happy path + 边界（无目标 / 已 DISABLED / 有 enabled alias 不入选）

### F-SI2-02：sync-status 度量重定义 + UI（D2）

**文件：**
- `src/app/api/admin/sync-status/route.ts`（加 unpricedActiveAliases + zeroPriceChannelsByAliasStatus 计算 + 响应 shape）
- `src/app/(console)/admin/operations/page.tsx`（type SyncStatusResponse 扩展 + 新 warning chip）
- `messages/zh-CN.json` + `messages/en.json`（新 i18n key `unpricedAliasWarning`）
- `src/app/api/admin/sync-status/__tests__/route.test.ts`（如不存在则**仅扩展现有测试 mock 文件**或在 mock fixture 加 case，不新建 test file — 遵循铁律 3）

**Generator 实施步骤：**
1. 加 2 个 SQL 计数（与现有 zeroPriceCount 并列在 Promise.all 中）
2. 响应 shape 增加 unpricedActiveAliases 与 zeroPriceChannelsByAliasStatus 字段
3. 前端 SyncStatusResponse type 同步加字段
4. operations/page.tsx 在既有 zero-price warning 旁加 unpriced-alias warning chip
5. i18n 双语 key 加上
6. cache key `cache:admin:sync-status` TTL 30s 不动（新字段同步参与缓存）

### F-SI2-03：scan 脚本扩展三维（D3）

**文件：** `scripts/maintenance/scan-zero-price-channels.ts`（修改）+ `__tests__/scan-zero-price-channels.test.ts`（扩展）

**Generator 实施步骤：**
1. SQL 加 `alias_status` 字段（CASE 表达式与 D2 SQL 共享，可抽 SQL helper 或 raw string 常量复用）
2. summary 分组键升级
3. CSV header 同步
4. 单测扩展 `buildSummary` 的纯函数测试覆盖三维场景

### F-SI2-04：Codex 验收 + 签收报告

**Codex 跑：**
1. `bash scripts/test/codex-setup.sh` + `codex-wait.sh`
2. 代码层：grep 验证三个 feature 关键改动点
3. 单测：F-SI2-01/02/03 新增/扩展单测 PASS
4. 脚本验收（在 _scratch DB 模拟）：
   - 构造 fixture：3 个 zero-price ACTIVE channel，分别属于 disabled-alias-only / enabled-alias-priced / enabled-alias-UNPRICED
   - 跑 disable-orphan：DRY_RUN 列出 1 条（仅 disabled-alias-only），real apply 后该 channel status=DISABLED，其他 2 channel status 不变
   - 二次跑 disable-orphan：0 affected（幂等）
   - 跑 scan：summary 表含三维 alias_status 列
5. API 层：sync-status 返回新字段 + 新分组 shape 正确
6. UI 层（dev server）：admin/operations 新 chip 在 unpriced > 0 时渲染（用 fixture 注入）
7. **生产软验收（如可达）：** 用户跑 disable-orphan 软停 259 channel + 验证 sync-status 新字段；签收报告附上"PHASE2 部署后生产软停 channel 数 = 259"
8. `npx tsc --noEmit` / `npm run test` / `npm run build` 全 PASS
9. 输出 signoff 报告

## 数据模型 / 接口

无 Prisma schema 改动。

API 改动：

```diff
GET /api/admin/sync-status (响应)
{
  data: {
    ...
    zeroPriceActiveChannels,                   // 保留
+   unpricedActiveAliases,                     // 新
+   zeroPriceChannelsByAliasStatus: {          // 新
+     enabledAliasPriced, enabledAliasUnpriced,
+     disabledAliasOnly, noAlias,
+   },
    ...
  }
}
```

向后兼容：仅新增字段，旧消费方忽略即可。

## 风险与回滚

| 风险 | 缓解 |
|---|---|
| 软停脚本误伤（如某个 channel 实际关联 enabled alias 但 SQL 判定错） | 严格三重条件 + EXISTS/NOT EXISTS 双向查；DRY_RUN 默认；纯函数单测覆盖 |
| sync-status 缓存延迟 | 30s TTL 现状；admin 一刷即新（与 PHASE1 一致） |
| F-SI2-02 i18n key 漏添加导致 build fail | 中英双 key 同时加 + Codex 验收 build PASS |
| 软停后某 alias 重新启用 → 该 model 关联 channel 全 DISABLED → 路由 503 | 这是 by design：alias 启用时 BL-ALIAS-MODEL-CASCADE-ENABLE F-ACE-01 cascade 仅 cascade Model.enabled，不 cascade channel.status；启用 alias 时若 channel 全 DISABLED，admin UI 已显示"All Channels Failing"红徽章（F-ACE-03），admin 知情后再手工激活 channel |

**回滚：**
- F-SI2-01：`prisma.channel.updateMany({ where: { id: { in: <被软停的 ids> } }, data: { status: 'ACTIVE' } })`（脚本输出 stdout 时打印被软停的 ids 备份用）
- F-SI2-02 / F-SI2-03：git revert 单 commit，旧消费方无影响

## Planner 自检（铁律清单逐条 — 应用 v0.9.9 新增内部命名 grep 确认）

- [x] 铁律 1：file:line 引用充分（route.ts:50-56 / post-process.ts:636 / page.tsx:329 等）
- [x] **铁律 1（v0.9.9 内部命名 grep）：spec acceptance 引用的内部命名已 grep 确认存在：**
  - `prisma.channel.updateMany`（Prisma 标准 API，存在 ✓）
  - `disconnectRedis`（src/lib/redis 已导出 ✓）
  - `cache:admin:sync-status`（route.ts:7 已存在常量 ✓）
  - `unpricedAliasWarning` i18n key（**新增**，spec 已说明 Generator 新加，不算引用不存在）
- [x] 铁律 1.1：实现形式锁死 + 等价说明（i18n key 名 / 字段名 / SQL 表达式）
- [x] 铁律 1.2：证据来源限定 Generator 代码 + 单测 + dev DB fixture（无运维依赖）
- [x] 铁律 1.3：定量 acceptance 含零基线（生产现状 enabled-alias-UNPRICED=0；软停后 0 affected 也合法）
- [x] 铁律 1.4：sync-status 度量本身是周期任务（admin 刷页面），无后台 cron 改写
- [x] 铁律 1.5：grep 全仓反向消费已展开 — `zeroPriceActiveChannels` 仅 1 处消费（admin/operations:62/329/332），新字段不影响其他消费方
- [x] 铁律 1.6：调研类不适用
- [x] 铁律 1.7：无 cron T+N 时序口径
- [x] 铁律 1.8：UI 改动仅加 chip，复用 admin/operations 既有 warning chip 样式（参考 zero-price warning 的样式实现 — page.tsx:330-334），不超出现有组件能力
- [x] 铁律 2.1：admin API 协议层标明（HTTP 200 + JSON shape diff）
- [x] 铁律 3：所有单测通过扩展 helper / fixture 完成，未要求 Generator 新建 test file 塞 case
