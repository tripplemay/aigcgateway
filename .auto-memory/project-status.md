---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- R4-design-restoration：`verifying`（7/7 generator features done，等待 Evaluator 验收）
- spec：`docs/specs/R4-design-restoration-spec.md`

## UI 重构进度
- 已完成：R1 / R2A / R2B / R2C / R3A / R3B / R3C
- 进行中：R4（6 页面设计稿还原 + Register 终端统一）— building 完成，进入 verifying
- 总计：全部页面 DS 统一 + i18n + 设计稿结构还原

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
