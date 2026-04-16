---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- API-POLISH：`done`（11/11 全部 PASS，首轮即通过）
- signoff：`docs/test-reports/API-POLISH-signoff-2026-04-16.md`
- **这是当前规划的最后一个批次**

## 生产状态
- 2026-04-16 两次部署：AUDIT-FOLLOWUP-2 + API-POLISH 均已上线
- exchange-rate API 返回 7.3（CNY 转换生效）
- deepseek-v3 / doubao-pro channels 仍有路由问题（chat 返回 unavailable）

## 已知 gap
- deepseek-v3 / doubao-pro chat 返回 "Model unavailable"
- 5 个图片模型 supportedSizes 规则不匹配
- glm-4.7-flash rate limit 较严

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX / AUDIT-CRITICAL-FIX / RATE-LIMIT / WORKFLOW-POLISH / AUDIT-FOLLOWUP / UI-UNIFY-FIX-2 / ADMIN-UI-UNIFY / ADMIN-OPS++ / REGRESSION-BACKFILL / USAGE-ALERTS / AUDIT-FOLLOWUP-2 / API-POLISH

## Backlog（延后）
- BL-065(支付验签) / BL-104(Settings 项目切换)
