---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- 无进行中批次（REGRESSION-BACKFILL 已 done，2026-04-15）

## 生产状态
- 所有代码已部署到 67889a0（ADMIN-OPS++ 签收版本）
- PM2 online，重启于 17:34 UTC+8
- PendingClassification 表已创建，等真实流量填充

## 遗留（不阻塞）
- templates/page.tsx:281 / 子路由（3 个 [id] 路由）/ admin/model-aliases text-[10px] / admin/models 搜索框 bg-lowest
- ADMIN-OPS++ reassign popover UI / 前端轮询统一端点
- e2e-errors.ts setup 调用 `/api/projects/{id}/keys`（404，c3bd6fe 引入，需修正为 `/api/keys`）
- test-mcp-errors.ts RB-02.4 缺 `model_not_found` skip 条件（本地 fal/flux-schnell 不存在）

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配：openai/gpt-5-image、wan2.7-image、wan2.7-image-pro、z-image-turbo、glm-4v

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX / AUDIT-CRITICAL-FIX / RATE-LIMIT / WORKFLOW-POLISH / AUDIT-FOLLOWUP / UI-UNIFY-FIX-2 / ADMIN-UI-UNIFY / ADMIN-OPS++ / REGRESSION-BACKFILL

## Backlog（延后）
- BL-065(支付验签) / BL-104(Settings 项目切换)
- 20260415 全量审计回归基线
