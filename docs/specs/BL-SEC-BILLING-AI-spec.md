# BL-SEC-BILLING-AI Spec

**批次：** BL-SEC-BILLING-AI（P0-security，第一波第 3 批）
**负责人：** Planner = Kimi / Generator = 默认映射 / Evaluator = Reviewer
**创建：** 2026-04-18
**修订：** 2026-04-18（Generator 规格核查后，基于实际代码修正签名与事务语义）
**工时：** 2 day
**源：** `docs/code-review/backend-fullscan-2026-04-17.md` CRIT-2 + CRIT-4 + H-16 + H-19

## 背景

Code Review 2026-04-17 发现 AI 调用扣费链路 4 类原子性/约束缺失。本批次基于**实际代码（migration 20260410120000 + post-process.ts:336-345）** 修正 Planner 初稿后实施。

### CRIT-2 — `deduct_balance` 锁语义依赖 EPQ，需显式加固

**实际函数签名（`prisma/migrations/20260410120000_apikey_to_user_level/migration.sql:40-80`）：**

```sql
CREATE OR REPLACE FUNCTION deduct_balance(
  p_user_id TEXT,
  p_project_id TEXT,
  p_amount DECIMAL(16,8),
  p_call_log_id TEXT,
  p_description TEXT DEFAULT 'API call deduction',
  p_trace_id TEXT DEFAULT NULL
)
RETURNS TABLE(new_balance DECIMAL(16,8)) AS $$
BEGIN
  UPDATE "users" SET "balance" = "balance" - p_amount, "updatedAt" = NOW()
  WHERE "id" = p_user_id AND "balance" >= p_amount
  RETURNING "balance" INTO v_new_balance;
  IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient balance for user %', p_user_id; END IF;
  -- 函数内已 INSERT transactions 'DEDUCTION', -p_amount, 关联 callLogId
  ...
END;
```

**Code Review 的"并发透支"定性需调整：** PostgreSQL 的 `UPDATE ... WHERE` 在取行锁后会通过 EPQ (EvaluatePlanQual) 重新评估 WHERE 条件，因此实际**不会透支**（第二个并发事务会看到 `NOT FOUND` → RAISE EXCEPTION）。但现实现依赖 EPQ 语义，**代码可读性差、语义不显式**，显式加 `SELECT ... FOR UPDATE` 仍然是值得做的防御性加固。

### CRIT-4 — `CallLog.create` + `deduct_balance` 非原子（计费泄漏，真实风险）

**文件：** `src/lib/api/post-process.ts:127-158 + :336-345`

```ts
await prisma.callLog.create({ data: callLogData });       // 第一步
await prisma.$queryRaw`SELECT * FROM deduct_balance(${userId}, ...)`;  // 第二步
```

若 `deduct_balance` 的 RAISE EXCEPTION（余额不足）或进程在两步之间崩溃 → **callLog 已落，但对应的 DEDUCTION transaction 没写**。持续性收入泄漏，对账失败。

### H-16 — `Transaction.amount` 无 CHECK 约束

符号与类型语义无 DB 层保证：
- DEDUCTION / REFUND 应 < 0
- RECHARGE / BONUS 应 ≥ 0
- ADJUSTMENT 可正可负

应用层校验失效时可绕过写入。

### H-19 — `TemplateRating.score` 无 range CHECK

前端校验失效时可写入越界评分（非 1-5），污染 qualityScore 聚合。

## 目标

1. **锁语义显式**：`deduct_balance` 改为先 `SELECT ... FOR UPDATE` 再分支，语义清晰不依赖 EPQ
2. **计费完整**：每个 CallLog 必有对应 Transaction（两者原子写入）；事务失败时两者均回滚
3. **数据层兜底**：Transaction.amount 符号、TemplateRating.score 范围由 DB CHECK 约束保证

## 改动范围

### F-BA-01：`deduct_balance` 内部改 SELECT FOR UPDATE + 分支（保签名）

**文件：** 新建 migration `prisma/migrations/20260418_deduct_balance_for_update/migration.sql`

**严格保持现有签名与返回** —— 6 参 + `RETURNS TABLE(new_balance DECIMAL(16,8))` + `RAISE EXCEPTION`（调用方 post-process.ts 无需改）：

```sql
CREATE OR REPLACE FUNCTION deduct_balance(
  p_user_id TEXT,
  p_project_id TEXT,
  p_amount DECIMAL(16,8),
  p_call_log_id TEXT,
  p_description TEXT DEFAULT 'API call deduction',
  p_trace_id TEXT DEFAULT NULL
)
RETURNS TABLE(new_balance DECIMAL(16,8)) AS $$
DECLARE
  v_balance DECIMAL(16,8);
  v_new_balance DECIMAL(16,8);
BEGIN
  -- 显式行锁：同用户并发扣费事务阻塞直到当前事务提交
  SELECT "balance" INTO v_balance
  FROM "users"
  WHERE "id" = p_user_id
  FOR UPDATE;

  IF v_balance IS NULL THEN
    RAISE EXCEPTION 'User not found: %', p_user_id;
  END IF;

  IF v_balance < p_amount THEN
    RAISE EXCEPTION 'Insufficient balance for user %', p_user_id;
  END IF;

  UPDATE "users"
  SET "balance" = "balance" - p_amount, "updatedAt" = NOW()
  WHERE "id" = p_user_id
  RETURNING "balance" INTO v_new_balance;

  -- 保持原有 transactions INSERT 逻辑（函数内）
  INSERT INTO "transactions" ("id", "projectId", "userId", "type", "amount", "balanceAfter", "status", "callLogId", "traceId", "description", "createdAt")
  VALUES (
    gen_random_uuid()::TEXT,
    p_project_id,
    p_user_id,
    'DEDUCTION',
    -p_amount,
    v_new_balance,
    'COMPLETED',
    p_call_log_id,
    p_trace_id,
    p_description,
    NOW()
  );

  RETURN QUERY SELECT v_new_balance;
END;
$$ LANGUAGE plpgsql;
```

**设计要点：**
- 签名、返回类型、异常语义完全一致 → post-process.ts 调用点 0 修改
- `CREATE OR REPLACE FUNCTION` 覆盖旧版，不 drop
- 回滚：重新运行旧 migration 20260410120000 的 deduct_balance 部分

### F-BA-02：CallLog.create + deduct_balance 调用改 prisma.$transaction

**文件：** `src/lib/api/post-process.ts:127-158`

当前：

```ts
await prisma.callLog.create({ data: callLogData });       // 独立 DB 往返
await prisma.$queryRaw`SELECT * FROM deduct_balance(...)`; // 独立 DB 往返
```

改为：

```ts
await prisma.$transaction(async (tx) => {
  await tx.callLog.create({ data: callLogData });
  await tx.$queryRaw`
    SELECT * FROM deduct_balance(
      ${userId}::TEXT,
      ${projectId}::TEXT,
      ${finalAmount}::DECIMAL(16,8),
      ${callLogId}::TEXT,
      ${"API call deduction"}::TEXT,
      ${traceId}::TEXT
    )
  `;
});
```

**关键：不额外 `tx.transaction.create()`** —— deduct_balance 函数内部已 INSERT DEDUCTION 记录（见 migration 第 62-76 行），再写会重复。

**异常处理：**
- deduct_balance `RAISE EXCEPTION`（余额不足）→ 整个事务回滚，callLog 不留记录
- 业务层（上层 catch）按需决定是否另起事务写 FAILED callLog（超出本批次 scope，不改）

**补 regression test：** `scripts/e2e-test.ts` 新增并发步骤：
- 创建测试用户余额 $1.00
- 发起 10 个并发 `/v1/chat/completions` 请求（mock adapter 或真实 alias，每次扣 $0.15）
- 断言：
  - 最终 balance ≥ 0（实际应为 $0.10 左右，成功 6 次）
  - `call_logs.where(status='SUCCESS').count === transactions.where(type='DEDUCTION' AND callLogId IS NOT NULL).count`
  - 失败的请求（余额不足）无 callLog 记录

### F-BA-03：Transaction.amount + TemplateRating.score CHECK 约束

**文件：** 新建 migration `prisma/migrations/20260418_billing_check_constraints/migration.sql`

```sql
-- 1. 不合规数据预检（若有则 RAISE EXCEPTION 引导人工清理，不静默 migration 失败）
DO $$
DECLARE
  v_bad_tx INT;
  v_bad_rating INT;
BEGIN
  SELECT COUNT(*) INTO v_bad_tx FROM "transactions" WHERE
    ("type" IN ('DEDUCTION', 'REFUND') AND "amount" >= 0) OR
    ("type" IN ('RECHARGE', 'BONUS') AND "amount" < 0);
  IF v_bad_tx > 0 THEN
    RAISE EXCEPTION '% transactions violate sign rule. Clean first: SELECT * FROM transactions WHERE ...', v_bad_tx;
  END IF;

  SELECT COUNT(*) INTO v_bad_rating FROM "template_ratings" WHERE "score" < 1 OR "score" > 5;
  IF v_bad_rating > 0 THEN
    RAISE EXCEPTION '% template_ratings violate score range', v_bad_rating;
  END IF;
END $$;

-- 2. 添加 CHECK 约束
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_sign_check" CHECK (
  ("type" IN ('DEDUCTION', 'REFUND') AND "amount" < 0) OR
  ("type" IN ('RECHARGE', 'BONUS') AND "amount" >= 0) OR
  ("type" = 'ADJUSTMENT')
);

ALTER TABLE "template_ratings" ADD CONSTRAINT "template_ratings_score_range_check"
  CHECK ("score" >= 1 AND "score" <= 5);
```

**schema.prisma 同步：** Prisma 不支持 `@@check`，在对应 model 注释标注即可。

### F-BA-04：并发压测 + 全量验收（Evaluator）

**并发原子性断言（5 项）：**
1. **透支防护**：10 并发 `/v1/chat/completions` 同用户，初始 $1、每次 $0.15 → 最终余额 ≥ 0（通过 $transaction + FOR UPDATE 实现串行化）
2. **计费一致**：`call_logs(status=SUCCESS).count === transactions(type=DEDUCTION AND callLogId IS NOT NULL).count`
3. **无重复 Transaction**：同一 callLogId 在 transactions 表中**唯一一条** DEDUCTION 记录（验证 F-BA-02 未错误重复写入）
4. **进程中断模拟**：在 `prisma.$transaction` async callback 中间 `throw new Error` → callLog 与 transaction 均不可见（事务整体回滚）
5. **CHECK 约束**：直接 SQL `INSERT INTO transactions VALUES(type=DEDUCTION, amount=10, ...)` → 23514 check_violation；同理 template_ratings score=10 → 23514

**构建与单测：**
6. 本地 `npx prisma migrate dev` 两个 migration 跑通
7. `npm run build` 通过
8. `npx tsc --noEmit` 通过
9. `npx vitest run` 全过

**生产数据预检（Codex 生产只读 SSH）：**
10. `SELECT COUNT(*) FROM transactions WHERE (type IN ('DEDUCTION','REFUND') AND amount >= 0) OR (type IN ('RECHARGE','BONUS') AND amount < 0)` = 0
11. `SELECT COUNT(*) FROM template_ratings WHERE score < 1 OR score > 5` = 0

**生成 signoff 报告。**

## 非目标

- 不重构整个计费链路（仅加原子性 + 锁显式 + CHECK 兜底）
- 不做跨 project / 跨组织并发收费隔离（单用户级足够）
- 不改 schema.prisma（@@check 不支持）
- 不做 refund 原子性（未标 Critical）
- 不加 balance 审计日志表
- 不引入业务层 FAILED callLog（余额不足时 callLog 被回滚丢弃是当前行为，保持）

## Risks

| 风险 | 缓解 |
|---|---|
| FOR UPDATE 行锁导致高并发慢查询 | 仅锁同用户同行，单次事务 < 10ms；单用户高并发是预期 |
| 现有 Transaction 不合规数据阻塞 migration | F-BA-03 migration 开头 DO $$ 预检 RAISE EXCEPTION，清晰提示人工清理 |
| $transaction 长事务耗尽连接池 | 事务内仅 DB 操作无网络调用；默认 5s timeout 足够 |
| 并发压测触发真金白银 AI 调用 | 用 mock adapter 或测试 alias |
| 单用户并发锁竞争 | 仅影响同一用户扣费，不阻塞跨用户 |
| F-BA-02 误加 tx.transaction.create 导致重复记录 | **spec 修订后明确禁止** + F-BA-04 断言 3 验证唯一性 |

## 部署

- 2 个 migration + 1 个应用代码变更
- 部署顺序：
  1. `git pull + npm ci + npm run build` 部署应用（F-BA-02 代码使用 $transaction，对旧函数无感）
  2. `npx prisma migrate deploy` 应用 2 个 migration（函数覆盖 + CHECK）
  3. pm2 restart
- 回滚：
  - F-BA-03 失败：删除 migration 文件 + `ALTER TABLE DROP CONSTRAINT`
  - F-BA-01 失败：重跑旧 migration 20260410120000 的 deduct_balance 部分
  - F-BA-02 失败：revert commit

## 验收标准

- [ ] F-BA-04 的 11 项断言全 PASS
- [ ] 本地 2 个 migration 无冲突
- [ ] tsc + build + vitest 全过
- [ ] 生产数据预检零不合规
- [ ] signoff 报告归档
