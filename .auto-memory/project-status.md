---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-RECON-UX-PHASE1：`verifying`**（对账面板 UX Phase 1，Generator 完成 F-RC-01+02，待 Codex F-RC-03）
- 用户需求：A 视图筛选 + D CSV 导出 + E 阈值可配置 + 排序倒序（最新在顶）
- 3 features：F-RC-01 ✅（commit 4b507f2 已 CI 通过）+ F-RC-02 ✅（本次 commit）+ F-RC-03 待验收
- Spec：`docs/specs/BL-RECON-UX-PHASE1-spec.md`
- 关键决策：阈值不溯及历史；CSV hard cap 10000 行；cards/trend 与明细表两路 fetch；Tier 3 不展示

## 上一批次（已 done）
- BL-DEV-PORT-3199（dev-chore 端口同步）@ 2026-04-26
- backlog 大清理 @ 2026-04-27：12 项 zombie 移除，剩 3 项 deferred

## Backlog（仅 deferred）
- BL-SEC-INFRA-GUARD-FOLLOWUP（high-deferred）— Next.js 14→16 迁移；用户 04-27 评估后暂不做
- BL-FE-DS-SHADCN（low-deferred）— shadcn 采用率
- BL-SEC-PAY-DEFERRED（critical-deferred）— 支付 webhook 验签

## 生产前置
- F-RC-01 部署后需跑一次 `npx prisma db seed` 写入 4 个 RECONCILIATION_* SystemConfig 默认值（之后管理员可在 UI 改）
- 阈值变更不溯及历史，仅下次 cron / 手动重跑生效
