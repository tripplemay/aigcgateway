# tests/integration/

Integration tests that exercise real PostgreSQL (via Testcontainers).

Run: `npm run test:integration` (Node env, 120s timeout, single worker).

Boot/migrate cost is ~30-40s per file, so keep this directory small —
add a file only when the behavior under test depends on real DB
semantics (concurrent writes, RLS, advisory locks, JSONB query
operators, Decimal precision). Pure logic belongs under
`src/**/__tests__/`.

First example landing in F-TI-05:
- `deduct-balance-atomic.test.ts` — concurrent `deduct_balance(user, amount)`
  must not over-spend.
