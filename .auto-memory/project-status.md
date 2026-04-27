---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-RECON-FIX-PHASE1：`verifying`**（对账数据正确性 bugfix Phase 1）
- F-RF-01 / F-RF-02 / F-RF-03 全部 commit（48baf89 / 0695615 / 916c20e）；tsc + build + vitest 452 全过
- 生产 audit：39 image models / **7 ⚠️ token-priced 可疑 channel**（6 openrouter image-via-chat + 1 zhipu cogview-4）/ 32 perCall 合理
- F-RF-04 验收（Codex）待执行；docs/audits/image-pricing-2026-04-27.md 已入仓
- Phase 2 留观察：用户 review 7 行 ⚠️ 后决定改 channel.costPrice 配置 + 历史 BIG_DIFF 回填 + 阈值粒度

## 上一批次（已 done）
- BL-RECON-UX-PHASE1（对账面板 UX）@ 2026-04-27（fix_round 1 收口，tc13 已放宽）

## Backlog（仅 deferred）
- BL-SEC-INFRA-GUARD-FOLLOWUP / BL-FE-DS-SHADCN / BL-SEC-PAY-DEFERRED

## 生产前置
- 部署 BL-RECON-UX-PHASE1：跑 `npx prisma db seed` 写入 4 个 RECONCILIATION_* SystemConfig 默认值（如未跑过）
- F-RF-03 报告生产数据 = 读取 prod DB（read-only），由 Generator 用 prod DATABASE_URL 跑 audit 脚本
- F-RF-01/02 部署后下次 cron（次日 04:30 UTC）自动应用新逻辑
