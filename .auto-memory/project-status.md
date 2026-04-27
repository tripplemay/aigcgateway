---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- **BL-RECON-UX-PHASE1：`building`**（对账面板 UX Phase 1，1.25 day）
- 用户需求：A 视图筛选 + D CSV 导出 + E 阈值可配置 + 排序倒序（最新在顶）
- 3 features：F-RC-01（后端 API + CSV + reconcile-job 阈值化 + SystemConfig seed）+ F-RC-02（前端 UX + i18n）+ F-RC-03（Codex 验收 16 项）
- Spec：`docs/specs/BL-RECON-UX-PHASE1-spec.md`
- 关键决策：阈值不溯及历史；CSV hard cap 10000 行；cards/trend 与明细表两路 fetch；Tier 3 不展示
- 排除：C 告警闭环 / B 数据洞察 / F 重跑 audit / G Tier 3 占位 → Phase 2

## 上一批次（已 done）
- BL-DEV-PORT-3199（dev-chore 端口同步）@ 2026-04-26
- backlog 大清理 @ 2026-04-27：12 项 zombie 移除，剩 3 项 deferred

## Backlog（仅 deferred）
- BL-SEC-INFRA-GUARD-FOLLOWUP（high-deferred）— Next.js 14→16 迁移；用户 04-27 评估后暂不做
- BL-FE-DS-SHADCN（low-deferred）— shadcn 采用率
- BL-SEC-PAY-DEFERRED（critical-deferred）— 支付 webhook 验签

## 生产前置
- 无（功能优化批次，纯前后端代码 + 1 个 SystemConfig seed）
