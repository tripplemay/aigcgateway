---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---

## 当前批次

**R2A-user-pages-keys-logs-models** — 用户侧页面还原：Keys + Logs + Models
- Status: `fixing`（verifying 结果：2 PASS / 2 PARTIAL / 5 FAIL）
- Spec: `docs/specs/R2A-user-pages-keys-logs-models-spec.md`
- Verifying 报告: `docs/test-reports/R2A-user-pages-keys-logs-models-verifying-2026-04-08.md`
- 待修复重点: logs 模型筛选与详情跳转、logs 详情 quality 按钮、i18n 硬编码、keys 过期项

## UI 重构全局计划

- 阶段一 R1（已完成）：基础组件 + Layout Shell + Dashboard 试点
- 阶段二 R2A（修复中）：Keys + Logs + Models
- 阶段二 R2B（待启动）：Balance + Usage + Settings
- 暂缓：Keys Insights、Templates、Actions
- 阶段三：管理侧 admin/* + login/quickstart/mcp-setup

## Backlog

- BL-065: 支付回调验签（支付上线前必修）

## 已知遗留

- 白名单重构后需在生产部署并触发 sync
- 同步耗时偏高（~264s）
