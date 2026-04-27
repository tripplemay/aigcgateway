---
name: proposed-learnings
description: 本项目运行中发现的值得沉淀到 Triad Workflow 框架的经验暂存（本地暂存，done 阶段批量同步到 harness-template repo）
type: project
---

# 本项目待沉淀到 Triad Workflow 的提案

> **定位：** 本文件是 aigcgateway 项目**本地**的 proposed-learnings 暂存区。
>
> **工作流：**
> 1. Generator / Evaluator / Planner 在批次运行中发现值得沉淀的经验时，追加到本文件
> 2. Planner 在 done 阶段读取本文件，逐条提交用户确认
> 3. 用户确认后，Planner **切换到 `~/project/harness-template` 目录**，将对应内容写入 framework 源码文件（如 `harness/planner.md`、`docs/XXX.md`、`CHANGELOG.md` 等），commit + push 到 harness-template repo
> 4. 完成同步的条目从本文件移除（或标记已同步）
>
> **注意：** framework 已独立为 `tripplemay/harness-template` repo（见 CLAUDE.md §Triad Workflow 规则）。本项目不再有 `framework/` 子目录，也不再通过 subtree push 同步。

---

<!-- 待确认的提案出现在此处，示例格式：

## [YYYY-MM-DD] [角色] — 来源：F-XXX

**类型：** 新规律 / 新坑 / 模板修订 / 铁律补充

**内容：** [一句话描述]

**建议写入 harness-template 的：** `harness/planner.md` / `docs/01-concepts.md` §经验教训 / 其他

**状态：** 待确认

-->

<!-- ================= 待确认区 ================= -->

## [2026-04-28] Planner — 来源：BL-RECON-FIX-PHASE2 F-RP-01 调研反转

**类型：** 模板修订（spec 设计 checklist）

**内容：** 调研类 spec 的假设列表应至少枚举三大类根因：(1) 数据缺失（gateway 没收到上游字段）/ (2) 数据正确但解释错（如单价错位 / 单位错位 / 货币错位）/ (3) 数据正确但消费方式错（如读了错的字段 / 聚合方式错）。本次 H1/H2/H3 三假设都聚焦「数据缺失」维度，漏掉了「单价错位」类根因（image-output token 实际单价 ~$30/M，远高于配置 $2.5/M completion 单价），Generator 走完调研才发现，多消耗一轮思考与一次真实 API 调用成本。

**建议写入 harness-template 的：** `harness/planner.md` § spec 设计经验，新增"调研类 feature 的假设枚举三类法"checklist。

**状态：** 待确认

---

## [2026-04-28] Planner — 来源：BL-RECON-FIX-PHASE2 F-RP-04 tc8 阻断

**类型：** 新坑 + 铁律补充

**内容：** 跨 cron 周期 / 上游 settlement 的 acceptance 必须明确 T+N 时序口径。本次 tc8「触发手动 rerun → 当日 model 行 status=MATCH」假设了 reconcile 在调用发生后当日立即可观察，但上游 OR billing API 当天数据未必已 settle（数据按 T+1 出账），导致同日 rowsWritten=11 但目标 model 行未出现，被迫向用户申请 T+1 口径放宽。涉及 cron / 上游账单 / 异步 settlement 的 acceptance，spec 写时就要标注「T+0 / T+1 / T+N」明确时序，避免 verifying 阶段才发现假设错误。

**建议写入 harness-template 的：** `harness/planner.md` § acceptance 设计 checklist 加一条「时序假设标注」；`harness/planner.md` 铁律 1.x 系列加一条「跨周期 acceptance 必须含时序口径」（编号待定）。

**状态：** 待确认

<!-- ================= 已同步到 harness-template（归档区） ================= -->


## [2026-04-26 已同步 v0.9.5] Planner 铁律 1.4：周期性后台任务对数据的覆写必须显式 + 回归保护
- 来源：BL-IMAGE-PRICING-OR-P2 mid-impl 裁决（buildCostPrice 回归）
- 写入：`harness/planner.md` §铁律 1.4 + 自检 checklist

## [2026-04-26 已同步 v0.9.5] Generator CLI 脚本退出前 close 所有外部连接
- 来源：BL-IMAGE-PRICING-OR-P2 fix_round 2 Path A #4（pricing CLI Redis hang）
- 写入：`harness/generator.md` §测试相关经验

## [2026-04-25 已同步 v0.9.4] Generator 单测 mock 层级 — 穿透多层转换类修复
- 来源：BL-IMAGE-PARSER-FIX fix round 1
- 写入：`harness/generator.md` §测试相关经验；`harness/evaluator.md` §4 评分标准（核查 mock 层级）

## [2026-04-25 已同步 v0.9.4] Planner 铁律 1.2：acceptance 证据来源限定
- 来源：BL-IMAGE-PARSER-FIX round 3 adjudication
- 写入：`harness/planner.md` §铁律 1.2 + 自检 checklist；`harness/evaluator.md` §4（运维依赖触发 adjudication）

## [2026-04-25 已同步 v0.9.4] Planner 铁律 1.3：定量 acceptance 零基线边界 + 证据组合满足
- 来源：BL-IMAGE-PARSER-FIX round 3 adjudication round 2
- 写入：`harness/planner.md` §铁律 1.3 + 自检 checklist

## [2026-04-20 已同步 v0.9.3] Next.js App Router 私有目录约定
- 来源：BL-FE-QUALITY fix round 5
- 写入：`harness/generator.md` §前端相关经验

## [2026-04-20 已同步 v0.9.3] Mid-Impl 裁决机制（fixing 阶段规格冲突）
- 来源：BL-SEC-POLISH Round 1
- 写入：`harness/pre-impl-adjudication.md` §10 附录

## [2026-04-20 已同步 v0.9.3] Planner 铁律 1.1：实现形式 vs 语义意图
- 来源：BL-FE-PERF-01 F-PF-02
- 写入：`harness/planner.md` §铁律 1.1

## [2026-04-20 已同步 v0.9.3] Planner 铁律自检规则
- 来源：BL-SEC-POLISH（铁律 2.1 反例第二次发生）
- 写入：`harness/planner.md` §铁律自检规则

## [2026-04-20 已同步 v0.9.3] dynamic import 模块边界
- 来源：BL-FE-PERF-01 F-PF-01
- 写入：`harness/generator.md` §前端相关经验

## [2026-04-27] Claude CLI — 来源：BL-RECON-UX-PHASE1 F-RC-01

**类型：** 铁律补充 / Planner-Generator 角色边界冲突

**内容：** 当前 `role-context/generator.md` 写「Generator 不写任何测试」，但本批次 spec/features.json acceptance 显式要求 Generator 写单测扩展（route.test.ts/export.test.ts/classify.test.ts 三处）。两处规则冲突，且 features.json 是上一会话同一 agent (我作 Planner) 写下的——Planner 自己埋了违反角色边界的 acceptance。

实现时不得不做的妥协：
1) 既有测试 mock 不全（route.test.ts 没 mock count；reconcile-job.test.ts 没 mock @/lib/config），新代码必然 break，必须扩 mocks（已经踩进"测试域"）
2) F-RC-03 Codex acceptance 只列 vitest run pass，没列写测试——若 Generator 不写，新功能就没单测覆盖

实际处理：按 spec 写完整测试。

**建议写入 harness-template 的：** `harness/planner.md` §铁律 — 写 acceptance 时不得越界把测试编写任务塞给 Generator。如果新功能确需单测，要么 (a) 拆出 `executor:codex` 子任务由 Codex 写，要么 (b) 在 features.json 显式标注「测试 mock 维护例外，Generator 仅扩展 mock 不新写 cases」。

**状态：** 待确认
