---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- 无进行中批次（ADMIN-OPS++ 已完成）

## 遗留（不阻塞）
- templates/page.tsx:281 手写 container-low 卡片
- templates/[templateId]、admin/users/[id]、admin/templates/[id] 子路由
- admin/model-aliases 定价编辑器 text-[10px] label
- admin/models 搜索框/筛选按钮 bg-lowest
- scripts/test-mcp.ts F-AF-02/03 回归段落需 dev server 补跑
- ADMIN-OPS++ reassign popover UI 留作迭代
- ADMIN-OPS++ 前端轮询对接 /api/admin/operations/progress 统一端点留作迭代

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配：openai/gpt-5-image、wan2.7-image、wan2.7-image-pro、z-image-turbo、glm-4v

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX / AUDIT-CRITICAL-FIX / RATE-LIMIT / WORKFLOW-POLISH / AUDIT-FOLLOWUP / UI-UNIFY-FIX-2 / ADMIN-UI-UNIFY / ADMIN-OPS++

## Backlog（延后）
- BL-065(支付验签) / BL-073 / BL-104 / BL-120
- 20260415 全量审计回归基线
