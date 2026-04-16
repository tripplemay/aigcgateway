---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- AUDIT-FOLLOWUP-2：`verifying`（10 条功能，9/9 generator done，等 codex F-AF2-10）
- 规格：`docs/specs/AUDIT-FOLLOWUP-2-spec.md`
- Generator: Richard 完成 F-AF2-01~09 全部，含 migration + 回归测试
- 待验收：F-AF2-10 codex L2 真实调用验收

## 部署前注意
- 新增 migration: `20260416_fix_template_step_order_base`（template step order 0→1）
- 需执行 `npx prisma migrate deploy && npx prisma generate`

## 生产状态
- 2026-04-16 运维修复：火山引擎 7 channel realModelId → ep-ID + 8 旧模型 disabled
- deepseek-v3 / doubao-pro 已恢复（验证 OK）
- USAGE-ALERTS 待部署

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配
- deepseek-r1 / seedream-3 的火山引擎 endpoint 即将下线

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX / AUDIT-CRITICAL-FIX / RATE-LIMIT / WORKFLOW-POLISH / AUDIT-FOLLOWUP / UI-UNIFY-FIX-2 / ADMIN-UI-UNIFY / ADMIN-OPS++ / REGRESSION-BACKFILL / USAGE-ALERTS

## Backlog（延后）
- BL-065(支付验签) / BL-104(Settings 项目切换)
