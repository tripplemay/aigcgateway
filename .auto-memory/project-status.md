---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-RECON-UX-PHASE1：`reverifying` (fix_round 1 完成)**
- F-RC-01 ✅ commit 4b507f2 / F-RC-02 ✅ commit 555f229 / F-RC-03 fix_round 1 ✅ 待 Codex 复验
- fix_round 1 改动：reconcile-job 加 `__testFetcherOverrides` 可选参数 + 新 wiring 测试 4 PASS（A 默认 MATCH / B 紧 MINOR_DIFF / C 同 fetcher 状态不同 / D 无 override 回归）
- vitest 445 PASS（baseline 441 + 4 新）；生产 callsite 0 改动
- 裁决文档：`docs/adjudications/BL-RECON-UX-PHASE1-tc13-relaxation-2026-04-27.md`

## Codex 复验范围
- 新测：`src/lib/billing-audit/__tests__/runReconciliation-thresholds.test.ts` 4 PASS
- 回归：≥445 全 PASS
- 抽样原 15 项 PASS smoke（本 fix_round 不动相关代码）
- 输出：`docs/test-reports/BL-RECON-UX-PHASE1-fix-round-1-signoff-2026-04-27.md`

## 上一批次（已 done）
- BL-DEV-PORT-3199（dev-chore）@ 2026-04-26
- backlog 大清理 @ 2026-04-27：12 项 zombie 移除，剩 3 项 deferred

## Backlog（仅 deferred）
- BL-SEC-INFRA-GUARD-FOLLOWUP / BL-FE-DS-SHADCN / BL-SEC-PAY-DEFERRED

## 生产前置
- F-RC-01 部署后需跑 `npx prisma db seed` 写入 4 个 RECONCILIATION_* SystemConfig 默认值
- 阈值变更不溯及历史，仅下次 cron / 手动重跑生效
- 部署后人工事后核对：deploy 次日 04:30 UTC cron 后在 /admin/reconciliation 观察分类是否符合预期
