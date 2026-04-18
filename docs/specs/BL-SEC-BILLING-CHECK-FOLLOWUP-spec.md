# BL-SEC-BILLING-CHECK-FOLLOWUP Spec

**批次：** BL-SEC-BILLING-CHECK-FOLLOWUP（P0-security，第一波第 3.5 批）
**负责人：** Planner = Kimi / Generator = 默认映射 / Evaluator = Reviewer
**创建：** 2026-04-18
**工时：** 0.5 day
**前置：** BL-SEC-BILLING-AI F-BA-03 生产部署失败（c8a7703 hotfix 回滚）

## 背景

BL-SEC-BILLING-AI 的 F-BA-03（CHECK 约束 migration）生产 `prisma migrate deploy` 失败：migration 的 DO $$ 预检在 `transactions` 表捕获 7 行"不合规"数据，RAISE EXCEPTION 阻止 ALTER TABLE。

**进一步调查发现"不合规"是假阳性：规则本身错了**。

### 实际代码中的 Transaction.amount 符号约定（以源码为准）

| type | amount 符号 | 语义 | 证据 |
|---|---|---|---|
| DEDUCTION | **负** | balance delta（扣减） | `prisma/migrations/20260410120000_apikey_to_user_level/migration.sql:67` — `-p_amount` |
| REFUND | **正** | 退款金额（= balance 增量） | `scripts/refund-zero-image-audit.ts:102` — `+sellPrice` |
| RECHARGE | **正** | 充值金额 | `src/lib/billing/payment.ts:80` — `+order.amount` |
| BONUS | **正** | 奖励金额 | `src/app/api/auth/register/route.ts:109` — `+bonusAmount` |
| ADJUSTMENT | 任意 | 管理员调整 | 无明确写入点，保留灵活 |

### 生产 7 行 REFUND 数据（业务正确，不需清理）

```
all 7 rows: type=REFUND, amount>0, description='Zero image delivery refund'
创建时间：2026-04-14 07:12:56
来源：scripts/refund-zero-image-audit.ts（F-ACF-03 历史退款审计）
balanceAfter 增量 = amount，确认为"加钱"操作
```

### 错因溯源

- **Code Review 报告 H-16 的 REFUND 符号断言错**（说 '<0'，应为 '>=0'）
- Planner 初稿 spec 照抄未核实
- 部署时 migration 的 DO $$ 预检（用错误规则）捕获 7 行"违反"数据

### 教训

Code Review 报告的事实性断言（特别是符号/类型/约束类）**必须与生产数据 + 源码交叉验证**。已追加 framework/proposed-learnings.md。

## 目标

1. 修正 CHECK 规则匹配实际代码约定
2. 重新提交 migration（v2 命名，与失败的 v1 区分）
3. 补齐 schema.prisma 的 `/// CHECK` 文档注释
4. 生产部署验证通过

## 改动范围

### F-BCF-01：修正 CHECK migration（v2）+ schema.prisma 注释

**文件：** 新建 `prisma/migrations/20260418_billing_check_constraints_v2/migration.sql`

```sql
-- 预检（用正确规则，预期 0 行不合规）
DO $$
DECLARE
  v_bad_tx INT;
  v_bad_rating INT;
BEGIN
  SELECT COUNT(*) INTO v_bad_tx FROM "transactions" WHERE
    ("type" = 'DEDUCTION' AND "amount" >= 0) OR
    ("type" IN ('REFUND', 'RECHARGE', 'BONUS') AND "amount" < 0);
  IF v_bad_tx > 0 THEN
    RAISE EXCEPTION '% transactions violate sign rule. DEDUCTION must be <0, REFUND/RECHARGE/BONUS must be >=0.', v_bad_tx;
  END IF;

  SELECT COUNT(*) INTO v_bad_rating FROM "template_ratings" WHERE "score" < 1 OR "score" > 5;
  IF v_bad_rating > 0 THEN
    RAISE EXCEPTION '% template_ratings violate score range [1,5]', v_bad_rating;
  END IF;
END $$;

-- Transaction.amount 符号规则（修正后）
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_amount_sign_check" CHECK (
  ("type" = 'DEDUCTION' AND "amount" < 0) OR
  ("type" IN ('REFUND', 'RECHARGE', 'BONUS') AND "amount" >= 0) OR
  ("type" = 'ADJUSTMENT')
);

-- TemplateRating.score 范围（与 v1 规则一致，v1 已失败未应用）
ALTER TABLE "template_ratings" ADD CONSTRAINT "template_ratings_score_range_check"
  CHECK ("score" >= 1 AND "score" <= 5);
```

**schema.prisma 文档注释（Prisma 不支持 @@check，只注释）：**

```prisma
model Transaction {
  // ...
  /// CHECK: DEDUCTION amount<0; REFUND/RECHARGE/BONUS amount>=0; ADJUSTMENT 任意
  /// 在 migration 20260418_billing_check_constraints_v2 定义
  amount Decimal
  // ...
}

model TemplateRating {
  // ...
  /// CHECK: 1 <= score <= 5
  /// 在 migration 20260418_billing_check_constraints_v2 定义
  score Int
  // ...
}
```

### F-BCF-02：验收（Codex）

**构建与 migration：**
1. 本地 `npx prisma migrate dev` 跑通 v2 migration
2. `npm run build` 通过
3. `npx tsc --noEmit` 通过

**生产数据预检（Codex 生产只读 SSH）：**
4. `SELECT COUNT(*) FROM transactions WHERE ("type"='DEDUCTION' AND "amount">=0) OR ("type" IN ('REFUND','RECHARGE','BONUS') AND "amount"<0)` = 0
5. `SELECT COUNT(*) FROM template_ratings WHERE "score"<1 OR "score">5` = 0

**生产部署（Codex 执行）：**
6. `ssh ... && cd /opt/aigc-gateway && git pull && npx prisma migrate deploy` 成功（新 v2 migration 应用）
7. `\d+ transactions` 见到 `transactions_amount_sign_check`
8. `\d+ template_ratings` 见到 `template_ratings_score_range_check`

**CHECK 约束功能验证（生产 psql）：**
9. 负向 1：`INSERT INTO transactions(type='DEDUCTION', amount=10, ...)` → 23514 check_violation
10. 负向 2：`INSERT INTO transactions(type='REFUND', amount=-10, ...)` → 23514
11. 负向 3：`INSERT INTO template_ratings(score=0, ...)` → 23514
12. 负向 4：`INSERT INTO template_ratings(score=6, ...)` → 23514
13. 正向：现有业务流（发一次 AI 调用触发 DEDUCTION；管理员 adjust 触发 ADJUSTMENT）应正常完成

**生成 signoff 报告 `docs/test-reports/BL-SEC-BILLING-CHECK-FOLLOWUP-signoff-2026-04-18.md`**

## 非目标

- 不改 deduct_balance / post-process.ts / 前端（BILLING-AI 已完成且部署）
- 不改 REFUND 符号约定（保持与现有代码一致）
- 不追溯清理历史数据（生产 7 行本身正确）
- 不做跨项目的 amount 审计

## Risks

| 风险 | 缓解 |
|---|---|
| 生产还有其他"真正不合规"数据未发现 | F-BCF-02 预检 SQL 用**正确规则** + RAISE EXCEPTION 在 migration 内自动阻断，失败立即可见 |
| REFUND 约定未来可能变动为负 | 当前约定已有完整代码支持（审计脚本 + MCP 响应），不具备变更动机；若真要统一可另立重构批次 |
| 旧失败 migration `20260418_billing_check_constraints`（v1）还在 _prisma_migrations 表 | c8a7703 commit 说明已用 `prisma migrate resolve --rolled-back` 清理；F-BCF-02 生产部署前再确认一次 |

## 部署

- 纯数据库变更，无应用代码
- 部署：`git pull + npx prisma migrate deploy`（不需重启 pm2）
- 回滚：`ALTER TABLE ... DROP CONSTRAINT ...` + 删 migration 文件 + `prisma migrate resolve --rolled-back 20260418_billing_check_constraints_v2`

## 验收标准（全部通过才签收）

- [ ] F-BCF-02 的 13 项断言全 PASS
- [ ] 生产部署 CHECK 约束已就位（`\d+ transactions` / `\d+ template_ratings` 可见）
- [ ] 正反向 INSERT 断言成立
- [ ] signoff 报告归档
