---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-EMBEDDING-MVP：`reverifying`** (fix_rounds=3，commit 2a251a2 / 16e45f9)
- 5 连击 regression 修复确认：03:00 hour 单 channel avg 1.00 row（vs 02:00 hour 1.28-1.86），完全回到预期
- 真因：H4 单进程内 setInterval re-entrancy（fire-and-forget 不 await，跑超 60s 时下一 tick 并发）— 重入 guard 修了；H1 排除（诊断 log 显示 elapsed 真实合理）
- bge-m3 channel SQL 解锁 ACTIVE（同 fix-round-2 流程）；SiliconFlow 已充值，直连 PASS
- F-EM-06 14 项 reverify 等 Codex（admin key 需 codex-admin 重创）

## fix-round 全程
- fix-round-1 (0aed054)：scripts/seed-embedding-models.ts 抽离独立脚本；prod 跑 → /v1/models?modality=embedding 返 2
- fix-round-2 (2f05db8)：health probe EMBEDDING modality branch；checker.ts/scheduler.ts isImage→isProbableModality
- fix-round-3 (2a251a2/16e45f9)：scheduler 重入 guard + 诊断日志（PID tag）+ 3 contract test 防回归

## Backlog（仅 deferred）
- BL-SEC-INFRA-GUARD-FOLLOWUP / BL-FE-DS-SHADCN / BL-SEC-PAY-DEFERRED

## 生产前置
- ✅ 部署到 16e45f9；5 连击数据未清理（保留作 debug 历史，无业务影响）
- 修复后 OR 月 probe 成本应回到 ~$2-3/月（vs fix-round-2 期间 ~$5-6/月）
- F-EM-06 #13 实证 1 次真实 bge-m3 调用 ~$0.000004
