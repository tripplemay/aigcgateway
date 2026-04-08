---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---

## 当前批次

**R2A-user-pages-keys-logs-models** — 用户侧页面还原：Keys + Logs + Models
- Status: `done`（9/9 PASS，4 轮修复，Reviewer 签收通过）
- 修复重点：i18n 硬编码（timeAgo、分页 of、breadcrumb、placeholder、状态标签）

## UI 重构全局计划

- **阶段一 R1（已完成）：** 基础组件 + Layout Shell + Dashboard 试点
- **阶段二 R2A（已完成）：** Keys(列表+创建+设置) + Logs(列表+详情) + Models
- **阶段二 R2B（待启动）：** Balance + Usage + Settings
- **暂缓：** Keys Insights（需 CallLog schema 加 apiKeyId）、Actions、Templates
- **阶段三：** 管理侧 admin/* + login/quickstart/mcp-setup
- 全部设计稿已加 DESIGN.md 标注 API 匹配度

## Backlog

- BL-065: 支付回调验签（支付上线前必修）

## 已知遗留

- 白名单重构后需在生产部署并触发 sync
- 同步耗时偏高（~264s）
