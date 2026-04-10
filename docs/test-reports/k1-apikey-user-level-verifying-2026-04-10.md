# K1 首轮验收报告（verifying）

## 范围
- 批次：`K1-apikey-user-level`
- 目标 Feature：`F-K1-09`
- 环境：L1 本地 `http://localhost:3099`
- 脚本：`scripts/test/k1-apikey-user-level-verifying-e2e-2026-04-10.ts`
- 执行时间：`2026-04-10T02:16:38.852Z`

## 结果概览
- PASS：5
- FAIL：2
- 结论：未通过，回到 `fixing`

## 通过项
- AC1：Key 调 chat 成功并扣 User.balance
- AC2：同一 Key 可切换 `X-Project-Id` 访问不同项目 Actions
- AC3：无项目上下文时 chat 可用、actions 返回 400
- AC4：`/api/keys` 用户级 Key 管理可用
- AC6：MCP 可初始化并返回 tools

## 失败项
### F-K1-04 旧 keys 路径未删除（High）
- 期望：`/api/projects/:id/keys` 已删除
- 实际：`GET /api/projects/:id/keys` 返回 `200`
- 证据：`AC4b detail = actual_status=200`

### F-K1-05 充值路径与规格不一致（High）
- 期望：新路径 `POST /api/admin/users/:id/recharge` 可用，旧路径删除
- 实际：新路径返回 `404`，旧路径 `POST /api/admin/users/:id/projects/:projectId/recharge` 返回 `201`
- 证据：`AC5 detail = new=404, old=201`

## 结论
K1 当前不满足规格中的“旧路径删除 + 新路径上线”要求，建议 Generator 修复后进入 `reverifying`。
