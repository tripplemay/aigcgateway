---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- AUDIT-FOLLOWUP-2：`done`（10/10 全部 PASS，L2 生产验证通过）
- signoff：`docs/test-reports/AUDIT-FOLLOWUP-2-signoff-2026-04-16.md`

## 生产状态
- 2026-04-16 部署完成，AUDIT-FOLLOWUP-2 全量修复已上线
- deepseek-v3 / doubao-pro channels 可能仍有路由问题（list_models 可见但 chat 返回 unavailable）
- USAGE-ALERTS 已部署

## 已知 gap
- deepseek-v3 / doubao-pro chat 返回 "Model unavailable"（channels 可能全部 disabled）
- 5 个图片模型 supportedSizes 规则不匹配
- glm-4.7-flash rate limit 较严

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX / AUDIT-CRITICAL-FIX / RATE-LIMIT / WORKFLOW-POLISH / AUDIT-FOLLOWUP / UI-UNIFY-FIX-2 / ADMIN-UI-UNIFY / ADMIN-OPS++ / REGRESSION-BACKFILL / USAGE-ALERTS / AUDIT-FOLLOWUP-2

## Backlog（延后）
- BL-065(支付验签) / BL-104(Settings 项目切换)
