---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- 无进行中批次（ROUTING-RESILIENCE 已 done，2026-04-16）

## 生产状态
- 2026-04-16 两次部署：AUDIT-FOLLOWUP-2 + API-POLISH 已上线
- USAGE-ALERTS / ROUTING-RESILIENCE 代码已合并 main，等用户手动触发部署

## 已知 gap
- deepseek-v3 / doubao-pro channels 路由问题（ROUTING-RESILIENCE failover 上线后应自动兜底）
- 5 个图片模型 supportedSizes 规则不匹配
- glm-4.7-flash rate limit 较严
- get-balance.ts(74): tsc TS2353 batchId pre-existing（API-POLISH 442e762 引入）

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX / AUDIT-CRITICAL-FIX / RATE-LIMIT / WORKFLOW-POLISH / AUDIT-FOLLOWUP / UI-UNIFY-FIX-2 / ADMIN-UI-UNIFY / ADMIN-OPS++ / REGRESSION-BACKFILL / USAGE-ALERTS / AUDIT-FOLLOWUP-2 / API-POLISH / ROUTING-RESILIENCE

## Backlog（延后）
- BL-065(支付验签) / BL-104(Settings 项目切换)
- BL-130 AUDIT-FOLLOWUP-2 spec 已写，下批次候选
