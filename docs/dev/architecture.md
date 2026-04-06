# Architecture Reference

> 按需阅读。只在涉及对应模块时参考，不需要每次会话都读。

## Four-Layer API Design

```
AI editors (Claude Code/Cursor) → /mcp (MCP Streamable HTTP) → MCP Tools → Engine
External SDK/curl              → /v1/* (middleware rewrite) → /api/v1/* (API routes) → Engine
Browser console                → /api/projects/*, /api/admin/* (JWT auth)
Payment webhooks               → /api/webhooks/alipay, /api/webhooks/wechat
```

`src/middleware.ts` rewrites `/v1/*` → `/api/v1/*` and `/mcp` → `/api/mcp`.

## Request Pipeline (AI Calls — API and MCP share this)

```
Request → auth (sha256 API Key → Project)
        → balance check (balance > 0?)
        → rate-limit (Redis RPM/TPM/ImageRPM)
        → router (model name → Channel + Provider + Adapter)
        → adapter.chatCompletions/imageGenerations
        → Response
        → async: post-process (CallLog + deduct_balance + recordTokenUsage)
```

## MCP Server (`src/lib/mcp/`)

- `server.ts` — McpServer instance + Server Instructions + Tool registration. Takes `projectId` to scope all operations.
- `auth.ts` — API Key auth (sha256 lookup), returns project context or null.
- `tools/` — 20 Tools: list-models, chat, generate-image, list-logs, get-log-detail, get-balance, get-usage-summary, list-actions, get-action-detail, create-action, update-action, delete-action, create-action-version, run-action, list-templates, get-template-detail, create-template, update-template, delete-template, run-template.
- `app/api/mcp/route.ts` — Streamable HTTP endpoint (POST/GET/DELETE), stateless mode, per-request auth + server creation.

MCP is not a separate service — it's a route handler inside the same Next.js app that reuses all existing infrastructure (auth, engine, billing, audit).

## Adapter Engine (`src/lib/engine/`)

- `openai-compat.ts` — Base engine handling 80% of providers
- `config-overlay.ts` — Runtime parameter adjustment per ProviderConfig (temperature clamp, quirks-based param removal)
- `adapters/volcengine.ts` — Image via chat fallback + multi-size retry
- `adapters/siliconflow.ts` — Image response format conversion
- `router.ts` — Model name → best ACTIVE channel (priority ASC)
- `sse-parser.ts` — SSE stream parsing with buffer, comment ignoring, [DONE]

## Auth: Two Systems

1. **API Key auth** (`auth-middleware.ts`) — For `/v1/*` and `/mcp` endpoints. `Authorization: Bearer pk_xxx` → sha256 → lookup `api_keys.keyHash`
2. **JWT auth** (`jwt-middleware.ts`) — For `/api/projects/*` and `/api/admin/*`. `Authorization: Bearer <JWT>` with `{ userId, role }`
3. **Admin guard** (`admin-guard.ts`) — JWT + `role === "ADMIN"` check

## Health Check System (`src/lib/health/`)

- Three-level verification: L1 (connectivity) → L2 (format) → L3 (quality)
- Auto-degradation: fail → retry → DEGRADED → 3 consecutive fails → DISABLED
- Recovery: DISABLED channel passes all 3 levels → back to ACTIVE
- Started via `src/instrumentation.ts` (Next.js instrumentation hook)

## i18n (`src/messages/` + `src/hooks/use-locale.ts`)

- Client-side i18n with `NextIntlClientProvider` (no route-level i18n)
- `useLocale()` hook: auto-detect from browser, persist to localStorage, instant switch
- Language toggle in sidebar footer (Globe icon)

## Database

- Prisma schema at `prisma/schema.prisma`
- Native SQL migrations for: tsvector + GIN index + trigger, `deduct_balance()`, `check_balance()`
- Global Prisma singleton at `src/lib/prisma.ts` — always import from here, never `new PrismaClient()`
- `env.ts` uses lazy Proxy validation — safe during build time
- CallLog.source field: `'api'` | `'mcp'` to distinguish call origins

## Console Pages

- `(auth)/` — Login, Register (no sidebar)
- `(console)/` — All console pages (with sidebar, JWT required)
- `(console)/admin/*` — Admin-only pages (ADMIN role required)
- 20 pages total, all internationalized

## SDK (`sdk/`)

Independent npm package `@guangai/aigc-sdk`. Zero dependencies, Node 18+. Outputs CJS + ESM + .d.ts via tsup. Has its own `tsconfig.json` — excluded from main project's tsc.
