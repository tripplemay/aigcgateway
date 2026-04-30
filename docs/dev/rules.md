# Development Rules Reference

> 按需阅读。涉及对应场景时参考。

## Migration 规则

- **提交前必须 review migration SQL：** 检查 NOT NULL 列是否有 DEFAULT（生产表非空时无 DEFAULT 会失败），检查是否夹带了无关表的变更
- **`@updatedAt` 字段的 migration 必须手动补 `DEFAULT now()`：** Prisma 生成的 SQL 不带 DEFAULT，对非空表会导致生产部署失败
- **不要用 `prisma migrate reset` + `migrate dev` 处理有 schema 漂移的库：** 会把所有差异打包成一个 migration，混入无关变更
- **每个 migration 只包含一个功能的变更：** 不同功能的 schema 变更必须拆为独立 migration

### Migration ROLLBACK 注释规范

每个 `prisma/migrations/*/migration.sql` 文件**必须**含一行 `-- ROLLBACK:` 注释，说明回滚策略。CI 的 `validate-rollback-sql` job 会调用 `scripts/validate-rollback-sql.sh` 强制校验，缺失则 push 失败。

| Migration 类型 | ROLLBACK 写法 |
|---|---|
| `CREATE INDEX` | `DROP INDEX "idx_name";` |
| `ADD COLUMN`（nullable / with default） | `ALTER TABLE "x" DROP COLUMN "y";` |
| `CREATE TABLE` | `DROP TABLE "x";`（含 FK 时加 CASCADE） |
| `ADD CONSTRAINT`（CHECK / FK） | `ALTER TABLE "x" DROP CONSTRAINT "y_check";` |
| `CREATE FUNCTION` / `CREATE TYPE` | 对应 `DROP FUNCTION` / `DROP TYPE` |
| `ALTER TYPE ... ADD VALUE`（PG enum） | 不可幂等回滚；标注 `revert commit; manual SQL recovery required`（drop + recreate enum 或接受残留值） |
| `RENAME TABLE` / `RENAME COLUMN` | 标注 `revert commit; manual SQL recovery required`（手动反向 RENAME） |
| `UPDATE` / `INSERT` / `DELETE`（DATA migration） | 标注 `revert commit + restore from backup`（不可幂等回滚） |
| `ALTER COLUMN` | 标注 `revert commit; ALTER COLUMN reversal must reproduce original column definition by hand` |
| 复合（多类操作） | 标注 `revert commit; manual SQL recovery required`，列出所有操作类型 |

64 个 historical migrations 已通过 `scripts/maintenance/add-rollback-comments.ts` 一次性 retrofit。新建 migration 时由开发者手写 `-- ROLLBACK:` 行（参考已有 migration 模板）。

参考实现：`/mnt/c/Users/tripplezhou/projects/kolmatrix/scripts/validate-rollback-sql.sh`（joyce/KOLMatrix 的同名脚本）。

## MCP Development Rules

- Use `@modelcontextprotocol/sdk`, never hand-write protocol layer
- AI invocation Tools (chat/generate_image) must write CallLog with `source='mcp'` and execute billing
- Query Tools (list_models/list_logs etc.) do not write audit logs, do not bill
- Tool descriptions are the only way AI editors understand what a Tool does — make them precise
- MCP and API share the same rate limit quotas (RPM/TPM)
- Never modify Server Instructions without product owner approval

**每次新增或修改 MCP Tool，必须同步更新 `src/lib/mcp/server.ts` 的 `SERVER_INSTRUCTIONS`，包含：**
1. 该 Tool 的适用场景和调用方式
2. 与 REST API / SDK 的能力差异
3. 已知约束或注意事项

漏写 Server Instructions = Codex 验收不通过。

## i18n Rules

- All user-visible text must go through `useTranslations()`, never hardcode strings
- Do not translate: model names, API Key values, traceId, code examples, adapter type names
- Translation keys grouped by page namespace: `dashboard.title`, `logs.searchPlaceholder`
- Both `en.json` and `zh-CN.json` must be updated together — no missing keys allowed

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

## CI/CD

- `.github/workflows/ci.yml` — Push to main: lint + tsc + build Docker → push ghcr.io
- `.github/workflows/deploy.yml` — Auto-deploy to VPS after CI success (PM2 + Node.js native, not Docker)
- `.github/workflows/publish-sdk.yml` — Auto-publish SDK when `sdk/package.json` version changes
- VPS deployment: `git pull → npm ci → prisma migrate → next build → pm2 restart`
- Build on VPS needs `NODE_OPTIONS="--max-old-space-size=768"` (1GB RAM server + 2GB swap)
