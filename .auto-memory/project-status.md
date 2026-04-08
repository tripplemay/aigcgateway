---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---

## 当前批次

**R2A-user-pages-keys-logs-models** — 用户侧页面还原：Keys + Logs + Models
- Status: `building`（0/9，8 generator + 1 codex）
- Spec: `docs/specs/R2A-user-pages-keys-logs-models-spec.md`
- 设计稿整理完成，新路径 `design-draft/{kebab-case}/code.html`，旧版归档至 `_archive/`

## UI 重构全局计划

- **阶段一 R1（已完成）：** 基础组件 + Layout Shell + Dashboard 试点
- **阶段二 R2A（进行中）：** Keys(列表+创建+设置) + Logs(列表+详情) + Models
- **阶段二 R2B（待启动）：** Balance + Usage + Settings
- **暂缓：** Keys Insights（需 CallLog schema 加 apiKeyId）、Templates（设计稿与数据模型冲突）、Actions（缺设计稿）
- **阶段三：** 管理侧 admin/* + login/quickstart/mcp-setup

## Backlog（1 条）

- BL-065: 支付回调验签（支付上线前必修）

## 已知遗留

- 白名单重构后需在生产部署并触发 sync
- 同步耗时偏高（~264s）
