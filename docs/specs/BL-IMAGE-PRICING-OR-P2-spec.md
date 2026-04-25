# BL-IMAGE-PRICING-OR-P2 Spec

**批次：** BL-IMAGE-PRICING-OR-P2（OpenRouter 6 条 token-priced image channel 定价 + DB 触发器约束 + model-sync buildCostPrice 回归修复）
**创建：** 2026-04-25
**工时：** 0.5 day → **修订 0.7 day**（含 mid-impl 裁决新增 F-BIPOR-04）
**优先级：** medium → **critical**（裁决后升级，回归阻塞 P1/P2 全部 image 计费）
**前置：** BL-BILLING-AUDIT-EXT-P1 / P2 已 done

**【2026-04-25 mid-impl 裁决修订】** Planner 在 verifying 前发现 `src/lib/sync/model-sync.ts:100-109 buildCostPrice` 对 IMAGE modality 硬编码返回 `{perCall:0,unit:'call'}`，每日 model-sync 自动覆盖所有 IMAGE channel.costPrice，使 OR-P2 F-BIPOR-01 apply 后下次 sync 必失效。生产已观测：2026-04-25 04:00 channel.updatedAt 集中爆发，channel.costPrice 全回 0（P1 F-BAX-08 apply 完已被冲掉）。详见 `docs/adjudications/2026-04-25-or-p2-buildcostprice-regression.md`。

**裁决处理：** 新增 F-BIPOR-04（generator，修 buildCostPrice）；原 F-BIPOR-04 codex 验收 → F-BIPOR-05；验收清单新增 #13（model-sync 跑后 channel.costPrice 保持）。

## 1. 背景

P1 F-BAX-08 系统性修正 image channel 定价时，6 条 OpenRouter image channel 因按 **token 计价**（非 per-call）延后到本批次独立处理。此外，P1 仅在应用层（前端 Zod + 后端 PATCH 400）做 IMAGE channel 必填校验，缺少 DB 层兜底 —— 本批次补 DB 层 trigger 约束。

## 2. 决策

| 项 | 决策 |
|---|---|
| 货币口径 | 沿用 P1 1A：USD 统一 |
| 加成 | 沿用 P1：sellPrice = costPrice × 1.2 |
| 数据源 | OpenRouter `/api/v1/models` 实时返回的 prompt + completion token 定价（canonical）|
| DB 约束 | 用 PL/pgSQL trigger（CHECK 不支持跨表 JOIN modality）|
| 历史 call_logs | 不回填（沿用 P1 口径）|

## 3. 目标

### 3.1 6 条 OR channel 定价（F-BIPOR-01）

| # | channelId | model | inputPer1M (USD) | outputPer1M (USD) |
|---|---|---|---|---|
| 1 | cmnpqumpb008zbnxc2t47ollt | google/gemini-2.5-flash-image | 0.30 | 2.50 |
| 2 | cmnpqumjc006wbnxceftbpqv3 | google/gemini-3-pro-image-preview | 2.00 | 12.00 |
| 3 | cmnpqum5m002bbnxcr4b4v3ew | google/gemini-3.1-flash-image-preview | 0.50 | 3.00 |
| 4 | cmnpqumo4008kbnxck2puju4i | openai/gpt-5-image | 10.00 | 10.00 |
| 5 | cmnpqumn40088bnxcn4z62t2x | openai/gpt-5-image-mini | 2.50 | 2.00 |
| 6 | cmo9iyi2w0buxbnvxe4c1aaqt | openai/gpt-5.4-image-2 | 8.00 | 15.00 |

**costPrice 格式：** `{ unit: "token", inputPer1M: X, outputPer1M: Y }`
**sellPrice 格式：** `{ unit: "token", inputPer1M: X×1.2, outputPer1M: Y×1.2 }`

**脚本：** `scripts/pricing/fix-or-image-channels-2026-04-25.ts`
- 默认 dry-run + `--apply` 开关 + 幂等重放
- 输出 diff 日志到 `docs/test-reports/artifacts/bl-image-pricing-or-p2-2026-04-25/pricing-or-migration.log`
- Generator 执行前先 `curl https://openrouter.ai/api/v1/models | jq` 复核当前定价（若 >±10% 偏差，push hold 让 Planner 重核）

### 3.2 DB trigger 约束（F-BIPOR-02）

**Migration：** `20260425_image_channel_pricing_trigger`

```sql
CREATE OR REPLACE FUNCTION validate_image_channel_pricing()
RETURNS TRIGGER AS $$
DECLARE
  v_modality TEXT;
BEGIN
  SELECT modality::text INTO v_modality FROM models WHERE id = NEW."modelId";
  IF v_modality = 'IMAGE' THEN
    IF NOT (
      (NEW."costPrice"->>'unit' = 'call' AND (NEW."costPrice"->>'perCall')::numeric > 0)
      OR (NEW."costPrice"->>'unit' = 'token' AND
          (COALESCE((NEW."costPrice"->>'inputPer1M')::numeric, 0) > 0
           OR COALESCE((NEW."costPrice"->>'outputPer1M')::numeric, 0) > 0))
    ) THEN
      RAISE EXCEPTION 'IMAGE channel costPrice must have call.perCall>0 OR token.inputPer1M>0 OR token.outputPer1M>0 (channelId=%, modelId=%)', NEW.id, NEW."modelId"
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_image_channel_pricing
BEFORE INSERT OR UPDATE OF "costPrice", "modelId" ON channels
FOR EACH ROW EXECUTE FUNCTION validate_image_channel_pricing();
```

**触发条件：** INSERT 任意 channel 或 UPDATE channels.costPrice / modelId 时触发；只校验当前 channel 关联 model 为 IMAGE 的情况。

**回退：** Migration 提供 down 操作 `DROP TRIGGER IF EXISTS ... + DROP FUNCTION IF EXISTS ...`。

### 3.3 单测 + smoke（F-BIPOR-03）

**单测（≥ 5 条）：**

1. dry-run 输出 6 条 channel diff（脚本测试）
2. 幂等重放输出 "no change"
3. token 计价反算：mock OR /chat/completions 返回 `{usage: {prompt_tokens: 1000, completion_tokens: 500}}` → `processChatResult` 写 call_log → `call_log.costPrice = (1000/1e6 × inputPer1M) + (500/1e6 × outputPer1M)`，浮点 ±1e-6 容差
4. 反例：token 计价但 costPrice 未配置 → 写 system_log WARN + cost=0
5. trigger 校验：直接 SQL `INSERT INTO channels (..., costPrice='{"unit":"call","perCall":0}', modelId=<IMAGE>)` → exception；UPDATE 同样

**生产 smoke（在 verify 阶段）：** 调用 `google/gemini-2.5-flash-image`（最便宜）一次 → 查 `call_logs` 对应 traceId → `costPrice > 0` + 数值 = `(prompt_tokens × 0.30 + completion_tokens × 2.50) / 1e6`。

### 3.4 model-sync buildCostPrice 修复（F-BIPOR-04）【2026-04-25 裁决新增】

**根因（实证）：** `src/lib/sync/model-sync.ts:100-109`：

```ts
function buildCostPrice(model: SyncedModel) {
  if (model.modality === "IMAGE") {
    return { perCall: 0, unit: "call" };  // 永远返回 0
  }
  ...
}
```

第 275 行调用 `prisma.channel.update({ data: { costPrice: ... } })` 强制覆盖。每次 sync 跑后，运营手设/批量脚本 apply 的 IMAGE channel costPrice 全部归零。

**修复方案（R1，最小改动）：** sync 时 IMAGE channel 跳过 costPrice 写入，保留运营手设值；其他字段（status / realModelId 等）仍可正常更新。

**实现要点：**
1. `buildCostPrice(model)` 返回 `null` 当 `model.modality === "IMAGE"`，调用方据此跳过 costPrice 字段
2. 第 273-280 行 update 路径：构造 `updateData` 时若 `costPrice === null` 则不加入 `data`
3. 第 282-290 行 createMany 路径：新建 IMAGE channel 默认 `costPrice = {perCall:0,unit:"call"}`（与现状兼容，靠 F-BIPOR-02 trigger 阻止后续 0 值持久化 —— 但创建瞬间是允许的，需运营在 admin 后立即填值）
4. 单测 ≥ 3 条：(a) sync 一个已存在 IMAGE channel 且 channel.costPrice 已是非零 → sync 后 channel.costPrice 不变；(b) sync 一个 TEXT channel → costPrice 按 token 公式更新；(c) sync 创建新 IMAGE channel → 默认 `{perCall:0}` 但允许（创建瞬间）
5. tsc + build 通过

**生产 smoke：** apply F-BIPOR-04 修复 + F-BIPOR-01 6 条 OR UPDATE → **手动触发** model-sync（POST /api/admin/sync-models 或等下一轮 sync）→ 重新 SELECT 6 条 OR + 30 条 P1 image channel costPrice 仍保持非零（不被 sync 冲掉）。

### 3.5 Codex 验收（F-BIPOR-05）

构建（4）：
1. `npm run build` 通过
2. `npx tsc --noEmit` 通过
3. `npx vitest run` 全过（新增 ≥ 5 条 P2 单测 + 历史不破坏）
4. Migration `20260425_image_channel_pricing_trigger` 生产 dry-run 通过

数据正确性（5）：
5. 生产执行 `npx tsx scripts/pricing/fix-or-image-channels-2026-04-25.ts --apply` 退出 0
6. 生产 DB 抽查 6 条 OR channel：costPrice.unit=token + inputPer1M+outputPer1M 与 spec § 3.1 表一致
7. 抽查 sellPrice / costPrice 比值 1.19-1.21（浮点容差）
8. 重跑脚本输出 "no change"（幂等）
9. 生产 trigger 反例测试：`UPDATE channels SET costPrice='{"unit":"call","perCall":0}' WHERE id=<IMAGE channel>` → SQL 报 check_violation；TEXT channel 同样改 → 通过（仅 IMAGE 约束）

生产 smoke（2）：
10. 触发 `google/gemini-2.5-flash-image` 一次 image 调用 → call_logs.costPrice > 0 且数值匹配 token 反算公式
11. 生产 image channel 查询：`SELECT id, costPrice FROM channels WHERE modelId IN (image_models)` → 全部 perCall>0 OR token.input/outputPer1M>0（无遗漏）

回归保护（1，裁决新增）：
13. **手动触发 model-sync 一次（POST /api/admin/sync-models 或等 daily sync）**→ 重查 6 条 OR + 30 条 P1 image channel costPrice：所有非零字段（perCall>0 或 token.input/outputPer1M>0）保持，**不被 sync 冲回 0**。这是路径 X 的关键回归保护。

报告（1）：
14. 生成 signoff `docs/test-reports/BL-IMAGE-PRICING-OR-P2-signoff-2026-04-2X.md`

## 4. Non-Goals

- 不修复 P1 保守填的 gpt-image-2 / gpt-image-2-ca（无新数据，沿用保守值）
- 不改 P1 已落地代码路径
- 不做历史 call_logs 回填

## 5. 风险

| 风险 | 应对 |
|---|---|
| OR 实时定价已变 | 脚本 apply 前 Generator 必须 curl /api/v1/models 复核 |
| trigger 性能开销 | INSERT/UPDATE 仅触发模型 SELECT 一次，可忽略；如出现热点可改为延迟校验 |
| 历史 IMAGE channel 已有 cost=0 行卡 trigger | 本次只 UPDATE 6 条 OR + 加 trigger；现存 call/token 都 0 的 IMAGE channel 已在 P1 全部修；新 IMAGE channel 创建受 trigger 保护 |

## 6. 应用框架自检（v0.9.4）

- ✅ 铁律 1：所有 channelId / model 表均已 SSH 生产 + Read schema 核实
- ✅ 铁律 1.1：spec 用 `unit:"token"` + 字段名形式描述，acceptance 不锁死实现细节
- ✅ 铁律 1.2：所有验收均基于 DB / call_logs / 脚本输出，不依赖运维（无 pm2 / cron / GCP）
- ✅ 铁律 1.3：定量阈值 1.19-1.21 已显式，浮点 ±1e-6 容差已声明
- ✅ 铁律 2：OR pricing 来自 OR `/api/v1/models` canonical
- ✅ 铁律 2.1：trigger 错误用 `check_violation` SQLSTATE 标明协议层
