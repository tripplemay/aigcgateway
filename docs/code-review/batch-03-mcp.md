# MCP Layer Code Review — Batch 03

**Date:** 2026-04-17  
**Reviewer:** Claude (code-review agent)  
**Scope:** `src/lib/mcp/**/*.ts` (auth, server, route, 25 tools)  
**Lines reviewed:** ~2,600

---

## Findings

### [HIGH] IP whitelist empty-array behavior diverges from API layer

**Files:** `src/lib/mcp/auth.ts:57-62`  
**Issue:** In `authenticateMcp`, when `ipWhitelist` is an empty array, the code falls through to `isIpInWhitelist` which evaluates against an empty set, almost certainly returning `false` and silently rejecting the request. The REST auth-middleware (`src/lib/api/auth-middleware.ts:145-149`) explicitly treats an empty whitelist as **"all requests blocked"** and returns a 403 with a clear message. The MCP path logs a `console.warn` and returns `null` (HTTP 401), leaking the fact that the key exists and is not blocked for the wrong reason.

Additionally the condition `whitelist.length === 0 || !isIpInWhitelist(...)` would actually pass an empty whitelist if `isIpInWhitelist` returns true for an empty set — the intent is ambiguous and the two paths are not equivalent.

```typescript
// auth-middleware.ts (correct): empty list = hard block
if (whitelist.length === 0) {
  return { ok: false, error: errorResponse(403, "forbidden", "IP whitelist is empty...") };
}

// auth.ts (MCP, wrong):
if (whitelist.length === 0 || !isIpInWhitelist(clientIp, whitelist)) {  // ← short-circuit returns null/401
```

**Fix:** Mirror the REST layer exactly — check `whitelist.length === 0` first and return null (or a distinct 403), then do the IP check.

---

### [HIGH] `run_template` with `test_mode` bypasses balance check

**File:** `src/lib/mcp/tools/run-template.ts:51-119`  
**Issue:** The balance check (line 60) and `projectId` guard (line 72) both execute **before** the `test_mode` branch (line 86). The `dry_run` test mode is documented as "free — no cost, no billing". But `test_mode=execute` **does** call models and deduct balance, and the balance check runs before projectId is validated. That ordering is actually fine for execute mode, but the dry_run path inside `runTemplateTest` may call models too (it depends on the `mode` parameter forwarded to `runTemplateTest`). The deeper concern is that if `projectId` is null and `test_mode` is set, the code hits `isError: true` on the `projectId` guard *after* the balance check already succeeded — the balance check DB read was wasted and the user gets a confusing error sequence. This is low-impact but inconsistent with `run_action`'s dry_run flow which checks ownership before balance.

**Fix:** Move the `test_mode` branch check and its `projectId` guard before the balance check, consistent with `run_action`.

---

### [HIGH] `list_actions` and `list_templates` fetch all versions in memory

**Files:**  
- `src/lib/mcp/tools/list-actions.ts:36-44`  
- `src/lib/mcp/tools/list-templates.ts:30-42`

**Issue:** `list_actions` includes `versions: { orderBy: { versionNumber: "desc" } }` with no `take` limit. For an action with many versions this fetches every version row just to pick the active one (`a.versions.find(v => v.id === a.activeVersionId)`). If a project has 20 actions each with 50 versions, this reads 1,000 rows per page. The correct approach is to fetch only the active version by its ID.

```typescript
// Current — loads ALL versions per action:
include: { versions: { orderBy: { versionNumber: "desc" } } }

// Fix — join only the active version:
include: {
  activeVersion: { select: { versionNumber: true, ... } },
  _count: { select: { versions: true } },
}
```

`list_templates` is less severe because it doesn't include versions, but it does `include: { steps: { include: { action: ... } } }` which runs N+1-style joins when steps reference many actions — acceptable at current scale but worth noting.

---

### [HIGH] `fork_public_template` — permission check absent

**File:** `src/lib/mcp/tools/fork-public-template.ts:22-26`  
**Issue:** `fork_public_template` checks `!projectId` but never calls `checkMcpPermission`. All other write tools (`create_action`, `update_action`, `delete_action`, `create_template`, `update_template`, `delete_template`) check `projectInfo` permission. An API key with `projectInfo: false` can still fork public templates and create Actions and a Template in the caller's project.

```typescript
// Missing at the top of the tool handler:
const permErr = checkMcpPermission(permissions, "projectInfo");
if (permErr) return { content: [{ type: "text", text: permErr }], isError: true };
```

---

### [MEDIUM] `list_logs` search path uses `ILIKE` with unescaped user input

**File:** `src/lib/mcp/tools/list-logs.ts:77-109`  
**Issue:** The `search` parameter is used directly as a `%${search}%` pattern in a `$queryRaw` parameterized query. Prisma's tagged template literals escape SQL injection, so there is no SQL injection risk. However, ILIKE wildcard characters (`%` and `_`) in the search string are not escaped, meaning a user can pass `%` or `_` characters that act as wildcards, potentially matching far more rows than intended and causing unexpectedly large result sets or performance degradation (full JSONB scan).

**Fix:** Escape `%` and `_` in the `search` string before building `likePattern`, e.g. `search.replace(/%/g, '\\%').replace(/_/g, '\\_')`, and add `ESCAPE '\\'` to the ILIKE clause.

---

### [MEDIUM] `create_action` and `create_action_version` — no length limits on `name` or `messages.content`

**Files:**  
- `src/lib/mcp/tools/create-action.ts:21-37`  
- `src/lib/mcp/tools/create-action-version.ts:20-36`  
- `src/lib/mcp/tools/update-action.ts:20-23`

**Issue:** The `name` field has no `.max()` constraint. The `messages[].content` field in `create_action` / `create_action_version` has no length limit — a single message could be megabytes long, stored as JSONB in PostgreSQL and transmitted back on every `get_action_detail` / `list_actions` call. The `chat` tool does apply `min(1)` to message content but `create_action` does not.

```typescript
// Current:
name: z.string().describe("Action name"),
content: z.string()

// Suggested:
name: z.string().min(1).max(200).describe("Action name"),
content: z.string().min(1).max(100000)
```

---

### [MEDIUM] `run_action` error response for insufficient balance missing error code prefix

**File:** `src/lib/mcp/tools/run-action.ts:124-131`  
**Issue:** The insufficient balance error message is `"Insufficient balance. Current: $..."` without a machine-readable `[error_code]` prefix. Every other error in the MCP layer uses `[error_code] message` format so AI models can pattern-match and take corrective action. The `chat` tool uses `[insufficient_balance] Insufficient balance...` correctly. Same pattern issue exists in `run-template.ts:63-68`.

```typescript
// run-action.ts (missing prefix):
text: `Insufficient balance. Current: $${Number(user?.balance ?? 0).toFixed(4)}`

// chat.ts (correct):
text: `[insufficient_balance] Insufficient balance. Current balance: $...`
```

---

### [MEDIUM] `run_template` test_mode `execute` path skips rate limiting

**File:** `src/lib/mcp/tools/run-template.ts:86-119`  
**Issue:** When `test_mode` is set (including `test_mode=execute`), the code routes entirely through `runTemplateTest` and returns before the rate-limit checks (lines 122-158). The `execute` mode actually calls models and writes CallLogs. This means `test_mode=execute` can bypass per-minute rate limits and token-per-minute limits. An attacker or misbehaving client can call `run_template(test_mode="execute")` in a tight loop and exceed rate limits.

**Fix:** For `test_mode=execute`, run the rate-limit checks before delegating to `runTemplateTest`. For `test_mode=dry_run` only, they can be skipped.

---

### [MEDIUM] `get_action_detail` and `list_actions` — no permission check

**Files:**  
- `src/lib/mcp/tools/get-action-detail.ts:22-26`  
- `src/lib/mcp/tools/list-actions.ts:22-32`  
- `src/lib/mcp/tools/list-templates.ts:22-32`  
- `src/lib/mcp/tools/get-template-detail.ts:22-26`

**Issue:** Read-only query tools for project-scoped data (action details, template details, action list, template list) do not call `checkMcpPermission`. In contrast, `list_logs` and `get_log_detail` do check `logAccess`, and `get_balance` checks `projectInfo`. An API key with `projectInfo: false` can still enumerate all Actions and Templates including their full prompt messages and variable definitions.

**Fix:** Add `checkMcpPermission(permissions, "projectInfo")` guard to these four tools.

---

### [LOW] `update_template` — metadata update and step replacement are not atomic

**File:** `src/lib/mcp/tools/update-template.ts:118-133`  
**Issue:** The metadata update (`prisma.template.update`) and step replacement (`deleteMany` + `createMany`) are two separate Prisma calls with no wrapping transaction. If the process crashes between them, the template ends up with updated metadata but stale or missing steps.

```typescript
// Current (non-atomic):
if (Object.keys(data).length > 0) {
  await prisma.template.update({ where: { id: template_id }, data });
}
if (steps) {
  await prisma.templateStep.deleteMany(...)
  await prisma.templateStep.createMany(...)
}

// Fix: wrap in prisma.$transaction(...)
```

---

### [LOW] `create_project` — no limit on projects per user

**File:** `src/lib/mcp/tools/manage-projects.ts:122-135`  
**Issue:** `create_project` calls `prisma.project.create` without checking how many projects the user already has. An AI agent could create unlimited projects (each with Actions and Templates) in a loop. The REST API layer has the same gap. A simple guard of 20–50 projects per user would prevent runaway automation.

---

### [LOW] `create_api_key` via MCP — key created with empty permissions object

**File:** `src/lib/mcp/tools/manage-api-keys.ts:96-107`  
**Issue:** Keys created via `create_api_key` always get `permissions: {}` (line 104). By the `checkMcpPermission` logic, `undefined`/missing permission fields are treated as "allow". This means MCP-created keys have full permissions by default. This is consistent with the UI behavior but worth documenting explicitly — there is no way via MCP to create a restricted key (e.g., chat-only).

---

### [LOW] `list_public_templates` — no authentication/permission check

**File:** `src/lib/mcp/tools/list-public-templates.ts:36`  
**Issue:** Unlike all other tools, `list_public_templates` takes `_opts` (unused) and performs no `checkMcpPermission` call. This is likely intentional (public catalog), but it means any valid API key — including a fully revoked key that somehow still reaches tool invocation — can browse the public library. Given the MCP route already requires a valid key at the transport level, this is low risk, but the inconsistency is worth noting.

---

## API Layer Drift Analysis

The `mcp/tools/chat.ts` implementation is closely aligned with `api/v1/chat/completions/route.ts`. Both share the same three-layer rate-limit sequence (RPM → TPM → spend), the same `resolveEngine` + `withFailover` pattern, and the same `processChatResult` post-processor. No meaningful business logic drift was found.

One difference: the REST route calls `rollbackRateLimit` on error to undo the RPM counter increment; the MCP `chat.ts` does not. This means a failed MCP call still consumes a rate-limit slot. The impact is minor but inconsistent.

---

## Prompt Injection Assessment

The MCP layer does not execute user-supplied text as code or instructions. Variables injected via `run_action` and `run_template` go through `injectVariables` which does `{{variable}}` substitution — no eval, no shell commands. The content passes through to upstream LLM providers as-is, which is the expected behavior.

The main prompt injection risk in this architecture is indirect: a malicious user could craft a `run_action` prompt that instructs the calling AI assistant to subsequently invoke `update_action` or `delete_action`. This is an inherent risk of agentic LLM workflows and is not a code defect. Mitigation (e.g., requiring human confirmation for destructive tools) is a product decision.

---

## Review Summary

| Severity | Count | Status |
|----------|-------|--------|
| CRITICAL | 0     | pass   |
| HIGH     | 4     | warn   |
| MEDIUM   | 4     | warn   |
| LOW      | 4     | note   |

**Verdict: WARNING — 4 HIGH + 4 MEDIUM issues should be resolved before the next major release. No CRITICAL security vulnerabilities found. Auth and ownership isolation are generally sound.**

### Priority Fixes

1. **[HIGH]** `fork_public_template` missing permission check — simplest fix, one line.
2. **[HIGH]** IP whitelist empty-array divergence in `auth.ts` — security behavior inconsistency.
3. **[HIGH]** `list_actions` unbounded version fetch — memory/performance risk at scale.
4. **[MEDIUM]** `run_template test_mode=execute` bypasses rate limits — correctness issue.
