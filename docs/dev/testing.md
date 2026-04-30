# Testing Guide — aigcgateway

Three-tier strategy ported from joyce/KOLMatrix in `BL-TEST-INFRA-IMPORT`.

## Tiers

| Tier | Tool | Where | When |
|---|---|---|---|
| **Unit** | Vitest + jsdom + MSW | `src/**/__tests__/*.test.ts(x)` (preferred) or `tests/unit/*.test.ts(x)` | Pure logic, single module, no DB. Mock upstreams via MSW or `vi.mock`. |
| **Integration** | Vitest + Testcontainers (PostgreSQL) | `tests/integration/*.test.ts` | Behavior depends on real DB semantics: row locks, RLS, advisory locks, JSONB query operators, Decimal precision, native SQL functions. |
| **E2E** | Playwright + dev server | `tests/e2e/*.spec.ts` | Full browser flow against the built app + real DB + seed data. |

## Decision Tree — Unit vs Integration

```
Is the behavior under test purely a property of TypeScript code
(formatting, validation, computation, branching)?
  → Unit. Mock the DB / upstreams.

Does correctness depend on PG-specific semantics?
  - row locking (FOR UPDATE)            → Integration
  - constraint enforcement (CHECK / FK)  → Integration
  - JSONB / GIN / tsvector queries       → Integration
  - DECIMAL / NUMERIC precision          → Integration
  - native SQL function side effects     → Integration
  - migration smoke (this column exists) → Integration

Is it the user-visible workflow across pages?
  → E2E.
```

If two tiers could cover the same behavior, pick the cheapest tier
that proves it. Integration tests cost ~30-40s of container boot per
file; reserve them for the cases above.

## Running

```bash
# Unit (jsdom env, MSW lifecycle, ~25s for 554 specs)
npm run test
npm run test:coverage      # write coverage/lcov.info + html
npm run test:watch         # watch mode

# Integration (Node env, Testcontainers, requires Docker)
npm run test:integration

# E2E (auto-starts npm run dev on ${E2E_PORT:-3000})
npm run test:e2e
npm run test:e2e:ui        # Playwright UI mode
```

CI runs all three tiers as separate jobs (see `.github/workflows/ci.yml`).
Unit-tests + e2e-tests jobs upload `coverage/lcov.info` and
`playwright-report/` as artifacts on every run.

## Integration Test Template

```ts
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { setupTestDb, teardownTestDb, truncateAll } from "../helpers/db";

let prisma: PrismaClient;

beforeAll(async () => {
  ({ prisma } = await setupTestDb());
}, 180_000); // hookTimeout — container boot + migrate deploy

afterAll(async () => {
  await teardownTestDb();
});

beforeEach(async () => {
  await truncateAll(prisma); // start each test from a known empty state
});

describe("my feature", () => {
  it("does the thing", async () => {
    // ... seed → act → assert against `prisma`
  });
});
```

Boot + migrate runs once per Vitest worker. `tests/helpers/db.ts`
caches the container in module-level state; `setupTestDb()` is
idempotent within a worker.

`vitest.integration.config.ts` sets:
- `environment: "node"` — Testcontainers needs Node IO primitives.
- `testTimeout: 120_000` — long enough for slow concurrent SQL.
- `hookTimeout: 180_000` — container boot can hit 60s on cold WSL2.
- `fileParallelism: false` — every file shares one worker (and one
  container) until the suite grows large enough to justify per-file
  containers.

## MSW (unit tier)

Default handlers in `tests/mocks/handlers.ts` cover the four upstream
provider surfaces aigcgateway calls (OpenAI / OpenRouter / Anthropic /
SiliconFlow). Tests override per-call with `server.use(...)` —
`tests/setup.ts` resets handlers between specs.

```ts
import { HttpResponse, http } from "msw";

import { server } from "../../tests/mocks/server";
import { MOCK_BASE_URLS } from "../../tests/mocks/handlers";

it("falls back when OpenAI returns 503", async () => {
  server.use(
    http.post(`${MOCK_BASE_URLS.openai}/v1/chat/completions`, () =>
      HttpResponse.json({ error: { message: "overloaded" } }, { status: 503 }),
    ),
  );
  // ... drive code that hits the OpenAI URL ...
});
```

`onUnhandledRequest: "warn"` lets unrelated fetches (next/font CDN,
etc.) through with a console warning rather than failing the test.
Add an explicit handler if a test surfaces a noisy warning.

## Coverage Threshold

`vitest.config.ts` declares `lines: 60 / functions: 60 / branches: 50 /
statements: 60`. The first baseline run on `BL-TEST-INFRA-IMPORT`
records ~23%; the threshold intentionally fails on baseline so the gap
is visible. Raise the threshold in a follow-up batch as more tests
land.

CI's `unit-tests` job runs with `continue-on-error: true` so threshold
failure does not block other jobs.

## Mock Provider Server (E2E / integration alternative)

`tests/mocks/provider-server.ts` exports `startMockProvider()` — a
real HTTP server (Node's `createServer`) that simulates an
OpenAI-compatible provider on a random port. Use it when:

- The code under test reads its base URL from a `Provider` DB record
  (so MSW interception at `https://api.openai.com` doesn't help — the
  request actually goes to `http://127.0.0.1:NNNN`).
- The test runs E2E and a service worker isn't a fit.

For pure unit tests, prefer MSW.
