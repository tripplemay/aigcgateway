---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- ADMIN-UI-UNIFY：`building`（7 条功能，0/7 完成，6 generator + 1 codex）
- 规格：`docs/specs/ADMIN-UI-UNIFY-spec.md`
- F-AUU-01: admin/models
- F-AUU-02: admin/model-aliases
- F-AUU-03: admin/providers
- F-AUU-04: admin/templates + admin/users
- F-AUU-05: admin/operations + admin/health
- F-AUU-06: admin/logs + admin/usage
- 9 个 admin 页面使用 PageContainer + PageHeader + TableCard + SectionCard + StatusChip + Button gradient

## 遗留（不阻塞）
- templates/page.tsx:281 手写 `bg-ds-surface-container-low rounded-xl` 卡片（超出上一批次 grep 范围）
- templates/[templateId]/page.tsx 子路由 text-[10px] chips（子路由超出范围）
- scripts/test-mcp.ts F-AF-02/03 回归段落需 dev server 手动补跑

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配：openai/gpt-5-image、wan2.7-image、wan2.7-image-pro、z-image-turbo、glm-4v

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX / AUDIT-CRITICAL-FIX / RATE-LIMIT / WORKFLOW-POLISH / AUDIT-FOLLOWUP / UI-UNIFY-FIX-2

## Backlog（延后）
- BL-065 / BL-073 / BL-099 / BL-101 / BL-104 / BL-111 / BL-113 / BL-120
- 20260415 全量审计回归基线（独立节奏触发）
