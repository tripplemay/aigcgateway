---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---

## 当前批次

**R2C-user-pages-actions-templates** — Actions + Templates 页面还原
- Status: `done`（用户确认签收）
- 签收说明：剩余 `/v1/models` 空数据导致的 UI 创建阻断由用户确认为测试环境问题并豁免
- Signoff：`docs/test-reports/R2C-user-pages-actions-templates-signoff-2026-04-09.md`

## UI 重构全局计划

- **阶段一 R1（已完成）：** 基础组件 + Layout Shell + Dashboard
- **阶段二 R2A（已完成）：** Keys + Logs + Models（4 轮修复）
- **阶段二 R2B（已完成）：** Balance + Usage + Settings（7 轮修复）
- **阶段二 R2C（done）：** Actions(3页) + Templates(3页)
- **待做：** 管理侧 14 页 + 认证 2 页
- 全部 30 个设计稿就绪

## 已完成 21 页，待做 14 页

## Backlog（7 条）

- BL-065 支付回调验签+幂等 [high]
- BL-069 余额模型收敛 [high]
- BL-070~073 安全修复 [medium/low]
- BL-068 Per-Key 使用分析 [low]

## 已知遗留

- 白名单重构后需在生产部署并触发 sync
- Settings Profile 保存按钮在自动化点击下不稳定（豁免签收）
