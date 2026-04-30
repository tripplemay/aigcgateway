# BL-SEC-CRED-HARDEN Spec

**批次：** BL-SEC-CRED-HARDEN（P0-security，第一波第 1 批）
**负责人：** Planner = Kimi / Generator = 默认映射 / Evaluator = Reviewer
**创建：** 2026-04-18
**工时：** 0.5 day
**源：** `docs/code-review/backend-fullscan-2026-04-17.md` CRIT-5 + CRIT-6 + L5

## 背景

2026-04-17 全量 Code Review 发现 3 类凭证硬化问题：

### CRIT-6 图片代理 HMAC Secret 硬编码 Fallback
`src/lib/api/image-proxy.ts:13-19` 的 `getSecret()` 有字符串 fallback：
```ts
process.env.IMAGE_PROXY_SECRET ?? AUTH_SECRET ?? NEXTAUTH_SECRET ?? "aigc-gateway-image-proxy-dev-secret"
```
若生产 env 未配置，使用公开字符串，攻击者可伪造 HMAC 访问所有用户生成的图片。

**2026-04-17 已为生产 env 注入随机 secret**，本批次负责删除代码 fallback + 启动校验。

### CRIT-5 硬编码 admin 密码（10+ 文件）
已提交到 git 历史的明文密码：
- `prisma/seed.ts:284` — `hashSync("admin123", 12)` (email: `admin@aigc-gateway.local`)
- `scripts/admin-auth.ts:5-6` — `"Codex@2026!"` (email: `codex-admin@aigc-gateway.local`)
- `scripts/stress-test.ts:12-13` — 同上
- `scripts/test/template-governance-eval.mjs:89-93`
- `scripts/test/_archive_2026Q1Q2/bf-fork-project-switch-verifying-e2e-2026-04-10.ts:49-50`
- `scripts/test/_archive_2026Q1Q2/rate-limit-f-rl-08-verifying-e2e-2026-04-15.ts:131-132`
- 另外 5+ 个 `scripts/test/*.ts`

**用户负责：** 生产 admin 密码由用户自行轮换（2026-04-17 同步确认）。
**本批次负责：** 删除代码中所有硬编码密码 fallback，改为 `process.env.X ?? throw`。

### L5 E2E 测试弱密码硬编码
`scripts/e2e-test.ts` 等 E2E 脚本使用硬编码 `Test1234`。级别虽低，但顺带清理。

## 目标

1. 所有 secret / 密码 **零代码 fallback**（无公开字符串保底）
2. 启动时 **fail-fast**：缺失关键 env 时直接抛错拒绝启动（不退化运行）
3. 脚本**就地 assert**：运行时缺失环境变量立即中止（不假 success）

## 改动范围

### F-CH-01：移除 `image-proxy.ts` fallback + 启动校验

**文件：** `src/lib/api/image-proxy.ts`

- 删除 `?? "aigc-gateway-image-proxy-dev-secret"` fallback
- `getSecret()` 改为：若 `IMAGE_PROXY_SECRET || AUTH_SECRET || NEXTAUTH_SECRET` 全空，`throw new Error("IMAGE_PROXY_SECRET (or AUTH_SECRET / NEXTAUTH_SECRET) is required")`
- `src/lib/env.ts` 启动校验块新增一项断言（若已有 startup env 检查函数则复用），保证应用启动时即抛错而非首次请求时
- 新增单测：`src/lib/api/__tests__/image-proxy.test.ts` 覆盖 env 缺失时抛错

### F-CH-02：`prisma/seed.ts` admin 密码 env 化

**文件：** `prisma/seed.ts`

- 删除 `hashSync("admin123", 12)` 字面量
- 改为 `hashSync(requireEnv("ADMIN_SEED_PASSWORD"), 12)`
- `requireEnv(key)` helper：`const v = process.env[key]; if (!v) throw new Error(\`\${key} required for seed\`); return v;`
- 保留 seed 幂等性：已存在的 admin 账号不重置密码（`upsert` update 块不含 passwordHash）
- 生产 `.env.production` 不设置 `ADMIN_SEED_PASSWORD`（禁止 prod 跑 seed）；开发者本地自定义

### F-CH-03：scripts + test scripts 密码 env 化

**文件：**
- `scripts/admin-auth.ts`
- `scripts/stress-test.ts`
- `scripts/test/template-governance-eval.mjs`
- `scripts/test/_archive_2026Q1Q2/bf-fork-project-switch-verifying-e2e-2026-04-10.ts`
- `scripts/test/_archive_2026Q1Q2/rate-limit-f-rl-08-verifying-e2e-2026-04-15.ts`
- 另外 5+ 个 `scripts/test/*.ts`（用 `git grep -l "Codex@2026\\!"` 枚举）
- `scripts/e2e-test.ts` 等含 `Test1234` 的 E2E 脚本

改动：

- 抽 `scripts/lib/require-env.ts`：`export function requireEnv(key: string): string { const v = process.env[key]; if (!v) { console.error(\`[\${path.basename(process.argv[1])}] Missing env: \${key}\`); process.exit(1); } return v; }`
- admin 密码：`const ADMIN_PASSWORD = requireEnv("ADMIN_TEST_PASSWORD")`
- 测试注册用户密码：`const TEST_USER_PASSWORD = requireEnv("E2E_TEST_PASSWORD")`
- 在仓库根目录 `.env.example` 文档化新增两个 env 变量：`ADMIN_TEST_PASSWORD=...`、`E2E_TEST_PASSWORD=...`

### F-CH-04：全量验收（Evaluator）

- `git grep -i "admin123\|Codex@2026\|Test1234\|aigc-gateway-image-proxy-dev-secret"` 零结果（除 docs/ 引用外）
- `npm run build` 通过
- `npx tsc --noEmit` 通过
- `npx vitest run src/lib/api/__tests__/image-proxy.test.ts` 新单测通过
- 启动校验验证：`IMAGE_PROXY_SECRET=` 空值启动 `npm run dev` 应立即抛错退出（本地试跑，dev server 期望崩溃）
- 脚本验证：`npx tsx scripts/admin-auth.ts` 无 env 时应 exit(1) 打 "Missing env: ADMIN_TEST_PASSWORD"
- 生成 signoff 报告

## 非目标

- 不做 git filter-repo 清理历史（视为已知泄漏，依赖密码轮换闭环）
- 不做更广的 env 强度校验（JWT_SECRET 长度等），留给后续安全批次
- 不改生产 admin 账户密码（用户负责）

## Risks

| 风险 | 缓解 |
|---|---|
| 本地开发者环境缺 env 导致 seed/script 无法启动 | `.env.example` 文档化 + `requireEnv` 报错明确提示变量名 + 错误信息给示例值 |
| CI 环境缺 env 测试脚本 fail | `.github/workflows/` 审计 + secrets 注入 `E2E_TEST_PASSWORD` |
| `image-proxy.ts` 启动校验过严拒绝应用启动 | 三级 fallback 链（`IMAGE_PROXY_SECRET → AUTH_SECRET → NEXTAUTH_SECRET`）保留，至少一个设置即可 |

## 部署

- 纯代码变更 + `.env.example` 更新，无 migration、无生产 env 新增（已在 2026-04-17 hotfix）
- CI 需在 GitHub Actions secrets 新增 `E2E_TEST_PASSWORD`（如 CI 跑 E2E 测试）
- 回滚：revert commit 即可

## 验收标准

- [ ] `git grep` 零硬编码密码/secret（除 docs）
- [ ] build + tsc + 新单测全过
- [ ] 启动校验验证通过（本地空 env 即崩溃）
- [ ] `.env.example` 文档完整
- [ ] 6 个 Critical 文件 + 10+ 脚本全部改完
- [ ] signoff 报告归档
