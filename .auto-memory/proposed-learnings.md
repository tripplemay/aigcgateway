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

<!-- ================= 已同步到 harness-template（归档区） ================= -->

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
