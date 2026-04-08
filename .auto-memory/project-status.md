---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---

## 当前批次

**R2B-user-pages-balance-usage-settings** — 用户侧页面还原：Balance + Usage + Settings
- Status: `fixing`（收口复验未通过）
- 收口结论：常规点击 Save Changes 仍“无 PATCH”；脚本触发 save-profile-btn.click 仍“出现双 PATCH”
- 关键含义：后端链路可通，但自动化常规点击路径仍不稳定，暂不可 signoff
- 报告：`docs/test-reports/R2B-user-pages-balance-usage-settings-close-attempt-2026-04-09.md`
- 背景：当前实现是 React onClick + 原生 addEventListener 双绑定
- 已移除：Notifications/System Status（DESIGN.md ignore）

## UI 重构全局计划

- **阶段一 R1（已完成）：** 基础组件 + Layout Shell + Dashboard 试点
- **阶段二 R2A（已完成）：** Keys(列表+创建+设置) + Logs(列表+详情) + Models
- **阶段二 R2B（fixing）：** Balance + Usage + Settings
- **暂缓：** Keys Insights（需 CallLog schema 加 apiKeyId）、Actions、Templates
- **阶段三：** 管理侧 admin/* + login/quickstart/mcp-setup
- 全部设计稿已加 DESIGN.md 标注 API 匹配度

## Backlog

- BL-065: 支付回调验签（支付上线前必修）

## 已知遗留

- 白名单重构后需在生产部署并触发 sync
- 同步耗时偏高（~264s）
