---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- BILLING-REFACTOR：`done`（7 条功能，7/7 完成）
- 核心：sellPrice 统一由 ModelAlias 管理，消除 Channel.sellPrice 扣费逻辑
- 来源：MCP 8 角色审计 FIN-001（扣费比展示价高 20%）

## 后续批次（已规划）
- AUDIT-SEC：安全 + 数据修补（上游错误脱敏、不可用模型过滤、XSS 转义等）
- DX-POLISH：DX 改进（deprecated 标记、enum、错误消息统一等）

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR

## Backlog（延后）
- BL-065(支付验签) / BL-073(高风险测试) / BL-099(删除服务商)
- BL-110(快速开始重写) / BL-111(classifier 审批队列) / BL-108(bug修复轮)
