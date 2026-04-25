# Mid-Impl 裁决：BL-IMAGE-PRICING-OR-P2 — buildCostPrice 回归

**日期：** 2026-04-25
**触发阶段：** verifying（Generator 已完成 F-BIPOR-01~03，Codex 即将验收）
**触发人：** Planner
**用户决策：** 路径 X（OR-P2 当前批次内 spec 修订 + 加 F-BIPOR-04 修 buildCostPrice + 复验）
**关联 spec：** `docs/specs/BL-IMAGE-PRICING-OR-P2-spec.md`

## 1. 触发场景

Planner 在 OR-P2 verifying 阶段调研生产 image log 显示 bug（用户报告"日志前端显示不正常"）时，附带发现：

**生产现象：** 30 条 P1 F-BAX-08 已 apply 的 image channel `costPrice.perCall` 全部回 0（生产 SSH 直查 raw JSON 确认）；同时 `sellPrice` 仍保留正确（0.0444 / 0.0504 / 0.0343 等）。所有 image channel `updatedAt` 集中在 2026-04-25 04:00:18 ~ 04:01:16。

**时段证据：** `system_logs` 04:00 前后大量 HEALTH_CHECK / AUTO_RECOVERY / BILLING_AUDIT；`call_logs` source='sync' 4 条出现在 03:30-04:30。

## 2. 根因（已实证）

`src/lib/sync/model-sync.ts:100-109`：

```ts
function buildCostPrice(model: SyncedModel) {
  if (model.modality === "IMAGE") {
    return { perCall: 0, unit: "call" };
  }
  return {
    inputPer1M: model.inputPricePerM ?? 0,
    outputPer1M: model.outputPricePerM ?? 0,
    unit: "token",
  };
}
```

第 270 行调用 `buildCostPrice(remote)`；第 275 行 `prisma.channel.update({ data: { costPrice } })` 强制覆盖。

**链路：** 每日 model-sync 跑（约 04:00 UTC）→ 遍历所有 channel → IMAGE 走 `{perCall:0}` 分支 → UPDATE → P1 F-BAX-08 / 任何后续 apply 全部归零。**只覆盖 costPrice，不动 sellPrice**（line 275 仅 set 一个字段），解释了 sellPrice 保留正确。

## 3. 与 OR-P2 acceptance 的冲突

OR-P2 F-BIPOR-01 acceptance 第 4 项：

> "UPDATE 后 costPrice={unit:'token',inputPer1M:X,outputPer1M:Y}"

**冲突：** Generator apply 完毕后，**下次 model-sync 必将所有 6 条 OR IMAGE channel costPrice 改回 `{perCall:0,unit:'call'}`**（IMAGE modality 走硬编码分支）。Codex 验收 #5/#6/#10 即使当前 PASS，下一轮 sync 后再核 → 必 FAIL。

这构成 **acceptance 与现有代码行为冲突**（pre-impl-adjudication.md §10 mid-impl 触发条件）。

## 4. 用户拍板的处理路径（X）

**选项对比（Planner 提出）：**

| 路径 | 说明 | 用户选择 |
|---|---|---|
| X | 当前 OR-P2 mid-impl adjudication，加 F-BIPOR-04 修 buildCostPrice + 重跑验收 | ✅ |
| Y | OR-P2 按现 spec 验收完毕，新建 hotfix 批次 BL-MODELSYNC-IMAGE-FIX | ✗ |
| Z | 用户立刻干预 OR-P2 当前流程，pause Codex 验收 | ✗（路径 X 已隐含此动作）|

**理由（路径 X 优势）：**
- 一次性根治：避免 OR-P2 验收 PASS 后下批次又因同一根因复发
- 闭环保护：通过新增验收 #13（model-sync 跑后 costPrice 保持）锁死回归边界
- 工时影响小：仅增 0.2d，OR-P2 总工时从 0.5 → 0.7

## 5. 修订内容（已应用）

### 5.1 spec 修订
- `docs/specs/BL-IMAGE-PRICING-OR-P2-spec.md` 顶部加裁决标注
- 新增 §3.4 F-BIPOR-04（model-sync buildCostPrice 修复，方案 R1）
- 原 §3.4 Codex 验收 → §3.5 F-BIPOR-05
- §3.5 验收清单新增 #13 model-sync 后回归保护 + #14 signoff

### 5.2 features.json 修订
- 新增 F-BIPOR-04（generator, status=pending, critical），acceptance 锁定 R1 方案 + 单测 ≥ 3 条
- 原 F-BIPOR-04（codex 12 项）→ F-BIPOR-05，13 项验收（新增 model-sync 回归保护）
- F-BIPOR-01/02/03 保留 status=completed
- total_features 4→5，completed_features 维持 3

### 5.3 progress.json 修订
- status=verifying → fixing（fix_round 1 由 Generator 接手 F-BIPOR-04）
- fix_rounds 0→1
- evaluator_feedback 加 BLOCKED issue：F-BIPOR-01 acceptance 因 model-sync.buildCostPrice 回归无法持久化，依赖 F-BIPOR-04 修复
- generator_handoff 指向 F-BIPOR-04

## 6. 修复方案 R1（最小改动）

**核心：** sync 时 IMAGE channel 跳过 costPrice 字段写入，保留运营手设值。

**关键改动点：**

1. `buildCostPrice(model)` 改为返回 `null | { ... }`：IMAGE → `null`
2. 调用处第 270-280 行：若 `costPrice === null` 则从 update `data` 中省略此字段
3. createMany 路径（新建 channel）：保持原行为 `{perCall:0,unit:"call"}` 默认 —— 新 IMAGE channel 在 admin UI / SQL apply 中由运营填正确值；F-BIPOR-02 的 DB trigger 在 UPDATE 时拦截全 0，新建瞬间允许（避免阻塞 sync 流）

**效果：** 对存量 IMAGE channel，sync 不再覆盖；对新增 IMAGE channel，默认 0 但靠 admin UI / 后端 PATCH 校验阻止持久化错误价。

## 7. 验收新增项（F-BIPOR-05 #13）

> 手动触发 model-sync 一次（POST /api/admin/run-inference 或等 daily sync）→ 重查 6 条 OR + 30 条 P1 image channel costPrice：所有非零字段（perCall>0 或 token.input/outputPer1M>0）保持，**不被 sync 冲回 0**。

## 8. 风险与确认

- ✅ 不涉及向后兼容（model-sync 是内部任务）
- ✅ 不需 migration（仅 TS 代码改动）
- ✅ 单测可在 unit + integration 层覆盖
- ⚠️ 生产实战需手动 trigger sync 一次 + diff 全 image channel costPrice 验证（验收 #13）

## 9. 后续

OR-P2 done 后，新批次 **BL-IMAGE-LOG-DISPLAY-FIX**（C 方案）启动：base64 转存对象存储 + 前端图片预览。已写入 `backlog.json`。
