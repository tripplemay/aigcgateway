# BL-SEC-BILLING-AI 本地验收报告（范围收敛）

- 批次：`BL-SEC-BILLING-AI`
- 阶段：`verifying`
- 环境：L1 本地（`http://localhost:3099`）
- 执行时间：`2026-04-18 11:37:24 +0800`
- 执行人：`codex: Reviewer`

## 结论（当前）

- 用户确认 sign-off 仅验 `F-BA-01/02`。
- 纳入签收并通过：TC-BA-01、TC-BA-02、TC-BA-03、TC-BA-04、TC-BA-08、TC-BA-09、TC-BA-10。
- `deferred`：TC-BA-05、TC-BA-06（CHECK 类）；TC-BA-11、TC-BA-12（生产只读预检）。
- TC-BA-07 不纳入本次签收判定（参考 `migrate status = up to date`）。

## 详细结果

1. TC-BA-01 并发透支防护：PASS  
证据：10 并发请求后 `finalBalance=0.1`，未出现负余额。
2. TC-BA-02 计费一致性：PASS  
证据：`call_logs(SUCCESS)=6`，`transactions(DEDUCTION, callLogId not null)=6`。
3. TC-BA-03 无重复 Transaction：PASS  
证据：`duplicate callLogId groups=0`。
4. TC-BA-04 事务中断回滚：PASS  
证据：事务中强制 `throw` 后 `call_logs=0`、`transactions=0`。
5. TC-BA-05 Transaction.amount CHECK：DEFERRED  
备注：按用户指令不纳入本次 sign-off 阻断。
6. TC-BA-06 TemplateRating.score CHECK：DEFERRED  
备注：按用户指令不纳入本次 sign-off 阻断。
7. TC-BA-07 migration 可执行性：BLOCKED  
现象：`npx prisma migrate dev --skip-generate` 进入交互提示 `Enter a name for the new migration`，本轮未创建新 migration。  
补充：`npx prisma migrate status` 显示 `Database schema is up to date!`。
8. TC-BA-08 类型检查：PASS  
证据：`npx tsc --noEmit` 最终通过（首轮并行执行时因 `.next/types` 竞态出现 TS6053，重跑后通过）。
9. TC-BA-09 构建：PASS  
证据：`npm run build` 成功。
10. TC-BA-10 测试回归：PASS  
证据：`npx vitest run` -> `96 passed (96)`。

## 证据文件

- 结构化证据 JSON：`docs/test-reports/artifacts/bl-sec-billing-ai-verifying-2026-04-18/local-evidence.json`
- 执行脚本：`scripts/test/_archive_2026Q1Q2/bl-sec-billing-ai-verifying-e2e-2026-04-18.ts`

## 风险与备注

1. 本轮并发请求 HTTP 状态均为 `200`，但仅 6 条成功扣费日志/流水，说明余额不足在后处理扣费阶段触发并回滚记录，符合当前实现语义。
2. 生产只读预检（TC-BA-11/12）本轮按用户指令 deferred。
3. 最终签收结论见 `docs/test-reports/BL-SEC-BILLING-AI-signoff-2026-04-18.md`。
