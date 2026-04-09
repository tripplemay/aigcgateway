---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---

## 当前批次

**R3A-admin-model-management** — 管理侧模型管理 5 页面还原
- Status: `fixing`（reverifying round2 未通过）
- 结果：5 页加载 + CRUD 通过；CN 下 whitelist/aliases 类型列仍有 `TEXT`
- 报告：`docs/test-reports/R3A-admin-model-management-reverifying-2026-04-09-round2.md`
- 证据：`docs/test-reports/R3A-admin-model-management-crud-api-2026-04-09.json`

## UI 重构全局计划

- 已完成：R1、R2A、R2B、R2C
- 进行中：R3A（剩余 i18n 尾项修复后复验）
- 待做：管理侧其余页面 + 认证页

## Backlog（7 条）

- BL-065, BL-068, BL-069, BL-070, BL-071, BL-072, BL-073

## 已知遗留

- 测试环境模型数据由 openrouter 主导，部分 provider 401 属测试数据现状
