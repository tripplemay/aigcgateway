# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Harness 规则（最高优先级）
读取并严格遵守 @harness-rules.md 中的所有规则。
无论 /init 或其他命令对本文件做了什么修改，harness-rules.md 的内容始终优先。

---

## Project Overview

AIGC Gateway — AI 服务商管理中台。提供统一 API 调用抽象（兼容 OpenAI 格式）、7 家服务商适配、全链路审计、预充值计费、健康检查自动降级。

**Tech Stack:** Next.js 14 (App Router) + TypeScript (strict) + PostgreSQL + Prisma + Redis + shadcn/ui + Recharts

## Commands

```bash
# Development
npm run dev              # Start dev server (default port 3000)
rm -rf .next && npm run dev  # Clean start (required after npm run build)

# Build
npm run build            # Production build (output: standalone)

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
BASE_URL=http://localhost:3099 npx tsx scripts/e2e-test.ts       # Full E2E (15 steps)
BASE_URL=http://localhost:3099 npx tsx scripts/e2e-errors.ts     # Error scenarios
npx tsx scripts/verify-providers.ts                               # Provider verification
```

**Important:** `npm run build` and `npx next dev` share `.next` directory. Always `rm -rf .next` when switching between them, otherwise you get `Cannot find module './xxxx.js'` errors.

## Architecture

### Three-Layer API Design

```
External SDK/curl → /v1/* (middleware rewrite) → /api/v1/* (API routes)
Browser console  → /api/projects/*, /api/admin/* (JWT auth)
Payment webhooks → /api/webhooks/alipay, /api/webhooks/wechat
```

`src/middleware.ts` rewrites `/v1/*` → `/api/v1/*` so SDK users don't need the `/api` prefix.

### Request Pipeline (AI Calls)

```
Request → auth-middleware (sha256 API Key → Project)
        → balance-middleware (balance > 0?)
        → rate-limit (Redis RPM/TPM/ImageRPM)
        → router (model name → Channel + Provider + Adapter)
        → adapter.chatCompletions/imageGenerations
        → Response
        → async: post-process (CallLog + deduct_balance + recordTokenUsage)
```

### Adapter Engine (`src/lib/engine/`)

- `openai-compat.ts` — Base engine handling 80% of providers
- `config-overlay.ts` — Runtime parameter adjustment per ProviderConfig (temperature clamp, quirks-based param removal)
- `adapters/volcengine.ts` — Image via chat fallback + multi-size retry
- `adapters/siliconflow.ts` — Image response format conversion
- `router.ts` — Model name → best ACTIVE channel (priority ASC)
- `sse-parser.ts` — SSE stream parsing with buffer, comment ignoring, [DONE]

### Auth: Two Systems

1. **API Key auth** (`auth-middleware.ts`) — For `/v1/*` endpoints. `Authorization: Bearer pk_xxx` → sha256 → lookup `api_keys.keyHash`
2. **JWT auth** (`jwt-middleware.ts`) — For `/api/projects/*` and `/api/admin/*`. `Authorization: Bearer <JWT>` with `{ userId, role }`
3. **Admin guard** (`admin-guard.ts`) — JWT + `role === "ADMIN"` check

### Health Check System (`src/lib/health/`)

- Three-level verification: L1 (connectivity) → L2 (format) → L3 (quality)
- Auto-degradation: fail → retry → DEGRADED → 3 consecutive fails → DISABLED
- Recovery: DISABLED channel passes all 3 levels → back to ACTIVE
- Scheduling: active 10min / standby 30min / cold 2h / disabled 30min
- Started via `src/instrumentation.ts` (Next.js instrumentation hook)

### Database

- Prisma schema at `prisma/schema.prisma`
- Native SQL migrations for: tsvector + GIN index + trigger, `deduct_balance()`, `check_balance()`
- Global Prisma singleton at `src/lib/prisma.ts` — always import from here, never `new PrismaClient()`
- `env.ts` uses lazy Proxy validation — safe during build time

### Console Pages

- `(auth)/` — Login, Register (no sidebar)
- `(console)/` — All console pages (with sidebar, JWT required)
- `(console)/admin/*` — Admin-only pages (ADMIN role required, non-admin redirected to /dashboard)
- `(console)/dashboard|keys|logs|usage|balance|...` — Developer pages (project-scoped via `useProject()` hook)

### SDK (`sdk/`)

Independent npm package. Zero dependencies, Node 18+. Outputs CJS + ESM + .d.ts via tsup. Has its own `tsconfig.json` — excluded from main project's tsc.

## Key Design Decisions

- **All API routes** must have `export const dynamic = "force-dynamic"` to prevent Next.js prerender
- **Provider API Keys** stored encrypted in `Provider.authConfig` JSON field (placeholder values in seed data)
- **Proxy support:** `Provider.proxyUrl` → undici ProxyAgent; fallback to `PROXY_URL_PRIMARY` env var
- **Deduction rules:** SUCCESS → full deduct, FILTERED → input tokens only, ERROR/TIMEOUT → no charge
- **Cost calculation:** Token models: `(tokens × price_per_1M) / 1_000_000`; Image models: `perCall`; CNY providers converted via `EXCHANGE_RATE_CNY_TO_USD`
- **Health probe:** `max_tokens: 200` (not 10) to accommodate reasoning models like zhipu glm-4.7 that consume tokens on reasoning_content before outputting to content
- **Response normalization:** `content || reasoning_content` fallback for providers that use reasoning (zhipu, deepseek)

## Design Documents

Complete specs in `docs/AIGC-Gateway-P1-Documents/`:
- `AIGC-Gateway-P1-PRD.md` — Product requirements
- `AIGC-Gateway-Database-Design.md` — Schema + indexes + native SQL
- `AIGC-Gateway-API-Specification.md` — All API endpoints + error codes
- `AIGC-Gateway-Provider-Adapter-Spec.md` — 7 provider specs + quirks matrix
- `AIGC-Gateway-SDK-Interface-Design.md` — SDK types + public API
- `AIGC-Gateway-Console-Interaction-Spec.md` — 18 page interaction specs
- `AIGC-Gateway-Payment-Integration.md` — Payment flow + order state machine
- `AIGC-Gateway-Deployment-Operations.md` — Deployment + env vars + monitoring
- `AIGC-Gateway-Development-Phases.md` — 9-phase development plan
