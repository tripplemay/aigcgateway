---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- BF3-tech-fixes：`done`（6/6 完成，已签收）
- 签收文档：`docs/test-reports/BF3-tech-fixes-signoff-2026-04-12.md`
- BL-112: MiniMax URL 修正 + healthCheckEndpoint skip 适配
- BL-109: 大小写归一化 + classifier 批次 15 + Redis 缓��清除

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080 / BF3-tech-fixes

## 生产手动修正（已完成）
- MiniMax baseUrl → api.minimaxi.com ✅
- MiniMax DEGRADED 渠道恢复 ACTIVE ✅
- 大小写重复 Model SQL 合并 ✅
- IMAGE 别名 supported_sizes 补全 ✅
- TEXT 别名 capabilities 修正 ✅
- 错误 AliasModelLink 清理（51+11 条）✅

## Backlog（延后）
- BL-065(支付验签) / BL-073(高风险测试) / BL-099(删除服务商)
- BL-110(快速开始页面重写) / BL-111(classifier 审批队列)
