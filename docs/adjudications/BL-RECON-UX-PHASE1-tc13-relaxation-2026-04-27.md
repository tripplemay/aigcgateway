# 裁决记录 — BL-RECON-UX-PHASE1 tc13 验收放宽

**裁决方：** Planner（Kimi）
**用户决策：** 同意放宽（2026-04-27）
**批次：** BL-RECON-UX-PHASE1
**阶段：** fixing（fix_rounds 0 → 1）
**状态：** `approved`，进入 fixing

---

## 背景

Codex F-RC-03 验收 15/16 通过，tc13 阻断：

- **原 tc13 acceptance**：阈值改 `MATCH |Δ|<` 至 `0.1` 保存 → 手动重跑昨日 → 部分原 MATCH 行变 MINOR_DIFF
- **失败现象**：rerun 返回 200 但 `rowsWritten=0`、`bigDiffs=0`，MATCH 总量不变（12022）
- **失败报告**：`docs/test-reports/BL-RECON-UX-PHASE1-verification-failed-2026-04-27.md`
- **失败证据**：`docs/test-reports/artifacts/bl-recon-ux-phase1-2026-04-27-codex-verifying/recheck-11-13.json` + `codex-setup.log`

## 失败本质

reconcile-job Tier 1/2 fetcher 需要真实上游 billing API 凭证（volcengine / openrouter / chatanywhere / deepseek / siliconflow / openrouter credits）。本地 codex-env.sh 不带这些 → 全部 fetcher skip provider → 无新 BillReconciliation 行写入 → 阈值变更无可观察对象。

**这不是代码 bug，是测试环境与产品边界的天然冲突。** reconcile-job 设计就是依赖外部 billing API 的 daily cron job，无凭证 = 不出新数据是预期行为。

## 已有机制证据（部分覆盖原 tc13 意图）

`F-RC-01` 单测已证：

- `classifyStatus(delta, dp, customThresholds)` 在不同阈值下输出不同 status（边界用例 + 默认参数回归保护）
- `loadThresholds()` 从 SystemConfig 读 4 个 keys（`getConfigNumber` 行为已被项目其他 config 覆盖）

**唯一未验证环节：** `runReconciliation` 入口确实 `await loadThresholds()` 并把结果 thread 到 2 处 classifyStatus 调用 — 这是 wiring 问题。

## 放宽决策

### 新 tc13 acceptance（替代原文本）

> tc13（mock-based wiring 验证）：补一个集成测试 `src/lib/billing-audit/__tests__/runReconciliation-thresholds.test.ts`，mock 一个 Tier 1 fake fetcher 返回 synthetic upstream bill（固定 delta 跨阈值边界），调 `runReconciliation(date)` 跑完，断言写入的 `BillReconciliation` 行 `status` 字段在 SystemConfig 阈值切换前后取不同值（MATCH vs MINOR_DIFF 二值差异）。零基线 = 同一 delta 在阈值 A 下 status=A'，阈值 B 下 status=B'，A'≠B'。
>
> **生产观测后置**：deploy 后首次 cron 或带凭证的手动 rerun 在 SystemLog / 面板观察分类变化，作为事后核对（不阻塞 done）。

### 与铁律对照

| 铁律 | 检查 |
|---|---|
| 1.1 实现形式 vs 语义意图 | 原 tc13 「部分原 MATCH 变 MINOR_DIFF」语义意图 = 「阈值生效」。机制证明 + 生产观测达成同一意图 ✓ |
| 1.2 acceptance 证据来源限定 | 新证据来源是 codebase 内可控的集成测试 + 单测，符合 ✓ |
| 1.3 定量 acceptance 零基线边界 | 二值差异（MATCH vs MINOR_DIFF）有明确零基线 ✓ |
| 1.4 周期性后台任务覆写显式 | 阈值变更不溯及历史已在 spec § Risks 标注 ✓ |

## 执行计划

### Generator fix_round 1 任务

**新建文件：** `src/lib/billing-audit/__tests__/runReconciliation-thresholds.test.ts`

**核心断言流程：**

1. **Setup**：mock 1 个 Tier 1 fake fetcher（注入到 `runReconciliation` 调用路径，最简单方式是新增 `runReconciliation` 的 `__test_fetcher_factory_override` 参数或抽 `tier1FetcherFor` 为可注入；推荐 dependency injection 形式，避免 monkey-patch）
2. **Synthetic data**：fake fetcher 返回 `{ providerId, modelName: "test-model", upstreamAmount: 0.3 }`，gateway aggregate 通过 mock prisma callLogs 让 `gatewayAmount = 0` → `delta = -0.3`，`deltaPercent = null`（upstream 无法 normalize）
3. **Test case A（默认阈值 0.5）**：`runReconciliation(date)` → 查 BillReconciliation row → `status === 'MATCH'`（`|0.3| < 0.5`）
4. **Test case B（紧阈值 0.1）**：先 `prisma.systemConfig.upsert RECONCILIATION_MATCH_DELTA_USD = 0.1` → 重跑 → `status === 'MINOR_DIFF'`（`|0.3| > 0.1` 且 `|0.3| < 5`）
5. **断言：** A 与 B 的 status 字段不同 → wiring 完整证据

**实现注意：**

- 优先方式：reconcile-job 已有 `tier1FetcherFor(p)` factory，可加一个 optional 第二参数 `overrides?: Map<string, TierOneBillFetcher>`（只在测试时传）。这是最小侵入式改造
- 备选方式：vitest module mock `vi.mock('@/lib/billing-audit/fetchers/volcengine', ...)` 等
- 测试用 `describe.sequential` 防并发污染 SystemConfig
- afterEach 清理：删除测试 provider + BillReconciliation 行 + reset SystemConfig

### Generator 工作量

≈ 1 hour（测试代码 + 必要的可注入改造）。

### Codex fix_round 1 验收

- 跑新单测 → PASS（必须）
- 重跑原 15 项 PASS 项保持 PASS（回归保护）
- 写 fix_round 1 signoff 报告 `docs/test-reports/BL-RECON-UX-PHASE1-fix-round-1-signoff-2026-04-2X.md`，引用本裁决文档

### 生产部署后

`.auto-memory/project-status.md` 加一条「待生产观察」备忘：deploy 后第一次 cron（次日 04:30 UTC）或手动 rerun 时，admin 在 `/admin/reconciliation` 面板观察分类变化是否符合预期；不符合则开 hotfix。

## 影响范围

- `docs/specs/BL-RECON-UX-PHASE1-spec.md` § F-RC-03 第 13 项更新
- `features.json` F-RC-03 acceptance 文本更新（仅 tc13 部分）
- `progress.json`：fix_rounds 0 → 1，evaluator_feedback 清空，generator_handoff 改为 fix_round 1 任务
- 代码改动：1 新单测文件 + reconcile-job 可注入 tier1FetcherFor（如选择此实现）

## 决策追溯

- 用户在 2026-04-27 对话中明确同意放宽
- Planner 给出 3 选项：(a) mock 集成测 + 生产观测；(b) staging；(c) 直接生产观察 done
- 用户选 (a)
- 本文档作为放宽决策的 audit trail
