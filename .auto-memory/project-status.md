---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---

## 当前批次

**R3A-admin-model-management** — done（7/7 PASS，3 轮修复）

## UI 重构全局计划

- **R1（已完成）：** 基础组件 + Layout Shell + Dashboard
- **R2A（已完成）：** Keys + Logs + Models（4 轮修复）
- **R2B（已完成）：** Balance + Usage + Settings（7 轮修复）
- **R2C（已完成）：** Actions + Templates（2 轮修复）
- **R3A（已完成）：** Admin Models/Whitelist/Capabilities/Aliases/Providers（3 轮修复）
- **R3B（待启动）：** Admin Users/Logs/Health/Usage/Templates（6 页）
- **R3C（待启动）：** Login/Register/QuickStart/MCP Setup（4 页）

## 已完成 26 页，待做 10 页

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
