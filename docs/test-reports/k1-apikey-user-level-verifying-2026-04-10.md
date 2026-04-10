# K1 复验报告（reverifying）

## 范围
- 批次：`K1-apikey-user-level`
- 目标 Feature：`F-K1-09`
- 环境：L1 本地 `http://localhost:3099`
- 脚本：`scripts/test/k1-apikey-user-level-verifying-e2e-2026-04-10.ts`
- 执行时间：`2026-04-10T04:32:12.290Z`

## 结果概览
- PASS：3
- FAIL：4
- 结论：未通过，回到 `fixing`

## 通过项
- AC4：`/api/keys` 用户级 Key 管理可用
- AC4b：旧 `/api/projects/:id/keys` 已删除（404）
- AC6：MCP 可初始化并返回 tools

## 失败项
### F-K1-03 / F-K1-09 — chat/actions 链路 503（High）
- 现象：Key 调 `/v1/chat/completions` 与 `/v1/actions/run` 返回 `503`。
- 证据：
  - `AC1 detail = status=503, balance_before=20, balance_after=20`
  - `AC2 detail = runA=503, runB=503`
  - `AC3 detail = chat=503, action=400`（仅 action 的无项目 400 仍符合预期）

### F-K1-05 — 新充值路径 500（High）
- 现象：`POST /api/admin/users/:id/recharge` 返回 `500`，旧路径已删除（404）。
- 证据：
  - `AC5 detail = new=500, old=404`
  - 服务日志出现 Prisma 外键错误：`Transaction` 写入触发 `transactions_projectId_fkey` 约束失败（`P2003`）。

### F-K1-03 伴随风险 — 调度器影响通道可用性（Medium）
- 现象：服务日志显示 health/model-sync 将 `openai/openai/gpt-4o-mini` 与 `openrouter/openai/gpt-4o-mini` 降级/禁用，复验阶段可能触发无可用通道。
- 影响：导致 chat/actions 在复验窗口内返回 503，放大非确定性失败。

## 结论
本轮复验确认：旧 keys 路径删除已完成，但 K1 仍因“chat/actions 503 + 新充值路径 500”未通过，状态保持 `fixing`，待修复后再次 `reverifying`。
