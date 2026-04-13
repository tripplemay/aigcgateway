---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- UI-UNIFY：`building`（13 条功能，0/13 完成，12 generator + 1 codex）
- 规格：`docs/specs/UI-UNIFY-spec.md`
- 第一阶段：抽取 9 个公共组件（PageContainer/PageHeader/TableCard/KPICard/StatusChip/CTABanner/SectionCard/TableLoader/PageLoader）
- 第二阶段：改造 12 个 console 页面，合并修复 BL-121/122/123
- 第三阶段：全量验收

## 待生产执行（DX-POLISH 遗留）
- `npx tsx scripts/fix-dp-06-model-data.ts --apply`
- DX-POLISH migration: `20260413_dx_polish_alias_deprecated`

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配：openai/gpt-5-image、wan2.7-image、wan2.7-image-pro、z-image-turbo、glm-4v

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC / DX-POLISH

## Backlog（延后）
- BL-065(支付验签) / BL-073(高风险测试) / BL-099(删除服务商)
- BL-110(快速开始重写) / BL-111(classifier 审批队列) / BL-108(bug修复轮)
