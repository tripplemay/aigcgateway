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

## [2026-04-19] Generator — 来源：BL-FE-QUALITY fix round 5 F-FQ-03 #10

**类型：** 新坑（Next.js App Router 私有目录约定）

**内容：** Next.js App Router 约定：**任何以下划线（`_` 或 `__`）开头的目录/文件夹视为 private folder，不生成 route**。本次把内部测试 route 命名为 `src/app/(console)/__error-test` 看似可访问，实际 404，导致 Codex 验证 error.tsx zh-CN 文案连续多轮 FAIL。改名为 `error-test` 后 build 输出即出现在 route 列表。

**适用场景警示：** 测试性质、诊断性质、开发期内部的 route 命名**必须避开下划线前缀**。合法命名：`/error-test`、`/diag-foo`、`/devtools`；非法：`/__error-test`、`/_dev-only`、`/_test-a11y`。

**建议写入 harness-template 的：** `harness/generator.md` §前端相关经验 新增 "Next.js App Router 路由约定" 小节：

> Next.js App Router 目录命名约定：`_xxx`/`__xxx` 开头的目录视为 private folder，不生成 route；`(xxx)` 括号命名为 route group（不出现在 URL 中但仍生成 route）。开发期诊断/测试用途的 route 避开下划线前缀。

**状态：** 待确认

**状态：** 待确认

-->
