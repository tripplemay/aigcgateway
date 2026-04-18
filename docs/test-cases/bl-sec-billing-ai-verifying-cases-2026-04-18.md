# BL-SEC-BILLING-AI 验收用例（待执行）

- 批次：`BL-SEC-BILLING-AI`
- 阶段：`verifying` / `reverifying`
- 目标功能：`F-BA-04`（`executor: codex`）
- 当前状态：**仅准备用例，不执行测试**

## 验收范围

1. `deduct_balance` 行锁生效，并发下不出现余额透支。
2. `CallLog.create + deduct_balance` 在同一事务中原子执行，不出现计费泄漏。
3. `deduct_balance` 函数内写入 `transactions`，同一 `callLogId` 不出现重复 DEDUCTION 记录。
4. `transactions.amount` CHECK 约束生效。
5. `template_ratings.score` CHECK 约束生效。
6. migration、构建、类型检查、单测可通过。
7. 生产数据预检 SQL 为 0（或提供清理证据）。

## 前置条件（执行时）

1. Generator 已完成并推送 `F-BA-01` ~ `F-BA-03`。
2. 本地测试环境使用 Codex 端口：
1. `bash scripts/test/codex-setup.sh`
2. `bash scripts/test/codex-wait.sh`
3. 测试账号、测试 API Key、以及可复用的并发请求脚本可用。
4. 并发用例需可控成本环境（mock provider 或低成本测试模型）。
5. 生产预检仅在你明确授权后执行。

## L1 本地验收矩阵

### TC-BA-01 并发透支防护
- 目的：验证单用户高并发扣费后余额不会小于 0。
- 步骤：
1. 准备测试用户，初始余额 `$1.00`。
2. 以同一用户发起 10 个并发 `/v1/chat/completions` 请求，每次理论扣费 `$0.15`。
3. 请求结束后查询用户余额。
- 期望：
1. 最终余额 `>= 0`。
2. 至少出现余额不足拒绝（预期部分请求失败或被拒绝）。

### TC-BA-02 计费一致性（call_logs vs transactions）
- 目的：验证成功调用与扣费流水条数一致。
- 步骤：
1. 执行 TC-BA-01 后，查询本轮测试窗口内：
1. `call_logs` 中 `status='SUCCESS'` 的数量。
2. `transactions` 中 `type='DEDUCTION' AND callLogId IS NOT NULL` 的数量。
2. 对比两者计数。
- 期望：
1. `call_logs(SUCCESS).count === transactions(DEDUCTION with callLogId).count`。

### TC-BA-03 无重复 Transaction（callLogId 唯一性）
- 目的：验证未发生重复写交易流水（例如事务内外重复插入）。
- 步骤：
1. 执行 TC-BA-01 后，按测试窗口查询：
```sql
SELECT "callLogId", COUNT(*) AS n
FROM transactions
WHERE type = 'DEDUCTION'
  AND "callLogId" IS NOT NULL
GROUP BY "callLogId"
HAVING COUNT(*) > 1;
```
- 期望：
1. 结果集为空（0 行）。

### TC-BA-04 事务中断回滚（原子性）
- 目的：验证事务中间失败时不留下半写入数据。
- 步骤：
1. 使用项目内可触发中断的回归脚本或故障注入开关，在 `prisma.$transaction` 中间强制 `throw`。
2. 记录请求 traceId / 时间窗。
3. 查询对应 `call_logs` 与 `transactions` 是否落库。
- 期望：
1. 中断场景下 `call_logs` 与 `transactions` 均不可见（或均为 0 条）。
2. 不允许出现仅写入其一的半成功状态。

### TC-BA-05 CHECK 约束（transactions.amount）
- 目的：验证交易金额符号约束在数据库层生效。
- 步骤：
1. 执行 SQL（示例）：
```sql
INSERT INTO transactions (id, "userId", type, amount, description, "createdAt", "updatedAt")
VALUES ('tc_ba_invalid_txn', '<TEST_USER_ID>', 'DEDUCTION', 10, 'invalid-positive-deduction', NOW(), NOW());
```
2. 记录数据库返回码与错误信息。
- 期望：
1. SQL 被拒绝，错误码为 `23514`（check violation）。

### TC-BA-06 CHECK 约束（template_ratings.score）
- 目的：验证评分范围约束在数据库层生效。
- 步骤：
1. 执行 SQL（示例）：
```sql
INSERT INTO template_ratings (id, "userId", "templateId", score, "createdAt", "updatedAt")
VALUES ('tc_ba_invalid_rating', '<TEST_USER_ID>', '<TEST_TEMPLATE_ID>', 10, NOW(), NOW());
```
2. 记录数据库返回码与错误信息。
- 期望：
1. SQL 被拒绝，错误码为 `23514`（check violation）。

### TC-BA-07 migration 可执行性
- 目的：验证两个新 migration 在本地可应用。
- 步骤：
1. `npx prisma migrate dev`
- 期望：
1. `20260418_deduct_balance_for_update` 和 `20260418_billing_check_constraints` 应用成功。
2. 无冲突、无回放失败。

### TC-BA-08 类型检查
- 目的：验证类型系统健康。
- 步骤：
1. `npx tsc --noEmit`
- 期望：
1. 命令通过。

### TC-BA-09 构建
- 目的：验证构建链路健康。
- 步骤：
1. `npm run build`
- 期望：
1. 命令通过。

### TC-BA-10 单元/集成测试回归
- 目的：验证新增改动未破坏现有测试。
- 步骤：
1. `npx vitest run`
- 期望：
1. 全部通过。

## 生产只读预检（需你明确授权）

### TC-BA-11 transactions 历史脏数据预检
- 步骤：
1. 执行 SQL：
```sql
SELECT COUNT(*) FROM transactions
WHERE (type IN ('DEDUCTION','REFUND') AND amount >= 0)
   OR (type IN ('RECHARGE','BONUS') AND amount < 0);
```
- 期望：
1. 结果为 `0`；若非 0，需记录清理方案后再迁移。

### TC-BA-12 template_ratings 历史脏数据预检
- 步骤：
1. 执行 SQL：
```sql
SELECT COUNT(*) FROM template_ratings
WHERE score < 1 OR score > 5;
```
- 期望：
1. 结果为 `0`；若非 0，需记录清理方案后再迁移。

## 执行输出（执行时）

1. 本地验证报告（建议）：
`docs/test-reports/bl-sec-billing-ai-verifying-local-2026-04-18.md`
2. 全量通过后 signoff：
`docs/test-reports/BL-SEC-BILLING-AI-signoff-2026-04-18.md`

## 备注

1. 当前仅完成用例准备，未执行任何测试命令。
2. 收到你“开始测试”指令后，按本用例逐项执行并保留证据。
