---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- API-POLISH：`building`（11 条功能，0/11 完成，10 generator + 1 codex）
- 规格：`docs/specs/API-POLISH-draft.md`
- F-AP-01~08：审计剩余 medium/low（分页/过滤/版本数/expiresAt/retryAfter/image token/maxOutputTokens/size enum）
- F-AP-09：余额显示 USD → CNY（用户反馈）
- F-AP-10：quickstart/mcp-setup/docs 宽度统一 + 删除 narrow variant（用户反馈）
- **这是当前规划的最后一个批次**

## 生产状态
- AUDIT-FOLLOWUP-2 已部署（L2 验证通过）
- USAGE-ALERTS 已部署
- 火山引擎 realModelId → ep-ID 已修复（deepseek-v3/doubao-pro 恢复）

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配
- deepseek-r1 / seedream-3 火山引擎 endpoint 即将下线
- glm-4.7-flash rate limit 较严

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX / AUDIT-CRITICAL-FIX / RATE-LIMIT / WORKFLOW-POLISH / AUDIT-FOLLOWUP / UI-UNIFY-FIX-2 / ADMIN-UI-UNIFY / ADMIN-OPS++ / REGRESSION-BACKFILL / USAGE-ALERTS / AUDIT-FOLLOWUP-2

## Backlog（延后）
- BL-065(支付验签) / BL-104(Settings 项目切换)
