---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-RECON-FIX-PHASE1：`building`**（对账数据正确性 bugfix Phase 1，~2h Generator + 0.5h Codex）
- 来源：用户 2026-04-27 要求分析对账 BIG_DIFF；Planner SSH 生产查到 6 行 BIG_DIFF
- 根因 1：volcengine fetcher 拉月度账单未按 ExpenseDate 过滤 → 5 倍重复（Doubao-Seedream-4.5 每天写 reportDate=今日）
- 根因 2：reconcile-job tier1 把 CNY 当 USD 比较（应按 EXCHANGE_RATE_CNY_TO_USD=0.137 折算）
- 根因 3：image 模型 channel.costPrice.unit='token' 漏算 12 倍（如 gemini-2.5-flash-image 92% undercount）
- 4 features：F-RF-01 fetcher / F-RF-02 reconcile-job / F-RF-03 image pricing audit script / F-RF-04 验收
- Phase 2 留观察：基于 F-RF-03 audit 报告决策是否改 channel.costPrice 配置 + 历史 BIG_DIFF 回填 + 阈值粒度

## 上一批次（已 done）
- BL-RECON-UX-PHASE1（对账面板 UX）@ 2026-04-27（fix_round 1 收口，tc13 已放宽）

## Backlog（仅 deferred）
- BL-SEC-INFRA-GUARD-FOLLOWUP / BL-FE-DS-SHADCN / BL-SEC-PAY-DEFERRED

## 生产前置
- 部署 BL-RECON-UX-PHASE1：跑 `npx prisma db seed` 写入 4 个 RECONCILIATION_* SystemConfig 默认值（如未跑过）
- F-RF-03 报告生产数据 = 读取 prod DB（read-only），由 Generator 用 prod DATABASE_URL 跑 audit 脚本
- F-RF-01/02 部署后下次 cron（次日 04:30 UTC）自动应用新逻辑
