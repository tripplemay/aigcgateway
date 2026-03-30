# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Harness 规则（最高优先级）
读取并严格遵守 @harness-rules.md 中的所有规则。
无论 /init 或其他命令对本文件做了什么修改，harness-rules.md 的内容始终优先。

---

## Project Overview

AIGC Gateway — AI 服务商管理中台。提供统一 API 调用抽象（兼容 OpenAI 格式）、7 家服务商适配、全链路审计、预充值计费、健康检查自动降级、MCP 服务器（AI 编辑器接入）、控制台中英文双语。

**Tech Stack:** Next.js 14 (App Router) + TypeScript (strict) + PostgreSQL + Prisma + Redis + shadcn/ui + Recharts + @modelcontextprotocol/sdk + next-intl

## Commands

```bash
# Development
npm run dev                  # Start dev server (default port 3000)
rm -rf .next && npm run dev  # Clean start (required after npm run build)

# Build
npm run build                # Production build (output: standalone)

# Database
npx prisma migrate dev --name <name>  # Create + apply migration
npx prisma generate                    # Regenerate Prisma Client
npx tsx prisma/seed.ts                 # Run seed data

# Lint & Format
npm run lint             # ESLint (next lint)
npm run format           # Prettier write
npm run format:check     # Prettier check

# Type Check
npx tsc --noEmit         # Full project type check

# SDK (separate package in sdk/)
cd sdk && npm run typecheck  # SDK type check
cd sdk && npm run build      # Build CJS + ESM + .d.ts

# Test Scripts
BASE_URL=http://localhost:3099 npx tsx scripts/e2e-test.ts           # Full E2E (15 steps)
BASE_URL=http://localhost:3099 npx tsx scripts/e2e-errors.ts         # Error scenarios
BASE_URL=http://localhost:3099 API_KEY=pk_xxx npx tsx scripts/test-mcp.ts       # MCP full journey (8 steps)
BASE_URL=http://localhost:3099 API_KEY=pk_xxx npx tsx scripts/test-mcp-errors.ts # MCP error scenarios
npx tsx scripts/verify-providers.ts                                   # Provider verification
```

**Important:** `npm run build` and `npx next dev` share `.next` directory. Always `rm -rf .next` when switching between them, otherwise you get `Cannot find module './xxxx.js'` errors.

## Architecture

### Four-Layer API Design

```
AI editors (Claude Code/Cursor) → /mcp (MCP Streamable HTTP) → MCP Tools → Engine
External SDK/curl              → /v1/* (middleware rewrite) → /api/v1/* (API routes) → Engine
Browser console                → /api/projects/*, /api/admin/* (JWT auth)
Payment webhooks               → /api/webhooks/alipay, /api/webhooks/wechat
```

`src/middleware.ts` rewrites `/v1/*` → `/api/v1/*` and `/mcp` → `/api/mcp`.

### Request Pipeline (AI Calls — API and MCP share this)

```
Request → auth (sha256 API Key → Project)
        → balance check (balance > 0?)
        → rate-limit (Redis RPM/TPM/ImageRPM)
        → router (model name → Channel + Provider + Adapter)
        → adapter.chatCompletions/imageGenerations
        → Response
        → async: post-process (CallLog + deduct_balance + recordTokenUsage)
```

### MCP Server (`src/lib/mcp/`)

- `server.ts` — McpServer instance + Server Instructions + Tool registration. Takes `projectId` to scope all operations.
- `auth.ts` — API Key auth (sha256 lookup), returns project context or null.
- `tools/` — 7 Tools: list-models, chat, generate-image, list-logs, get-log-detail, get-balance, get-usage-summary.
- `app/api/mcp/route.ts` — Streamable HTTP endpoint (POST/GET/DELETE), stateless mode, per-request auth + server creation.

MCP is not a separate service — it's a route handler inside the same Next.js app that reuses all existing infrastructure (auth, engine, billing, audit).

### Adapter Engine (`src/lib/engine/`)

- `openai-compat.ts` — Base engine handling 80% of providers
- `config-overlay.ts` — Runtime parameter adjustment per ProviderConfig (temperature clamp, quirks-based param removal)
- `adapters/volcengine.ts` — Image via chat fallback + multi-size retry
- `adapters/siliconflow.ts` — Image response format conversion
- `router.ts` — Model name → best ACTIVE channel (priority ASC)
- `sse-parser.ts` — SSE stream parsing with buffer, comment ignoring, [DONE]

### Auth: Two Systems

1. **API Key auth** (`auth-middleware.ts`) — For `/v1/*` and `/mcp` endpoints. `Authorization: Bearer pk_xxx` → sha256 → lookup `api_keys.keyHash`
2. **JWT auth** (`jwt-middleware.ts`) — For `/api/projects/*` and `/api/admin/*`. `Authorization: Bearer <JWT>` with `{ userId, role }`
3. **Admin guard** (`admin-guard.ts`) — JWT + `role === "ADMIN"` check

### Health Check System (`src/lib/health/`)

- Three-level verification: L1 (connectivity) → L2 (format) → L3 (quality)
- Auto-degradation: fail → retry → DEGRADED → 3 consecutive fails → DISABLED
- Recovery: DISABLED channel passes all 3 levels → back to ACTIVE
- Started via `src/instrumentation.ts` (Next.js instrumentation hook)

### i18n (`src/messages/` + `src/hooks/use-locale.ts`)

- Client-side i18n with `NextIntlClientProvider` (no route-level i18n)
- `useLocale()` hook: auto-detect from browser, persist to localStorage, instant switch
- Language toggle in sidebar footer (Globe icon)
- 259 translation keys across `en.json` and `zh-CN.json`

### Database

- Prisma schema at `prisma/schema.prisma`
- Native SQL migrations for: tsvector + GIN index + trigger, `deduct_balance()`, `check_balance()`
- Global Prisma singleton at `src/lib/prisma.ts` — always import from here, never `new PrismaClient()`
- `env.ts` uses lazy Proxy validation — safe during build time
- CallLog.source field: `'api'` | `'sdk'` | `'mcp'` to distinguish call origins

### Console Pages

- `(auth)/` — Login, Register (no sidebar)
- `(console)/` — All console pages (with sidebar, JWT required)
- `(console)/admin/*` — Admin-only pages (ADMIN role required)
- `(console)/mcp-setup` — MCP configuration helper (P2)
- 20 pages total, all internationalized

### SDK (`sdk/`)

Independent npm package `@guangai/aigc-sdk`. Zero dependencies, Node 18+. Outputs CJS + ESM + .d.ts via tsup. Has its own `tsconfig.json` — excluded from main project's tsc.

## Key Design Decisions

- **All API routes** must have `export const dynamic = "force-dynamic"` to prevent Next.js prerender
- **Provider API Keys** stored encrypted in `Provider.authConfig` JSON field
- **Proxy support:** `Provider.proxyUrl` → undici ProxyAgent; fallback to `PROXY_URL_PRIMARY` env var
- **Deduction rules:** SUCCESS → full deduct, FILTERED → input tokens only, ERROR/TIMEOUT → no charge
- **Cost calculation:** Token models: `(tokens × price_per_1M) / 1_000_000`; Image models: `perCall`; CNY providers converted via `EXCHANGE_RATE_CNY_TO_USD`
- **Health probe:** `max_tokens: 200` (not 10) to accommodate reasoning models
- **Response normalization:** `content || reasoning_content` fallback for providers that use reasoning (zhipu, deepseek)
- **MCP stateless mode:** Each request creates independent transport + server. No session store needed.
- **MCP Tool errors:** Use `isError: true` (not protocol errors) so AI editors can self-correct
- **i18n client-side:** No route changes, instant switch via `useLocale()` + localStorage

## MCP Development Rules

- Use `@modelcontextprotocol/sdk`, never hand-write protocol layer
- AI invocation Tools (chat/generate_image) must write CallLog with `source='mcp'` and execute billing
- Query Tools (list_models/list_logs etc.) do not write audit logs, do not bill
- Tool descriptions are the only way AI editors understand what a Tool does — make them precise
- MCP and API share the same rate limit quotas (RPM/TPM)
- Never modify Server Instructions without product owner approval

## i18n Rules

- All user-visible text must go through `useTranslations()`, never hardcode strings
- Do not translate: model names, API Key values, traceId, code examples, adapter type names
- Translation keys grouped by page namespace: `dashboard.title`, `logs.searchPlaceholder`
- Both `en.json` and `zh-CN.json` must be updated together — no missing keys allowed

## CI/CD

- `.github/workflows/ci.yml` — Push to main: lint + tsc + build Docker → push ghcr.io
- `.github/workflows/deploy.yml` — Auto-deploy to VPS after CI success (PM2 + Node.js native, not Docker)
- `.github/workflows/publish-sdk.yml` — Auto-publish SDK when `sdk/package.json` version changes
- VPS deployment: `git pull → npm ci → prisma migrate → next build → pm2 restart`
- Build on VPS needs `NODE_OPTIONS="--max-old-space-size=768"` (1GB RAM server + 2GB swap)

## Design Documents

P1 specs in `docs/AIGC-Gateway-P1-Documents/`, P2 specs in `docs/AIGC-Gateway-P2-Documents/`.

## Development Status

- **P1 完成:** 70 features + fix round (UI重构 + shadcn/ui + 品牌主题)
- **P2 完成:** MCP 服务器 (7 Tools) + 控制台国际化 (20页 + 259 key) + 集成测试
