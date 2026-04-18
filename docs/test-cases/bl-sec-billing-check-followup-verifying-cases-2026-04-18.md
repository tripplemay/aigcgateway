# BL-SEC-BILLING-CHECK-FOLLOWUP 验收用例（待执行）

- 批次：`BL-SEC-BILLING-CHECK-FOLLOWUP`
- 阶段：`verifying` / `reverifying`
- 目标功能：`F-BCF-02`（`executor: codex`）
- 当前状态：**仅准备用例，不执行测试**

## 验收范围

1. 本地 migration/build/tsc/vitest 健全性验证。
2. 生产数据预检（按修正后的 amount 规则）。
3. 生产部署 `prisma migrate deploy` 与约束存在性验证。
4. 生产 CHECK 约束负向验证（transactions/template_ratings）。
5. 生产正向回归（AI 调用扣费链路正常）。

## 前置条件（执行时）

1. Generator 已完成并推送 `F-BCF-01`（含 v2 migration 与 schema 注释）。
2. 本地测试环境使用 Codex 端口：
1. `bash scripts/test/codex-setup.sh`
2. `bash scripts/test/codex-wait.sh`
3. 生产 SSH、生产数据库访问、生产环境变量可用。
4. 生产写操作和高成本操作需要你明确授权后执行。

## L1 本地验收矩阵

### TC-BCF-01 migration 可执行性（v2）
- 目的：验证 v2 migration 在本地可应用。
- 步骤：
1. `npx prisma migrate dev`
- 期望：
1. `20260418_billing_check_constraints_v2` 应用成功。
2. 不创建与本批次无关的额外 migration。

### TC-BCF-02 类型检查
- 目的：验证类型系统健康。
- 步骤：
1. `npx tsc --noEmit`
- 期望：
1. 命令通过。

### TC-BCF-03 构建
- 目的：验证构建链路健康。
- 步骤：
1. `npm run build`
- 期望：
1. 命令通过。

### TC-BCF-04 测试回归
- 目的：验证现有测试未被破坏。
- 步骤：
1. `npx vitest run`
- 期望：
1. 全部通过。

## L2 生产验收矩阵（执行前需你授权）

### TC-BCF-05 transactions 预检（修正规则）
- 目的：验证生产数据满足正确符号规则。
- 步骤：
1. 执行 SQL：
```sql
SELECT COUNT(*) FROM transactions
WHERE ("type" = 'DEDUCTION' AND "amount" >= 0)
   OR ("type" IN ('REFUND','RECHARGE','BONUS') AND "amount" < 0);
```
- 期望：
1. 结果为 `0`。

### TC-BCF-06 template_ratings 预检
- 目的：验证生产评分数据满足范围约束。
- 步骤：
1. 执行 SQL：
```sql
SELECT COUNT(*) FROM template_ratings
WHERE "score" < 1 OR "score" > 5;
```
- 期望：
1. 结果为 `0`。

### TC-BCF-07 生产部署 migration
- 目的：验证生产部署成功应用 v2 migration。
- 步骤：
1. SSH 进入生产并执行：`git pull`
2. 执行：`npx prisma migrate deploy`
- 期望：
1. 部署成功，包含 `20260418_billing_check_constraints_v2`。

### TC-BCF-08 约束存在性（transactions）
- 目的：验证 `transactions_amount_sign_check` 已在生产生效。
- 步骤：
1. `\d+ transactions`
- 期望：
1. 可见约束 `transactions_amount_sign_check`。

### TC-BCF-09 约束存在性（template_ratings）
- 目的：验证 `template_ratings_score_range_check` 已在生产生效。
- 步骤：
1. `\d+ template_ratings`
- 期望：
1. 可见约束 `template_ratings_score_range_check`。

### TC-BCF-10 负向 INSERT：DEDUCTION 正数应拒绝
- 目的：验证 transactions CHECK 生效（DEDUCTION 必须 < 0）。
- 步骤：
1. SQL 插入 `type='DEDUCTION', amount=10`（其他字段给合法占位值）。
- 期望：
1. 返回 `23514 check_violation`。

### TC-BCF-11 负向 INSERT：REFUND 负数应拒绝
- 目的：验证 transactions CHECK 生效（REFUND 必须 >= 0）。
- 步骤：
1. SQL 插入 `type='REFUND', amount=-10`（其他字段给合法占位值）。
- 期望：
1. 返回 `23514 check_violation`。

### TC-BCF-12 负向 INSERT：template_ratings score=0 应拒绝
- 目的：验证评分下界约束生效。
- 步骤：
1. SQL 插入 `score=0`。
- 期望：
1. 返回 `23514 check_violation`。

### TC-BCF-13 负向 INSERT：template_ratings score=6 应拒绝
- 目的：验证评分上界约束生效。
- 步骤：
1. SQL 插入 `score=6`。
- 期望：
1. 返回 `23514 check_violation`。

### TC-BCF-14 正向回归：AI 调用扣费链路
- 目的：验证修正后线上调用链路正常。
- 步骤：
1. 发起一次生产 AI 调用（受控最小成本）。
2. 查询最新 `call_logs` 与 `transactions` 对应记录。
- 期望：
1. 调用成功。
2. 可见对应 DEDUCTION 交易记录且对齐。

## 执行输出（执行时）

1. 本地验证报告（建议）：
`docs/test-reports/bl-sec-billing-check-followup-verifying-local-2026-04-18.md`
2. 全量通过后 signoff：
`docs/test-reports/BL-SEC-BILLING-CHECK-FOLLOWUP-signoff-2026-04-18.md`

## 备注

1. 当前仅完成用例准备，未执行任何测试命令。
2. 收到你“开始测试”指令后，按本用例逐项执行并附证据。
