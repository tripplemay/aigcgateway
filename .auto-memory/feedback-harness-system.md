---
name: feedback-harness-system
description: Harness 七态状态机的使用规则，每次启动必须读 progress.json 和 .auto-memory/MEMORY.md
type: feedback
---

每次开始任务前，必须先读取 `progress.json` 判断当前阶段，再执行对应角色文件。同时读取 `.auto-memory/MEMORY.md` 及 `project-aigcgateway.md` 获取最新项目状态。

**Why:** Harness 是项目约定的开发流水线，跳过会导致重复工作或覆盖未完成的进度。`.auto-memory/` 是唯一记忆源，不读则基于过期信息执行。

**How to apply（七态状态机）：**

| status | 执行工具 | 角色 |
|---|---|---|
| `new` | Claude CLI | Planner：读 backlog，拆需求，写 spec |
| `planning` | Claude CLI | Planner：继续 planning（上次中断） |
| `building` | Claude CLI | Generator：按 features.json 实现 |
| `verifying` | Codex | Evaluator：首轮验收 |
| `fixing` | Claude CLI | Generator：根据 evaluator_feedback 修复 |
| `reverifying` | Codex | Evaluator：复验，写 signoff |
| `done` | Claude CLI | Planner：更新记忆 → 处理 proposed-learnings → 下一批 |

- 上下文窗口剩余不足 20% 时立即保存进度，结束会话
- 每完成一个功能立即更新 progress.json，不得跳过
