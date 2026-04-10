---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- U1-admin-user-detail：`building`
- spec：`docs/specs/U1-admin-user-detail-spec.md`

## U1 功能拆分（7 个）
- F-U1-01 Schema + API（suspended/deletedAt/transactions/suspend/delete）
- F-U1-02 用户列表 API 适配
- F-U1-03 前端余额+充值+历史
- F-U1-04 前端 lastActive + 项目卡片
- F-U1-05 前端 Danger Zone（Suspend/Delete）
- F-U1-06 i18n
- F-U1-07 全量验收（codex）

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF / K1

## Backlog
- 17 条（BL-065~096），含 2 条 high（BL-093 LLM 健壮性, BL-086 MCP chat 参数）
