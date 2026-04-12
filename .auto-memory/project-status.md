---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- BF3-tech-fixes：`building`（6 条功能，0/6 完成）
- BL-112: MiniMax URL 修正 + API_REACHABILITY healthCheckEndpoint 适配
- BL-109: 大小写归一化 + classifier 批次 15 + Redis 缓存清除

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1 / U1 / L1 / MCP2 / A1 / T1 / N1 / O1 / CI1 / SUP1 / P6 / DQ2 / ADMIN-UX / BF2 / ADMIN-OPS+ / BL-080

## 生产手动修正（本会话执行）
- MiniMax baseUrl → api.minimaxi.com ✅
- MiniMax DEGRADED 渠道恢复 ACTIVE ✅
- 大小写重复 Model SQL 合并 ✅
- IMAGE 别名 supported_sizes 补全 ✅
- TEXT 别名 capabilities 修正（reasoning/search/去 image_input）✅
- 错误 AliasModelLink 清理（51+11 条）✅

## Backlog（延后）
- BL-065(支付验签) / BL-073(高风险测试) / BL-099(删除服务商)
- BL-110(快速开始页面重写) / BL-111(classifier 审批队列)
