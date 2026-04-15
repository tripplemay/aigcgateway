---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- UI-UNIFY-FIX-2：`building`（7 条功能，0/7 完成，6 generator + 1 codex）
- 规格：`docs/specs/UI-UNIFY-FIX-2-spec.md`
- F-UF2-01: SectionCard 替换 ~47 处手写卡片（dashboard/settings/models/balance/usage/mcp-setup/quickstart/templates）
- F-UF2-02: balance/settings/usage 3 页改用 TableCard
- F-UF2-03: KPICard 替换手写指标卡
- F-UF2-04: StatusChip 替换 5 处手写胶囊
- F-UF2-05: templates CTA 改用 CTABanner（与 actions 统一）
- F-UF2-06: quickstart 剩余手写渐变按钮改 Button variant

## 遗留（上一批）
- scripts/test-mcp.ts 的 F-AF-02/03 回归段落未实际执行（需 dev server），下次启动 dev 时手动补跑
- AUDIT-FOLLOWUP 代码部署用户并行处理

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配：openai/gpt-5-image、wan2.7-image、wan2.7-image-pro、z-image-turbo、glm-4v

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH / UI-UNIFY / DOCS-REFRESH / UI-UNIFY-FIX / AUDIT-CRITICAL-FIX / RATE-LIMIT / WORKFLOW-POLISH / AUDIT-FOLLOWUP

## Backlog（延后）
- BL-065 / BL-073 / BL-099 / BL-101 / BL-104 / BL-111 / BL-113 / BL-120 / BL-129(ADMIN-UI-UNIFY)
- 20260415 全量审计回归基线（独立节奏触发）
