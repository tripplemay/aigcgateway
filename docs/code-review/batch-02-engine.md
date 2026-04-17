# Code Review — Batch 02: Engine Layer
**Date:** 2026-04-17
**Reviewer:** Claude Sonnet 4.6 (automated code review)
**Scope:**
- src/lib/engine/**/*.ts - router, openai-compat, adapters, sse-parser, cooldown, failover, config-overlay, types
- src/lib/api/**/*.ts - post-process, rate-limit, auth-middleware, balance-middleware, errors, prompt-validation
- src/app/api/v1/chat/completions/route.ts
- src/app/api/v1/images/generations/route.ts

---

## CRITICAL

None found.

---

## HIGH

### [HIGH-01] Stream timeout AbortController cleared before body is read
**File:** src/lib/engine/openai-compat.ts:218-262

`fetchWithProxy` sets a 60s `AbortController`, but clears it in the `finally` block as soon as HTTP headers arrive. For streaming responses the body has not been read at that point. If the upstream provider stalls after sending headers, the connection hangs indefinitely.

Evidence:
```ts
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 60_000);
try {
  // ...fetch and get response...
  return response;   // body not yet consumed
} finally {
  clearTimeout(timeoutId);  // timeout cancelled here, before any chunk is read
}
```

Impact: Each stalled streaming connection holds a server-side TCP socket indefinitely. Under load this exhausts the connection pool. Affects all 11 providers on the streaming path.

Fix: Do not clear the timeout in the `fetchWithProxy` finally block. Instead, expose the `AbortController` (or a cancel handle) to the stream consumer and clear the timeout only after `done=true` or an error is signalled in the `ReadableStream.start()` handler.

---

### [HIGH-02] Upstream ReadableStream reader not cancelled on streaming error
**File:** src/app/api/v1/chat/completions/route.ts:359-379

When `reader.read()` throws inside the `ReadableStream.start()` callback, the catch block calls `controller.error(err)` but never calls `reader.cancel()` or `reader.releaseLock()`. The lock on the upstream body stream is never released, and the TCP connection cannot be returned to the pool.

Evidence:
```ts
} catch (err) {
  controller.error(err);
  if (rlKey && rlMember) rollbackRateLimit(rlKey, rlMember).catch(() => {});
  processChatResult({ ... });
  // missing: reader.cancel()
}
```

Impact: Every streaming error (timeout, network drop, provider 5xx) leaks one TCP connection. At high error rates this depletes the connection pool.

Fix:
```ts
} catch (err) {
  try { reader.cancel(); } catch { /* ignore */ }
  controller.error(err);
  // ...
}
```

---

### [HIGH-03] `processChatResultAsync` issues an extra DB query per call to fetch the Project
**File:** src/lib/api/post-process.ts:168-175

The route handler already holds the `project` object from `auth.ctx.project`, but `PostProcessParams` has no `project` field, so `processChatResultAsync` re-fetches it every time to call `recordTokenUsage`:

```ts
const project = await prisma.project.findUnique({
  where: { id: params.projectId },
  select: { id: true, rateLimit: true },
});
```

Impact: One extra DB round-trip per successful API call. In a high-throughput deployment this is a measurable load increase on the database. Although fire-and-forget, it still consumes connection pool slots.

Fix: Add `project?: Pick<Project, 'id' | 'rateLimit'> | null` to `PostProcessParams`; pass it from the route handler; skip the re-fetch when already present.

---

### [HIGH-04] `projectId` falls back to empty string `""` when project is null, corrupting CallLog records
**File:** src/app/api/v1/images/generations/route.ts:123, src/app/api/v1/chat/completions/route.ts:148

```ts
projectId: project?.id ?? user.defaultProjectId ?? "",
```

When both `project` and `user.defaultProjectId` are null (possible for users who have not created a project), `projectId` is written as `""` to `CallLog.projectId`. The field is a non-nullable String in Prisma, so no DB error is raised, but billing aggregation, usage dashboards, and spend tracking all fail to associate these records with any project.

Impact: For projectless users, all CallLog records have an empty projectId, making billing data unreliable.

Fix: Return 400 with `"no active project found"` if `projectId` resolves to empty, rather than writing an empty string.

---

## MEDIUM

### [MED-01] `mergeSystemMessages` silently drops multipart-content system messages
**File:** src/lib/engine/config-overlay.ts:84

```ts
const content = typeof msg.content === "string" ? msg.content : "";
```

When a `system` message has `content: ChatContentPart[]` (valid OpenAI multimodal format), the function silently replaces it with an empty string before merging. The system instructions are lost without any error.

Impact: For providers that do not support the system role, sending a multimodal system message yields a silently wrong prompt.

Fix: Extract text parts from `ChatContentPart[]`, or throw `INVALID_REQUEST` when multipart system content is encountered on a provider that cannot handle it.

---

### [MED-02] `VolcengineAdapter.imageViaChat` overrides parent with a weaker two-stage extractor
**File:** src/lib/engine/adapters/volcengine.ts:53-78

The parent `OpenAICompatEngine.imageViaChat` has four extraction stages (multipart parts, base64 data URI, URL with extension, any HTTPS URL). `VolcengineAdapter` overrides `imageViaChat` completely with only two stages (URL with extension, `content.startsWith("http")`). Because the method is overridden, the four-stage parent logic never runs for Volcengine.

Impact: Volcengine responses containing base64 inline images or extensionless CDN URLs will throw `PROVIDER_ERROR` 502 instead of being handled correctly.

Fix: Either call `super.imageViaChat(request, route)` or extract the four-stage logic into a shared protected static method both paths call.

---

### [MED-03] `withFailover` throws `undefined` when called with an empty candidates array
**File:** src/lib/engine/failover.ts:101-137

```ts
const maxAttempts = Math.min(candidates.length, MAX_FAILOVER_RETRIES + 1);
// if candidates.length === 0, maxAttempts = 0
for (let i = 0; i < maxAttempts; i++) { ... } // loop never runs
throw lastError; // lastError is undefined
```

Impact: Callers receive `throw undefined`; the `catch (err)` branch evaluates `err instanceof EngineError` as false and `(err as Error).message` as `undefined`, resulting in a `502 provider_error "undefined"` response to clients.

Fix: Add a guard at the top of `withFailover`:
```ts
if (candidates.length === 0) {
  throw new EngineError("No candidates available", ErrorCodes.CHANNEL_UNAVAILABLE, 503);
}
```

---

### [MED-04] Streaming chunk transformer silently discards all JSON parse errors
**File:** src/lib/engine/openai-compat.ts:97-108

```ts
transform(sseEvent, controller) {
  try {
    const raw = JSON.parse(sseEvent.data) as Record<string, unknown>;
    controller.enqueue(raw as unknown as ChatCompletionChunk);
  } catch {
    // skip unparseable chunks
  }
}
```

If a provider sends an inline error object mid-stream (e.g. `{"error": {"message": "..."}}`) without a subsequent `[DONE]`, it is silently discarded. The consumer receives a truncated but error-free stream; `processChatResult` has no error to record; failover is never triggered.

Impact: Mid-stream provider errors are invisible to the monitoring and billing pipeline.

Fix: After `JSON.parse` succeeds, call `this.throwIfBodyError(raw)` (or `mapBodyError`) to detect body-level errors and propagate them as `EngineError` through the stream controller.

---

### [MED-05] `rpmCheck` reads count before writing the member — TOCTOU window allows limit overshoot
**File:** src/lib/api/rate-limit.ts:183-199

The Redis pipeline orders operations as: `zremrangebyscore`, `zcard` (reads count), `zadd` (adds member), `expire`. The `currentCount` check is based on the count *before* the member is added. Under concurrent requests across multiple instances, requests at `currentCount == limit - 1` each read the same value and all pass, then all add their members, exceeding the limit by N-1.

Impact: RPM limits are soft, not hard. At burst scale the actual throughput can exceed the configured limit by the number of concurrent requests.

Fix: Reorder the pipeline to `zadd` first, then `zcard` to get the post-write count; alternatively use a Lua script for atomicity.

---

### [MED-06] `sanitizeErrorMessage` regex `[a-z]{2}-[a-z]+-\d+` can match model slugs, discarding useful error messages
**File:** src/lib/engine/types.ts:186, 221-224

```ts
sanitized = sanitized.replace(/\b[a-z]{2}-[a-z]+-\d+\b/g, "[infra removed]");
// later:
if (sanitized.includes("[infra removed]")) {
  sanitized = "Model unavailable, please try list_models to find alternatives";
}
```

The regex `\b[a-z]{2}-[a-z]+-\d+\b` targets AWS/Aliyun region identifiers (e.g. `us-east-1`) but can also match common model-name fragments (e.g. `gpt-4o-1` would not match but edge cases exist). Any unintended match causes the entire error message — including meaningful 4xx details like "Invalid API key" — to be replaced with a generic string.

Impact: Users and operators may receive unhelpful error messages when provider errors contain region-like tokens.

Fix: Tighten the regex to require a known prefix or length (e.g. `\b(?:us|eu|ap|cn)-[a-z]+-\d+\b`) rather than any two-letter prefix.

---

### [MED-07] `callLog.create` and `deduct_balance` are not wrapped in a transaction
**File:** src/lib/api/post-process.ts:127-158

```ts
const callLog = await prisma.callLog.create({ data: { ... } });
// ...
await deductBalance(params.userId, params.projectId, sellUsd, callLog.id, params.traceId);
```

These are two sequential operations with no shared transaction. If `deductBalance` (a raw SQL stored-procedure call) fails after `callLog.create` succeeds, the service was used but was not charged. Conversely, if the process crashes between the two calls, the same outcome occurs.

Impact: Billing leakage — services consumed without corresponding ledger entries.

Fix: Wrap both operations in `prisma.$transaction` (interactive transactions), or restructure `deduct_balance` to accept and create the CallLog atomically inside the DB function.

---

## LOW

### [LOW-01] Adapter singleton cache has no documentation of statelessness requirement
**File:** src/lib/engine/router.ts:16-38

The module-level `adapterCache` stores adapter singletons across requests in long-running Node.js processes. Currently all adapters are stateless, but no code comment enforces this. A future developer adding request-level state to an adapter would introduce subtle bugs.

Fix: Add a comment block at the adapter cache stating adapters MUST be stateless (no instance fields mutated per request).

---

### [LOW-02] `applyConfigOverlay` unconditionally overwrites `stream_options` from callers
**File:** src/lib/engine/config-overlay.ts:71-73

```ts
if (req.stream) {
  req.stream_options = { include_usage: true };
}
```

This overwrites any caller-supplied `stream_options` (e.g. `{ include_usage: false }`) and will send `stream_options` to providers that may not support it, potentially causing 400 errors.

Fix: Use `req.stream_options ??= { include_usage: true }` to preserve caller-supplied values, and add a quirk flag for providers that reject `stream_options`.

---

### [LOW-03] `imageViaChat` logs contain internal channel/provider IDs
**File:** src/lib/engine/openai-compat.ts:364-372, 390-399, 411-419, 432-439

Multiple `console.error` calls include `{ model: route.channel.realModelId, provider: route.channel.providerId }`. In production these appear in server logs that may be aggregated externally, leaking internal infrastructure identifiers.

Fix: Replace with structured logging via `writeSystemLog` (already used in the scheduler) and use alias names instead of internal DB IDs.

---

### [LOW-04] `detectEndpoint` uses naive `URL.includes()` instead of pathname matching
**File:** src/lib/api/auth-middleware.ts:42-49

```ts
if (raw.includes("/chat/completions")) return "chat";
```

If a query parameter or fragment contains the string `/chat/completions`, the endpoint detection will produce a false positive. While exploiting this requires control of the URL, it is a defence-in-depth gap.

Fix: Use `new URL(raw).pathname` and match against that.

---

### [LOW-05] `EXCHANGE_RATE_CNY_TO_USD` fallback is a hardcoded stale rate
**File:** src/lib/api/post-process.ts:279

```ts
const cnyToUsd = Number(process.env.EXCHANGE_RATE_CNY_TO_USD ?? 0.137);
```

The hardcoded `0.137` (≈1:7.3) will drift from reality over time. If the environment variable is not set, all CNY-priced provider cost calculations silently use a potentially outdated rate.

Fix: Emit a startup warning (or hard error) if `EXCHANGE_RATE_CNY_TO_USD` is unset, so operators are aware rather than silently using stale data.

---

## INFO (design observations, no fix required)

### [INFO-01] Scheduler F-RR2-06: DISABLED→DEGRADED promotion may reactivate permanently-failed channels
**File:** src/lib/health/scheduler.ts:394-403 (new in this diff)

The new logic promotes a DISABLED channel back to DEGRADED when a health probe returns a transient error (429/timeout). This is intentional to recover channels that were DISABLED while being rate-limited. However, a channel DISABLED for a permanent reason (e.g. invalid API key) whose subsequent probes happen to return 429 (some providers return 429 before 401 when the key is revoked) will be incorrectly promoted back into the routing pool.

Recommendation: Validate this edge case in the test suite; consider storing the DISABLE reason in the Channel record to distinguish transient-DISABLED from permanent-DISABLED.

---

### [INFO-02] `routeByAlias` performs two sorts, first of which is redundant
**File:** src/lib/engine/router.ts:105, 126-136

The first sort at line 105 orders by `priority` only. The second sort at line 126 also includes `priority` as its primary key, making the first sort redundant. No performance impact (candidate count is typically < 20), but the first sort can be removed to reduce cognitive overhead.

---

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 4     | warn   |
| MEDIUM   | 7     | warn   |
| LOW      | 5     | note   |
| INFO     | 2     | note   |

**Verdict: WARNING — 4 HIGH + 7 MEDIUM issues should be addressed before next production deploy.**

HIGH-01 (stream timeout cleared before body read) and HIGH-02 (stream reader not cancelled on error) together form a connection-leak risk under load. HIGH-04 (empty projectId written to CallLog) and MED-07 (non-atomic billing) are data-integrity issues affecting revenue accuracy.
