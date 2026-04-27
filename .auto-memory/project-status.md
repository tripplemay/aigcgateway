---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-RECON-UX-PHASE1：`fixing` (fix_round 1)**（Codex 验收 15/16，tc13 阻断已放宽）
- F-RC-01 ✅ commit 4b507f2 / F-RC-02 ✅ / F-RC-03 待 reverify
- tc13 失败本质：reconcile-job fetcher 需真实 billing 凭证，本地 codex-env.sh 不带 → fetcher skip → rowsWritten=0 → 阈值变更无可观察对象（环境约束非代码 bug）
- 用户 2026-04-27 同意放宽：mock-based wiring 集成测试替代真实 rerun 验证；生产观察事后核对不阻塞 done
- 裁决文档：`docs/adjudications/BL-RECON-UX-PHASE1-tc13-relaxation-2026-04-27.md`

## fix_round 1 待办（Generator）
- 新建 `src/lib/billing-audit/__tests__/runReconciliation-thresholds.test.ts`
- 改造 `runReconciliation` 加可选 `__testFetcherOverrides` 参数（推荐方式，生产 callsite 0 改动）
- 测试：mock fake fetcher 返回 upstream=10/gateway=9.7 → 默认阈值 status=MATCH，紧阈值（matchDelta=0.1+matchPercent=1）status=MINOR_DIFF
- 工时 ~1h；status fixing → reverifying

## 上一批次（已 done）
- BL-DEV-PORT-3199（dev-chore）@ 2026-04-26
- backlog 大清理 @ 2026-04-27：12 项 zombie 移除，剩 3 项 deferred

## Backlog（仅 deferred）
- BL-SEC-INFRA-GUARD-FOLLOWUP / BL-FE-DS-SHADCN / BL-SEC-PAY-DEFERRED

## 生产前置
- F-RC-01 部署后需跑 `npx prisma db seed` 写入 4 个 RECONCILIATION_* SystemConfig 默认值
- 阈值变更不溯及历史，仅下次 cron / 手动重跑生效
- 部署后人工事后核对：deploy 次日 04:30 UTC cron 后在 /admin/reconciliation 观察分类是否符合预期
