---
name: project-status
description: AIGC Gateway 当前状态快照（覆盖写，≤30 行）
type: project
---
## 当前批次
- K1-apikey-user-level：`fixing`
- 最近一轮 `reverifying` 被 migration 阻断，等待 Generator 修复后再复验

## K1 变更摘要
- Schema：ApiKey projectId→userId、User +defaultProjectId、Project -balance、RechargeOrder projectId→userId
- 鉴权：authenticateApiKey 返回 user+project(nullable)、X-Project-Id header
- API：v1 chat/image/actions/templates 适配、新建 /api/keys 用户级路由
- MCP：auth 返回 userId、21 tools null projectId guard、balance 查 User
- Billing：payment/scheduler 改 userId、deduct_balance 直接接收 userId
- 前端：Keys 页 + 对话框改用 /api/keys

## 当前阻断
- `bash scripts/test/codex-setup.sh` 在 Prisma 迁移 `20260410043537_transaction_projectid_optional` 失败
- 错误：尝试删除不存在的 `api_keys_userId_fkey`，导致 3099 无法启动

## 已完成批次
- R1~R4 / P5 / M1a~M1d / BF(bugfix)

## Backlog
- 11 条（BL-065~092），含 2 条 high（BL-078 用户详情页, BL-086 MCP chat 参数）
