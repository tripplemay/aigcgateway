---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- R3B-admin-remaining：`done`（reverifying 全 PASS）
- signoff：`docs/test-reports/r3b-admin-remaining-signoff-2026-04-09.md`
- 下一批次候选：R3C（Login/Register/QuickStart/MCP Setup）

## UI 重构进度
- 已完成：R1 / R2A / R2B / R2C / R3A
- 已完成：R3B（Admin Users/Logs/Health/Usage/Templates）
- 待启动：R3C（Login/Register/QuickStart/MCP Setup）
- 总计：已完成 32 页，待做 4 页

## Backlog（8 条）
- BL-065 支付回调验签+幂等 [high]
- BL-069 余额模型收敛 [high]
- BL-070~073 安全修复 [medium/low]
- BL-068 Per-Key 使用分析 [low]
- BL-074 系统预设模板 [medium]

## 已知遗留
- 白名单重构后需在生产部署并触发 sync
- Settings Profile 保存按钮在自动化点击下不稳定（豁免签收）
- 测试环境 provider 占位 key 导致部分同步 401
