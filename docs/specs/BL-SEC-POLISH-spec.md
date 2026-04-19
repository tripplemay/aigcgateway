# BL-SEC-POLISH Spec

**批次：** BL-SEC-POLISH（合并批次，P2-polish 第 1 批）
**负责人：** Planner = Kimi / Generator = 默认映射 / Evaluator = Reviewer
**创建：** 2026-04-19
**工时：** 1.5 day
**源：** 合并原 BL-SEC-AUTH-HYGIENE（H-7/9/10）+ BL-SEC-SSRF-INPUT（H-27/28）+ BL-SCRIPT-HYGIENE（H-42-46）

## 背景

3 组安全加固杂项合并批次。scope 独立但主题同族，**文件域互不重叠**（auth / notifications+proxy / scripts），任一子任务失败不 block 另两组。同 Generator 上下文复用节省 2 次 plan/verify/deploy。

所有 file:line 已核实（2026-04-19）。

### 组 A — AUTH 细节硬化

**H-10：login 时序 oracle（`[已核实 login/route.ts:28-41]`）**

```ts
// src/app/api/auth/login/route.ts:28
const valid = await bcrypt.compare(password, user.passwordHash);   // ← 先 bcrypt
// ...
if (user.deletedAt) { ... }   // line 33  ← 后查状态
if (user.suspended) { ... }   // line 36
```

攻击者可通过响应时长差异（bcrypt ~200ms vs 直接拒绝 ~10ms）**推断用户是否存在且未删除**。应先查状态返回等价错误，再做 bcrypt。

**H-9：bcrypt cost 从 12 降级为 10（`[已核实 login/route.ts:43]`）**

```ts
// line 41-45
const currentRounds = bcrypt.getRounds(user.passwordHash);
if (currentRounds < 12) {
  const newHash = await bcrypt.hash(password, 10);  // ← 10 而非 12
  // rehash ...
}
```

bcrypt cost=10（2^10 iterations）降低暴力破解成本。应恢复到 12。

**H-7：login + register 无 rate limit（`[已核实 login/route.ts 全文无 checkRateLimit 引用]`）**

`/api/auth/login` + `/api/auth/register` 无 Redis IP / account 级速率限制 → 暴力破解 + 批量注册风险。

### 组 B — SSRF + Content-Type

**H-27：test-webhook SSRF（`[已核实 test-webhook/route.ts:37]`）**

```ts
// src/app/api/notifications/test-webhook/route.ts:37
const res = await fetch(pref.webhookUrl, {...});  // 无 SSRF 过滤
```

用户可配置 `webhookUrl: http://169.254.169.254/...`（云元数据） / `http://10.0.0.1/...`（内网）触发服务端代理请求，探测内部服务。dispatcher.ts 发 webhook 时同样问题（已通过 fetchWithTimeout 加了超时，但仍无 SSRF 过滤）。

**H-28：image-proxy Content-Type 透传（`[已核实 images/proxy/[traceId]/[idx]/route.ts:48-52]`）**

```ts
const contentType = upstreamRes.headers.get("content-type") ?? "application/octet-stream";
response.setHeader("Content-Type", contentType);
```

上游返回 `text/html` 或 `application/javascript` 时原样透传 → 用 image-proxy 代理非图片内容。应白名单 `image/*`，其余改 `application/octet-stream`。

### 组 C — 脚本硬化

**H-42：e2e-errors.ts setup 无 fatal（`[已核实 e2e-errors.ts:34]`）**

注释说 "Setup: register + login + create project + key (balance = 0)"，但 setup 步骤失败不 exit → 后续步骤连锁假 FAIL，Evaluator 难定位根因。

**H-43：stress-test.ts 报告路径硬编码（`[已核实 stress-test.ts:230, 352-353]`）**

```ts
// line 230 注释: "# 压力测试报告 — 2026-04-04"
// line 352: fs.writeFileSync("docs/test-reports/stress-test-2026-04-04.md", ...)
```

每次运行覆盖同一文件，无法对比历史。

**H-44：setup-zero-balance-test.ts bcrypt dummy（`[已核实 setup-zero-balance-test.ts:38]`）**

```ts
passwordHash: "dummy"  // Not used for API testing
```

非合法 bcrypt hash（应以 `$2a$` / `$2b$` 开头），可能破坏本地 schema CHECK 或 login 流程。

**H-45：e2e-test.ts webhook 无签名（`[已核实 e2e-test.ts 有 webhook fetch，行号待 Generator 核]`）**

E2E 脚本调 `/api/webhooks/alipay` 没有签名 header，一方面无法真正测签名流程，另一方面用现有脚本会训练出"webhook 可无签名"的错误印象（特别是未来 BL-SEC-PAY-DEFERRED 开始加签名后，测试脚本如不更新会失败）。

**H-46：run-template test_mode 跳速率限制（`[已核实 run-template.ts:86-119 vs :122 rate limit]`）**

```ts
// run-template.ts:86
if (test_mode) {
  // ... runTemplateTest + return
  return { content: [...] };  // ← 直接 return 跳过下方 rate limit
}

// line 122
const rateCheck = await checkRateLimit(...);  // test_mode=execute 永远到不了这里
```

`test_mode="execute"` 执行真实 AI 调用（有成本）但绕过 rate limit → 攻击者用测试模式调用 + 偷用户配额。

## 目标

1. 登录/注册防暴力破解 + 账号枚举 + 时序攻击
2. 外部 webhook 无法访问私网/元数据/HTTP
3. image-proxy 仅可代理图片，阻断代理任意内容
4. 脚本 fatal 检查 + 报告路径动态 + 合法 bcrypt + webhook 签名 + test_mode rate limit

## 改动范围

### F-SP-01：AUTH 硬化（rate limit + bcrypt 12 + 顺序修正）

**文件：** `src/app/api/auth/login/route.ts` + `src/app/api/auth/register/route.ts`

**改动：**

1. **login 顺序修正（H-10）：**
   ```ts
   // 先查用户状态
   const user = await prisma.user.findUnique({...});
   if (!user || user.deletedAt || user.suspended) {
     // 统一错误 + 固定延迟防时序 oracle
     await new Promise(r => setTimeout(r, 100));  // 或做 dummy bcrypt.compare
     return errorResponse(401, "invalid_credentials", "Email or password incorrect");
   }
   // 再 bcrypt
   const valid = await bcrypt.compare(password, user.passwordHash);
   if (!valid) return errorResponse(401, "invalid_credentials", "Email or password incorrect");
   ```
   
   注：账号 suspended 原本返回 403 + "account_suspended" — 为防账号枚举，改 suspended 也返 401 + 通用消息（但日志内部记录真实状态供审计）；或保留 403 但先 bcrypt.compare 校验后再查 suspended（用户密码对才知道状态）。**推荐方案：先查+dummy bcrypt + 401 统一**。

2. **bcrypt cost 恢复 12（H-9）：**
   - `bcrypt.hash(password, 10)` → `bcrypt.hash(password, 12)`
   - catch 若有静默忽略改抛出 + 日志（原代码 `try/catch` 若存在）

3. **rate limit（H-7）：**
   - 新增 `src/lib/api/auth-rate-limit.ts`：两级 IP+account
   - IP 级：10 req/min（login/register 合计）
   - account 级：5 req/min per email（login），register 用 email 前缀 5 req/hour
   - 复用 `rate-limit.ts` 的 Redis Lua 模式（BL-INFRA-RESILIENCE F-IR-02 产物）
   - 触发限流 → 429 "too_many_requests"

4. **register 同步加 rate limit**（复用 helper）

**单测：** auth-rate-limit 并发 + bcrypt cost 12 生效 + 时序测试（dummy bcrypt vs 真 bcrypt 时长差 < 20ms）

### F-SP-02：SSRF + Content-Type

**文件：** 新建 `src/lib/infra/url-safety.ts` + 改 `src/app/api/notifications/test-webhook/route.ts` + `src/lib/notifications/dispatcher.ts` + `src/app/api/v1/images/proxy/[traceId]/[idx]/route.ts`

**url-safety helper：**

```ts
// src/lib/infra/url-safety.ts
export async function isSafeWebhookUrl(urlStr: string): Promise<boolean> {
  try {
    const url = new URL(urlStr);
    if (url.protocol !== "https:") return false;  // 仅 https
    // DNS 解析
    const dns = await import("node:dns").then(m => m.promises);
    const addresses = await dns.resolve4(url.hostname).catch(() => [] as string[]);
    for (const ip of addresses) {
      if (isPrivateIp(ip)) return false;  // 私网 / loopback / link-local / 云元数据
    }
    return true;
  } catch { return false; }
}

function isPrivateIp(ip: string): boolean {
  // 10.0.0.0/8, 172.16.0.0/12, 192.168.0.0/16, 127.0.0.0/8, 169.254.0.0/16, 100.64.0.0/10
  // + ::1, fc00::/7 (IPv6 ULA)
}
```

**test-webhook route 应用：**

```ts
if (!await isSafeWebhookUrl(pref.webhookUrl)) {
  return errorResponse(400, "invalid_webhook_url", "Webhook URL must be https and not point to a private/metadata address");
}
```

**dispatcher.ts 应用：** 发送前同样校验。

**image-proxy Content-Type 白名单：**

```ts
// route.ts:48-52
const upstreamCt = upstreamRes.headers.get("content-type") ?? "";
const isImage = /^image\/(jpeg|png|webp|gif|svg\+xml)$/.test(upstreamCt);
const safeCt = isImage ? upstreamCt : "application/octet-stream";
response.setHeader("Content-Type", safeCt);
```

**单测：** isSafeWebhookUrl 各类输入（https pass / http reject / 10.x reject / 169.254 reject / 127.0.0.1 reject）；image-proxy 非图片 CT → octet-stream。

### F-SP-03：脚本硬化 5 项

**文件：** `scripts/e2e-errors.ts` + `scripts/stress-test.ts` + `scripts/setup-zero-balance-test.ts` + `scripts/e2e-test.ts` + `src/lib/mcp/tools/run-template.ts`

**H-42 e2e-errors setup fatal：**
```ts
async function setup() {
  try { await register(); await login(); ... }
  catch (err) {
    console.error("[SETUP FAILED]", err);
    process.exit(1);  // 不跑后续
  }
}
```

**H-43 stress-test 报告路径动态：**
```ts
const dateStr = new Date().toISOString().slice(0, 10);  // 2026-04-19
const reportPath = `docs/test-reports/stress-test-${dateStr}.md`;
fs.writeFileSync(reportPath, report);
```

**H-44 setup-zero-balance bcrypt：**
```ts
import bcrypt from "bcryptjs";
passwordHash: bcrypt.hashSync(crypto.randomBytes(16).toString("hex"), 10),  // 合法格式
```

**H-45 e2e-test webhook 签名：**
- 若 BL-SEC-PAY-DEFERRED 尚未实施，保持现有调用但加注释 "TODO: 支付接入后加签名"
- 若已有签名 helper，调用正确签名方法

（当前 BL-SEC-PAY-DEFERRED 延后，本批次只加 TODO 注释。）

**H-46 run-template test_mode rate limit：**
```ts
// run-template.ts line 86 前增加 rate limit 检查
async ({ template_id, variables = {}, test_mode }) => {
  // ...
  
  // Rate limit 提前到 test_mode 分支之前（所有调用都限流）
  const project = await prisma.project.findUnique({ where: { id: projectId } });
  const projectForLimits = project ?? { id: projectId, rateLimit: null };
  const rateCheck = await checkRateLimit(projectForLimits, "text", keyRateLimit, { apiKeyId, userId });
  if (!rateCheck.ok) {
    return errorResponse(429, ...);
  }
  
  if (test_mode) {
    // ... existing
  }
  // ...
}
```

保留 test_mode 的成本不扣费特性（走 dry_run 或 runTemplateTest 内部不扣），但速率限制一视同仁。

**单测：** stress-test 报告路径含当日日期；setup-zero-balance bcrypt format 合法；test_mode + 过限 → 429。

### F-SP-04：全量验收（Evaluator）

**AUTH（6 项）：**
1. login 不存在用户 + 错密码 → 响应时长 < 50ms（不做 bcrypt）
2. login 存在用户 + 错密码 → 响应时长 > 150ms（做 bcrypt cost=12）
3. login 正确凭证 + 首次登录（存量 cost=10） → rehash 为 cost=12（数据库验证）
4. login 同 IP 11 req/min → 第 11 req 返 429
5. login 同 email 6 req/min → 第 6 req 返 429
6. register 同 IP 11 req/min → 429（IP 级）

**SSRF / Content-Type（4 项）：**
7. test-webhook 配置 `http://example.com` → 400（非 https）
8. test-webhook 配置 `https://169.254.169.254/...` → 400（云元数据拒绝）
9. test-webhook 配置 `https://10.0.0.1/...` → 400（私网拒绝）
10. image-proxy 上游返 `text/html` → 本地响应 Content-Type=`application/octet-stream`

**脚本（4 项）：**
11. e2e-errors setup 失败 → process.exit(1) + 明确错误
12. stress-test 报告生成在 `stress-test-{YYYY-MM-DD}.md`（当日日期）
13. setup-zero-balance 生成的 user.passwordHash 匹配 `^\$2[aby]\$` bcrypt 格式
14. run-template test_mode=execute 超过 rate limit → 429

**构建（3 项）：**
15. npm run build 通过
16. npx tsc --noEmit 通过
17. npx vitest run 全过

18. 生成 signoff 报告。

## 非目标

- 不实现支付 webhook 验签（留 BL-SEC-PAY-DEFERRED）
- 不做 CAPTCHA（rate limit 够用）
- 不做 2FA / SSO（独立批次）
- 不全量清理 bcrypt cost<12 的存量密码（lazy rehash 已在 login 路径）
- 不改 e2e-test.ts 真正的 webhook 签名（PAY-DEFERRED 后做）

## Risks

| 风险 | 缓解 |
|---|---|
| rate limit 误伤合法用户 | 阈值保守（IP 10/min, account 5/min），超过返明确 429 引导等待 |
| bcrypt cost 12 首次登录慢 | 仅首次 rehash，后续正常；用户侧可接受（< 500ms） |
| SSRF 白名单过严伤合法 webhook | DNS 私网检测针对 RFC1918 + 169.254 + 127.0.0.0/8，合法公网域名不受影响 |
| image-proxy 上游返回 `image/avif` 等未列出类型 | 正则白名单 `image/(jpeg|png|webp|gif|svg\+xml|avif|heic)` 宽容覆盖常见格式 |
| run-template test_mode 加限流后测试难 | test_mode 走正常限流（合理）；单独测试场景需用 dry_run 不扣费也不计速率 |

## 部署

- 纯代码改动
- 部署：git pull + npm ci + npm run build + pm2 restart
- 回滚：revert commit

## 验收标准

- [ ] F-SP-04 的 18 项全 PASS
- [ ] build + tsc + vitest 全过
- [ ] signoff 报告归档
