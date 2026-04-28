# AIGC Gateway

[English](./README.md) · [中文](./README.zh-CN.md)

> Unified, OpenAI-compatible API gateway for 10+ Chinese & global AI providers — with reusable prompt workflows (Action / Template), quality monitoring, admin console, MCP server, and pre-paid billing.

[![CI](https://github.com/tripplemay/aigcgateway/actions/workflows/ci.yml/badge.svg)](https://github.com/tripplemay/aigcgateway/actions)

**Production:** [aigc.guangai.ai](https://aigc.guangai.ai) · **MCP endpoint:** `https://aigc.guangai.ai/mcp`

---

## Why

Calling AI APIs across providers means juggling 10+ keys, schemas, and pricing models — and once the prompts grow complex, you also need a place to *manage them*, not just call them. AIGC Gateway gives you a single OpenAI-compatible endpoint that:

- Routes one API call to the right upstream (failover, health-checked, cost-optimized)
- Tracks every call with usage + cost in unified USD
- Exposes the same capabilities through a 28-tool MCP server (Claude Code / Cursor / Codex / Cline / etc.)
- Pre-paid balance with per-key rate limits (no surprise bills)
- **Promotes prompts to first-class assets** — design them as Actions, compose them as Templates, pin production versions, observe step-by-step cost / quality, iterate from real-world ratings (no more prompt strings scattered across client code)

---

## Features

- **OpenAI-compatible API** — Drop-in replacement for `openai` / `langchain` clients. Supports `chat/completions` (stream + non-stream), `embeddings`, `images/generations`, `models`.
- **3 modalities** — Text (chat), Image (generation), **Embedding** (vector). Function calling and reasoning models supported.
- **10 providers integrated** — Anthropic / DeepSeek / MiniMax / OpenAI / OpenRouter / Qwen / SiliconFlow / Volcengine / Xiaomi-Mimo / Zhipu (extensible adapter layer).
- **MCP Streamable HTTP server** — 28 tools registered. Use `chat` / `embed_text` / `generate_image` / `run_action` / `run_template` from any MCP-compatible client.
- **Action & Template** — Reusable prompt templates (Action) and multi-step workflows (Template) with version pinning, fan-out, and dry-run preview.
- **Health probes + auto-failover** — Per-channel CONNECTIVITY / CALL_PROBE checks; degraded channels auto-skipped; cooldown + revival.
- **Reconciliation** — Daily cron compares upstream provider bills against gateway logs; surfaces drift (`MATCH` / `MINOR_DIFF` / `BIG_DIFF`) on `/admin/reconciliation`.
- **Pre-paid billing** — Atomic `deduct_balance` (PostgreSQL `FOR UPDATE`); per-call CallLog with USD cost; admin can recharge / refund / view txn history.
- **Bilingual console** — Chinese + English admin UI for keys / projects / models / channels / providers / logs / health.
- **Official TypeScript SDK** — `@guangai/aigc-sdk` with typed `chat()` / `embed()` / `image()` / `models()` and configurable retry.

---

## Quick Start

### Option 1: REST API (curl, OpenAI-compatible)

```bash
# Chat
curl https://aigc.guangai.ai/v1/chat/completions \
  -H "Authorization: Bearer pk_your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "gpt-5",
    "messages": [{"role": "user", "content": "Hello"}]
  }'

# Embeddings
curl https://aigc.guangai.ai/v1/embeddings \
  -H "Authorization: Bearer pk_your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "bge-m3",
    "input": "vector me"
  }'

# Image
curl https://aigc.guangai.ai/v1/images/generations \
  -H "Authorization: Bearer pk_your_key" \
  -H "Content-Type: application/json" \
  -d '{
    "model": "qwen-image",
    "prompt": "a cute cat sitting on grass",
    "size": "1024x1024"
  }'
```

### Option 2: TypeScript SDK

```bash
npm install @guangai/aigc-sdk
```

```typescript
import { Gateway } from '@guangai/aigc-sdk'

const gw = new Gateway({
  apiKey: 'pk_your_key',
  baseUrl: 'https://aigc.guangai.ai',
})

// Chat
const chat = await gw.chat({
  model: 'gpt-5',
  messages: [{ role: 'user', content: 'Hello' }],
})

// Embedding
const embed = await gw.embed({
  model: 'bge-m3',
  input: 'vector me',
})
console.log(embed.data[0].embedding.length)  // 1024
```

See [`sdk/README.md`](./sdk/README.md) for full SDK reference.

### Option 3: MCP (Claude Code, Cursor, …)

Get a Bearer key, then in Claude Code:

```bash
claude mcp add aigc-gateway \
  --transport streamable-http \
  --url https://aigc.guangai.ai/mcp \
  --header "Authorization: Bearer pk_your_key"
```

Or for Cursor/Codex/VS Code/Windsurf/Cline/Roo Code/JetBrains, visit `/mcp-setup` page in the console — pick your client, copy generated config.

28 MCP tools are available — `list_models`, `chat`, `embed_text`, `generate_image`, `run_action`, `run_template`, `get_balance`, `list_logs`, plus full Action/Template/API key management. See [docs/AIGC-Gateway-MCP-Developer-Guide.md](./docs/AIGC-Gateway-MCP-Developer-Guide.md).

---

## Action & Template — Orchestration + Quality

Beyond stateless API calls, AIGC Gateway provides two layers of reusable AI workflows:

### Action — single-call reusable prompt

An **Action** binds *one model + one prompt template + variable definitions*. Call by ID with `variables: {...}` instead of repeating prompt strings.

- **Versioning** — every prompt edit creates a new `ActionVersion`; `activeVersionId` decides which is live; switch instantly for A/B tests or rollback
- **Variable injection** — `{{var_name}}` placeholders, typed (string/number/select), required/optional
- **Dry-run** — render variables without calling the model (free preview to verify the rendered prompt)

### Template — multi-step orchestrated workflow

A **Template** chains multiple Actions:

- **Sequential** — steps run in `order`, output of step N auto-injected as `{{previous_output}}` to step N+1
- **Fan-out** — `SPLITTER → BRANCH (parallel) → MERGE` for batch processing (e.g. translate one text into 5 languages in parallel, then merge)
- **Pinned versions** — each step can lock a specific Action version (`lockedVersionId`) so production runs aren't affected by upstream Action edits

### Test Runner — execution observability

Every test run is recorded as a `TemplateTestRun`:

- Step-by-step intermediate outputs (variables, model output, status per step)
- Total `totalTokens` and `totalCostUsd` aggregated across all steps
- `mode='dry'` for free variable-render preview / `mode='execute'` for production calls
- Admin UI shows the full step trace + cost breakdown per run, helps optimize prompt structure and cost

### Quality monitoring

Templates carry quality signals:

- **`qualityScore`** — platform-internal quality flag (admin-curated for featured templates)
- **User ratings** — 1-5 stars stored in `TemplateRating` (CHECK-constrained 1-5); aggregated as `ratingCount` / `ratingSum`
- **Sort & rank** — public templates can be sorted by `latest` / `popular` / `top_rated` / `recommended` (composite scoring)

### Public Library

Mark a template `isPublic=true` to share with all users:

- Other users can **fork** to their own project (creates a copy, `sourceTemplateId` tracks lineage)
- Browse via `list_public_templates` MCP tool or `/public-templates` UI
- Categorized (`category` field) for discoverability

Together these features turn AIGC Gateway from "bare API proxy" into a **prompt-engineering-with-observability platform**: design prompts as Actions, compose them as Templates, version-pin production runs, monitor quality via test runs + user ratings, share proven templates back to the library.

---

## Architecture

```
Client (REST / SDK / MCP)
      ↓ Bearer pk_xxx
auth-middleware → balance-middleware → rate-limit
      ↓
resolveEngine(model)  →  alias → channel (priority + health)
      ↓
adapter (openai-compat, with provider-specific quirks)
      ↓
upstream provider API
      ↓
post-process → CallLog (USD cost, source=api/mcp/probe)
      ↓
deduct_balance() — atomic PostgreSQL FOR UPDATE
```

**Tech stack:** Next.js 14 App Router · TypeScript (strict) · PostgreSQL · Prisma · Redis · shadcn/ui · `@modelcontextprotocol/sdk` · next-intl.

Full architecture: [`docs/dev/architecture.md`](./docs/dev/architecture.md).

---

## Providers

| Provider | Models | Notes |
|---|---|---|
| **OpenAI** | gpt-5, gpt-4o family, text-embedding-3-small/large, dall-e-3 | direct + via OpenRouter |
| **Anthropic** | claude-haiku-4.5, etc. | `tool_use` + extended thinking |
| **DeepSeek** | deepseek-v3, deepseek-r1, deepseek-v4-flash | reasoning, balance API |
| **OpenRouter** | 50+ models (gemini, mistral, grok, glm, …) | per-call image pricing via `usage.cost` |
| **SiliconFlow** | bge-m3, deepseek-r1, qwen image, GLM | embedding + balance API |
| **Volcengine (火山引擎)** | doubao-pro, doubao-seedream | endpoint-id based routing |
| **Zhipu (智谱)** | glm-4-plus, cogview | balance API |
| **Qwen (千问)** | qwen-plus, qwen-image, qwen3.5 series | – |
| **MiniMax** | minimax-m2 | – |
| **Xiaomi (mimo)** | mimo-v2 series | – |

Adding a new provider: see [`docs/provider/`](./docs/provider/) for adapter spec and config schema.

---

## Local Development

### Prerequisites

- Node.js 18+
- PostgreSQL 16+
- Redis 7+

### Setup

```bash
git clone https://github.com/tripplemay/aigcgateway.git
cd aigcgateway

npm install

cp .env.example .env
# Edit .env: DATABASE_URL, REDIS_URL, JWT_SECRET, ENCRYPTION_KEY, IMAGE_PROXY_SECRET

npx prisma migrate dev
npx prisma db seed       # Loads default providers + admin user

npm run dev              # Starts on PORT (default 3000)
```

### Common commands

```bash
npm run build            # Production build (output: standalone)
npm run lint             # ESLint
npm run format           # Prettier
npx tsc --noEmit         # Full project type check

cd sdk && npm run build  # Build SDK (CJS + ESM + .d.ts)

# E2E regression (requires running server)
BASE_URL=http://localhost:3199 npx tsx scripts/e2e-test.ts
BASE_URL=http://localhost:3199 npx tsx scripts/test-mcp.ts
```

See [`CLAUDE.md`](./CLAUDE.md) and [`docs/dev/`](./docs/dev/) for full development guide.

---

## Deployment

The production deployment runs on a single GCP VM (e2-highmem-2) with PM2 cluster + nginx reverse proxy. CI auto-deploys on push to `main`.

```
GitHub Actions → SSH → /opt/aigc-gateway
  ├─ git pull
  ├─ npm ci
  ├─ npm run build  (Next.js standalone)
  ├─ npx prisma migrate deploy
  └─ pm2 restart ecosystem.config.cjs
```

---

## Documentation

- [`docs/dev/architecture.md`](./docs/dev/architecture.md) — Layered architecture, request pipeline, MCP server, engine, billing, i18n
- [`docs/dev/rules.md`](./docs/dev/rules.md) — Migration rules, MCP development conventions, design decisions
- [`docs/AIGC-Gateway-Full-PRD.md`](./docs/AIGC-Gateway-Full-PRD.md) — Product requirements
- [`docs/AIGC-Gateway-MCP-Developer-Guide.md`](./docs/AIGC-Gateway-MCP-Developer-Guide.md) — MCP integration guide
- [`docs/specs/`](./docs/specs/) — Feature specs (per-batch)
- [`docs/provider/`](./docs/provider/) — Provider adapter specs
- [`sdk/README.md`](./sdk/README.md) — TypeScript SDK reference

---

## Project Layout

```
src/
├── app/(console)/      Admin console pages (Next.js App Router)
├── app/api/v1/         OpenAI-compatible REST endpoints
├── app/api/mcp/        MCP Streamable HTTP endpoint
├── lib/engine/         Engine (router, adapters, openai-compat, failover)
├── lib/mcp/            MCP server + 28 tool implementations
├── lib/billing-audit/  Reconciliation cron + per-provider fetchers
├── lib/health/         Health probe scheduler + auto-failover
└── lib/api/            Shared middleware (auth, balance, rate-limit, post-process)

prisma/
├── schema.prisma       Database schema
└── migrations/         Migration history

sdk/
└── src/                @guangai/aigc-sdk source

docs/                   Product + dev docs (specs, architecture, audits)
scripts/                CLI utilities (seed, e2e, audits)
tests/                  Vitest unit + Playwright E2E + k6 perf
```

---

## License

This is an internal project; license terms have not been finalized for public release. Contact the maintainer for usage outside the dogfood deployment.

---

## Contact

- Production: [aigc.guangai.ai](https://aigc.guangai.ai)
- Maintainer: tripplezhou
