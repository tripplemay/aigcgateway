---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- R3C-final-ds-unification：`verifying`（8/8 generator done，待 Codex 验收）
- spec：`docs/specs/R3C-final-ds-unification-spec.md`

## UI 重构进度
- 已完成：R1 / R2A / R2B / R2C / R3A / R3B
- 当前：R3C（whitelist/aliases/capabilities/docs/layout/login/register/mcp-setup）
- 总计：36/36 页全部 building 完成，待验收

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
