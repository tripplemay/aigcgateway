---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- 无进行中批次（USAGE-ALERTS + CLEANUP 已 done，2026-04-16）

## 生产状态
- 部署 67889a0（ADMIN-OPS++ 版本，USAGE-ALERTS 未部署）
- PM2 online

## 遗留（不阻塞）
- REDIS_URL 未配置本地 .env（dedup 依赖 Redis，生产已配）
- 5 个图片模型 supportedSizes 规则不匹配（openai/gpt-5-image 等）

## 待部署
- USAGE-ALERTS 批次（F-UA-01~09）：通知系统 + CLEANUP 修复，等用户手动触发 GitHub Actions 部署

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX / AUDIT-CRITICAL-FIX / RATE-LIMIT / WORKFLOW-POLISH / AUDIT-FOLLOWUP / UI-UNIFY-FIX-2 / ADMIN-UI-UNIFY / ADMIN-OPS++ / REGRESSION-BACKFILL / USAGE-ALERTS

## Backlog（延后）
- BL-065(支付验签) / BL-104(Settings 项目切换)
- BL-130 AUDIT-FOLLOWUP-2（spec 已写）
