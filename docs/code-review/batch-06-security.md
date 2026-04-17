# Batch 06: 全栈安全审计

审计日期: 2026-04-17
审计范围: `src/` + `prisma/` + `scripts/`
审计员: Security Reviewer (Claude Sonnet 4.6)

---

## Critical

### [C1] 支付宝 / 微信 Webhook 签名验证缺失（CWE-345）

- 文件: `src/app/api/webhooks/alipay/route.ts:L30-L32` / `src/app/api/webhooks/wechat/route.ts:L31-L34`
- 证据:
  ```ts
  // TODO: P2 实现 RSA2 签名验证
  // const signValid = verifyAlipaySign(body);
  // if (!signValid) return new NextResponse("fail", { status: 400 });
  ```
  微信端同样注释掉签名+解密，并明确标注 `P1: 假设 ciphertext 是明文 JSON（仅开发环境）`。
- 攻击场景: 攻击者直接 POST 伪造的回调通知，携带任意 `out_trade_no` 和 `trade_status=TRADE_SUCCESS`，即可触发 `processPaymentCallback`，将订单标记为 COMPLETED 并给任意用户充值余额，无需支付任何金额。
- 影响: 直接资金损失；平台余额可被任意人以零成本刷取，导致业务破产级别的财务风险。
- 修复建议:
  1. 支付宝：使用官方 SDK 的 `AlipaySignature.rsaCheckV1/V2` 校验 RSA2 签名，完整参数集合必须逐字段拼接后再验签。
  2. 微信：实现 `WECHATPAY2-SHA256-RSA2048` 请求头验签 + AES-256-GCM 解密 `resource.ciphertext`，使用 `@notchpay/wechatpay` 或官方参考实现。
  3. 两者均需在验签失败时立即返回 400/fail，不进行任何业务处理。

---

### [C2] seed 脚本硬编码 admin 密码（CWE-798）

- 文件: `prisma/seed.ts:L284`
- 证据:
  ```ts
  const adminPasswordHash = hashSync("admin123", 12);
  // email: "admin@aigc-gateway.local"
  ```
- 攻击场景: 任何获得代码库访问权限的人（包括通过 git history、公开仓库、内部泄漏）都能立即得知管理员账号的明文密码，直接登录管理后台，获取全部用户数据、API Key、计费系统控制权。
- 影响: 完整管理员权限泄漏，可导致全量用户数据泄漏、任意余额篡改、服务商 API Key 泄漏。
- 修复建议:
  1. 移除 seed 中的固定密码，改为从环境变量读取：`process.env.ADMIN_SEED_PASSWORD`。
  2. 在 `.env.example` 中说明此变量为必填，且要求 ≥16 位随机字符串。
  3. 立即轮换生产环境的 `admin@aigc-gateway.local` 密码。

---

### [C3] 压测脚本硬编码 admin 密码（CWE-798）

- 文件: `scripts/admin-auth.ts:L27` / `scripts/stress-test.ts:L13`
- 证据:
  ```ts
  const ADMIN_PASSWORD = "Codex@2026!";
  const ADMIN_EMAIL = "codex-admin@aigc-gateway.local";
  ```
  同样出现在: `scripts/test/bf-fork-project-switch-verifying-e2e-2026-04-10.ts:L49-L50`、`scripts/test/rate-limit-f-rl-08-verifying-e2e-2026-04-15.ts:L131-L132` 等 10+ 个文件。
- 攻击场景: 与 C2 相同，这些脚本通常由 CI/CD 执行，代码库中的密码明文可被任何有代码读取权限的成员使用。
- 影响: 管理员账号凭据泄漏，同 C2。
- 修复建议: 所有脚本中的密码改为 `process.env.ADMIN_PASSWORD ?? (() => { throw new Error("ADMIN_PASSWORD not set") })()`，禁止有任何硬编码 fallback 值。

---

### [C4] 图片代理 HMAC Secret 存在硬编码 Fallback（CWE-798）

- 文件: `src/lib/api/image-proxy.ts:L13-L19`
- 证据:
  ```ts
  function getSecret(): string {
    return (
      process.env.IMAGE_PROXY_SECRET ??
      process.env.AUTH_SECRET ??
      process.env.NEXTAUTH_SECRET ??
      "aigc-gateway-image-proxy-dev-secret"   // ← 硬编码 fallback
    );
  }
  ```
- 攻击场景: 若生产环境未配置任何上述环境变量，HMAC secret 将使用众所周知的固定字符串。攻击者可用此 secret 为任意 `traceId/idx` 伪造合法签名，然后调用 `/v1/images/proxy/:traceId/:idx` 访问任何用户的图片原始 URL（含其他用户生成的内容）。
- 影响: 越权访问所有图片结果，绕过 HMAC 签名保护，用户隐私泄漏。
- 修复建议:
  1. 移除字符串 fallback，改为：若所有变量均未设置则抛出启动错误。
  2. 在 `src/lib/env.ts` 中将 `IMAGE_PROXY_SECRET` 加为必填字段（或复用 `ENCRYPTION_KEY`）。

---

## High

### [H1] 登录端点无速率限制（CWE-307）

- 文件: `src/app/api/auth/login/route.ts` / `src/app/api/auth/register/route.ts`
- 证据: 两个文件均不调用 `checkRateLimit`，也不使用任何 IP 级限流机制；对比 `/v1/chat/completions` 的多维度限流，登录端点完全无保护。
- 攻击场景: 攻击者对已知邮箱地址执行密码爆破，bcrypt cost=10 在现代 GPU 下仍可遍历常见弱密码字典；`/api/auth/register` 无限制注册可用于垃圾账号创建和 Welcome Bonus 刷取（如启用）。
- 影响: 账号被暴力破解；滥用注册奖励（经济损失）；账号枚举（计时侧信道）。
- 修复建议:
  1. 在登录端点加入基于 Redis 的 IP 级滑动窗口限流（建议 5 次/分钟/IP）。
  2. 连续失败 5 次后引入指数级延迟或临时锁定（15 分钟）。
  3. 注册端点同样需要 IP 级速率限制（建议 3 次/小时/IP）。

---

### [H2] Webhook URL 无 SSRF 防护（CWE-918）

- 文件: `src/lib/notifications/dispatcher.ts:L120` / `src/app/api/notifications/test-webhook/route.ts:L37`
- 证据:
  ```ts
  const res = await deps.fetchImpl(job.url, { ... });  // job.url = 用户输入的 webhookUrl
  ```
  `preferences/route.ts` 仅做 `z.string().url()` 校验（验证 URL 格式合法），不过滤内网地址。
- 攻击场景: 用户设置 `webhookUrl = "http://169.254.169.254/latest/meta-data/iam/security-credentials/"` （AWS 元数据服务）或 `http://localhost:3306`（内网数据库探测），服务器会自动 POST 请求到该地址，攻击者从响应中提取内部服务凭据或探测内网拓扑。
- 影响: 云环境实例凭据泄漏（潜在 AWS/GCP IAM 权限提升）；内网服务探测；内部 API 滥用。
- 修复建议:
  1. 在 `dispatchWebhook` 执行前（或在 preferences 保存时）校验 URL：拒绝私有 IP 段（10.x、172.16-31.x、192.168.x、127.x、169.254.x、::1）。
  2. 推荐使用 `ssrf-req-filter` 或自行实现 DNS 解析后二次校验。

---

### [H3] Admin ProviderConfig PATCH 无字段白名单（CWE-915 Mass Assignment）

- 文件: `src/app/api/admin/providers/[id]/config/route.ts:L28-L35`
- 证据:
  ```ts
  const body = await request.json();
  const config = await prisma.providerConfig.upsert({
    update: body,          // 整个 body 直接传入 Prisma
    create: { providerId: params.id, ...body },
  });
  ```
- 攻击场景: 恶意或被攻击的 Admin 账户可以通过 PATCH 请求向 `ProviderConfig` 写入任意字段，包括 Prisma 内部字段（如 `id`、`createdAt`）或应用层未预期的字段，导致数据库状态损坏；更严重的是，若 Prisma 版本存在 nested write 漏洞，可能影响关联模型。
- 影响: 数据完整性破坏；潜在逻辑漏洞利用。
- 修复建议: 明确列出允许更新的字段，例如：
  ```ts
  const { chatEndpoint, imageEndpoint, quirks, currency, ...rest } = body;
  // Only allow known safe fields
  const allowedUpdate = { chatEndpoint, imageEndpoint, quirks, currency };
  ```

---

### [H4] Admin Model POST 无字段白名单（CWE-915 Mass Assignment）

- 文件: `src/app/api/admin/models/route.ts:L90-L96`
- 证据:
  ```ts
  const body = await request.json();
  if (!body.name || !body.displayName || !body.modality) { ... }
  const model = await prisma.model.create({ data: body });
  ```
- 攻击场景: 攻击者（或被攻陷的 Admin 账号）可将系统级字段（`id`、`enabled: false` 批量禁用模型、`createdAt` 等）或未知字段写入数据库，破坏路由逻辑。
- 影响: 数据完整性破坏；路由异常（模型被批量禁用）。
- 修复建议: 解构并只接受预期字段：`name`、`displayName`、`modality`、`contextWindow`、`maxTokens`、`capabilities`、`supportedSizes`。

---

### [H5] 依赖漏洞：Next.js DoS / HTTP 请求走私（CVE）

- 文件: `package.json`（Next.js 版本落后）
- 证据: `npm audit` 报告：
  - `next 9.5.0 - 15.5.14`：HTTP 请求走私（GHSA-ggv3-7p47-pfv8）、Server Components DoS（GHSA-q4gf-8mx6-v5v3、GHSA-h25m-26qc-wcjf）
  - `defu ≤6.1.4`：Prototype Pollution（GHSA-737v-mqg7-c878）
  - `glob 10.2.0 - 10.4.5`：CLI 命令注入（GHSA-5j98-mcp5-4vw2）
  共计 8 High + 3 Moderate。
- 攻击场景: HTTP 请求走私可能绕过前端代理的安全规则、导致请求污染；Prototype Pollution 可能篡改 `Object.prototype` 影响全局行为。
- 影响: DoS、认证绕过（请求走私场景）、服务中断。
- 修复建议: 优先更新 Next.js（`npm audit fix --force` 后需测试兼容性），升级 `defu` 到 `>6.1.4`。

---

### [H6] 压测脚本命令注入风险（CWE-78）

- 文件: `scripts/stress-test.ts:L35-L40`
- 证据:
  ```ts
  const headerFlags = Object.entries(opts.headers ?? {})
    .map(([k, v]) => `-H '${k}=${v}'`)   // 字符串拼接
    .join(" ");
  const cmd = `npx autocannon -c ${opts.connections} ... ${headerFlags} '${opts.url}'`;
  const raw = execSync(cmd, ...);   // 传入 shell
  ```
- 攻击场景: 若 `opts.headers` 的键/值或 `opts.url` 来自外部输入（如 CI 参数），注入 shell metacharacter（`'$(id)'`、`; rm -rf /`）即可在运行脚本的机器上执行任意命令。
- 影响: 脚本执行环境下的 RCE（CI 服务器、开发机）。
- 修复建议: 改用 `spawn("npx", ["autocannon", ...args])` 数组形式，杜绝 shell 解析；当前 `spawnAutocannon` 函数已是安全写法，应移除 `runAutocannon` 中的 `execSync` 版本。

---

## Medium

### [M1] JWT Cookie 缺少 Secure 和 HttpOnly 标志（CWE-614）

- 文件: `src/app/(auth)/login/page.tsx:L131`
- 证据:
  ```ts
  document.cookie = `token=${data.token}; path=/; max-age=${7 * 24 * 3600}; SameSite=Lax`;
  ```
  缺少 `Secure`（允许 HTTP 传输）和 `HttpOnly`（JavaScript 可读取 cookie，XSS 可盗取）。同时 token 也写入了 `localStorage`（`L130`），同样可被 XSS 盗取。
- 影响: XSS 攻击可盗取 JWT session token，实现会话劫持。
- 修复建议:
  1. Cookie 添加 `; Secure; HttpOnly`（HttpOnly 可防 JS 读取，但需将 middleware 读取方式从 `cookies()` 读取，而非 JS 传递——当前 middleware 已支持从 cookie 读取 JWT）。
  2. 不在 `localStorage` 中存储 JWT；仅使用 HttpOnly Cookie 做持久化。

---

### [M2] 无全局 HTTP 安全响应头（CWE-693）

- 文件: `next.config.js`（缺失 `headers()` 配置）
- 证据: `next.config.js` 仅配置了 `output: "standalone"`，全文未见 `Content-Security-Policy`、`X-Frame-Options`、`X-Content-Type-Options`、`Strict-Transport-Security`、`Referrer-Policy` 等响应头。
- 影响: XSS 攻击面扩大（无 CSP）；Clickjacking（无 X-Frame-Options）；MIME Sniffing（无 X-Content-Type-Options）；降级攻击（无 HSTS）。
- 修复建议: 在 `next.config.js` 中添加：
  ```js
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains' },
        { key: 'Content-Security-Policy', value: "default-src 'self'; ..." },
      ],
    }];
  }
  ```

---

### [M3] 中间件 JWT 验证仅解码不验签（CWE-347）

- 文件: `src/middleware.ts:L5-L13`
- 证据:
  ```ts
  function decodeJwtPayload(token: string): ... {
    const payload = JSON.parse(atob(parts[1] ...));   // 仅 base64 解码
    return payload;   // 未做签名验证
  }
  ```
- 攻击场景: 攻击者构造一个 `{"userId":"admin-uuid","role":"ADMIN","exp":9999999999}` 的 payload，用任意 base64 编码拼上两个假段（`fake.eyJ1c2VySWQi...eyJleHAi.fake`），即可绕过中间件的路由保护，访问 `/admin/*`。实际 API handler 调用 `verifyJwt`（使用 `jsonwebtoken.verify` 做真正签名验证），但**前端路由层**（中间件）的保护被绕过，攻击者可访问所有被 middleware matcher 保护的页面。
- 影响: 中间件级别的 ADMIN 路由保护被绕过（注意：API 层仍有 `requireAdmin` 保护，但前端页面完全可见）；结合页面中可能暴露的敏感信息，存在信息泄漏风险。
- 修复建议: Edge Runtime 下可使用 `jose` 库做完整 JWT 验证：
  ```ts
  import { jwtVerify } from 'jose';
  const secret = new TextEncoder().encode(process.env.JWT_SECRET);
  const { payload } = await jwtVerify(token, secret);
  ```

---

### [M4] 用户自定义 Webhook URL 未限制内网访问（SSRF，同 H2）

已在 H2 中覆盖。

---

### [M5] 注册响应泄漏 emailVerificationToken（CWE-200）

- 文件: `src/app/api/auth/register/route.ts:L120-L131`
- 证据:
  ```ts
  return NextResponse.json({
    id: user.id,
    email: user.email,
    name: user.name,
    emailVerified: user.emailVerified,
    defaultProjectId: user.defaultProjectId,
    verificationToken,   // ← 明文 token 返回给客户端
  }, { status: 201 });
  ```
- 攻击场景: 若攻击者控制注册请求的客户端（或 MitM），可截获 `verificationToken`，立即验证他人注册的邮箱（若邮件验证是安全控制措施）。
- 影响: 邮箱验证机制被绕过，欺诈账号可立即获得已验证状态。
- 修复建议: 注册响应不应返回 `verificationToken`；token 仅通过邮件发送。响应仅返回 `{ id, email, emailVerified: false }`。

---

### [M6] bcrypt Cost Factor 为 10，低于推荐值（CWE-916）

- 文件: `src/app/api/auth/register/route.ts:L55` / `src/app/api/auth/login/route.ts:L39-L43`
- 证据:
  ```ts
  const passwordHash = await bcrypt.hash(password, 10);
  // login.ts 中还主动把 cost=12 降级为 cost=10
  if (currentRounds !== 10) {
    const newHash = await bcrypt.hash(password, 10);
  }
  ```
- 影响: OWASP 推荐 bcrypt cost ≥12（2023 年基准为 14）。Cost=10 在现代硬件约 100ms/hash；相比 cost=12（400ms）降低了约 4 倍暴力破解成本。
- 修复建议: 将 cost factor 设为 12（生产环境可通过配置调整），移除降级逻辑（保留升级逻辑：旧 cost → 新 cost）。

---

### [M7] 管理员 Admin Channel PATCH 无字段白名单（CWE-915）

- 文件: `src/app/api/admin/channels/[id]/route.ts:L14`
- 证据:
  ```ts
  const channel = await prisma.channel.update({ where: { id: params.id }, data: body });
  ```
- 影响: 同 H3/H4，整个 request body 直接传入 Prisma，可能写入任意字段。
- 修复建议: 明确白名单字段：`status`、`priority`、`costPrice`、`sellPrice` 等。

---

## Low

### [L1] `$queryRawUnsafe` 字符串拼接 SQL（CWE-89）

- 文件: `src/app/api/admin/sync-status/route.ts:L50-L56`
- 证据:
  ```ts
  const zeroPriceCount = await prisma.$queryRawUnsafe<[{ cnt: number }]>(
    `SELECT count(*)::int as cnt FROM channels WHERE status = 'ACTIVE' AND ...`
  );
  ```
- 分析: 当前此查询无用户输入插值，风险较低；但使用了 `$queryRawUnsafe` API，未来若有人在此处添加过滤条件而不注意参数化，将引入 SQL 注入。
- 修复建议: 改用 `$queryRaw` 模板字面量（Prisma 自动参数化）；如无需动态条件，直接使用 Prisma ORM 查询。

---

### [L2] 用户提示词（promptSnapshot）完整存入数据库（隐私风险）

- 文件: `src/lib/api/post-process.ts:L127-L134`
- 证据:
  ```ts
  promptSnapshot: params.promptSnapshot as unknown as object,  // 全量 messages
  ```
- 影响: 所有用户的完整对话消息（含 system prompt、历史上下文）写入 `call_logs` 表，可能包含 PII（个人信息）、密钥、商业机密；若数据库被访问，隐私风险高。
- 修复建议: 考虑对 `promptSnapshot` 做摘要存储（仅保留前 200 字符预览）或提供 `DISABLE_PROMPT_LOGGING` 环境变量开关。

---

### [L3] IP 白名单可被 `X-Forwarded-For` 伪造（CWE-290）

- 文件: `src/lib/api/ip-utils.ts:L32-L43`
- 证据:
  ```ts
  const xff = request.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  ```
- 影响: 若服务未部署在受信任的反向代理之后（或反向代理未剥离客户端的 XFF 头），攻击者可伪造 `X-Forwarded-For: 127.0.0.1` 绕过 IP 白名单。
- 修复建议: 仅信任来自已知代理 IP 的 `X-Forwarded-For`；或使用 Cloudflare 的 `CF-Connecting-IP` 等不可伪造来源；在文档中明确说明需在 Nginx/LB 层配置 `set_real_ip_from`。

---

### [L4] NEXT_PUBLIC_ 变量泄漏内部 URL（信息泄漏）

- 文件: `src/lib/mcp/tools/list-templates.ts:L63` / `src/lib/mcp/tools/manage-projects.ts:L80` / `src/lib/mcp/tools/generate-image.ts:L260`
- 证据:
  ```ts
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL || "https://aigc.guangai.ai";
  ```
- 分析: `NEXT_PUBLIC_` 前缀会将变量内联进 client-side bundle，暴露给浏览器。这些文件在 MCP Server（服务端）使用，但若 `NEXT_PUBLIC_BASE_URL` 包含内网地址，将会泄漏给客户端。
- 修复建议: MCP Server 侧使用无 `NEXT_PUBLIC_` 前缀的服务端专用变量（如 `INTERNAL_GATEWAY_ORIGIN`）。

---

### [L5] 测试/E2E 脚本硬编码明文密码（整体问题）

- 文件: `scripts/e2e-errors.ts`、`scripts/test/` 下多个文件
- 证据: `"password": "Test1234"` 在 E2E 脚本中硬编码作为测试用户密码。
- 影响: 若测试账号在共享/生产环境中存在，密码已公开。
- 修复建议: E2E 测试密码通过环境变量注入（`process.env.E2E_TEST_PASSWORD`）；测试账号在隔离环境中使用，不在生产库中创建。

---

## Info

### [I1] API Key 使用 SHA-256 哈希存储（可接受）

- 文件: `src/lib/api/auth-middleware.ts:L75`
- 分析: API Key 使用 SHA-256 哈希存储，无法从数据库反推原始 key，是合理的存储方式。无需改为 bcrypt（SHA-256 对于高熵随机 key 是足够的）。

---

### [I2] $queryRaw 模板字面量参数化（安全，已正确使用）

- 文件: `src/app/api/admin/logs/search/route.ts`、`src/app/api/projects/[id]/logs/search/route.ts`
- 分析: 这些文件使用 Prisma 的 `$queryRaw` 模板字面量（`` $queryRaw`...${likePattern}...` ``），Prisma 自动将插值参数化，**不存在 SQL 注入**。

---

### [I3] 图片代理 HMAC 签名机制设计合理

- 文件: `src/lib/api/image-proxy.ts` / `src/app/api/v1/images/proxy/[traceId]/[idx]/route.ts`
- 分析: 使用 HMAC-SHA256 + 过期时间防止 URL 枚举和延迟访问，设计正确。唯一问题是 fallback secret（见 C4）。

---

## 严重度汇总

| 严重度    | 数量 |
|-----------|------|
| Critical  | 4    |
| High      | 6    |
| Medium    | 6    |
| Low       | 5    |
| Info      | 3    |
| **Total** | **24** |

---

## 优先修复顺序

1. **C1** — Webhook 签名验证缺失（直接资金损失风险，需立即修复）
2. **C2/C3** — 硬编码 admin 密码（需立即轮换生产密码 + 修复代码）
3. **C4** — 图片代理 HMAC fallback secret（需立即验证生产环境是否配置了对应 env var）
4. **H1** — 登录端点无速率限制（暴力破解风险）
5. **H2** — Webhook SSRF（SSRF 攻击面）
6. **H5** — 依赖更新（Next.js DoS 漏洞）
7. **M3** — 中间件 JWT 不验签（前端路由保护被绕过）
8. 其余 High/Medium 按优先级排序处理
