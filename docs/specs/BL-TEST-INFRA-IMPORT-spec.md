# BL-TEST-INFRA-IMPORT — 全量迁移 KOLMatrix 测试基建

**批次类型：** 测试基建 / dev infra
**创建：** 2026-04-28
**预计工时：** ~10-12h（6 generator features + 1 codex）
**来源：** 用户 2026-04-28 对比分析 — joyce/KOLMatrix 测试基建显著领先 aigcgateway，决定全量迁移

---

## 背景

Planner 调研对比 aigcgateway 与 joyce/KOLMatrix 测试基建：

| 维度 | aigcgateway | joyce | 落差 |
|---|---|---|---|
| 测试文件 | 69（含 69 dated scripts） | 134（清晰三层 unit/integration/e2e）| -49% 真测试 |
| CI jobs | 3 | 8 | 缺 5 类关键 |
| Coverage | 未装 | 装 + threshold | 完全 0 |
| Mock 框架 | 1 个手写 | MSW（生命周期 + warn unhandled）| 工具栈代差 |
| Integration | 0 | 35（Testcontainers PostgreSQL）| 完全缺失 |
| E2E in CI | 不跑 | 跑 + visual + artifact | 完全缺失 |
| Migration rollback | 无 | validate-rollback-sql.sh 强制 | 完全缺失 |

历史 fix-round 复盘：BL-EMBEDDING-MVP 3 轮 / BL-FE-QUALITY 6 轮 / BL-RECON-FIX-PHASE2 / BL-MCP-PAGE-REVAMP 4 轮 — **大量「单测过但生产挂」类型可被 joyce 测试基建直接 catch**。

KOLMatrix 在 BI1-BI2 阶段就把测试基建当核心 batch 做（spec 在 docs/specs/BI1-* / BI2-*）；aigcgateway 没有等价批次，测试基建落后 ~6-12 个月。

---

## 目标

迁移 joyce 测试基建到 aigcgateway，包括：
- ✅ CI 7+ jobs（含 build+migrate / coverage / integration / e2e / rollback validate）
- ✅ vitest 三配置（unit / integration / e2e）+ coverage v8
- ✅ MSW 完整 mock 框架
- ✅ Testcontainers PostgreSQL 集成测（先 1-2 示例落地）
- ✅ Playwright e2e in CI
- ✅ Migration ROLLBACK 强制规范（含 64 historical migration retrofit）
- ✅ tests/ 目录三层结构（unit / integration / e2e）
- ✅ scripts/test/ 历史 dated 脚本归档清理

---

## F-TI-01（generator, ~1h）：Foundation — deps + 基础配置文件

### 安装依赖（精确版本对齐 joyce）

```bash
npm install -D \
  msw@^2.13.4 \
  @testcontainers/postgresql@^11.14.0 \
  testcontainers@^11.14.0 \
  @testing-library/jest-dom@^6.9.1 \
  @testing-library/react@^16.3.2 \
  @testing-library/user-event@^14.6.1 \
  @vitest/coverage-v8@^4.1.4 \
  @vitest/ui@^4.1.4
# @playwright/test 已装，确认版本 ^1.59.1
```

### 改 `package.json` scripts

```json
{
  "scripts": {
    "test": "vitest run",
    "test:unit": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:ui": "vitest --ui",
    "test:integration": "vitest run --config vitest.integration.config.ts",
    "test:e2e": "playwright test",
    "test:e2e:ui": "playwright test --ui",
    "test:e2e:debug": "playwright test --debug"
  }
}
```

### 重写 `vitest.config.ts`（参考 joyce）

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./tests/setup.ts"],
    include: [
      "src/**/__tests__/**/*.{test,spec}.{ts,tsx}",
      "src/**/*.{test,spec}.{ts,tsx}",
      "scripts/**/*.test.ts",
      "tests/unit/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: ["node_modules", "dist", ".next", "tests/integration/**", "tests/e2e/**"],
    coverage: {
      provider: "v8",
      reporter: ["text", "html", "lcov"],
      reportsDirectory: "coverage",
      include: [
        "src/lib/**/*.{ts,tsx}",
        "src/components/**/*.{ts,tsx}",
        "src/app/api/**/*.{ts,tsx}",
      ],
      exclude: [
        "src/**/*.d.ts",
        "src/**/__tests__/**",
        "src/**/*.test.{ts,tsx}",
        "src/components/ui/**",
        "src/app/(console)/**",
      ],
      thresholds: {
        lines: 60,
        functions: 60,
        branches: 50,
        statements: 60,
      },
    },
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
});
```

### 新建 `vitest.integration.config.ts`

```ts
import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/integration/**/*.{test,spec}.ts"],
    exclude: ["node_modules", "dist", ".next"],
    globals: true,
    testTimeout: 120_000,
    hookTimeout: 180_000,
    fileParallelism: false,
  },
  resolve: {
    alias: { "@": path.resolve(__dirname, "./src") },
  },
});
```

### 新建 `playwright.config.ts`

参考 joyce — 含 E2E_BASE_URL / E2E_PORT / PORT fallback；testDir 指 tests/e2e；screenshots/traces on failure。

### Acceptance

- [ ] 8 个新 deps 装齐
- [ ] 3 个 config 文件创建（vitest / vitest.integration / playwright）
- [ ] package.json 9 个 test scripts 加完
- [ ] `npx tsc --noEmit` 通过
- [ ] `npm run test` 现有 554 测试不破（jsdom env 切换可能要调整 1-2 个测试）

---

## F-TI-02（generator, ~2h）：tests/ 目录重组 + MSW 框架

### 新建 `tests/setup.ts`

```ts
import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./mocks/server";

beforeAll(() => server.listen({ onUnhandledRequest: "warn" }));
afterEach(() => server.resetHandlers());
afterAll(() => server.close());
```

### 新建 `tests/mocks/{server,handlers,browser}.ts`

模拟 aigcgateway 上游的 4 类 HTTP 服务（与 joyce 内容不同 — joyce 模 aigcgateway 自己 + Resend；aigcgateway 模 OpenAI + OpenRouter + Anthropic + SiliconFlow）：

```ts
// tests/mocks/handlers.ts
export const MOCK_BASE_URLS = {
  openai: "https://api.openai.com",
  openrouter: "https://openrouter.ai",
  anthropic: "https://api.anthropic.com",
  siliconflow: "https://api.siliconflow.cn",
} as const;

export const handlers = [
  http.post(`${MOCK_BASE_URLS.openai}/v1/chat/completions`, async () => HttpResponse.json({...})),
  http.post(`${MOCK_BASE_URLS.openai}/v1/embeddings`, async () => HttpResponse.json({...})),
  http.post(`${MOCK_BASE_URLS.openrouter}/v1/chat/completions`, async () => HttpResponse.json({...})),
  http.post(`${MOCK_BASE_URLS.openrouter}/v1/embeddings`, async () => HttpResponse.json({...})),
  http.get(`${MOCK_BASE_URLS.openrouter}/api/v1/activity`, async () => HttpResponse.json({data: []})),
  http.post(`${MOCK_BASE_URLS.anthropic}/v1/messages`, async () => HttpResponse.json({...})),
  http.post(`${MOCK_BASE_URLS.siliconflow}/v1/embeddings`, async () => HttpResponse.json({...})),
  // ... 其他常用 endpoint
];
```

### 目录重组

```
tests/
├── setup.ts                  # MSW 生命周期
├── mocks/
│   ├── server.ts             # setupServer (Node)
│   ├── browser.ts            # setupWorker (Browser)
│   └── handlers.ts           # 默认 handlers
├── factories/                # 已存在，保留
│   └── index.ts
├── unit/                     # 新建 — 跨模块单测（i18n / 配置等）
├── integration/              # 新建 — Testcontainers
│   └── ... (F-TI-05 落地)
├── e2e/                      # 已存在 3 个 spec
│   ├── balance-user-level-ui.spec.ts
│   ├── project-switcher.spec.ts
│   └── user-profile-center.spec.ts
├── perf/                     # 已存在，保留 k6 / autocannon
└── mcp-test/                 # 已存在（MCP 8 角色 audit prompts），保留
```

### 现有 src/lib/__tests__/* 不动（已是 unit 测）

### Acceptance

- [ ] tests/setup.ts + mocks/{server,browser,handlers}.ts 创建
- [ ] tests/{unit,integration} 目录创建（空 placeholder OK，F-TI-05 填）
- [ ] 现有 554 单测仍通过（setup.ts 的 MSW lifecycle 不破现有）
- [ ] `npm run test:coverage` 跑通，coverage/ 目录生成
- [ ] tsc + build 通过

---

## F-TI-03（generator, ~1h）：CI workflow 扩展 — 3 jobs → 8 jobs

### 重写 `.github/workflows/ci.yml`

参考 joyce 结构，jobs 含：

1. `install` — npm ci with cache
2. `lint`
3. `typecheck` — npx prisma generate + npm run typecheck
4. `validate-rollback-sql` — 调 F-TI-04 脚本
5. `build` — PostgreSQL service container + npx prisma migrate deploy + npm run build
6. `unit-tests` — vitest run + coverage（artifact 上传 lcov.info）
7. `integration-tests` — vitest run --config vitest.integration.config.ts（用 Testcontainers，无需 service container）
8. `e2e-tests` — PostgreSQL service container + npx playwright install + npx playwright test + 上传 playwright-report artifact

### env 块（CI-only secrets）

```yaml
env:
  NODE_VERSION: "22"
  DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/aigc_gateway?schema=public"
  JWT_SECRET: "ci-placeholder-secret-do-not-use-in-prod"
  ENCRYPTION_KEY: "ci-placeholder-encryption-key-32-bytes-long-do-not-use"
  IMAGE_PROXY_SECRET: "ci-placeholder-image-proxy-secret-32-bytes-long"
  REDIS_URL: "redis://localhost:6379/0"
```

### concurrency

```yaml
concurrency:
  group: ci-${{ github.ref }}
  cancel-in-progress: true
```

### Acceptance

- [ ] CI 跑出 8 个 jobs（含 build + e2e）
- [ ] PostgreSQL service container 启动 + migrate deploy 成功
- [ ] Playwright 跑 3 个现有 spec（即使全 fail 也要先建 pipeline，单独 issue 修测试）
- [ ] coverage artifact 上传成功
- [ ] CI 总时间 ≤ 10min（concurrency 让 jobs 并行）

---

## F-TI-04（generator, ~1.5-2h）：Migration ROLLBACK 强制规范

### 新建 `scripts/validate-rollback-sql.sh`

直接 port joyce 版本（极简，35 行）。

### 64 个 historical migrations retrofit

机械工作：每个 `prisma/migrations/*/migration.sql` 文件需含一行 `^-- ROLLBACK:` 注释。

策略：

| migration 类型 | ROLLBACK 写法 |
|---|---|
| **CREATE INDEX** | `-- ROLLBACK: DROP INDEX "idx_name";` |
| **ADD COLUMN（nullable）** | `-- ROLLBACK: ALTER TABLE "x" DROP COLUMN "y";` |
| **ADD COLUMN（with default）** | `-- ROLLBACK: ALTER TABLE "x" DROP COLUMN "y";` |
| **CREATE TABLE** | `-- ROLLBACK: DROP TABLE "x";` |
| **ADD CHECK constraint** | `-- ROLLBACK: ALTER TABLE "x" DROP CONSTRAINT "y_check";` |
| **DATA migration（UPDATE / 数据修复）** | `-- ROLLBACK: revert commit + restore from backup（不可幂等回滚）` |
| **复合 / 大改动** | `-- ROLLBACK: revert commit; manual SQL recovery required（标注理由）` |

工时拆：
- 64 文件 × 1-2min = ~1.5h（脚本辅助批量加 placeholder + 人工复核 SQL 内容）

### 部署脚本同步

如果有 deploy.yml / scripts/deploy 的 pre-ssh step：在生产部署前调 `validate-rollback-sql.sh` 兜底（参考 joyce）。

### Acceptance

- [ ] `scripts/validate-rollback-sql.sh` 创建并 +x
- [ ] 64 个 historical migration 全部含 `-- ROLLBACK:` 注释
- [ ] 脚本在 CI（F-TI-03 第 4 个 job）跑通退出码 0
- [ ] 文档化规范：在 docs/dev/rules.md 加一段「migration ROLLBACK 注释规范」+ 链接 joyce reference

---

## F-TI-05（generator, ~2h）：Testcontainers 集成测示例

### 新建 1-2 个高价值集成测

**示例 1：`tests/integration/deduct-balance-atomic.test.ts`**

测试 `deduct_balance` PostgreSQL function 在并发场景下的原子性（FOR UPDATE 行锁）：

```ts
import { GenericContainer } from "testcontainers";
import { PostgreSqlContainer } from "@testcontainers/postgresql";
import { PrismaClient } from "@prisma/client";

describe("deduct_balance atomicity (Testcontainers)", () => {
  let container: PostgreSqlContainer;
  let prisma: PrismaClient;

  beforeAll(async () => {
    container = await new PostgreSqlContainer("postgres:16").start();
    process.env.DATABASE_URL = container.getConnectionUri();
    // 跑 prisma migrate deploy
    // 跑 seed 创建测试 user + balance=10
    prisma = new PrismaClient();
  }, 60_000);

  afterAll(async () => {
    await prisma.$disconnect();
    await container.stop();
  });

  it("两并发请求不会让 balance < 0（FOR UPDATE 锁）", async () => {
    // 起 2 个并发 deduct_balance(user_id, 8)
    const [r1, r2] = await Promise.all([
      prisma.$queryRaw`SELECT deduct_balance(${userId}, 8)`,
      prisma.$queryRaw`SELECT deduct_balance(${userId}, 8)`,
    ]);
    // 一个成功一个 throw insufficient_balance；最终 balance ≥ 0
    const finalBalance = await prisma.user.findUnique({ where: { id: userId } });
    expect(finalBalance.balance).toBeGreaterThanOrEqual(0);
  });
});
```

**示例 2：`tests/integration/reconciliation-cny-conversion.test.ts`**

测试 BL-RECON-FIX-PHASE1 F-RF-02 的 CNY→USD 转换在真实 PostgreSQL 上的 BillReconciliation 行为（含 Decimal 精度）。

### 文档化

`docs/dev/testing.md` 新建：
- Testcontainers 集成测怎么写
- 何时用 unit (vi.mock) vs integration (Testcontainers) — 决策树
- 启动时间预期（~30s 容器 boot + ~10s migrate）

### Acceptance

- [ ] 2 个集成测文件 PASS（本地 + CI）
- [ ] `docs/dev/testing.md` 创建（≥ 50 行）
- [ ] CI integration job（F-TI-03）跑通 ≤ 90s

---

## F-TI-06（generator, ~1h）：scripts/test/ 历史 dated 脚本归档

### 现状

`scripts/test/` 共 72 个 .ts/.tsx 文件：
- 69 个 `*-YYYY-MM-DD.ts` 是 dated 一次性 e2e（每批次 verifying 阶段产物，已归档价值低）
- 3 个 keep：`codex-env.sh` / `codex-setup.sh` / `codex-wait.sh`（现役 Codex 测试环境）

### 操作

```bash
mkdir -p scripts/test/_archive_2026Q1Q2
git mv scripts/test/*-YYYY-MM-DD.ts scripts/test/_archive_2026Q1Q2/  # 用 glob 实际操作
git mv scripts/test/*-YYYY-MM-DD.tsx scripts/test/_archive_2026Q1Q2/
```

或者更激进：直接 `git rm`（git 历史保留），减少仓库体积。

**决策点：** 用户在 fix-round 时可能想跑历史脚本验证回归（如 BL-FE-QUALITY 历史 e2e 复跑），故倾向 **归档保留** 而非删除。

### scripts/seed-* 保留

`scripts/seed-marketing-templates.ts` / `scripts/seed-embedding-models.ts` 是产线必需，保留在 scripts/ 根。

### Acceptance

- [ ] `scripts/test/` 仅剩 codex-* 3 文件（现役）+ _archive_2026Q1Q2/ 目录
- [ ] git ls-files | wc -l 减少 ~60+
- [ ] 文档化：在 `docs/dev/rules.md` 标注「dated e2e 脚本写到 _archive_，新批次 verifying e2e 写到 tests/e2e/」

---

## F-TI-07（codex, ~1h）：全量验收

### 静态（4）
1. tsc + build + vitest（单测 + integration 各跑一次）通过
2. coverage artifact 生成（lcov.info 可读）
3. validate-rollback-sql.sh 通过（64 migrations 全含 ROLLBACK）
4. CI 8 jobs 在 PR 中全绿

### 集成测（2）
5. 1 个集成测真跑通（deduct_balance atomicity）
6. Testcontainers 容器启动 + migrate + cleanup 全程 ≤ 90s

### E2E（2）
7. Playwright e2e 跑 3 个现有 spec，至少 1 个 PASS
8. CI 上传 playwright-report artifact

### MSW（2）
9. tests/setup.ts 启用后现有 554 单测无回归
10. mocks/handlers.ts mock OR/OpenAI 等 4 个上游，untreated 请求 → console warn

### 报告（1）
11. `docs/test-reports/BL-TEST-INFRA-IMPORT-signoff-2026-04-2X.md`，含证据：CI 8 jobs 截图 + coverage % + integration test log + e2e report

---

## Risks

| 风险 | 缓解 |
|---|---|
| jsdom env 切换让现有单测部分破（之前 vitest config 是 node env） | F-TI-01 先用 environment: "happy-dom" 或保留 node + 让 jsdom 仅在需要的测里 declare；逐 case 修 |
| 64 historical migration 补 ROLLBACK 注释枯燥易错 | 用脚本批量加默认 placeholder + 人工 review 关键 migration（DATA migration / 大改动） |
| Testcontainers 在 CI 启动慢（30s+ × 集成测数）→ CI 总时间膨胀 | 集成测 Phase 1 仅 1-2 文件；fileParallelism: false 串行；总时长 < 2min 可接受 |
| Playwright 现有 3 个 spec 部分本就破（开发期被 ignore） | F-TI-07 acceptance 只要求「CI 跑 + 至少 1 PASS + report 上传」；后续单独 batch 修测 |
| MSW handlers 与现有 vi.mock 混用产生 mock 漂移 | F-TI-02 仅引入 MSW 不强制全替换；新测试推荐用 MSW，旧 vi.mock 保留 |
| @testing-library/react 引入后 React component 单测可能改写法 | 现有 component 测全用 vi.mock + 不渲染真组件；不强制改 |
| `scripts/test/` 大量历史脚本归档可能让某些 documentation 引用断 | 全仓 grep `scripts/test/.*-202` 引用 → 验证后再删 / 移 |

---

## 部署

无生产部署影响（纯 dev infra + CI 改动）。

回滚：单 commit revert 即可。

---

## 验收标准（Phase 1 = 本批次）

- [ ] F-TI-07 11 项全 PASS
- [ ] CI 8 jobs 在 main push 全绿
- [ ] coverage 启用 + 阈值生效
- [ ] 1 个 Testcontainers 集成测真跑
- [ ] Playwright 在 CI 跑（artifact 上传）
- [ ] 64 migrations 含 ROLLBACK
- [ ] MSW 框架引入 + 现有 554 单测无回归
- [ ] scripts/test/ 历史归档
- [ ] signoff 报告归档

## 非目标 / Phase 2 留观察

- ❌ 不强制把现有 vi.mock 替换为 MSW（增量替换）
- ❌ 不补 e2e tests（现有 3 spec 改 + 加新 e2e 留 BL-TEST-INFRA-PHASE2）
- ❌ 不引入 visual regression baseline（joyce 有但 aigcgateway UI 改动较少，留 Phase 2）
- ❌ 不引入 update-visual-baselines workflow
- ❌ 不写 staging 环境（独立 batch BL-INFRA-STAGING）
- ❌ 不改任何业务代码逻辑（纯测试基建）
