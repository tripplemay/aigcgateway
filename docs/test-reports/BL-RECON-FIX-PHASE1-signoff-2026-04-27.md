# BL-RECON-FIX-PHASE1 签收报告（verifying / PASS）

- 批次：`BL-RECON-FIX-PHASE1`
- 阶段：`verifying`
- 验收人：`Reviewer (Codex)`
- 结论：`10/10 PASS`（满足 F-RF-04）

## 验收结果
1. `npx tsc --noEmit`：PASS
2. `npm run build`：PASS
3. `npx vitest run`：PASS（`62 files / 452 tests`）
4. F-RF-01 单测（ExpenseDate filter）PASS（`volcengine.test.ts`）
5. cross-5days 集成模拟 PASS：5 天重跑仅在 `2026-04-02` 写入 1 行目标 model
6. F-RF-02 单测（CNY→USD）PASS（`reconcile-job.test.ts`）
7. CNY→USD 落库证据 PASS：`3.25 CNY -> 0.44525 USD`，details 含 `upstreamAmountOriginal/currency/exchangeRateApplied`
8. 审计脚本在测试 DB 运行 PASS（baseline 输出无错误）
9. 审计脚本 `⚠️` 标记机制 PASS（mock image+token channel 后命中）
10. 签收报告：PASS（本文件）

## 关键证据
- 静态与全量回归：
  - `docs/test-reports/artifacts/bl-recon-fix-phase1-2026-04-27-codex-verifying/tsc.log`
  - `docs/test-reports/artifacts/bl-recon-fix-phase1-2026-04-27-codex-verifying/build.log`
  - `docs/test-reports/artifacts/bl-recon-fix-phase1-2026-04-27-codex-verifying/vitest.log`
- F-RF-01 / F-RF-02 指定单测：
  - `docs/test-reports/artifacts/bl-recon-fix-phase1-2026-04-27-codex-verifying/volcengine.test.log`
  - `docs/test-reports/artifacts/bl-recon-fix-phase1-2026-04-27-codex-verifying/reconcile-job.test.log`
- 行为级验证：
  - `docs/test-reports/artifacts/bl-recon-fix-phase1-2026-04-27-codex-verifying/reconcile-cross-5days.json`
  - `docs/test-reports/artifacts/bl-recon-fix-phase1-2026-04-27-codex-verifying/cny-usd-evidence.json`
- 审计脚本验证：
  - `docs/test-reports/artifacts/bl-recon-fix-phase1-2026-04-27-codex-verifying/audit-image-pricing-testdb-baseline.md`
  - `docs/test-reports/artifacts/bl-recon-fix-phase1-2026-04-27-codex-verifying/audit-image-pricing-testdb-mock.md`

## 审计输出片段（tc9）
- `Channels using token-priced costPrice (⚠️ suspect for image modality): **1**`
- `### \`codex-mock-image-token-flag\` (Codex Mock Image Token Flag)`
- `| openrouter | ... | {unit:'token', in/1M:0.3, out/1M:2.5} | ... | ⚠️ token-priced image |`

## 备注
- 本地 `codex-setup.sh` 需显式注入 `ADMIN_SEED_PASSWORD` 才能过 seed（本轮已通过环境变量注入完成）。
- cross-5days 脚本执行期间出现其他 provider 缺 key 的预期 warning，不影响本批次断言目标。
- 按 spec 明确排除项：未做生产 reconcile 重跑、未回填历史 BIG_DIFF、未改 channel 配置（留 Phase 2 决策）。

## 结论
BL-RECON-FIX-PHASE1 已满足当前验收标准，建议将 `progress.json` 置为 `done`，并将本报告写入 `docs.signoff`。
