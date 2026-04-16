---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- TEMPLATE-TESTING：`verifying`（9 条功能，8/8 generator 完成，待 Codex 验收 F-TT-09）
- 规格：`docs/specs/TEMPLATE-TESTING-spec.md`
- 新增：TemplateTestRun 表 / test-runner lib / POST|GET test APIs / MCP test_mode
- 新增：/templates/[id]/test 独立页面 / 详情+列表+global-library 测试入口
- global-library.tsx 已对齐 SectionCard/StatusChip/Button gradient-primary

## 生产状态
- ROUTING-RESILIENCE + endpointMap 已部署（failover + scheduler 优化）
- TEMPLATE-LIBRARY-UPGRADE 待部署（分类+评分+排序）
- TEMPLATE-TESTING 本地完成，未 commit/push

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配
- get-balance.ts(74) tsc TS2353 batchId pre-existing
- execute 模式 cost 依赖 CallLog 异步写入，最多轮询 3s

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX / AUDIT-CRITICAL-FIX / RATE-LIMIT / WORKFLOW-POLISH / AUDIT-FOLLOWUP / UI-UNIFY-FIX-2 / ADMIN-UI-UNIFY / ADMIN-OPS++ / REGRESSION-BACKFILL / USAGE-ALERTS / AUDIT-FOLLOWUP-2 / API-POLISH / ROUTING-RESILIENCE / TEMPLATE-LIBRARY-UPGRADE

## Backlog（延后）
- BL-065(支付验签) / BL-104(Settings 项目切换)
