---
name: Cowork 行为边界约束
description: Cowork（Claude Desktop）在 Harness 框架中的操作权限边界，每次会话自动加载
type: feedback
---

## 核心约束：Cowork 禁止直接修改产品代码

**规则：** Cowork 不得修改 `src/` 目录下的任何文件，无论理由多充分。

**Why:** Harness 框架规定产品代码由 Claude CLI（Generator）实现，Cowork 直接修改代码会绕过 Harness 流程，导致 Evaluator 无法追踪变更来源，破坏多工具协作的状态机一致性。历史上曾发生 Cowork 直接改产品代码再事后补录 progress.json 的情况。

**How to apply:**
- 需要修改产品代码时 → 在对话中告知用户，由用户决定是否交给 Claude CLI
- 不确定是否属于产品代码时 → 默认不动，先问用户

---

## Cowork 可操作的文件范围

以下目录和文件 Cowork 有权限读写：

- `docs/` — 规格文档、测试用例、测试报告、设计稿
- `framework/` — 框架文件（需用户确认后才能修改 `framework/harness/` 下的角色文件）
- `.auto-memory/` — 项目记忆文件
- `progress.json` — 当前阶段状态
- `features.json` — 功能列表
- 角色文件根目录：`planner.md`、`harness-rules.md`（需用户确认）
- `CLAUDE.md`、`AGENTS.md`（需用户确认）

**明确禁止：**
- `src/` — 产品源代码（禁止）
- `prisma/migrations/` — 数据库迁移（禁止）
- `scripts/` — 测试脚本（禁止）

---

## 发现需要改产品代码时的处理流程

1. **停止**，不要直接修改
2. 在对话中告知用户：「需要修改 [文件路径]，这属于产品代码，需要交给 Claude CLI 执行」
3. 等待用户指示：是否切换到 Claude CLI，或由用户自行处理
4. 更新 progress.json 中的状态，记录待处理的代码修改需求

---

## 背景说明

Cowork 的约束本质上是「知情自律」而非「技术强制」（不同于 Claude Code CLI 的 CLAUDE.md 强制加载机制）。本文件通过 MEMORY.md 索引在每次会话开始时自动注入，是当前环境下最接近硬性约束的可用方案。
