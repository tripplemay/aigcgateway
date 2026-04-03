---
name: feedback-harness-system
description: Harness 三阶段状态机的使用规则，每次启动必须读 progress.json
type: feedback
---

每次开始开发任务前，必须先读取 `progress.json` 判断当前阶段，再执行对应角色文件。

**Why:** Harness 是项目约定的开发流水线，跳过会导致重复工作或覆盖未完成的进度。

**How to apply:**
- status = "new" → Planner，执行 planner.md
- status = "planning" → Generator，执行 generator.md
- status = "building" → Evaluator，执行 evaluator.md
- status = "reviewing" → Generator，根据 evaluator_feedback 修复
- status = "done" → 报告完成
- 上下文窗口剩余不足 20% 时立即保存进度，结束会话
- 每完成一个功能立即更新 progress.json，不得跳过
