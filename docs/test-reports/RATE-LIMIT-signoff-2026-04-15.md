# RATE-LIMIT Signoff 2026-04-15

> 状态：**Evaluator 验收通过（L1）**
> 触发：`F-RL-08` 全量验收完成，10/10 检查项通过。

---

## 验收范围

- 批次：`RATE-LIMIT`
- 规格：`docs/specs/RATE-LIMIT-spec.md`
- 验收环境：`localhost:3099`（L1）
- 验收脚本：`scripts/test/rate-limit-f-rl-08-verifying-e2e-2026-04-15.ts`
- 验收报告：`docs/test-reports/rate-limit-f-rl-08-verifying-e2e-2026-04-15.json`

---

## 结论

- `F-RL-01` ~ `F-RL-07` 的关键验收点全部通过。
- `F-RL-08`（Codex 执行项）完成，报告 `pass=true`，`passCount=10`，`failCount=0`。
- 限流链路（RPM/TPM/Burst/Spend）与三维度（Key/User/Project）均有实测 429 证据。

---

## 关键证据

- Burst 并发 15 次触发 `burst_limit_exceeded`（10/15 为 429）。
- Key 维度 RPM：触发 `rate_limit_exceeded on key`。
- User 维度 RPM：触发 `rate_limit_exceeded on user`。
- Project 维度 RPM：触发 `rate_limit_exceeded on project`。
- TPM：触发 `token_rate_limit_exceeded`。
- Spend：触发 `spend_rate_exceeded`。
- Project Settings 修改 `rateLimit` 后即时生效（无需重启）。
- Admin 全局默认值（`GLOBAL_DEFAULT_KEY_RPM`）修改后即时生效。
- `SystemLog(category=RATE_LIMIT)` 有完整事件，覆盖 `burst/rpm/tpm/spend`。
- `get_usage_summary.rateLimitedCount` 与项目维度 RATE_LIMIT 日志计数一致。

---

## 风险与备注

- 本次为 L1 本地验收；不包含外部 provider 不确定性（L2）。
- 本次为受控 mock-provider 验证，聚焦限流逻辑与配置即时生效。

---

## Harness 说明

本批次按 Harness 状态机完成 `planning → building → verifying → done` 交付。
`progress.json` 已写入 `docs.signoff`，并置为 `status: "done"`。
