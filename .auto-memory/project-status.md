---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- TEMPLATE-TESTING：`building`（8 条功能，0/8 完成，7 generator + 1 codex）
- 规格：`docs/specs/TEMPLATE-TESTING-spec.md`
- F-TT-01 schema / F-TT-02 执行 API / F-TT-03 历史 API / F-TT-04 MCP test_mode
- F-TT-05 前端左侧 / F-TT-06 前端右侧 / F-TT-07 入口按钮 / F-TT-08 验收
- 核心：/templates/[id]/test 独立页面，dry_run 预览 + execute 真实执行

## 生产状态
- ROUTING-RESILIENCE + endpointMap 已部署（failover + scheduler 优化）
- TEMPLATE-LIBRARY-UPGRADE 待部署（分类+评分+排序）

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配
- get-balance.ts(74) tsc TS2353 batchId pre-existing

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX / AUDIT-CRITICAL-FIX / RATE-LIMIT / WORKFLOW-POLISH / AUDIT-FOLLOWUP / UI-UNIFY-FIX-2 / ADMIN-UI-UNIFY / ADMIN-OPS++ / REGRESSION-BACKFILL / USAGE-ALERTS / AUDIT-FOLLOWUP-2 / API-POLISH / ROUTING-RESILIENCE / TEMPLATE-LIBRARY-UPGRADE

## Backlog（延后）
- BL-065(支付验签) / BL-104(Settings 项目切换)
