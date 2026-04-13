---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- AUDIT-SEC：`fixing`（L1 验收 9/10 PASS，free_only/perCall=0 过滤失败待修复）
- 安全：上游错误脱敏增强、日志 XSS 转义
- 数据：不可用模型过滤、supportedSizes 回填脚本、image 计费 perCall fallback
- DX：generate_image size 预校验通过；free_only 仍需修复后复验
- **待执行**：生产环境执行 `npx tsx scripts/backfill-supported-sizes.ts --apply`

## 后续批次
- DX-POLISH：DX 改进（deprecated 标记、enum、错误消息统一等）

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3 / PRICE-FIX / BF4 / BILLING-REFACTOR

## Backlog（延后）
- BL-065(支付验签) / BL-073(高风险测试) / BL-099(删除服务商)
- BL-110(快速开始重写) / BL-111(classifier 审批队列) / BL-108(bug修复轮)
