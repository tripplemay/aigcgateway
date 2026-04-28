---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-EMBEDDING-MVP：`fixing` (fix_round 3)**（fix-round-2 部署后回归 — scheduler 5 连击）
- fix-round-2 (commit 2f05db8) 修了 EMBEDDING probe DEGRADED 但**引入回归**：每 2h due 周期内同 channel 被连续 select 5 次
- 影响：7/9 provider 都中招（openai/openrouter/qwen/siliconflow/volcengine/deepseek/minimax；xiaomi-mimo/zhipu 不受影响）
- siliconflow 部署前后 health_checks 倍数最严重 2.57x（21→54）；openai 1.83x；OR 上游 24h 669 reqs ~$0.16，>95% probe
- 配置 ACTIVE_INTERVAL=2h 生效（spike 整点 18/20/22/00 UTC 周期对齐），但每 spike 内 1min×5 次连续

## fix-round 3 待办（Generator）
1) 加诊断日志（runScheduledChecks 内 console.log dueChannels.length/channelIds/lastCheckTime）
2) 部署诊断版 + 等 2h spike 观察 pm2 logs
3) 根因定位（H1 prisma include nested take:1 cluster 行为 / H2 MAX_CHECKS_PER_ROUND 截断后重选 / H3 排除 / H4 leader-lock race）
4) 修复 + due-once 回归单测（fix-round-2 漏掉的）
5) commit + push + 部署
6) SQL 清理虚假 5 连击数据（用户授权后）
7) 等 2h 验证 max_n_per_channel_per_hour 回到 1
8) status fixing → reverifying，Codex 跑 F-EM-06 14 项

## fix-round 2 已完成（commit 2f05db8）
- runCallProbe + runTextCheck 加 EMBEDDING 分支（probe modality switch）
- scheduler.ts isImage→isProbableModality（IMAGE 仍 reachability，TEXT+EMBEDDING 走 full）
- vitest 513 PASS（基线 505 + 8 新）

## Backlog（仅 deferred）
- BL-SEC-INFRA-GUARD-FOLLOWUP / BL-FE-DS-SHADCN / BL-SEC-PAY-DEFERRED

## 生产前置
- 当前数据被 5 连击污染（fix-round-2 部署后 ~10h），需清理
- 修复后 OR 月 probe 成本应回到 ~$2-3/月（vs 当前 ~$5-6/月）
