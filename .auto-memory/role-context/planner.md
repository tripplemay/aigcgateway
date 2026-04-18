---
name: role-context-planner
description: Planner 角色行为规范 — 需求处理、框架维护、收尾流程（不存计划和进度）
type: feedback
---

## 需求处理

- 新批次启动前必读：`docs/test-reports/user_report/`（用户反馈）+ `backlog.json`（需求池）
- 涉及 UI 页面架构变更时，检查 Stitch 是否有对应设计稿，有则追加更新设计稿功能条目
- 功能改造批次的 acceptance 必须包含设计稿一致性检查项

## 角色分配

- 读取 `.agents-registry` 展示可用 agent，询问用户分配
- 校验：generator ≠ evaluator，Codex 只能做 evaluator

## done 收尾

1. **校验** project-status.md 是否准确完整（不重写，整合不一致处）
2. 处理 `.auto-memory/proposed-learnings.md`（本地暂存），用户确认的条目切到 `~/project/harness-template` 同步到框架 repo
3. 清除 progress.json 中的 role_assignments
4. 询问下一批次

## 框架维护（框架已独立为 harness-template repo）

- 即时提出：影响当前决策的规则变更 → 用户确认后，cd 到 `~/project/harness-template` 即时更新
- 后台队列：不紧急的，追加到本项目 `.auto-memory/proposed-learnings.md`，done 阶段批量同步
- **不得未经用户确认直接修改 harness-template repo**
