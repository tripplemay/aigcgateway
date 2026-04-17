# AIGC Gateway 全量 Code Review 总报告

**审查日期：** 2026-04-17
**审查范围：** 全后端 + 全前端 + 数据库 + 运维脚本（约 44,645 行代码）
**审查方式：** 8 个 subagent 并行深度审查（6 × code-reviewer / 1 × database-reviewer / 1 × security-reviewer）
**详细报告：** 本目录下 `batch-01-api-routes.md` ~ `batch-08-hooks-scripts.md`

---

## 执行摘要

**整体结论：BLOCK — 不允许生产部署，必须先修复全部 15 个 Critical 问题。**

本次审查发现 **169 个独立问题**（含跨批次重复，唯一问题约 140 个），严重度分布：

| 严重度 | 合计 | 说明 |
|---|---|---|
| **Critical** | **15** | 直接可导致资金损失 / 认证绕过 / 数据透支 / RCE / 凭证泄漏 |
| **High** | **46** | 需特定条件利用但影响广泛，或明显数据完整性/可用性风险 |
| **Medium** | **54** | 代码质量、健壮性、性能、可维护性问题 |
| **Low** | **42** | 风格改进、边缘 case |
| **Info** | **12** | 观察性意见，无需修复 |

**各批次计数：**

| 批次 | 范围 | C | H | M | L | I |
|---|---|---|---|---|---|---|
| 01 | API 路由层（96 routes） | 2 | 6 | 8 | 5 | 3 |
| 02 | 引擎层 + API 适配 | 0 | 4 | 7 | 5 | 2 |
| 03 | MCP 层（25 tools） | 0 | 4 | 4 | 4 | 0 |
| 04 | 基础设施（健康/同步/计费/通知/模板） | 1 | 6 | 6 | 5 | 0 |
| 05 | 数据层（schema + 56 migrations） | 3 | 7 | 8 | 7 | 4 |
| 06 | 全栈安全专项 | 4 | 6 | 6 | 5 | 3 |
| 07 | 前端页面 + 组件 | 2 | 8 | 9 | 7 | 0 |
| 08 | Hooks + 运维脚本 | 3 | 5 | 6 | 4 | 0 |
| **合计** | | **15** | **46** | **54** | **42** | **12** |

---

## Critical 问题清单（去重后 10 项，均 BLOCK）

### 🔴 资金安全类（4 项）

#### CRIT-1 | 支付 Webhook 完全未验签 — 任意请求可充值任意用户
- **文件：** `src/app/api/webhooks/alipay/route.ts:32` / `src/app/api/webhooks/wechat/route.ts:31`
- **现象：** 支付宝 RSA2 验签和微信 WECHATPAY2-SHA256-RSA2048 验签 + AEAD-AES-256-GCM 解密均被注释掉。微信 webhook 甚至直接将 `ciphertext` 按明文 JSON 解析。
- **攻击路径：** 直接 POST 伪造回调（`out_trade_no` + `trade_status=TRADE_SUCCESS`）→ `processPaymentCallback` → 任意用户余额被充值，零成本。
- **影响：** 业务破产级资金损失。
- **交叉引用：** Batch 01 [C1]、Batch 06 [C1]、Batch 08 [S-04]
- **修复：** 立即实现验签；验签未通过前 400 拒绝。使用 `alipay-sdk` 的 `AlipaySignature.rsaCheckV2` / 官方微信 SDK。

#### CRIT-2 | `deduct_balance` PostgreSQL 函数缺行级锁 — 并发余额透支
- **文件：** `prisma/migrations/20260410120000_apikey_to_user_level/migration.sql:40-80`
- **现象：** `UPDATE users SET balance = balance - p_amount WHERE id = p_user_id AND balance >= p_amount` 不带 `SELECT ... FOR UPDATE`，两个并发事务可同时通过检查后都扣减 → 余额变负。
- **影响：** 高并发用户（多 key 并发）可透支余额，直接亏损。
- **交叉引用：** Batch 05 [C1]
- **修复：** 改用 `SELECT balance INTO v_balance FROM users WHERE id = p_user_id FOR UPDATE`，再做条件判断。

#### CRIT-3 | 支付回调幂等性竞态 — 余额双充
- **文件：** `src/lib/billing/payment.ts:20-98`
- **现象：** 先 `findUnique` 读订单状态再进事务处理，两并发回调都读到 `PENDING` → 都执行余额增加。
- **影响：** 支付平台重试场景下用户余额被充两次，平台损失。
- **交叉引用：** Batch 04 [HIGH-3]
- **修复：** 事务内改用 `updateMany` 条件 CAS：`where: { id, status: "PENDING" }, data: { status: "COMPLETED" }`，`updated.count === 0` 则跳过。

#### CRIT-4 | `CallLog.create` 与 `deduct_balance` 非原子 — 计费泄漏
- **文件：** `src/lib/api/post-process.ts:127-158`
- **现象：** 两次顺序 DB 调用，`callLog.create` 成功后 `deductBalance` 若失败或进程崩溃，服务已消费但无扣费记录。
- **影响：** 持续性收入泄漏，对账失败。
- **交叉引用：** Batch 02 [MED-07]、Batch 05 [H3]
- **修复：** 用 `prisma.$transaction` 包裹两步，或让 `deduct_balance` 函数内同时创建 CallLog。

### 🔴 认证/凭证类（4 项）

#### CRIT-5 | 硬编码 admin 密码已提交到 git（10+ 文件）
- **文件：**
  - `prisma/seed.ts:284` — `hashSync("admin123", 12)` (email: `admin@aigc-gateway.local`)
  - `scripts/admin-auth.ts:5-6` — `ADMIN_PASSWORD = "Codex@2026!"` (email: `codex-admin@aigc-gateway.local`)
  - `scripts/stress-test.ts:12-13` — 同上
  - `scripts/test/template-governance-eval.mjs:89-93`
  - `scripts/test/bf-fork-project-switch-verifying-e2e-2026-04-10.ts:49-50`
  - `scripts/test/rate-limit-f-rl-08-verifying-e2e-2026-04-15.ts:131-132`
  - 另外 5+ 个 `scripts/test/*.ts` 文件
- **现象：** 明文密码已进入 git 历史，永久可见。
- **影响：** 任何有代码读权限者均可直接登录生产管理员账号。
- **交叉引用：** Batch 06 [C2][C3]、Batch 08 [S-01][S-02]
- **修复：**
  1. **立即轮换** 生产环境 `admin@aigc-gateway.local` 和 `codex-admin@aigc-gateway.local` 密码。
  2. 脚本改为 `process.env.ADMIN_PASSWORD ?? throw`，无 fallback。
  3. seed.ts 改读 `process.env.ADMIN_SEED_PASSWORD`。
  4. 考虑用 `git filter-repo` 清理历史（或标记为已知泄漏）。

#### CRIT-6 | 图片代理 HMAC Secret 硬编码 Fallback
- **文件：** `src/lib/api/image-proxy.ts:13-19`
- **现象：** `process.env.IMAGE_PROXY_SECRET ?? AUTH_SECRET ?? NEXTAUTH_SECRET ?? "aigc-gateway-image-proxy-dev-secret"`。若生产未配置对应 env，使用公开字符串。
- **影响：** 攻击者用此 secret 为任意 traceId/idx 伪造 HMAC 签名 → 访问所有用户生成的图片（含敏感生成内容）。
- **交叉引用：** Batch 06 [C4]
- **修复：** 移除字符串 fallback，改为启动时校验：未设置则抛出 `throw new Error("IMAGE_PROXY_SECRET required")`；立即验证生产是否已配置。

#### CRIT-7 | JWT 写入非 HttpOnly cookie + localStorage — XSS 会话劫持
- **文件：** `src/app/(auth)/login/page.tsx:131` + `src/app/(console)/layout.tsx:50` + `src/app/(console)/settings/page.tsx:711-714` + `src/components/top-app-bar.tsx:45`
- **现象：** `document.cookie = "token=${data.token}; path=/; max-age=...; SameSite=Lax"` 同时 `localStorage.setItem("token", ...)`。均无 HttpOnly、无 Secure。
- **影响：** 任一 XSS 漏洞（或第三方 CDN 被攻陷）→ 所有在线用户 session 被盗。
- **交叉引用：** Batch 06 [M1]、Batch 07 [CRITICAL-01]
- **修复：** 后端 `/api/auth/login` 路由中 `Set-Cookie: HttpOnly; Secure; SameSite=Lax` 设置；前端不再直接读写 token。

#### CRIT-8 | ProviderConfig PATCH 无字段白名单 — 服务商 API Key 可被覆盖
- **文件：** `src/app/api/admin/providers/[id]/config/route.ts:30` (3 份重复代码)
- **现象：** `prisma.providerConfig.upsert({ update: body, create: { providerId, ...body } })` 直接透传 body。
- **影响：** 管理员账户被接管后（或内部人员）可将任意服务商 `apiKey` 替换为受控端点 → 劫持所有上游流量（SSRF + 凭证劫持）。
- **交叉引用：** Batch 01 [C2]、Batch 06 [H3]
- **修复：** 明确字段白名单（`chatEndpoint`、`imageEndpoint`、`quirks`、`currency` 等），其余丢弃。

### 🔴 可用性/基础设施类（2 项）

#### CRIT-9 | 调度器无分布式锁 — 多副本部署产生并发污染
- **文件：** `src/instrumentation.ts:14-17` + `src/lib/health/scheduler.ts:35-48` + `src/lib/sync/model-sync.ts:44-46`
- **现象：** `syncInProgress`/`schedulerTimer` 仅进程内变量。`isWorkerZero` 判断 `NODE_APP_INSTANCE === "0" || undefined`。Docker 多副本下 `NODE_APP_INSTANCE` 均为 undefined → 所有副本同时跑调度。
- **影响：** 多副本并发执行健康检查 → 误判 DISABLE；并发执行 model-sync → 通道 upsert 冲突、错误下架通道。
- **交叉引用：** Batch 04 [CRITICAL-1]
- **修复：** Redis `SET NX EX 70` 实现单实例选主锁；或改用 Kubernetes CronJob / pg_cron。

#### CRIT-10 | 运维脚本 shell 注入
- **文件：** `scripts/stress-test.ts:34-40`
- **现象：** `execSync(\`npx autocannon ... -H '${k}=${v}' ... '${opts.url}'\`)` — URL 和 header 值未转义，`BASE_URL` 来自 env。
- **影响：** 若 `BASE_URL` 被污染（CI 参数、恶意 PR），脚本执行环境 RCE。
- **交叉引用：** Batch 06 [H6]、Batch 08 [S-03]
- **修复：** 改用 `spawn("npx", ["autocannon", ...args])` 数组形式；删除所有字符串拼接 `execSync` 调用。

---

## High 问题（46 项，按主题归类）

### 性能 & 索引（6 项）

| ID | 位置 | 问题 | 来源 |
|---|---|---|---|
| H-1 | `prisma/schema.prisma:614` `TemplateStep.actionId` | 外键无索引，删除/关联查询全表扫描 | Batch 05 C2 |
| H-2 | `prisma/schema.prisma:303-313` `AliasModelLink` | 两个外键均无单列索引，路由反查全表扫描 | Batch 05 C3 |
| H-3 | `call_logs` / `system_logs` / `health_checks` | 无归档/分区，6 个月后表体积数十 GB | Batch 05 H1 |
| H-4 | `src/lib/sync/model-sync.ts:196-229` | `reconcile` N+1：每日同步 400-600 次 DB 往返 × 11 家 | Batch 04 HIGH-2 |
| H-5 | `src/lib/mcp/tools/list-actions.ts:36-44` | `include: { versions }` 无 take，单页可拉 1000+ 行 | Batch 03 HIGH |
| H-6 | `src/lib/api/post-process.ts:168-175` | 每个成功调用多一次 Project 查询 | Batch 02 HIGH-03 |

### 认证/授权（8 项）

| ID | 位置 | 问题 | 来源 |
|---|---|---|---|
| H-7 | `src/app/api/auth/login/route.ts` + `register/route.ts` | 无速率限制，可暴力破解 / 批量注册 | Batch 01 H2、Batch 06 H1 |
| H-8 | `src/middleware.ts:4-13` | `decodeJwtPayload` 仅 base64 解码，中间件 admin 路由保护可绕过 | Batch 04 HIGH-6、Batch 06 M3 |
| H-9 | `src/app/api/auth/login/route.ts:40` | bcrypt cost 从 12 降级为 10（静默 catch） | Batch 01 H5、Batch 06 M6 |
| H-10 | `src/app/api/auth/login/route.ts:23` | `deletedAt/suspended` 检查在 bcrypt 之后 → 时序 oracle | Batch 01 H4 |
| H-11 | `src/app/api/admin/channels/[id]/route.ts:11` | Channel PATCH 仅删 `sellPrice`，其余 mass assignment | Batch 01 H1、Batch 06 M7 |
| H-12 | `src/app/api/admin/models/route.ts:90-96` | Model POST 无字段白名单 | Batch 06 H4 |
| H-13 | `src/lib/mcp/tools/fork-public-template.ts:22-26` | 无 `checkMcpPermission`，`projectInfo:false` 的 key 仍可 fork | Batch 03 HIGH |
| H-14 | `src/lib/mcp/auth.ts:57-62` | 空 IP 白名单语义与 REST 层不一致 | Batch 03 HIGH |

### 数据完整性（6 项）

| ID | 位置 | 问题 | 来源 |
|---|---|---|---|
| H-15 | `src/app/api/v1/chat/completions/route.ts:148` | `projectId: ... ?? ""` 空字符串写入 CallLog，破坏计费聚合 | Batch 02 HIGH-04 |
| H-16 | `Transaction.amount` | 无 CHECK 约束，类型与符号无强制 | Batch 05 H2 |
| H-17 | `EmailVerificationToken.userId` FK | 无 `onDelete`，阻止用户硬删除 | Batch 05 H4 |
| H-18 | `prisma/migrations/20260416_fix_template_step_order_v2/migration.sql` | `WHERE "order" >= 10000` 粗粒度修复，覆盖风险 | Batch 05 H5 |
| H-19 | `TemplateRating.score` | 无 range CHECK 约束 | Batch 05 H6 |
| H-20 | `notifications` 表 | 无 TTL，事件高频时无限堆积 | Batch 05 H7 |

### 并发/流式/资源泄漏（6 项）

| ID | 位置 | 问题 | 来源 |
|---|---|---|---|
| H-21 | `src/lib/engine/openai-compat.ts:218-262` | `fetchWithProxy` timeout 在 headers 到达即清除，流式超时失效 | Batch 02 HIGH-01 |
| H-22 | `src/app/api/v1/chat/completions/route.ts:359-379` | catch 中未 `reader.cancel()`，TCP 连接泄漏 | Batch 02 HIGH-02 |
| H-23 | `src/lib/notifications/dispatcher.ts:118-133` | webhook fetch 无 AbortController，协程泄漏 | Batch 04 HIGH-5 |
| H-24 | `src/lib/health/alert.ts:18-31` | 告警 webhook 调用无超时，阻塞健康检查循环 | Batch 04 MEDIUM-2 |
| H-25 | `src/lib/template/test-runner.ts:292-308` | `waitForCallLog` 失败静默返回，成本显示 $0 | Batch 04 HIGH-4 |
| H-26 | `src/lib/api/rate-limit.ts:183-199` | `rpmCheck` 先读后写 TOCTOU，多实例会超限 | Batch 02 MED-05 |

### SSRF / 输入验证（5 项）

| ID | 位置 | 问题 | 来源 |
|---|---|---|---|
| H-27 | `src/app/api/notifications/test-webhook/route.ts:37` + `dispatcher.ts:120` | 用户 webhookUrl 无 SSRF 过滤，可探测云元数据 | Batch 01 H6、Batch 06 H2 |
| H-28 | `src/app/api/v1/images/proxy/[traceId]/[idx]/route.ts:47` | Content-Type 透传，可代理非图片响应 | Batch 01 H3 |
| H-29 | `src/app/api/admin/providers/[id]/route.ts:154` | `baseUrl` 无协议/格式校验 | Batch 01 M5 |
| H-30 | `package.json` | Next.js HTTP 请求走私 / defu Prototype Pollution 等 8 高危 | Batch 06 H5 |
| H-31 | `src/lib/billing/scheduler.ts:72-119` | `checkBalanceAlerts` 无去重，每小时重复告警 | Batch 04 HIGH-1 |

### 前端架构（8 项）

| ID | 位置 | 问题 | 来源 |
|---|---|---|---|
| H-32 | `src/app/(console)/layout.tsx` 整个布局 `"use client"` | 无服务端鉴权守卫，闪现未授权内容 | Batch 07 HIGH-01 |
| H-33 | 9 个 console 页面用 `window.location.reload()` 作为回调 | 破坏 SPA，重置所有状态 | Batch 07 HIGH-02 |
| H-34 | `src/app/(console)/settings/page.tsx:190-199` | 同时存在 native `addEventListener` 和 `onClick`，点击触发两次 | Batch 07 HIGH-03 |
| H-35 | `src/app/(console)/keys/page.tsx:173` | 复制按钮复制的是脱敏 key，误导用户 | Batch 07 HIGH-04 |
| H-36 | `src/app/(console)/` 缺 `loading.tsx` | 无路由级 Suspense 边界 | Batch 07 HIGH-05 |
| H-37 | `src/components/notification-center.tsx:43-71` | `timeAgo()` 硬编码英文、汇率硬编码 `7.3` | Batch 07 HIGH-06 |
| H-38 | 数十个图标按钮无 `aria-label` | 屏幕阅读器不友好 | Batch 07 HIGH-07 |
| H-39 | `src/hooks/use-mobile.ts` | 缺 `"use client"` 指令，可能 SSR 崩溃 | Batch 08 H-01 |

### 脚本/测试（7 项）

| ID | 位置 | 问题 | 来源 |
|---|---|---|---|
| H-40 | `src/app/(console)/error.tsx` | 硬编码英文，非 i18n | Batch 07 CRITICAL-02（实为 i18n 严重性） |
| H-41 | `src/app/(console)/admin/models/page.tsx:65/70/282` | `"Free"` `"Degraded"` 硬编码 | Batch 07 HIGH-08 |
| H-42 | `scripts/e2e-errors.ts:39-69` | setup（register/login）失败无 fatal，后续步骤连锁假 FAIL | Batch 08 S-05 |
| H-43 | `scripts/stress-test.ts:340-341` | 报告路径硬编码 `2026-04-04`，每次覆盖 | Batch 08 S-06 |
| H-44 | `scripts/setup-zero-balance-test.ts:37-40` | `passwordHash: "dummy"`（非合法 bcrypt 格式） | Batch 08 S-07 |
| H-45 | `scripts/e2e-test.ts:171-176` | 测试直接调 webhook 无签名，教坏测试模式 | Batch 08 S-04 |
| H-46 | `src/lib/mcp/tools/run-template.ts:86-119` | `test_mode=execute` 跳过速率限制，可被利用 | Batch 03 MEDIUM |

---

## 观察到的系统性问题（模式层面）

### 1. 防御性设计缺失
- 多个 admin PATCH 路由直接 `data: body`（mass assignment），全项目至少 3 处（ProviderConfig、Channel、Model）。**建议引入统一的 zod schema 校验中间件，禁止直接透传 body**。

### 2. 异步扣费不原子
- `CallLog.create` + `deduct_balance` + `Transaction` 三步无统一事务保证，至少 2 处风险（`post-process.ts`、`payment.ts`）。**建议将 deduct_balance 函数重写为同时插入 CallLog + Transaction + 更新 balance 的原子 plpgsql**。

### 3. 多实例感知缺失
- scheduler、model-sync、rpmCheck、notifications 重复去重均假设单进程。**项目若未来水平扩容必须加 Redis 分布式锁/原子操作**。

### 4. 凭证管理
- 3 组硬编码密码 + 2 组硬编码 secret fallback + 测试脚本弱密码。**建议建立 env 白名单启动校验（类似 `src/lib/env.ts`），所有敏感 env 启动时 assert 存在**。

### 5. 超时/资源泄漏
- 至少 4 处 `fetch` 无 AbortController，全部在异步后台任务（健康告警、通知、Jina 抓取、webhook）。**建议封装 `fetchWithTimeout` 并强制所有外部调用使用**。

### 6. i18n 完整性
- 前端发现 10+ 处硬编码英文/数字（error boundary、权限 chip、通知文案、日期格式、日历 locale）。**建议启用 `next-intl` 的 lint 规则，或在 CI 中 grep 常见英文词块报错**。

### 7. Schema 约束缺失
- 多个金额/评分字段无 CHECK，多个外键无 index，JSON 字段无 schema 定义。**建议补齐 CHECK 约束和 DB 层守护，不依赖应用层**。

---

## 优先修复顺序（基于风险 × 修复成本）

### 🔥 P0（本周必修，阻塞生产）
1. **CRIT-5** 轮换生产 admin 密码 + 移除 seed/脚本硬编码 *(1h)*
2. **CRIT-1** 支付 webhook 验签（alipay + wechat） *(1-2d)*
3. **CRIT-6** 验证 `IMAGE_PROXY_SECRET` 生产已配置 + 移除 fallback *(30m)*
4. **CRIT-7** JWT 改 HttpOnly cookie（后端 Set-Cookie） *(半日)*
5. **CRIT-8** ProviderConfig/Channel/Model PATCH 字段白名单 *(半日)*

### 🟠 P1（2 周内）
6. **CRIT-2** `deduct_balance` 加 `SELECT FOR UPDATE` *(半日 + 测试)*
7. **CRIT-3** 支付回调改 `updateMany` CAS *(半日)*
8. **CRIT-4** CallLog + deduct 包 transaction *(1-2d)*
9. **CRIT-9** scheduler Redis 分布式锁 *(半日，或确认当前单副本部署)*
10. **CRIT-10** stress-test 改 spawn 数组形式 *(1h)*
11. **H-7** 登录/注册 IP 速率限制 *(半日)*
12. **H-8** 中间件 JWT 用 `jose` 验签 *(半日)*
13. **H-27** webhook URL SSRF 过滤 *(半日)*
14. **H-30** Next.js / defu 依赖升级 + 回归测试 *(1d)*

### 🟡 P2（本月内）
15. **H-1/H-2/H-4/H-5** 补索引 + 重写 reconcile *(2d)*
16. **H-21/H-22/H-23** 流式与 webhook 超时修复 *(1d)*
17. **H-15/H-16/H-17/H-20** DB 约束与 TTL *(1d)*
18. **CRIT-2 扩展：** `Transaction.amount` CHECK、`TemplateRating.score` CHECK *(半日)*

### 🟢 P3（下迭代）
- 其余 M 级、前端重构（`loading.tsx`、HttpOnly 切换后清理 localStorage 代码、error boundary i18n、9 处 `window.location.reload` 改造）
- 前端 accessibility 扫描补 `aria-label`
- 数据归档策略（call_logs 月度分区）

---

## 未完全覆盖的领域（建议补充审查）

1. **邮件发送路径** — 未见 `src/lib/email/*`，`verifyEmail` 流程是否真正发送邮件？
2. **CI/CD workflows** — `.github/workflows/*.yml` 本次未审，建议单独审计（secrets、权限、deploy 触发条件）
3. **国际化 RTL** — 本次仅检查 zh-CN/en，若未来支持阿语/希伯来，UI 方向性兼容未测
4. **依赖供应链** — `npm audit` 结果已在 H-30 中列出，但未做 SBOM + Snyk 等深度扫描
5. **生产环境 env 变量** — 本次是静态审查，未验证生产实际配置（`IMAGE_PROXY_SECRET`、`JWT_SECRET` 强度等）

---

## 附：详细报告索引

所有分批详细报告位于 `docs/code-review/`：

- [`batch-01-api-routes.md`](./batch-01-api-routes.md) — API 路由层（96 routes）
- [`batch-02-engine.md`](./batch-02-engine.md) — 引擎层 + API 适配（11 adapters / post-process / rate-limit）
- [`batch-03-mcp.md`](./batch-03-mcp.md) — MCP 层（25 tools / auth / server）
- [`batch-04-infra.md`](./batch-04-infra.md) — 基础设施（health / sync / cache / billing / notifications / templates）
- [`batch-05-database.md`](./batch-05-database.md) — 数据层（schema + 56 migrations）
- [`batch-06-security.md`](./batch-06-security.md) — 全栈安全专项（OWASP + 依赖漏洞）
- [`batch-07-frontend-pages.md`](./batch-07-frontend-pages.md) — 前端页面 + 组件（35 pages + 43 components）
- [`batch-08-hooks-scripts.md`](./batch-08-hooks-scripts.md) — React hooks + 运维脚本（5 hooks + 82 scripts）

---

**审查者：** Claude（Opus 4.7 主控 + Sonnet 4.6 × 8 子 agent 并行）
**审查耗时：** 约 28 分钟
**下一步建议：** 由 Planner 将 Critical/P0/P1 问题拆解为独立 BL-xxx 批次，逐条进入标准状态机流程修复。
