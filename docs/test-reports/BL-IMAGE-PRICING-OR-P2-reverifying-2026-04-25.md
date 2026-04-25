# BL-IMAGE-PRICING-OR-P2 Reverifying Report

**Date:** 2026-04-25  
**Evaluator:** Reviewer  
**Stage:** reverifying / fix_round=1  
**Result:** FAIL, do not sign off

## Summary

F-BIPOR-04 R1 prevents the 6 OR token-priced image channels from being overwritten by a manual model sync, but the batch still fails acceptance. Production still has 32/39 IMAGE channels with `costPrice={unit:"call",perCall:0}`, image smoke writes `call_logs.costPrice=0`, the provided smoke script uses a non-existent alias, and the pricing apply script hangs under the full production env after printing its summary.

## Local Verification

| Check | Result | Evidence |
|---|---:|---|
| `npm run build` | PASS | `docs/test-reports/artifacts/bl-image-pricing-or-p2-2026-04-25-codex/build.local.log` |
| `npx tsc --noEmit` | PASS | `docs/test-reports/artifacts/bl-image-pricing-or-p2-2026-04-25-codex/tsc.local.log` |
| `npx vitest run` | PASS, 385 tests | `docs/test-reports/artifacts/bl-image-pricing-or-p2-2026-04-25-codex/vitest.local.log` |
| Local `prisma migrate diff --from-migrations` | NOT VALID | Missing `--shadow-database-url`; production transaction dry-run used instead |

## Production Verification

| Check | Result | Evidence |
|---|---:|---|
| Production HEAD | PASS | `fba779a`, PM2 online; `prod-status.log` |
| Migration transaction dry-run | PASS | `BEGIN -> CREATE FUNCTION -> DROP TRIGGER -> CREATE TRIGGER -> ROLLBACK`; `prod-migration-transaction-dry-run.v2.log` |
| Pricing apply, env loaded | PARTIAL | 6 OR channels updated, but script process did not exit on its own due open Redis handle; `prod-pricing-apply.with-env.log` |
| Pricing idempotency | FAIL | Printed 6 `no change`, then `timeout` returned `EXIT_CODE=124`; `prod-pricing-idempotency.log` |
| 6 OR channel DB values | PASS | All 6 match spec token cost/sell price and 1.2 ratio; `prod-db-pricing-check.v2.json` |
| Trigger negative/positive test | PASS | IMAGE zero update blocked with SQLSTATE `23514`; TEXT zero update passed in rollback transaction; `prod-trigger-transaction-test.v3.json` |
| Full IMAGE channel scan | FAIL | 32/39 IMAGE channels still have zero costPrice; `prod-db-pricing-check.v2.json` |
| Manual model sync regression | FAIL | 6 OR channels retained token cost, but 32/39 IMAGE channels remained zero after sync; `prod-sync-regression-check.log` |
| Provided image smoke script | FAIL | Uses `gemini-2.5-flash-image`; production returns `model_not_found`; `prod-image-smoke.v2.log` |
| Manual canonical image smoke | FAIL | `google/gemini-2.5-flash-image` returned HTTP 200, but call_log has `costPrice="0"`, `promptTokens=null`, `completionTokens=null`; `prod-image-smoke-manual-canonical.v2.log` |

## Findings

1. **F-BIPOR-05 #11/#12 fail: 32/39 IMAGE channels still have zero costPrice.**  
   Evidence: `prod-db-pricing-check.v2.json` reports `imageCount=39`, `invalidImageCount=32`. Examples include `seedream-3.0`, `dall-e-3`, `gpt-image-1`, `qwen-image-*`, `gpt-image-2`, all with `costPrice={unit:"call",perCall:0}`. After manual `/api/admin/sync-models`, the 6 OR channels kept token pricing, but the other 32 remained zero.

2. **F-BIPOR-03/F-BIPOR-05 #10 fail: real image smoke writes zero cost.**  
   Evidence: manual canonical request to `/v1/images/generations` with `model="google/gemini-2.5-flash-image"` returned HTTP 200 and trace `trc_b5b1fk03vzr1ia80pvl04au8`, but `call_logs.costPrice="0"`, `promptTokens=null`, `completionTokens=null`. This does not satisfy `costPrice > 0` or the token formula assertion.

3. **F-BIPOR-03 smoke script uses the wrong model alias.**  
   Evidence: `scripts/pricing/verify-or-image-channels-2026-04-25.ts` hardcodes `gemini-2.5-flash-image`, while production accepts the canonical `google/gemini-2.5-flash-image`. The script returns `model_not_found`.

4. **F-BIPOR-01/F-BIPOR-05 #5/#8 fail under production env: pricing script does not exit cleanly.**  
   Evidence: with `.env.production` loaded, the script prints successful apply/no-change summaries but leaves a Redis client open. Idempotency run required `timeout` and returned `EXIT_CODE=124`.

5. **Spec mismatch: model sync endpoint is `/api/admin/sync-models`, not `/api/admin/run-inference`.**  
   Evidence: `src/app/api/admin/sync-models/route.ts` calls `runModelSync()`. `src/app/api/admin/run-inference/route.ts` performs classify/brand/capability inference only. I used `/api/admin/sync-models` for the actual regression trigger.

## Conclusion

Do not sign off. Keep status in `fixing`. Required fixes must at least address:

- Restore all non-OR IMAGE channel `costPrice` values or explicitly revise acceptance if those 32 zero-cost rows are intentionally out of scope.
- Fix image generation post-processing so successful image calls record usage/cost or revise the pricing formula acceptance with a supported data source.
- Fix `verify-or-image-channels-2026-04-25.ts` to use the production-valid model name.
- Ensure pricing CLI scripts terminate with exit code 0 under `.env.production`.
- Correct the spec/handoff endpoint from `/api/admin/run-inference` to `/api/admin/sync-models` for model-sync regression validation.
