---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- UI-UNIFY-FIX-2：`verifying`（7 条，6/7 完成；6 generator ✅ + 1 codex 待验收）
- 规格：`docs/specs/UI-UNIFY-FIX-2-spec.md`
- F-UF2-01 ✅ SectionCard 8 页替换 + models 表用 TableCard
- F-UF2-02 ✅ balance/settings/usage 3 表就位
- F-UF2-03 ⚠️ dashboard/usage 原本已有；balance 余额大卡 SectionCard 壳（KPICard API 太紧）
- F-UF2-04 ✅ 5 处 StatusChip + 额外 templates[templateId]
- F-UF2-05 ✅ templates CTABanner 统一
- F-UF2-06 ✅ quickstart step0 Button gradient-primary

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
