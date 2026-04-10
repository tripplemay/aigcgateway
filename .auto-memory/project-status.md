---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- K1-apikey-user-level：`building`
- spec：`docs/specs/K1-apikey-user-level-spec.md`

## K1 功能拆分（8 个）
- F-K1-01 Schema 迁移（ApiKey→userId, 删 Project.balance/RechargeOrder.projectId）
- F-K1-02 鉴权中间件重构（userId + X-Project-Id header）
- F-K1-03 API 端点适配（chat/image/actions/templates）
- F-K1-04 Keys API 用户级（/api/keys，删旧路径）
- F-K1-05 充值 API 简化 + 余额清理
- F-K1-06 MCP 适配
- F-K1-07 前端适配（Keys 页 + Balance 页 + 侧边栏）
- F-K1-08 全量验收（codex）

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF(bugfix)

## Backlog
- 11 条（BL-065~092），含 2 条 high（BL-078 用户详情页, BL-086 MCP chat 参数）
- BL-065 安全加固推迟到接支付时
