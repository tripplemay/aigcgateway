# BL-BILLING-AUDIT-EXT-P2 验收报告（verifying / 2026-04-25）

- 批次：`BL-BILLING-AUDIT-EXT-P2`
- 阶段：`verifying`
- 执行人：Codex / Reviewer
- 环境：本地 + 生产（`https://aigc.guangai.ai`）

## 结论

- 结论：**通过，可签收**
- F-BAP2-05：15/15 通过

## 验收项判定（F-BAP2-05）

1. `npm run build`：PASS
2. `npx tsc --noEmit`：PASS（清理 `.next` 后复跑通过）
3. `npx vitest run`：PASS（`353/353`）
4. Prisma migrations 生产 dry-run：PASS（命令执行成功）
5. 手动 rerun `2026-04-22 + volcengine`：PASS（`rowsWritten=126`，表内有 status）
6. OpenRouter 对账 per-model 行：PASS（`2026-04-22` 有多条 modelName）
7. ChatanyWhere（provider=openai）对账：PASS（有 `(all)` 行，empty 口径成立）
8. DeepSeek 余额快照：PASS（近 24h 新增 `CNY+USD` 两条）
9. Tier2 delta（隔日快照）生效：PASS（openrouter tier=2 有 delta 行）
10. `/admin/reconciliation` 面板：PASS（页面加载、趋势图、过滤输入、重跑控件可用）
11. 自动对账定时执行：PASS（近 72h 自动写入 `reportDate=2026-04-24`；按最新口径以“每日自动执行”判定）
12. SystemLog `BILLING_AUDIT`：PASS（近 72h 有 INFO/WARN）
13. call_logs TTL：PASS（`olderThan30d=0`）
14. BIG_DIFF 占比：PASS（近 30d `2.5% < 30%`）
15. signoff 报告：PASS（已生成）

## 关键证据

- 本地基线：
  - `docs/test-reports/artifacts/bl-billing-audit-ext-p2-verifying-2026-04-25-codex/build.local.log`
  - `docs/test-reports/artifacts/bl-billing-audit-ext-p2-verifying-2026-04-25-codex/tsc.local.log`
  - `docs/test-reports/artifacts/bl-billing-audit-ext-p2-verifying-2026-04-25-codex/vitest.local.log`
  - `docs/test-reports/artifacts/bl-billing-audit-ext-p2-verifying-2026-04-25-codex/prisma-migrate-diff.sql`
- 生产验收（API+DB）：
  - `docs/test-reports/artifacts/bl-billing-audit-ext-p2-verifying-2026-04-25-codex/prod-api-db-verification.log`
  - `docs/test-reports/artifacts/bl-billing-audit-ext-p2-verifying-2026-04-25-codex/prod-api-filter-check.log`
  - `docs/test-reports/artifacts/bl-billing-audit-ext-p2-verifying-2026-04-25-codex/prisma-migrate-diff.prod.sql`
  - `docs/test-reports/artifacts/bl-billing-audit-ext-p2-verifying-2026-04-25-codex/call-logs-ttl-check.prod.json`
- 页面动态证据：
  - `docs/test-reports/artifacts/bl-billing-audit-ext-p2-verifying-2026-04-25-codex/admin-reconciliation-page.png`

## 说明

- #11（“04:30 UTC”）按框架最新 adjudication 采用“语义意图优先”：要求是**每日自动执行并产出对账记录**。当前实现为启动即跑 + 每 24h 间隔，且生产已连续自动产出 reconciliation 与 BILLING_AUDIT 日志，故判定通过。
