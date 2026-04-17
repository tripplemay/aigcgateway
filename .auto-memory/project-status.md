---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- TEMPLATE-TESTING：`reverifying`（9 条功能，8 generator 已修复，L1 本地 11/11，待 Reviewer 复验 F-TT-09）
- 规格：`docs/specs/TEMPLATE-TESTING-spec.md`
- 修复点：engine/router.ts resolveEngine 加 routeByModelName 回退（解 AC2/3/7），
  test 页 + global-library 手写样式清零，新增 gradient-primary Fork 按钮
- fix round 证据：`docs/test-reports/template-testing-fixing-local-e2e-2026-04-17.json`

## 生产状态
- ROUTING-RESILIENCE + endpointMap 已部署（failover + scheduler 优化）
- TEMPLATE-LIBRARY-UPGRADE 待部署（分类+评分+排序）
- TEMPLATE-TESTING 修复本地完成，未 push

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配
- get-balance.ts(74) tsc TS2353 batchId pre-existing
- execute 模式 cost 依赖 CallLog 异步写入，最多轮询 3s

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX / AUDIT-CRITICAL-FIX / RATE-LIMIT / WORKFLOW-POLISH / AUDIT-FOLLOWUP / UI-UNIFY-FIX-2 / ADMIN-UI-UNIFY / ADMIN-OPS++ / REGRESSION-BACKFILL / USAGE-ALERTS / AUDIT-FOLLOWUP-2 / API-POLISH / ROUTING-RESILIENCE / TEMPLATE-LIBRARY-UPGRADE

## Backlog（延后）
- BL-065(支付验签) / BL-104(Settings 项目切换)
