---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---

## 当前批次

**R2C-user-pages-actions-templates** — Actions + Templates 页面还原
- Status: `fixing`（Codex 首轮验收未通过）
- 验收结果：6 个页面加载与 i18n 切换通过；阻断点为 `/actions/new` 模型下拉无数据（`GET /v1/models -> []`），导致 UI 创建链路不可用
- 报告：`docs/test-reports/R2C-user-pages-actions-templates-verifying-2026-04-09.md`

## UI 重构全局计划

- **阶段一 R1（已完成）：** 基础组件 + Layout Shell + Dashboard
- **阶段二 R2A（已完成）：** Keys + Logs + Models（4 轮修复）
- **阶段二 R2B（已完成）：** Balance + Usage + Settings（7 轮修复）
- **阶段二 R2C（fixing）：** Actions(3页) + Templates(3页)
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
