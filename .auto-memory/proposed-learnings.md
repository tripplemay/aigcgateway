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

## [2026-04-21] Planner + Generator — 来源：BL-IMAGE-PARSER-FIX fix round 1

**类型：** 新坑（测试 mock 层级）

**内容：** 当修复涉及多层调用链时（如 parser 读某字段 → 中间某层 normalize 会剥该字段），Generator 的单测若在"中间层"之上做 mock（override 中间层方法直接返回已组装好的对象），会掩盖中间层的副作用（剥字段、重组），导致测试绿但生产红。本次 F-IPF-02 的 6 条单测 override `chatCompletions` 返回含 images 的假响应，绕过了真实的 `normalizeChatResponse` 会剥 `images` 字段的 bug，单测全绿但生产部署后 100% 失败。

**具体规则建议：** Generator 单测涉及"修改响应字段处理逻辑"或"穿透多层转换"的修复时，至少有 1 条单测从**最外层边界**（HTTP 层 / `global.fetch` / `fetchWithProxy`）mock，让中间所有层级真实执行，验证字段能完整穿透。

**建议写入 harness-template 的：** `harness/generator.md` §测试设计 新增规则；可能也写入 `harness/evaluator.md` §代码审查要求 评估员须核对 mock 层级

**状态：** 待确认

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
