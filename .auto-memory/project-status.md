---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---

## 当前批次

**R2B-user-pages-balance-usage-settings** — 用户侧页面还原：Balance + Usage + Settings
- Status: `fixing`（reverifying round5 诊断轮仍失败，继续修复）
- 诊断结论：常规点击 Save Changes 时“无 toast + 无 PATCH”；强制 requestSubmit 时“无 toast + 有 PATCH”
- 关键含义：后端更新链路可通，但真实 UI 交互路径提交不稳定；toast 信号本身也未按预期出现
- 报告：`docs/test-reports/R2B-user-pages-balance-usage-settings-reverifying-round5-2026-04-09.md`
- 背景：generator 已加 toast.info + data-testid，仍需继续排查 UI 事件触发链
- 已移除：Notifications/System Status（DESIGN.md ignore）

## UI 重构全局计划

- **阶段一 R1（已完成）：** 基础组件 + Layout Shell + Dashboard 试点
- **阶段二 R2A（已完成）：** Keys(列表+创建+设置) + Logs(列表+详情) + Models
- **阶段二 R2B（verifying）：** Balance + Usage + Settings
- **暂缓：** Keys Insights（需 CallLog schema 加 apiKeyId）、Actions、Templates
- **阶段三：** 管理侧 admin/* + login/quickstart/mcp-setup
- 全部设计稿已加 DESIGN.md 标注 API 匹配度

## Backlog

- BL-065: 支付回调验签（支付上线前必修）

## 已知遗留

- 白名单重构后需在生产部署并触发 sync
- 同步耗时偏高（~264s）
