# BL-BILLING-AUDIT-EXT-P1 复验报告（reverifying / 2026-04-25 round2）

- 批次：`BL-BILLING-AUDIT-EXT-P1`
- 阶段：`reverifying`
- 执行人：Codex / Reviewer
- 触发：生产已完成 fix_round 2（F-BAX-08）

## 结论

- 结论：**通过，可签收**
- F-BAX-07：18/18 通过（含 #11、#18）
- F-BAX-08：按最新裁决口径通过（OR 路由项按 backlog 2B 不计入本批 fail）

## 关键复验结果

1. 生产 `seedream-3` 抽样：`call_logs.costPrice=0.005069 > 0`（PASS）
2. 后端校验：IMAGE channel `perCall=0` -> `400 IMAGE_CHANNEL_REQUIRES_PERCALL_PRICE`；TEXT channel 同值 -> `200`（PASS）
3. fetcher 复验：`volcengine records=126`、`openrouter records=62`、`chatanywhere records=0` 且无异常（PASS）
4. 24h 观测：`pm2 unstable_restarts=0`，错误关键词命中 `0`，`call_logs source` 分组存在 `probe/sync/api`（PASS）
5. 本地基线：`build`/`tsc`/`vitest(306/306)`/`prisma migrate diff` 均通过（PASS）

## 证据

- 生产 smoke：`docs/test-reports/artifacts/bl-billing-audit-ext-p1-reverifying-2026-04-25-codex/pricing-smoke-reverify.log`
- 后端 guard：`docs/test-reports/artifacts/bl-billing-audit-ext-p1-reverifying-2026-04-25-codex/admin-channel-price-guard-reverify.log`
- fetchers：`docs/test-reports/artifacts/bl-billing-audit-ext-p1-reverifying-2026-04-25-codex/fetchers-prod-reverify-2026-04-22.log`
- 24h 观测：`docs/test-reports/artifacts/bl-billing-audit-ext-p1-reverifying-2026-04-25-codex/ops-24h-reverify.log`
- 本地基线：
  - `docs/test-reports/artifacts/bl-billing-audit-ext-p1-reverifying-2026-04-25-codex/build.local.log`
  - `docs/test-reports/artifacts/bl-billing-audit-ext-p1-reverifying-2026-04-25-codex/tsc.local.log`
  - `docs/test-reports/artifacts/bl-billing-audit-ext-p1-reverifying-2026-04-25-codex/vitest.local.log`
  - `docs/test-reports/artifacts/bl-billing-audit-ext-p1-reverifying-2026-04-25-codex/prisma-migrate-diff.sql`

## 判定备注（按 Planner 新口径）

- `verify-image-channels-2026-04-24.ts` 结果为 `1/3 PASS`，其中 `gpt-image-mini` 与 `gemini-3-pro-image` 的 `costPrice=0` 来自 OpenRouter 路由。
- 该两项属于决策 2B 已延期范围（`BL-IMAGE-PRICING-OR-P2`），不作为本批次失败项。
- 本批签收锚点为：`seedream-3` 非零计费恢复 + 30 条定价迁移 + 幂等 + 后端约束生效。
