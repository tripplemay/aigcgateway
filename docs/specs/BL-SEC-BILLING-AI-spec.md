# BL-SEC-BILLING-AI Spec

**批次：** BL-SEC-BILLING-AI（P0-security，第一波第 3 批）
**负责人：** Planner = Kimi / Generator = 默认映射 / Evaluator = Reviewer
**创建：** 2026-04-18
**工时：** 2 day
**源：** `docs/code-review/backend-fullscan-2026-04-17.md` CRIT-2 + CRIT-4 + H-16 + H-19

## 背景

Code Review 2026-04-17 发现 AI 调用扣费链路 4 类原子性/约束缺失，合并为一个批次修复。这条链路在**每次 AI API 调用**都会走（与支付模块无关），高并发下可直接造成**余额透支 + 计费泄漏**的资金损失。

### CRIT-2 — `deduct_balance` 缺行级锁（并发透支）

**文件：** `prisma/migrations/20260410120000_apikey_to_user_level/migration.sql:40-80`

```sql
CREATE OR REPLACE FUNCTION deduct_balance(p_user_id TEXT, p_amount DECIMAL)
RETURNS BOOLEAN AS $$
BEGIN
  UPDATE users SET balance = balance - p_amount
  WHERE id = p_user_id AND balance >= p_amount;
  RETURN FOUND;
END;
$$ LANGUAGE plpgsql;
```

两个并发事务可同时通过 `balance >= p_amount` 检查 → 都执行 UPDATE → **余额变负**。

### CRIT-4 — `CallLog.create` + `deduct_balance` 非原子（计费泄漏）

**文件：** `src/lib/api/post-process.ts:127-158`

```ts
await prisma.callLog.create({ ... });       // 第一次 DB 往返
await deductBalance(userId, cost);          // 第二次 DB 往返
```

若 `deductBalance` 失败（或进程在两步之间崩溃）→ **服务已消费但无扣费记录**，持续性收入泄漏。

### H-16 — `Transaction.amount` 无 CHECK 约束

当前 schema 仅类型为 `Decimal`，未约束符号与类型语义：
- DEDUCTION / REFUND 应 < 0
- RECHARGE / BONUS / ADJUSTMENT 应 ≥ 0（ADJUSTMENT 可正可负，视业务）

异常数据可绕过应用层校验写入，破坏对账。

### H-19 — `TemplateRating.score` 无 range CHECK

当前仅类型为 `Int`，未约束 1 ≤ score ≤ 5。前端校验失效时可写入越界评分，污染 qualityScore 计算。

## 目标

1. **并发安全**：任意并发 deduct_balance 调用后，user.balance ≥ 0 恒成立
2. **计费完整**：每个成功的 AI 调用必有一条 call_logs 且必有一条对应的 deduction transaction，两者条数一致
3. **数据层兜底**：Transaction.amount 符号/TemplateRating.score 范围由 DB CHECK 约束保证，不依赖应用层

## 改动范围

### F-BA-01：`deduct_balance` 加 SELECT FOR UPDATE 行锁

**文件：** 新建 migration `prisma/migrations/20260418_deduct_balance_for_update/migration.sql`

```sql
CREATE OR REPLACE FUNCTION deduct_balance(p_user_id TEXT, p_amount DECIMAL)
RETURNS BOOLEAN AS $$
DECLARE
  v_balance DECIMAL;
BEGIN
  SELECT balance INTO v_balance
  FROM users
  WHERE id = p_user_id
  FOR UPDATE;                           -- 行锁：同用户其他事务阻塞
  
  IF v_balance IS NULL THEN
    RETURN FALSE;                       -- 用户不存在
  END IF;
  
  IF v_balance < p_amount THEN
    RETURN FALSE;                       -- 余额不足
  END IF;
  
  UPDATE users SET balance = balance - p_amount
  WHERE id = p_user_id;
  
  RETURN TRUE;
END;
$$ LANGUAGE plpgsql;
```

**设计决策：**
- `CREATE OR REPLACE FUNCTION` 覆盖旧版，**不 drop**（保持签名不变 → 不影响现有调用方）
- 新 migration 独立文件（不原位改旧 migration，符合 `docs/dev/rules.md` 的 migration 铁律）
- 回滚：删除本 migration 后再运行旧 migration 可恢复原函数

### F-BA-02：CallLog + deduct 合并到 prisma.$transaction

**文件：** `src/lib/api/post-process.ts:127-158`

```ts
// 当前代码（高风险）
await prisma.callLog.create({ data: callLogData });
const success = await prisma.$queryRaw`SELECT deduct_balance(${userId}, ${cost})`;

// 改为
const result = await prisma.$transaction(async (tx) => {
  await tx.callLog.create({ data: callLogData });
  const [row] = await tx.$queryRaw<{ deduct_balance: boolean }[]>`
    SELECT deduct_balance(${userId}, ${cost}) AS deduct_balance
  `;
  return row.deduct_balance;
});
```

**同时同文件处理 Transaction 记录：**
若 deduct 成功，紧跟着 `tx.transaction.create({ type: "DEDUCTION", amount: -cost, ... })` 在**同一事务内**写入。

**补 regression test：** `scripts/e2e-test.ts` 新增并发场景：
- 创建测试用户余额 $1.00
- 发起 10 个并发 `/v1/chat/completions` 请求，每次扣 $0.15（理论总开销 $1.50）
- 断言：最终 balance ≥ 0，call_logs(status=SUCCESS) 数量 = transactions(type=DEDUCTION) 数量（至多 6-7 个成功，其余 402）

### F-BA-03：Transaction.amount + TemplateRating.score CHECK 约束

**文件：** 新建 migration `prisma/migrations/20260418_billing_check_constraints/migration.sql`

```sql
-- Transaction.amount 符号 CHECK
ALTER TABLE transactions ADD CONSTRAINT transactions_amount_sign_check
CHECK (
  (type IN ('DEDUCTION', 'REFUND') AND amount < 0) OR
  (type IN ('RECHARGE', 'BONUS') AND amount >= 0) OR
  (type = 'ADJUSTMENT')  -- 允许正负
);

-- TemplateRating.score 范围 CHECK
ALTER TABLE template_ratings ADD CONSTRAINT template_ratings_score_range_check
CHECK (score >= 1 AND score <= 5);
```

**风险评估：** 执行前先跑 SQL 统计现有表不合规数据数量：

```sql
SELECT COUNT(*) FROM transactions WHERE 
  (type IN ('DEDUCTION','REFUND') AND amount >= 0) OR
  (type IN ('RECHARGE','BONUS') AND amount < 0);

SELECT COUNT(*) FROM template_ratings WHERE score < 1 OR score > 5;
```

若有不合规数据：先数据清理（`UPDATE ... SET amount = -ABS(amount)` 等），migration 才能安全 ALTER。

**schema.prisma 同步：** 目前 Prisma 不支持 `@@check`（除非用 `unsupported`），CHECK 约束只在 migration SQL 中定义，schema.prisma 注释标注即可。

### F-BA-04：并发压测 + 全量验收（Evaluator）

**压测场景（Codex 执行）：**
1. **透支防护：** 10 并发请求同用户，余额初始 $1，每次扣 $0.15，断言最终余额 ≥ 0
2. **计费一致：** 上述场景运行后，call_logs.count(SUCCESS) === transactions.count(DEDUCTION)
3. **进程崩溃模拟：** 在 prisma.$transaction 中间 `throw new Error` → 断言 callLog 和 transaction 均回滚不可见（利用 Prisma beforeExit hook + SIGINT 测试）
4. **CHECK 约束生效：** 尝试直接 SQL INSERT Transaction(type=DEDUCTION, amount=10) → 断言 DB 拒绝（23514 check_violation）
5. **CHECK 约束生效：** 尝试直接 SQL INSERT TemplateRating(score=10) → 断言 DB 拒绝

**构建与单测：**
6. `npm run build` 通过
7. `npx tsc --noEmit` 通过
8. 新单测（若有）全过

**生成 signoff 报告。**

## 非目标

- 不重构整个计费链路（本次仅加原子性 + CHECK 兜底）
- 不做跨 project / 跨组织的并发收费隔离（单用户级别足够）
- 不改 schema.prisma（@@check 不支持，只加 migration 层 CHECK）
- 不做 refund 原子性（refund 链路本次审查未标 Critical）
- 不加 balance 审计日志表（独立批次考虑）

## Risks

| 风险 | 缓解 |
|---|---|
| `FOR UPDATE` 行锁导致高并发下慢查询 | PostgreSQL 行锁颗粒度 OK；实际每次扣费事务 < 10ms；单用户高并发是预期场景 |
| 现有 Transaction 表不合规数据导致 CHECK migration 失败 | F-BA-03 前先 SELECT COUNT 统计，必要时先数据清理；migration 内含 SELECT 断言（预检） |
| prisma.$transaction 长事务导致连接池耗尽 | 事务内只做 DB 操作，不含网络调用；默认 5s timeout 足够 |
| 并发压测触发真实 AI 调用产生真金白银开销 | 用 mock adapter 或测试专用 alias（指向本地 echo server） |
| 单用户高并发锁竞争影响其他请求 | 行锁仅影响**同一用户**的并发扣费，不阻塞跨用户；正常用户单会话不会触发 |
| deduct_balance 签名改变破坏现有调用 | 保持 `(TEXT, DECIMAL) RETURNS BOOLEAN` 签名不变，只改内部实现 |

## 部署

- 2 个 migration：`20260418_deduct_balance_for_update` + `20260418_billing_check_constraints`
- 部署顺序：先部署应用代码（F-BA-02 事务化），再跑 migration（先函数更新，再 CHECK）
- 生产流程：
  1. `git pull + npm ci + npm run build` 部署应用（F-BA-02 代码使用 $transaction 即可，对旧 deduct_balance 无感知）
  2. `npx prisma migrate deploy` 应用 2 个 migration
  3. pm2 restart（确保新函数被新连接池使用）
- **回滚：** F-BA-03 若失败立即删除 migration 文件 + `ALTER TABLE DROP CONSTRAINT`；F-BA-01 重新运行旧 migration；F-BA-02 revert commit

## 验收标准（Evaluator 全部通过才签收）

- [ ] F-BA-04 的 5 项断言全 PASS
- [ ] `npx prisma migrate dev` 本地跑两个 migration 无冲突
- [ ] `prisma/migrations/` 新增 2 个文件，未动旧文件
- [ ] tsc + build + vitest 全过
- [ ] 生产数据预检：Transaction.amount 符号与 type 一致（或已清理）、TemplateRating.score 全在 [1,5]
- [ ] signoff 报告归档
