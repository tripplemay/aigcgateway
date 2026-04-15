---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- 无（ADMIN-UI-UNIFY 已签收 done，等待下一批次）
- Signoff：`docs/test-reports/ADMIN-UI-UNIFY-signoff-2026-04-15.md`

## 遗留（不阻塞）
- admin/users/[id]、admin/templates/[id] 子路由未改造（超出本批次 scope）
- admin/model-aliases 定价编辑器内部 text-[10px] label 保留（spec 允许）
- admin/models 搜索框/筛选按钮 bg-ds-surface-container-lowest rounded-xl（UI control，可后续 cleanup）
- templates/page.tsx:281 手写 container-low 卡片 / templates/[templateId] text-[10px] chips（上批次遗留）
- scripts/test-mcp.ts F-AF-02/03 回归段落需 dev server 手动补跑

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配：openai/gpt-5-image、wan2.7-image、wan2.7-image-pro、z-image-turbo、glm-4v

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX / AUDIT-CRITICAL-FIX / RATE-LIMIT / WORKFLOW-POLISH / AUDIT-FOLLOWUP / UI-UNIFY-FIX-2 / ADMIN-UI-UNIFY

## Backlog（延后）
- BL-065 / BL-073 / BL-099 / BL-101 / BL-104 / BL-111 / BL-113 / BL-120
- 20260415 全量审计回归基线（独立节奏触发）
