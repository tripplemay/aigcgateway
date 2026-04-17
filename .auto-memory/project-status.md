---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- TEMPLATE-TESTING：`reverifying` fix round 2（9 条功能，8/8 generator 已修，等 Codex 复验 F-TT-09）
- 规格：`docs/specs/TEMPLATE-TESTING-spec.md`
- Fix round 2：验证 resolveEngine fallback 覆盖 alias-linked 与无 alias 两种场景
- 证据：`docs/test-reports/template-testing-fixing-r2-local-e2e-2026-04-17.json`（11/11）
- Reviewer 注意：reverifying 请执行 `scripts/test/codex-setup.sh` 完整流程（rm -rf .next + rebuild），避免 stale build

## 生产状态
- ROUTING-RESILIENCE + endpointMap 已部署
- TEMPLATE-LIBRARY-UPGRADE 待部署
- TEMPLATE-TESTING 本地 round 2 完成，未 push

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配
- get-balance.ts(74) tsc TS2353 batchId pre-existing
- execute 模式 cost 依赖 CallLog 异步写入，最多轮询 3s

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX / AUDIT-CRITICAL-FIX / RATE-LIMIT / WORKFLOW-POLISH / AUDIT-FOLLOWUP / UI-UNIFY-FIX-2 / ADMIN-UI-UNIFY / ADMIN-OPS++ / REGRESSION-BACKFILL / USAGE-ALERTS / AUDIT-FOLLOWUP-2 / API-POLISH / ROUTING-RESILIENCE / TEMPLATE-LIBRARY-UPGRADE

## Backlog（延后）
- BL-065(支付验签) / BL-104(Settings 项目切换)
