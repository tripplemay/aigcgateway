---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- AUDIT-FOLLOWUP-2：`building`（10 条功能，0/10 完成，9 generator + 1 codex）
- 规格：`docs/specs/AUDIT-FOLLOWUP-2-spec.md`
- Phase 1 止血：F-AF2-01 超时退款 / F-AF2-02 零图路径 + CALL_PROBE
- Phase 2 副作用修复：F-AF2-03 脱敏占位符 / F-AF2-04 reasoningTokens / F-AF2-05 HTML 编码
- Phase 3 Workflow：F-AF2-06 run_action 对齐 / F-AF2-07 update_action 版本 / F-AF2-08 模板 order
- Phase 4：F-AF2-09 chat cost + refund batchId / F-AF2-10 **L2 真实调用**验收

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
