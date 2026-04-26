# BL-IMAGE-PRICING-OR-P2 Signoff

**Date:** 2026-04-26  
**Evaluator:** Reviewer  
**Stage:** reverifying / fix_round=2  
**Result:** PASS

## Scope

Validated OpenRouter token-priced image channel pricing, DB trigger guard, image-via-chat token cost calculation, pricing script process cleanup, and model-sync regression protection after production deploy `278b18c`.

## Evidence

| Acceptance | Result | Evidence |
|---|---:|---|
| `npm run build` | PASS | `docs/test-reports/artifacts/bl-image-pricing-or-p2-2026-04-26-codex/build.local.log` |
| `npx tsc --noEmit` | PASS | `docs/test-reports/artifacts/bl-image-pricing-or-p2-2026-04-26-codex/tsc.local.log` |
| `npx vitest run` | PASS, 390 tests | `docs/test-reports/artifacts/bl-image-pricing-or-p2-2026-04-26-codex/vitest.local.log` |
| Migration production dry-run | PASS | `prod-migration-transaction-dry-run.log` shows `BEGIN -> CREATE FUNCTION -> DROP TRIGGER -> CREATE TRIGGER -> ROLLBACK` |
| Production deploy version | PASS | `prod-status.log`: production HEAD `278b18c`, PM2 online |
| P1 image pricing restore script | PASS | `prod-p1-image-pricing-apply.log`: 30 channels inspected, exit code 0 |
| OR image pricing apply/idempotency | PASS | `prod-or-image-pricing-apply.log`: 6 `no change`, exit code 0 |
| 6 OR channel DB pricing | PASS | `prod-db-pricing-check.json`: all 6 match spec token prices and sell/cost ratio |
| Full IMAGE channel scan | PASS | `prod-db-pricing-check.json`: `imageCount=39`, `invalidImageCount=0` |
| Trigger negative/positive test | PASS | `prod-trigger-test.json`: IMAGE zero update blocked with SQLSTATE `23514`; TEXT zero update passed in rollback transaction |
| Production image smoke | PASS | `prod-or-image-smoke.log`: HTTP 200, prompt=6, completion=1294, `costPrice=0.0032368`, formula diff=0 |
| Model-sync regression | PASS | `prod-sync-regression-check.log`: `/api/admin/sync-models` returned 202; after sync `invalidImageCount=0`, 6 OR token prices retained |

## Key Results

- Production is running `278b18c` and PM2 `aigc-gateway` workers are online.
- Local quality gates pass: build, typecheck, and 390 Vitest tests.
- Pricing scripts now exit cleanly under `.env.production`; prior Redis handle hang is resolved.
- The 6 OpenRouter image channels use token pricing matching spec §3.1, with sell price at 1.2x.
- All 39 production IMAGE channels have valid non-zero cost pricing.
- The DB trigger blocks invalid IMAGE zero-cost writes while allowing TEXT writes.
- Real image generation via `google/gemini-2.5-flash-image` writes token usage and non-zero `call_logs.costPrice` exactly matching `(prompt_tokens*0.30 + completion_tokens*2.50)/1e6`.
- Manual model sync through `/api/admin/sync-models` no longer resets IMAGE channel pricing.

## Conclusion

BL-IMAGE-PRICING-OR-P2 meets the F-BIPOR-05 acceptance criteria. Signoff approved.
