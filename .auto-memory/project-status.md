---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---

## 当前批次

**R2B-user-pages-balance-usage-settings** — 用户侧页面还原：Balance + Usage + Settings
- Status: `done`（用户确认签收）
- 签收说明：用户明确将“自动化常规点击无 PATCH、脚本点击可 PATCH”的差异视为自动化测试问题并接受风险
- Signoff：`docs/test-reports/R2B-user-pages-balance-usage-settings-signoff-2026-04-09.md`
- 背景：当前实现为 React onClick + 原生 addEventListener 双绑定
- 已移除：Notifications/System Status（DESIGN.md ignore）

## UI 重构全局计划

- **阶段一 R1（已完成）：** 基础组件 + Layout Shell + Dashboard 试点
- **阶段二 R2A（已完成）：** Keys(列表+创建+设置) + Logs(列表+详情) + Models
- **阶段二 R2B（done）：** Balance + Usage + Settings
- **暂缓：** Keys Insights（需 CallLog schema 加 apiKeyId）、Actions、Templates
- **阶段三：** 管理侧 admin/* + login/quickstart/mcp-setup
- 全部设计稿已加 DESIGN.md 标注 API 匹配度

## Backlog

- BL-065: 支付回调验签（支付上线前必修）

## 已知遗留

- 白名单重构后需在生产部署并触发 sync
- 同步耗时偏高（~264s）
