---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---

## 当前批次

**R1-design-system-foundation** — 设计系统基础对齐 + Dashboard 试点还原
- Status: `done`（13/13 PASS，0 轮修复，Reviewer 签收通过）
- 交付物：Button/Input/Card/Dialog/Table 对齐设计系统、Sidebar/TopAppBar Layout 对齐、useAsyncData+SearchBar+Pagination 公共组件、Dashboard 试点还原

## UI 重构全局计划

三阶段推进，每阶段完成后用户确认再进下一阶段：
- **阶段一 R1（已完成）：** 基础组件 + Layout Shell + Dashboard 试点
- **阶段二（待启动，2-3 批次）：** 用户侧页面 — keys/logs/models → actions 系列 → templates/balance/usage/settings
- **阶段三（1-2 批次）：** 管理侧 admin/* + login/quickstart/mcp-setup

Action/Template v2 设计稿缺 code.html，开工前需确认是否补稿。

## Backlog（1 条）

- BL-065: 支付回调验签（支付上线前必修）

## 已知遗留

- 白名单重构后需在生产部署并触发 sync，然后在 Admin 白名单页启用所需模型
- 同步耗时偏高（~264s）
- 表单字段建议补充 id/name（浏览器 issue 级别，不影响功能）
