# Code Review — Batch 08: Hooks & Scripts

**Reviewer:** Claude (Senior Code Review Agent)
**Date:** 2026-04-17
**Scope:**
- `src/hooks/**/*.ts` / `.tsx` (5 files)
- `scripts/**/*.ts` / `.mjs` / `.sh` (82 files, top-level + `scripts/test/`)

---

## Part A — React Hooks

### [HIGH] H-01 — `use-mobile.ts`: Direct `window` access without SSR guard

**File:** `src/hooks/use-mobile.ts:9`

```ts
// BAD: window.matchMedia accessed unconditionally inside useEffect —
// BUT the file has no "use client" directive at the top.
const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
```

The file is missing the `"use client"` directive. All other hooks in this directory have it. If this hook is imported (directly or transitively) by a Server Component, `window` will be undefined at module evaluation time, causing a build-time or runtime crash. The hook relies on `useEffect` for deferred DOM access, but without the directive Next.js may not enforce the client boundary automatically.

**Fix:** Add `"use client";` at the top of the file, matching the pattern of the other hooks.

---

### [MEDIUM] H-02 — `use-exchange-rate.ts`: Module-level mutable singleton; silent error swallow

**File:** `src/hooks/use-exchange-rate.ts:5–18`

```ts
let cachedRate: number | null = null;   // module-level singleton

export function useExchangeRate(): number {
  const [rate, setRate] = useState(cachedRate ?? 7.3);
  useEffect(() => {
    if (cachedRate !== null) return;
    apiFetch<{ rate: number }>("/api/exchange-rate")
      .then(...)
      .catch(() => {});   // error silently dropped
  }, []);
  return rate;
}
```

Two issues:

1. **Module-level cache is never invalidated.** If the exchange rate changes while the app is running (or between HMR reloads in dev), the stale value is served forever. A stale rate directly affects billing display to users. There is no TTL or revalidation path.

2. **Silent `.catch(() => {})`** means the hook returns the hard-coded fallback `7.3` with no way for the UI to show an error or retry. If the exchange-rate API is down, all CNY/USD conversions silently use a potentially wrong rate.

**Fix:** Add a TTL to the cache (e.g., 10 minutes via `cachedAt` timestamp). Surface the error via an `error` state field so callers can show a staleness warning.

---

### [MEDIUM] H-03 — `use-async-data.ts`: `fetcher` identity instability can cause fetch loops

**File:** `src/hooks/use-async-data.ts:25–37`

```ts
const execute = useCallback(async () => {
  // ...
  const result = await fetcher();
  // ...
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, deps);
```

The hook explicitly suppresses the ESLint `react-hooks/exhaustive-deps` rule and does not include `fetcher` in `useCallback`'s dependency array. This is intentional by design — callers are expected to memoize `fetcher` themselves — but the hook does **not** document this contract in its JSDoc. If a caller passes an inline arrow function (the most natural usage), `deps` will be `[]`, `fetcher` changes every render, yet `execute` never updates, leading to stale closures calling an old version of `fetcher`.

Additionally there is **no abort controller** on the fetch. If `deps` change while a fetch is in flight, two concurrent fetches can race and the later-resolving one will overwrite the result of the newer one.

**Fix (two parts):**
1. Add an `AbortController` inside `execute`; check `signal.aborted` before calling `setData`.
2. Document explicitly in JSDoc that `fetcher` must be stable (wrapped in `useCallback` or defined outside the component).

---

### [MEDIUM] H-04 — `use-project.tsx`: `refresh` has a stale-closure dependency; errors swallowed silently

**File:** `src/hooks/use-project.tsx:54–64`

```ts
const refresh = useCallback(async () => {
  const r = await apiFetch<{ data: Project[] }>("/api/projects");
  setProjects(r.data);
  const currentStillExists = current && r.data.find((p) => p.id === current.id);
  // ...
}, [current]);   // ← 'current' captured; fine for staleness,
                 //   but no error handling here
```

Issues:
1. `refresh` has no `try/catch`. Any network error will result in an unhandled promise rejection thrown from a `useCallback` that callers (`refresh()`) do not necessarily await or wrap. Unlike `load`, which has a `try/catch`, `refresh` is naked.
2. `load` silently ignores errors via an empty `catch {}`. Callers have no way to distinguish "still loading" from "failed" other than `loading === false && data.length === 0`, which is ambiguous on first load vs. error.

**Fix:** Add `try/catch` to `refresh`; expose an `error` field from `ProjectContext` so the UI can show a retry prompt.

---

### [LOW] H-05 — `use-locale.tsx`: Hydration mismatch on SSR (minor)

**File:** `src/hooks/use-locale.tsx:26–29`

```ts
const [locale, setLocaleState] = useState<Locale>("en");
useEffect(() => {
  setLocaleState(detectLocale());
}, []);
```

This is the correct SSR-safe pattern (static initial state, hydrated via `useEffect`). However it will cause a hydration flicker: the first render is always `"en"`, then immediately switches to the user's stored locale, causing a layout shift for Chinese users. Depending on whether locale affects layout (e.g., different font sizes), this may be visible.

This is a known trade-off for localStorage-based locale detection and is acceptable here. No action required unless UX feedback surfaces.

---

## Part B — Scripts

### [CRITICAL] S-01 — `scripts/admin-auth.ts` and `scripts/stress-test.ts`: Hardcoded admin credentials

**Files:**
- `scripts/admin-auth.ts:5–6`
- `scripts/stress-test.ts:12–13`

```ts
// admin-auth.ts
const ADMIN_EMAIL = "codex-admin@aigc-gateway.local";
const ADMIN_PASSWORD = "Codex@2026!";

// stress-test.ts
const ADMIN_EMAIL = "codex-admin@aigc-gateway.local";
const ADMIN_PASSWORD = "Codex@2026!";
```

These credentials are committed to the git repository in plain text. Both scripts are designed to run against production (`BASE_URL=https://aigc.guangai.ai`). If `codex-admin@aigc-gateway.local` is a real production account, the password is now in version control history permanently.

**Fix:**
- Move credentials to environment variables: `ADMIN_EMAIL` / `ADMIN_PASSWORD`.
- Add `.env.test.local` (git-ignored) with the actual values and document the required vars in the script header.
- Rotate the production admin password if it matches what is in these files.

---

### [CRITICAL] S-02 — `scripts/test/template-governance-eval.mjs`: Hardcoded admin credentials

**File:** `scripts/test/template-governance-eval.mjs:89–93`

```js
const res = await api("/api/auth/login", {
  method: "POST",
  body: { email: "admin@aigc-gateway.local", password: "admin123" },
});
```

A separate set of hardcoded credentials (`admin@aigc-gateway.local` / `admin123`) committed to source control. Same risk as S-01.

**Fix:** Read from `ADMIN_EMAIL` / `ADMIN_PASSWORD` environment variables. Never commit real passwords.

---

### [CRITICAL] S-03 — `scripts/stress-test.ts`: Shell injection via header value interpolation

**File:** `scripts/stress-test.ts:34–40`

```ts
const headerFlags = Object.entries(opts.headers ?? {})
  .map(([k, v]) => `-H '${k}=${v}'`)
  .join(" ");

const cmd = `npx autocannon -c ${opts.connections} -d ${opts.duration} ${headerFlags} -j '${opts.url}'`;
const raw = execSync(cmd, { ... });
```

`k`, `v`, and `opts.url` are all interpolated directly into a shell string passed to `execSync`. The JWT obtained from the `login()` call at the top is placed into a header value. While the JWT is fetched from a controlled endpoint, `opts.url` contains `BASE` which comes from `process.env.BASE_URL`. A malicious `BASE_URL` value (e.g., `https://target.com'; rm -rf / #`) would execute arbitrary shell commands.

**Fix:** Use `spawn` with an array of arguments (already partially done in `spawnAutocannon`) instead of `execSync` with a template string. Alternatively, validate that `BASE_URL` is an https URL before use.

---

### [HIGH] S-04 — `scripts/e2e-test.ts`: Alipay webhook hit without signature — test teaches bad pattern

**File:** `scripts/e2e-test.ts:171–176`

```ts
await fetch(`${BASE}/api/webhooks/alipay`, {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: `out_trade_no=${orderId}&trade_status=TRADE_SUCCESS&total_amount=50`,
});
```

The webhook is called without any HMAC/RSA signature. If the production webhook handler does not enforce signature verification, a real attacker can credit arbitrary balances. The test passing here means the handler accepted an unsigned payment notification — which should be flagged for the backend handler review separately, but the test itself normalises the pattern.

**Note:** If the handler does enforce signatures in production but not in test mode (feature flag), this is acceptable. Confirm with the backend handler that signature verification is enforced in production.

---

### [HIGH] S-05 — `scripts/e2e-errors.ts` and `scripts/e2e-test.ts`: Test setup failures are not fatal

**File:** `scripts/e2e-errors.ts:39–69`

```ts
const reg = await fetch(`${BASE}/api/auth/register`, {...});
await reg.json();  // result ignored, no status check
const login = await fetch(`${BASE}/api/auth/login`, {...});
const loginData = await login.json();
token = loginData.token;  // undefined if login failed
```

The setup block (register → login → create project → create key) runs outside any `step()` wrapper and does not check HTTP status codes. If registration or login fails (e.g., the server is down or returns 500), `token` is `undefined`, `projectId` is `""`, and all subsequent tests fail with confusing errors like "Cannot read properties of undefined" rather than a clear "Setup failed: login returned 500". CI sees all steps as FAIL but has no root-cause signal.

**Fix:** Wrap setup in a `step("Setup", ...)` block or throw immediately on non-2xx. The same pattern exists in `e2e-test.ts` steps 1b and 1c — those do check status, so the pattern is inconsistent within the same file.

---

### [HIGH] S-06 — `scripts/stress-test.ts`: Hardcoded report output path; not parameterizable

**File:** `scripts/stress-test.ts:340–341`

```ts
fs.writeFileSync("docs/test-reports/stress-test-2026-04-04.md", report);
```

The output path is hardcoded with a date from months ago (`2026-04-04`). Every subsequent run silently overwrites the same file rather than creating a dated report. This destroys historical benchmarks.

**Fix:**

```ts
const date = new Date().toISOString().slice(0, 10);
const outPath = `docs/test-reports/stress-test-${date}.md`;
fs.writeFileSync(outPath, report);
```

---

### [HIGH] S-07 — `scripts/setup-zero-balance-test.ts`: Dummy password hash stored in DB

**File:** `scripts/setup-zero-balance-test.ts:37–40`

```ts
user = await prisma.user.create({
  data: {
    email: "test-zero-balance@example.com",
    passwordHash: "dummy",  // Not used for API testing
  },
});
```

The string `"dummy"` is stored as `passwordHash`. If the authentication system ever falls back to a timing-safe comparison against this value and a real user happens to have `"dummy"` as their password hash (e.g., collision), it would succeed. More critically, if someone calls the login endpoint with this email, the hash comparison will run against `"dummy"` — which is not a valid bcrypt/argon2 hash and may cause the hash library to throw an error that is swallowed, potentially returning a truthy auth result.

**Fix:** Store a properly-formatted but invalid hash: `passwordHash: await bcrypt.hash(randomBytes(32).toString('hex'), 10)` — this ensures a well-formed hash that is computationally infeasible to match.

---

### [HIGH] S-08 — `scripts/test/template-governance-eval.mjs`: Test data not cleaned up

**File:** `scripts/test/template-governance-eval.mjs:100–432`

The script creates: 2 user accounts, 1 project (with balance set via direct Prisma write), 1 admin template, 1 project template, 1 forked template, 1 MCP template, and multiple versions. The final `step("delete routes work")` only deletes the forked template and admin template — the project template, MCP template, and both user accounts are left in the database permanently. Re-running the script creates another set of orphaned records (the `${NOW}` suffix prevents idempotency collisions but accumulates garbage).

**Fix:** Add a cleanup step in a `finally` block that deletes all created resources in reverse-dependency order. At minimum, delete both test user accounts (cascades to projects/keys).

---

### [MEDIUM] S-09 — `scripts/stress-test.ts`: No concurrency limit on `runScenario`; sequential blocking

**File:** `scripts/stress-test.ts:300–336`

```ts
const scenarioA = runScenario({...});  // synchronous, blocks for 60s+
const scenarioB = runScenario({...});  // runs after A completes
const scenarioC = runScenario({...});  // runs after B completes
```

Scenarios A–D run sequentially via `execSync`, taking `(connections × duration)` per scenario (~4 × 60s = 4 minutes minimum). This is intentional for the cold/warm split but the comment "Mixed concurrency" in scenario E correctly uses `Promise.all`. The inconsistency means scenarios A–D don't actually test simultaneous load — each runs in isolation. Document this limitation explicitly or reconsider if truly parallel baselines are needed.

---

### [MEDIUM] S-10 — Multiple scripts: No timeout on `fetch` calls

**Files:** `scripts/e2e-test.ts`, `scripts/e2e-errors.ts`, `scripts/test-mcp.ts`, `scripts/test-mcp-errors.ts`

None of the `fetch()` calls pass an `AbortSignal` with a timeout. If the server is unresponsive (not down, just slow), the test process hangs indefinitely. CI has a global job timeout, but a hung test will consume the entire CI budget rather than failing fast with a meaningful error.

**Fix:** Wrap all test `fetch` calls with a global timeout helper or use `Promise.race` with a reject-after-N-seconds signal. Node.js 20+ supports `AbortSignal.timeout(ms)` natively.

---

### [MEDIUM] S-11 — `scripts/seed-marketing-templates.ts`: Hardcoded `PROJECT_ID`

**File:** `scripts/seed-marketing-templates.ts:27`

```ts
const PROJECT_ID = "cmnrcbgvm0007bn5ajdyybs2u";
```

The project ID is a production cuid hardcoded directly. If the script is run against a different environment (staging, a fresh DB restore), it silently fails with the pre-flight check `"Project not found"` and exits with code 1 — which is the correct behaviour. However, if a different environment happens to have a project with this ID (collision probability is low but not zero), the seed writes data into an unexpected project.

**Fix:** Accept `PROJECT_ID` as an environment variable with the hardcoded value as the default. Document the requirement in the script header.

---

### [MEDIUM] S-12 — `scripts/test/codex-env.sh`: `JWT_SECRET` is a weak constant

**File:** `scripts/test/codex-env.sh:6`

```sh
export JWT_SECRET="test-jwt-secret-2026"
```

This file is git-tracked. The secret `"test-jwt-secret-2026"` is designed for the test environment only, which is correct. However, if a developer accidentally deploys using `codex-env.sh` as the environment source (or if the CI script sources this file for integration tests against a semi-production DB), JWTs signed with this predictable key would be forgeable.

**Note:** This is acceptable if the test environment is fully isolated (ephemeral DB). The risk is operational: no guard prevents the secret from leaking into a higher environment. Consider adding a comment: `# NEVER use this file outside the isolated test environment.`

---

### [LOW] S-13 — `scripts/test-mcp.ts`: `selectedTextModel` referenced before assignment

**File:** `scripts/test-mcp.ts:373, 879`

```ts
model: selectedTextModel ?? "deepseek-v3",  // line 373
```

`selectedTextModel` is used but never declared or assigned in the file. This will throw a `ReferenceError` at runtime when steps 16b and 21 execute. These steps are regression tests that would silently fail at the `JSON.parse` level rather than surfacing the missing variable.

**Fix:** Declare `let selectedTextModel = ""` alongside `selectedImageModel` at the top of the file and populate it from `list_models` in step 3.

---

### [LOW] S-14 — `scripts/e2e-test.ts`: `keyId` assigned but never used; `orderRes` / `txnRes` unused

**File:** `scripts/e2e-test.ts:12, 159–161`

```ts
let keyId = "";          // line 12 — assigned in step 4, never read after
const orderRes = await api(...)   // line 159 — result unused
const txnRes  = await api(...)    // line 161 — result unused
```

Dead code. `keyId` is assigned in step 4 but never used again (the revoke-key test in `e2e-errors.ts` manages its own `keyId`). `orderRes` and `txnRes` in step 7 are fetched but their results are thrown away (a fresh order is created two lines later). This wastes two API calls per test run and obscures the real logic.

---

### [LOW] S-15 — `scripts/init-ssl.sh`: `--force-renewal` flag on every run

**File:** `scripts/init-ssl.sh:68`

```bash
docker compose -f "$COMPOSE_FILE" run --rm certbot certonly \
    --webroot \
    --force-renewal \
    $DOMAIN_ARGS
```

`--force-renewal` re-requests a certificate even if the existing one is valid. Let's Encrypt rate-limits to 5 duplicate certificates per week per domain. If this script is run more than 5 times in a week (e.g., during debugging), the domain will be blocked from new certificates for up to 7 days. This should only be run once during initial setup; subsequent renewals are handled by the `certbot` service.

---

### [LOW] S-16 — `scripts/stress-test.ts`: `stress-test-2026-04-04.md` header date is hardcoded

**File:** `scripts/stress-test.ts:219`

```ts
"# 压力测试报告 — 2026-04-04",
```

Even if the output filename is fixed (addressed in S-06), the Markdown report heading always says `2026-04-04`. A reviewer reading the report has no way to determine when it was actually generated.

**Fix:** Use `new Date().toLocaleDateString('zh-CN')` in the report header.

---

## Summary

| Severity | Count | Items |
|----------|-------|-------|
| CRITICAL | 3 | S-01 (hardcoded admin creds), S-02 (hardcoded admin creds in eval script), S-03 (shell injection in stress-test) |
| HIGH     | 5 | H-01 (missing "use client"), S-04 (unsigned webhook), S-05 (silent setup failures), S-06 (hardcoded report path), S-07 (dummy password hash) |
| MEDIUM   | 6 | H-02 (stale exchange rate cache + silent error), H-03 (missing abort + undocumented fetcher contract), H-04 (refresh no error handling), S-08 (test data not cleaned up), S-09 (sequential stress scenarios), S-10 (no fetch timeout), S-11 (hardcoded project ID), S-12 (weak JWT secret in git) |
| LOW      | 4 | H-05 (hydration flicker), S-13 (selectedTextModel undefined), S-14 (dead code), S-15 (--force-renewal risk), S-16 (hardcoded report date) |

**Verdict: BLOCK — 3 CRITICAL issues must be resolved before this code reaches production.**

The admin passwords in `scripts/admin-auth.ts`, `scripts/stress-test.ts`, and `scripts/test/template-governance-eval.mjs` are committed to version control. If any of these match real production account passwords, they must be rotated immediately regardless of whether code changes are made.

