---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- ADMIN-OPS++：`building`（9 条功能，0/9 完成，8 generator + 1 codex）
- 规格：`docs/specs/ADMIN-OPS-PLUS-PLUS-spec.md`
- Phase 1 删服务商：F-AO2-01 级联 API / F-AO2-02 二次确认 UI（BL-099）
- Phase 2 运维可观测：F-AO2-03 SystemLog 写入 / F-AO2-04 状态提示 / F-AO2-05 Redis 进度（BL-101）
- Phase 3 classifier 审批：F-AO2-06 队列 schema / F-AO2-07 审批 UI（BL-111）
- Phase 4 IMAGE 定价：F-AO2-08 suggest-price 适配（BL-113）
- 合并关闭 backlog：BL-099 + BL-101 + BL-111 + BL-113

## 遗留（不阻塞）
- templates/page.tsx:281 手写 container-low 卡片
- templates/[templateId]、admin/users/[id]、admin/templates/[id] 子路由
- admin/model-aliases 定价编辑器 text-[10px] label
- admin/models 搜索框/筛选按钮 bg-lowest
- scripts/test-mcp.ts F-AF-02/03 回归段落需 dev server 补跑

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配：openai/gpt-5-image、wan2.7-image、wan2.7-image-pro、z-image-turbo、glm-4v

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX / AUDIT-CRITICAL-FIX / RATE-LIMIT / WORKFLOW-POLISH / AUDIT-FOLLOWUP / UI-UNIFY-FIX-2 / ADMIN-UI-UNIFY

## Backlog（延后）
- BL-065(支付验签) / BL-073 / BL-104 / BL-120
- 20260415 全量审计回归基线
