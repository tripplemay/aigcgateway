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

## [2026-04-19] Planner+Generator — 来源：BL-SEC-POLISH Round 1 裁决

**类型：** harness 流程补充（Generator 裁决申请机制）

**内容：** Generator 在 fixing 阶段发现 spec acceptance 条款与以下任一冲突时，应落盘 `docs/adjudications/<批次名>-adjudication-request-<日期>.md`：
(a) 同一 spec 内背景 / 风险分析 / 设计决策
(b) 协议规范 / 语言标准
(c) Planner session_notes 设计目标

Planner 读取后裁决（修订 spec 或指示回退实现），Generator 不自主回退或坚持。本次 BL-SEC-POLISH 首次应用此流程，模板文件可作为事实标准。

**背景事件：** BL-SEC-POLISH acceptance #1 "<50ms" 与 H-7 抗时序意图冲突；#14 "HTTP 429" 违反 MCP 协议标准。Generator 不自主决定，落盘裁决申请，Planner 裁决为修订 spec（而非回退实现）。

**Planner 自省：** 本次 #14 是**我已采纳的铁律 2.1（协议返回形式标明协议层）**的反例第二发生——铁律已写下但 spec 编写时未自觉应用。教训：Planner 写 acceptance 时应**逐条对照已采纳铁律清单自检**，不是有规则就够，要真的用。

**建议写入 harness-template 的：**
- `harness/harness-rules.md` 新增 "§Generator 裁决申请" 小节（参考 adjudication request 模板结构）
- `harness/planner.md` "Planner 铁律" 后新增一条 "自检规则"：写完 acceptance 后对照已采纳铁律清单逐条核查，特别关注形式/意图分离（铁律 1.1）和协议层标注（铁律 2.1）

**状态：** 待确认

---

## [2026-04-19] Generator — 来源：BL-FE-QUALITY fix round 5 F-FQ-03 #10

**类型：** 新坑（Next.js App Router 私有目录约定）

**内容：** Next.js App Router 约定：**任何以下划线（`_` 或 `__`）开头的目录/文件夹视为 private folder，不生成 route**。本次把内部测试 route 命名为 `src/app/(console)/__error-test` 看似可访问，实际 404，导致 Codex 验证 error.tsx zh-CN 文案连续多轮 FAIL。改名为 `error-test` 后 build 输出即出现在 route 列表。

**适用场景警示：** 测试性质、诊断性质、开发期内部的 route 命名**必须避开下划线前缀**。合法命名：`/error-test`、`/diag-foo`、`/devtools`；非法：`/__error-test`、`/_dev-only`、`/_test-a11y`。

**建议写入 harness-template 的：** `harness/generator.md` §前端相关经验 新增 "Next.js App Router 路由约定" 小节：

> Next.js App Router 目录命名约定：`_xxx`/`__xxx` 开头的目录视为 private folder，不生成 route；`(xxx)` 括号命名为 route group（不出现在 URL 中但仍生成 route）。开发期诊断/测试用途的 route 避开下划线前缀。

**状态：** 待确认

**状态：** 待确认

-->
