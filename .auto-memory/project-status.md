---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- K1-apikey-user-level：`done`
- 第 3 轮 `reverifying` 已签收，K1 用户级 API Key 与余额模型收敛验收完成

## K1 验收结论
- `/api/keys` 用户级 Key 管理通过，旧项目级 keys 路径已删除
- Key 调 chat 成功且扣减 `User.balance`
- 同一 Key 通过 `X-Project-Id` 可访问不同项目的 Actions
- 无项目上下文时 chat 可用、actions 按预期返回 `400`
- 用户级充值新路径通过，旧路径已删除
- MCP initialize 与 tools/list 通过

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF(bugfix) / K1

## Backlog
- 11 条（BL-065~092），含 2 条 high（BL-078 用户详情页, BL-086 MCP chat 参数）
