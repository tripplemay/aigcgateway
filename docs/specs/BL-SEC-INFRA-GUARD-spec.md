# BL-SEC-INFRA-GUARD Spec

**批次：** BL-SEC-INFRA-GUARD（P0-security，第一波第 4 批）
**负责人：** Planner = Kimi / Generator = 默认映射 / Evaluator = Reviewer
**创建：** 2026-04-18
**工时：** 2.5 day
**源：** `docs/code-review/backend-fullscan-2026-04-17.md` CRIT-8 + CRIT-9 + CRIT-10 + H-11 + H-12 + H-13 + H-14 + H-29 + H-30 + H-31

## 背景

Code Review 2026-04-17 发现基建层 9 个加固点，合并为一个批次覆盖。

所有 `file:line` 引用均已与实际源码核实（2026-04-18 Planner 核查）。

### CRIT-8 / H-11 / H-12 — admin PATCH mass assignment

三处直接 `data: body` 透传 → 管理员账号接管后可改写 provider apiKey 劫持上游：

| 文件 | 行 | 当前代码 |
|---|---|---|
| `src/app/api/admin/providers/[id]/config/route.ts` | L30-34 | `prisma.providerConfig.upsert({ update: body, create: { providerId, ...body } })` |
| `src/app/api/admin/channels/[id]/route.ts` | L13-14 | 仅 `delete body.sellPrice`，其余 `data: body` 透传 |
| `src/app/api/admin/models/route.ts` | L95 | `prisma.model.create({ data: body })` |
| `src/app/api/admin/models/[id]/route.ts` | L72 | `prisma.model.update({ data: modelUpdate })` 有部分 whitelist 需 audit |

### CRIT-9 — scheduler / model-sync 进程内锁不支持多副本

| 文件 | 行 | 问题 |
|---|---|---|
| `src/instrumentation.ts` | L19-20 | `isWorkerZero = NODE_APP_INSTANCE==="0" \|\| undefined` → Docker 多副本均为 undefined |
| `src/lib/health/scheduler.ts` | L35-54 | `schedulerTimer` 进程内 setInterval |
| `src/lib/sync/model-sync.ts` | L44, 380, 396, 628 | `syncInProgress` 进程内 boolean |

### CRIT-10 — scripts/stress-test.ts shell 注入

`scripts/stress-test.ts:34-40` `execSync` 字符串拼接 URL / headers，若 CI 参数或环境变量被污染可 RCE。

### H-13 — fork-public-template 无 MCP 权限检查

`src/lib/mcp/tools/fork-public-template.ts:22-45` 只检查 projectId，**无 `checkMcpPermission` 调用**。`projectInfo:false` 的 API key 仍可 fork 到自己项目。

### H-14 — MCP IP 白名单与 REST 层语义不一致 `[部分核实]`

| 文件 | 行 | 逻辑 |
|---|---|---|
| `src/lib/mcp/auth.ts` | L57-62 | `if (Array.isArray(w)) { if (w.length === 0 \|\| !inList) return null }` — 空白名单 → 隐式 block |
| `src/lib/api/auth-middleware.ts` | L143-154 | 空白名单 → 显式 403 "all requests blocked" |

**核实说明：** 两者行为都是"空 = block"，但 REST 显式、MCP 隐式（`||` 短路）。统一为显式更安全。Generator 可在规格核查阶段再 Read 代码确认是否有真实语义分歧。

### H-29 — Provider baseUrl 无协议校验

`src/app/api/admin/providers/[id]/route.ts:154-158` + `src/app/api/admin/providers/route.ts:36-63` 接收 `baseUrl` 时**无 URL.parse / protocol 校验**，可被写入 `file://` / `javascript:` 等非 http(s) 协议。

### H-30 — Next.js + glob 依赖高危 `[已核实]`

`npm audit --production` 输出：`8 vulnerabilities (3 moderate, 5 high)`。主要：

- `next@14.2.35`（当前）→ 最新 14.2.x 稳定修复 HTTP 请求走私等漏洞
- `glob@10.3.10` 与 `glob@7.2.3`（间接，ESLint + rimraf 带入）
- `defu` — 需 `npm ls defu` 确认（Code Review 提及但本会话未交叉验证）

### H-31 — checkBalanceAlerts 每小时重复告警

`src/lib/billing/scheduler.ts:72-119`（Code Review 报告位置，Generator 需核实实际行号）— 无 dedup key，每小时同一用户触发多次。

## 目标

1. 所有 admin PATCH 字段白名单化，禁止 mass assignment
2. 关键定时任务支持多副本部署（Redis 选主锁）
3. 运维脚本无 shell 注入面
4. MCP 与 REST 权限/IP 白名单语义一致
5. 告警不重复打扰用户
6. npm audit high/critical 数降为 0

## 改动范围

### F-IG-01：admin PATCH 字段白名单（zod schema 统一）

**文件：**
- `src/app/api/admin/providers/[id]/config/route.ts`（CRIT-8）
- `src/app/api/admin/channels/[id]/route.ts`（H-11）
- `src/app/api/admin/models/route.ts` + `[id]/route.ts`（H-12）
- `src/app/api/admin/providers/[id]/route.ts` + `route.ts`（H-29，baseUrl 协议校验）

**改动要求：**

1. 抽 `src/lib/api/admin-schemas.ts`：导出 `providerConfigUpdateSchema` / `channelUpdateSchema` / `modelCreateSchema` / `modelUpdateSchema` / `providerCreateSchema` / `providerUpdateSchema` zod schemas
2. 每个 schema 只允许本来就应该让 admin 改的字段，**禁止 apiKey / providerId / id / createdAt 等敏感或系统字段**
3. baseUrl 字段用 `z.string().url().refine(u => new URL(u).protocol === 'http:' || 'https:')`
4. 每个 handler 用 `const data = schema.parse(body)` 替换 `data: body`；ZodError → 400 with errors
5. providerConfig 的 apiKey 单独走 `/api/admin/providers/[id]/secrets` 或等价 path（查现有代码，若无则保留 providerConfig PATCH 含 apiKey 但白名单明确）

**验证：** 对每处路由补 vitest 或 e2e 测试，恶意 body（含 `id: "fake", apiKey: "xxx"`）应被拒或字段被丢弃。

### F-IG-02：scheduler + model-sync Redis 分布式锁

**文件：** `src/instrumentation.ts` + `src/lib/health/scheduler.ts` + `src/lib/sync/model-sync.ts`

**改动要求：**

1. 抽 `src/lib/infra/leader-lock.ts`：
   ```ts
   export async function acquireLeaderLock(key: string, ttlSeconds: number): Promise<boolean>;
   export async function releaseLeaderLock(key: string): Promise<void>;
   export async function heartbeatLock(key: string, ttlSeconds: number): Promise<boolean>;
   ```
   - 用 Redis `SET key value NX EX ttl` 实现
   - Redis 不可用时 fallback 到本地 boolean（记 warn 日志）
2. `instrumentation.ts` 删除 `NODE_APP_INSTANCE==="0"` 判断，改为启动时尝试 `acquireLeaderLock('scheduler', 70)`；成功才启 scheduler + model-sync
3. `scheduler.ts` 每 tick 调 `heartbeatLock('scheduler', 70)` 刷新 TTL
4. `model-sync.ts` 每次启动前 `acquireLeaderLock('model-sync', 3600)`，失败 skip
5. Graceful shutdown（SIGTERM）调用 `releaseLeaderLock`

**验证：** 本地启两个 dev server（不同 PORT），观察只有一个跑 scheduler；杀掉它后另一个 70s 内接管。

### F-IG-03：scripts/stress-test.ts shell 注入修

**文件：** `scripts/stress-test.ts:34-40`

**改动：**

- 所有 `execSync(\`npx autocannon ...\`)` 改 `spawnSync("npx", ["autocannon", "-H", `${k}=${v}`, opts.url, ...])` 数组形式
- 审计其他脚本：`git grep "execSync\|exec(" scripts/ | grep -v "^scripts/test/"` 全量检视
- 命中额外的字符串拼接 execSync 一并改 spawn

**验证：** 设置 `BASE_URL="; echo pwn"` 运行脚本，确认不被执行。

### F-IG-04：MCP 权限 + IP 白名单一致性

**文件：** `src/lib/mcp/tools/fork-public-template.ts` + `src/lib/mcp/auth.ts`

**改动：**

1. `fork-public-template.ts` handler 首行调 `checkMcpPermission(ctx, "projectInfo")`（模仿 `create-template.ts` 或类似工具），`projectInfo:false` → 返回 403
2. `mcp/auth.ts:57-62` 改为显式：
   ```ts
   if (Array.isArray(whitelist)) {
     if (whitelist.length === 0) {
       console.warn(`[mcp] Empty whitelist on key ${keyPrefix} — blocking`);
       return null;
     }
     if (!isIpInWhitelist(clientIp, whitelist)) { return null; }
   }
   ```
   语义与 REST 层 `auth-middleware.ts:143-154` 保持一致（空=blocked，非空=严格匹配）

**验证：** 生成 projectInfo:false 的 API key + fork public template 应 403；空白名单的 key 调用 MCP 应 401。

### F-IG-05：checkBalanceAlerts 去重

**文件：** `src/lib/billing/scheduler.ts`（Generator 核实实际 checkBalanceAlerts 函数位置）

**改动：**

- 每次发告警前 `redis.set(\`alert:balance:\${userId}:\${thresholdKey}:\${YYYYMMDD}\`, "1", "NX", "EX", 86400)`
- SET NX 返回 null 则 skip（当日已发）
- thresholdKey 例如 "low" / "critical"，对应不同阈值

**验证：** 本地触发一次 balance alert，查 Redis 存在 key；再次触发同日同阈值应 skip。

### F-IG-06：Next.js + glob 依赖升级

**改动要求：**

1. 先 snapshot `package-lock.json` 作为回滚基线
2. 升级 `next@14.2.35` → `next@14.2.latest`（保 App Router 14.x 兼容）
3. 升级 `glob@7.2.3`（rimraf 带入）→ 间接升级或 override
4. 运行 `npm audit --production` 确认 high/critical 降为 0
5. 跑 `npm run build` + `npx tsc --noEmit` + `npx vitest run` 全部通过
6. 手动冒烟：登录 / dashboard / api 调用一次确认无 runtime regression

**验证：** `npm audit --production` 输出 0 high + 0 critical。

### F-IG-07：全量验收（Evaluator）

**admin PATCH mass assignment 防护（5 处）：**
1. providerConfig PATCH 带 `apiKey: "fake"` + `id: "fake"` → 验证请求被拒或字段被丢弃
2. channel PATCH 带 `status: "HIJACKED"` + 不在 whitelist 字段 → 同上
3. model POST/PATCH 带 `projectId: "other"` → 同上
4. provider PATCH `baseUrl: "file:///etc/passwd"` → 400
5. provider PATCH `baseUrl: "javascript:alert(1)"` → 400

**分布式锁（2 处）：**
6. 本地两实例 dev server，scheduler 仅一个实例跑（查 pm2 logs）
7. Redis 不可用 fallback 本地 boolean（手动停 Redis 启动观察 warn）

**shell 注入防护：**
8. `BASE_URL="; rm -rf /tmp/test"; npx tsx scripts/stress-test.ts` 不应执行恶意命令

**MCP 权限：**
9. fork-public-template with projectInfo:false key → 403
10. 空 IP whitelist MCP key → 401（语义显式）

**告警去重：**
11. 同用户同日 balance 告警仅触发一次

**依赖升级：**
12. `npm audit --production` 0 high + 0 critical
13. `npm run build` + tsc + vitest 全过
14. 冒烟：生产登录 + dashboard + 一次 AI 调用无 regression

**生成 signoff 报告。**

## 非目标

- 不重构 admin UI 层（只动 API handler）
- 不引入新的 RBAC / ACL 系统（单 admin role 足够）
- 不做 CI 参数白名单审查（独立批次）
- 不做 Redis lock 的 fencing token 机制（简单 NX EX 足够）
- 不升级 prisma / 其他大依赖（范围控制）

## Risks

| 风险 | 缓解 |
|---|---|
| Next.js 升级破坏 App Router 兼容 | 只升小版本（14.2.x），升前 snapshot package-lock；build + smoke 验证 |
| Redis 分布式锁 fallback 到本地 boolean 时多副本并发 | 日志 warn + 生产仅部署单副本（现状）；未来扩容触发时主动加锁 |
| zod schema 遗漏正常字段导致业务 break | 每个 schema 过一遍现有前端 / admin UI 的字段使用，对齐白名单 |
| admin UI 发往 API 的 body 含额外字段被 Zod 拒 | `schema.partial().strict()` 拒绝未知字段 + 明确错误返回让前端改正 |
| shell 注入测试误伤 | 只用 echo / 创建文件等无害命令测试 |

## 部署

- 纯代码变更 + 1 个依赖升级 + Redis key 约定
- 部署：git pull + npm ci + npm run build + pm2 restart
- 回滚：revert commit + npm ci 回旧 lockfile

## 验收标准

- [ ] F-IG-07 14 项全 PASS
- [ ] build + tsc + vitest + npm audit 全绿
- [ ] signoff 报告归档
