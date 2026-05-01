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

## [2026-05-01] Generator (Generator-HPMT) — 来源：BL-HEALTH-PROBE-MIN-TOKENS F-HPMT-01

**类型：** 铁律补充（铁律 1.5 范围细化）

**内容：** Planner 铁律 1.5 "前置 grep 反向消费点" 应明确把搜索范围扩到整个项目代码（src/ + scripts/，且不限定单一子目录），否则跨模块同款字面量会被漏掉。本批次 spec 中 grep "max_tokens: 1" 仅限 src/lib/health/checker.ts，命中两处并据此定义 acceptance；但 src/lib/api/post-process.ts:216 writeProbeCallLog 的 requestParams 也硬编码同款字面量记录 audit log，spec 阶段未发现。Generator 修完后 wire 发 16 / audit log 仍写 1，纯审计漂移、不影响 probe 行为，但语义上是同一根因，理应同批解决。

**建议写入 harness-template 的：** `harness/planner.md` §铁律 1.5 — grep 命令示例改为 `grep -rn "<literal>" src/ scripts/` 全项目；自检 checklist 加 "已覆盖 src/ + scripts/，未限定单一子目录"。

**状态：** 待确认

<!-- ================= 已同步到 harness-template（归档区） ================= -->

## [2026-04-30 已同步 v0.9.6] Planner 铁律 1.5：枚举/字段扩展必须前置 grep 所有反向消费点
- 来源：BL-EMBEDDING-MVP fix-round-2（isImage 硬编码漏定义）
- 写入：`harness/planner.md` §铁律 1.5 + 自检 checklist

## [2026-04-30 已同步 v0.9.6] Planner 铁律 1.6：调研类 spec 假设必须枚举三类根因
- 来源：BL-RECON-FIX-PHASE2 F-RP-01（漏掉「单价错位」根因）
- 写入：`harness/planner.md` §铁律 1.6 + 自检 checklist

## [2026-04-30 已同步 v0.9.6] Planner 铁律 1.7：跨 cron 周期 acceptance 必须标注时序口径
- 来源：BL-RECON-FIX-PHASE2 F-RP-04 tc8（T+1 出账假设未对齐）
- 写入：`harness/planner.md` §铁律 1.7 + 自检 checklist

## [2026-04-30 已同步 v0.9.6] Planner 铁律 3：不得在 acceptance 中将测试编写任务塞给 Generator
- 来源：BL-RECON-UX-PHASE1 F-RC-01（角色边界冲突两难）
- 写入：`harness/planner.md` §铁律 3 + 自检 checklist

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

