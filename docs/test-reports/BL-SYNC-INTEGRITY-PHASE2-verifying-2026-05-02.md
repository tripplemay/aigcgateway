# BL-SYNC-INTEGRITY-PHASE2 Verifying Report

- Batch: `BL-SYNC-INTEGRITY-PHASE2`
- Evaluator: `Codex / Reviewer`
- Date: `2026-05-02 10:55:00 CST`
- Commit under test: `a7ff707`
- Conclusion: `FAIL`

## Summary

This batch is not ready for signoff yet.

- `F-SI2-01` passes: the orphan zero-price channel disable script works in dry-run, apply, and idempotent rerun modes.
- `F-SI2-03` passes: the zero-price scan script remains read-only and emits consistent JSON + CSV output.
- `F-SI2-02` fails on a contract gap: `/api/admin/sync-status` does not count enabled aliases whose `sellPrice` is stored as JSON `null`, so `unpricedActiveAliases` stays at `0` and the new alias-level warning chip cannot render for that case.

Recommended next status: `fixing`

## Acceptance Results

### Harness PASS

- `bash scripts/test/codex-setup.sh`: PASS
- `bash scripts/test/codex-wait.sh`: PASS

### F-SI2-01 PASS

- Script exists: [disable-orphan-zero-price-channels.ts](/Users/yixingzhou/project/aigcgateway/scripts/maintenance/disable-orphan-zero-price-channels.ts)
- Pure helper coverage passed in [disable-orphan-zero-price-channels.test.ts](/Users/yixingzhou/project/aigcgateway/scripts/maintenance/__tests__/disable-orphan-zero-price-channels.test.ts)
- Runtime smoke confirmed:
  - `DRY_RUN=1` only lists target ids
  - real apply updates only disabled-alias-only zero-price ACTIVE channels
  - second run is idempotent with `0 affected`

Evidence:

```json
{
  "dryRun": true,
  "applyAffected": 2,
  "rerunAffected": 0
}
```

### F-SI2-03 PASS

- Script exists: [scan-zero-price-channels.ts](/Users/yixingzhou/project/aigcgateway/scripts/maintenance/scan-zero-price-channels.ts)
- Pure helper coverage passed in [scan-zero-price-channels.test.ts](/Users/yixingzhou/project/aigcgateway/scripts/maintenance/__tests__/scan-zero-price-channels.test.ts)
- Runtime scan confirmed:
  - output remains read-only
  - JSON and CSV artifacts are generated together
  - row counts stay consistent between SQL and emitted data

### F-SI2-02 FAIL

Blocking finding:

1. `unpricedActiveAliases` misses JSON `null` rows
   - The route in [route.ts](/Users/yixingzhou/project/aigcgateway/src/app/api/admin/sync-status/route.ts) counts only aliases matching `enabled = true` and `(sellPrice IS NULL OR sellPrice::text = '{}')`
   - A real Prisma-created alias with `sellPrice: null` persisted as JSON `null`, not SQL `NULL`
   - Raw SQL inspection showed `sell_price_text = 'null'`
   - As a result, the route still returned `unpricedActiveAliases: 0` after inserting an enabled alias with JSON-null `sellPrice`
   - The alias-level warning chip in [page.tsx](/Users/yixingzhou/project/aigcgateway/src/app/(console)/admin/operations/page.tsx) therefore never appears for this valid unpriced alias case

Evidence:

```json
{
  "enabledAliasFixture": true,
  "sellPriceStoredAs": "json-null",
  "routeResult": {
    "unpricedActiveAliases": 0,
    "zeroPriceActiveChannels": 4
  }
}
```

## Regression

- `npx tsc --noEmit`: PASS
- Targeted vitest for maintenance helpers: PASS
- `npm run test`: PASS
- `npm run build`: PASS

## Conclusion

- `F-SI2-01`: accepted
- `F-SI2-02`: rejected
- `F-SI2-03`: accepted
- `F-SI2-04`: rejected because the batch is not ready for signoff

This batch must return to `fixing`.
