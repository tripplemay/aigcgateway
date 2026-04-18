# BL-SEC-BILLING-AI Sign-off（范围收敛）

- 批次：`BL-SEC-BILLING-AI`
- 阶段：`verifying -> done`
- 日期：`2026-04-18`
- Evaluator：`codex: Reviewer`

## 签收范围（用户确认）

1. 本次 sign-off 仅验收 `F-BA-01` / `F-BA-02`。
2. CHECK 类项按用户指令标记 `deferred`，不作为当前批次阻断条件。
3. 相关测试用例已在 `docs/test-cases/bl-sec-billing-ai-verifying-cases-2026-04-18.md` 更新标注。

## 验收结果（纳入签收）

1. 并发透支防护：PASS  
证据：10 并发后余额 `0.1`，未出现负余额。
2. 计费一致性：PASS  
证据：`call_logs(SUCCESS)=6` 且 `transactions(DEDUCTION, callLogId!=null)=6`。
3. 单 callLogId 唯一扣费：PASS  
证据：重复 `callLogId` 分组数 `0`。
4. 事务回滚原子性：PASS  
证据：事务中 `throw` 后 `call_logs=0` 且 `transactions=0`（无半写入）。
5. 构建与回归：PASS  
证据：`npm run build` 通过，`npx tsc --noEmit` 通过，`npx vitest run` 通过（`96/96`）。

## Deferred 项（不纳入本次阻断）

1. TC-BA-05：`transactions.amount` CHECK（`23514`）— deferred  
2. TC-BA-06：`template_ratings.score` CHECK（`23514`）— deferred  
3. TC-BA-11/12：生产只读预检 SQL — deferred

## 证据

1. 本地执行报告：`docs/test-reports/bl-sec-billing-ai-verifying-local-2026-04-18.md`
2. 结构化证据：`docs/test-reports/artifacts/bl-sec-billing-ai-verifying-2026-04-18/local-evidence.json`
3. 执行脚本：`scripts/test/bl-sec-billing-ai-verifying-e2e-2026-04-18.ts`

## 最终结论

在“仅验 `F-BA-01/02` + CHECK 类 deferred”的用户确认范围内，本批次验收通过，予以 sign-off。
