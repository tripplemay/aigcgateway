# 后端代码全面审计报告（2026-04-08）

## 总体结论
后端存在多处阻断级问题（支付回调安全、入账幂等、余额模型一致性、鉴权边界）。按生产可用标准，本次审计结论是 `Not ready`。

## 问题清单

### [高] 支付回调未验签，可伪造“支付成功”直接入账
- 影响：攻击者可绕过真实支付直接增加余额（资金安全/业务风控失效）。
- 触发路径：Webhook 仅按 `trade_status/trade_state` 和 `out_trade_no` 处理，不校验签名。
- 证据：
  - `src/app/api/webhooks/alipay/route.ts:30`
  - `src/app/api/webhooks/wechat/route.ts:30`
  - `src/app/api/projects/[id]/recharge/route.ts:58`

### [高] 支付回调并发下可重复入账（幂等失效）
- 影响：同一订单可能被重复加钱。
- 触发路径：先查 `PENDING`（事务外）再事务内按 `id` 更新，无“`status=PENDING` 原子条件更新/行锁”。
- 证据：
  - `src/lib/billing/payment.ts:22`
  - `src/lib/billing/payment.ts:55`

### [高] 余额模型迁移后实现不一致（`User.balance` 与 `Project.balance` 混用）
- 影响：充值后可用余额与扣费口径不一致；MCP 侧可能“调用成功但扣费失败”。
- 触发路径：
  1. SQL 已改为扣 `users.balance`：`prisma/migrations/20260408010000_balance_user_level/migration.sql:35`
  2. API 检查也看 `user.balance`：`src/lib/api/balance-middleware.ts:23`
  3. 支付入账仍加 `project.balance`：`src/lib/billing/payment.ts:55`
  4. MCP 多工具仍看 `project.balance`：
     - `src/lib/mcp/tools/chat.ts:105`
     - `src/lib/mcp/tools/generate-image.ts:46`
     - `src/lib/mcp/tools/run-action.ts:109`
     - `src/lib/mcp/tools/run-template.ts:45`
  5. 扣费失败在异步后处理里仅记录日志，不回滚已返回结果：`src/lib/api/post-process.ts:53`

### [中] 限流超限回滚逻辑无效，计数可能被污染
- 影响：误限流、计数偏差，在高并发下更明显。
- 触发路径：`pipeline.exec()` 后又 `pipe.zremrangebyscore(...)` 但未再次 `exec()`；且按 score 删除会误删同秒请求。
- 证据：
  - `src/lib/api/rate-limit.ts:69`
  - `src/lib/api/rate-limit.ts:75`

### [中] 邮箱验证接口可被伪造（无 token 校验/无鉴权）
- 影响：知道 `userId` 即可将任意账号标记为 `emailVerified=true`。
- 触发路径：接口接受 `userId` 或 `token`，最终都按 `id` 查用户。
- 证据：
  - `src/app/api/auth/verify-email/route.ts:26`
  - `src/app/api/auth/verify-email/route.ts:30`

### [中] JWT 密钥缺失时会退化为“空密钥签发/验签”
- 影响：部署漏配 `JWT_SECRET` 时，JWT 安全性失效。
- 触发路径：`JWT_SECRET = process.env.JWT_SECRET ?? ""`，且环境校验模块未被业务代码使用。
- 证据：
  - `src/lib/api/jwt-middleware.ts:12`
  - `src/lib/env.ts:24`

### [低] 高风险路径自动化测试覆盖不足
- 影响：支付回调、限流边界、邮箱验证等缺少回归保障。
- 证据：当前仅看到与充值相关的 E2E。
  - `tests/e2e/project-switcher.spec.ts:91`
  - `tests/e2e/balance-user-level-ui.spec.ts:53`

## 评分卡
- Correctness（正确性）: 1/5 - 支付幂等与余额口径存在可触发错误。
- Regression Risk（回归风险）: 2/5 - 余额模型迁移后多处逻辑未统一。
- Security（安全性）: 1/5 - Webhook 验签缺失、邮箱验证可伪造、JWT 配置兜底不安全。
- Reliability（可靠性）: 1/5 - 异步扣费失败不会阻断成功响应，限流回滚无效。
- Performance（性能）: 3/5 - 未见明显致命性能瓶颈。
- Maintainability（可维护性）: 2/5 - 余额语义分裂导致后续变更高风险。
- Test Readiness（测试完备度）: 2/5 - 高风险路径缺乏针对性测试。

## 待确认事项
- Webhook 未验签是否仅用于内网/沙箱环境；若是生产路径则属于立即阻断项。
- 余额最终口径是否已正式切换到 `User.balance`（从代码与迁移看应是“已切换”，但实现未完成收敛）。

## 最终结论
- Weighted result（加权结果）: 多条红线命中（安全+正确性阻断）。
- Final grade（最终等级）: `F`
- Readiness（可推进性）: `Not ready`

## 附：自动检查
- 已执行：`npm run lint`
- 结果：无后端阻断报错，仅 1 条前端字体规则 warning。
