# BL-SEC-BILLING-CHECK-FOLLOWUP Sign-off

- Batch: `BL-SEC-BILLING-CHECK-FOLLOWUP`
- Date: `2026-04-18`
- Evaluator: `codex: Reviewer`
- Scope: `F-BCF-02` acceptance items

## 1) 本地 build 健全性

执行：
1. `npx tsc --noEmit`
2. `npm run build`
3. `npx vitest run`

结果：
1. `tsc` PASS
2. `build` PASS（存在既有 eslint warnings，不阻断）
3. `vitest` PASS（`96 passed / 96`）

## 2) 生产数据预检 SQL

执行（生产 DB）：
1. `SELECT COUNT(*) FROM transactions WHERE ("type"='DEDUCTION' AND "amount">=0) OR ("type" IN ('REFUND','RECHARGE','BONUS') AND "amount"<0);`
2. `SELECT COUNT(*) FROM template_ratings WHERE "score"<1 OR "score">5;`

结果：
1. `BAD_TX=0`
2. `BAD_RATING=0`

## 3) 生产部署（git pull + prisma migrate deploy）

执行：
1. `ssh tripplezhou@34.180.93.185`
2. `cd /opt/aigc-gateway`
3. `git pull --ff-only origin main`
4. `set -a && source .env.production && set +a`
5. `npx prisma migrate deploy`

结果：
1. 服务器代码 fast-forward 到 `7d25837`
2. `prisma migrate deploy` 输出：`No pending migrations to apply.`
3. 迁移表核对：
1. `20260418_billing_check_constraints` = rolled back
2. `20260418_billing_check_constraints_v2` = applied

备注：
本次未发生“现场 apply v2 一条”，原因是 v2 在本次执行前已处于已应用状态；当前数据库状态与目标一致。

## 4) 约束存在性 + 负向 INSERT 断言（4 项）

约束存在性：
1. `transactions_amount_sign_check` 存在
2. `template_ratings_score_range_check` 存在

负向 INSERT 结果：
1. `DEDUCTION +10` -> `23514`
2. `REFUND -10` -> `23514`
3. `template_ratings score=0` -> `23514`
4. `template_ratings score=6` -> `23514`

## 5) 正向回归（AI 调用 -> DEDUCTION 对齐）

执行：
1. 在生产注册临时用户并登录
2. 创建项目 + API key
3. 调用 `POST /v1/chat/completions`（model=`deepseek-v3`）

关键证据：
1. `traceId = trc_gnm8x3rbbt9a6okk7z8zzmhb`
2. `CALLLOG=1`（该 traceId 下 `status=SUCCESS`）
3. `TXN=1`（该 traceId 关联 `type=DEDUCTION`）

结论：
同一调用链路中 `callLog ↔ transaction` 一对一对齐，正向回归通过。

## 最终结论

`F-BCF-02` 验收项通过，批次可签收。
