---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- DX-POLISH：`verifying`（11/11 generator 完成，等待 Evaluator）
- 核心：reasoning_tokens 独立计量 + max_reasoning_tokens 参数
- 数据/精度：sellPrice 6 位精度、deprecated 字段、数据修正脚本
- DX：capability enum、not-found 措辞、json_mode 剥离、modality 校验

## 待生产执行
- `npx tsx scripts/fix-dp-06-model-data.ts --apply`（数据修正）
- `20260413_dx_polish_alias_deprecated` migration

## 已知 gap
- 5 个图片模型 supportedSizes 规则不匹配：openai/gpt-5-image、wan2.7-image、wan2.7-image-pro、z-image-turbo、glm-4v

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR / AUDIT-SEC

## Backlog（延后）
- BL-065(支付验签) / BL-073(高风险测试) / BL-099(删除服务商)
- BL-110(快速开始重写) / BL-111(classifier 审批队列) / BL-108(bug修复轮)
