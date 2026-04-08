---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---

## 当前批次

**R2B-user-pages-balance-usage-settings** — 用户侧页面还原：Balance + Usage + Settings
- Status: `fixing`（reverifying round4 仍失败，继续修复）
- 复验结论：按要求清空 `.next` 后复验，/settings 个人信息保存仍失败
- 阻断缺陷：form onSubmit 路径下点击 Save Changes 后仍无 profile 更新请求（仅 GET /api/auth/profile），刷新后姓名回退
- 报告：`docs/test-reports/R2B-user-pages-balance-usage-settings-reverifying-round4-2026-04-09.md`
- 变更背景：generator 已提交 fix round4（div+button 改 form+submit），但提交链路问题仍在
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
