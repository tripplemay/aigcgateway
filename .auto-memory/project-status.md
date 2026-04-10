---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- U1-admin-user-detail：`fixing`
- 首轮 `verifying` 4/5 通过，等待 Generator 修复项目卡片 Key 数缺口

## U1 验收结论
- 已通过：balance、lastActive、交易记录分页、充值、暂停/恢复、删除链路
- 未通过：用户详情 `projects[]` 缺少 `keyCount`，项目卡片无法按规格展示“调用数 / Key 数”

## U1 变更摘要
- Schema: User +suspended/deletedAt
- API: GET 详情(balance/lastActive)、GET transactions、POST suspend、DELETE 软删除
- 鉴权: API Key + JWT 登录检查 suspended/deletedAt
- 前端: 余额卡+充值、交易记录+分页、Suspend/Delete 确认弹窗
- i18n: 22 个新 key

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1

## Backlog
- 17 条（BL-065~096），含 2 条 high
