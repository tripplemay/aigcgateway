# Batch 01: API 路由层审查

审查日期：2026-04-17
审查范围：`src/app/api/**/route.ts`（96 个文件）
审查人：Claude Sonnet 4.6（code-reviewer agent）

---

## Critical

### [C1] 支付 Webhook 未验签——任意请求可触发余额充值

- **文件：** `src/app/api/webhooks/alipay/route.ts:32` / `src/app/api/webhooks/wechat/route.ts:31`
- **证据：**
  ```ts
  // alipay/route.ts L32
  // TODO: P2 实现 RSA2 签名验证
  // const signValid = verifyAlipaySign(body);
  // if (!signValid) return new NextResponse("fail", { status: 400 });
  ```
  ```ts
  // wechat/route.ts L31
  // TODO: P2 实现 WECHATPAY2-SHA256-RSA2048 签名验证 + AES-256-GCM 解密
  ```
  两个 webhook 均注释掉了签名验证，接受任意 POST 请求触发 `processPaymentCallback`。
  微信 webhook 进一步将 `ciphertext` 直接按明文 JSON 解析（L44），攻击者可以不解密就构造通知。
- **影响：** 攻击者发送一个伪造的回调（`out_trade_no` + `trade_status=TRADE_SUCCESS`）即可向任意用户充值，导致系统记账错乱；或者反过来用 `TRADE_CLOSED` 触发 `markOrderFailed` 使正常订单失败。资金损失风险极高。
- **建议：** 立即实现 RSA2/SHA256 验签，在验签通过前拒绝所有 webhook 请求。支付宝使用 `alipay-sdk` 验签，微信使用 `Wechatpay-Node-V3` 或官方推荐库完成 AEAD-AES-256-GCM 解密。

---

### [C2] ProviderConfig PATCH 接受未经过滤的 body——API Key 可被任意覆盖

- **文件：** `src/app/api/admin/providers/[id]/config/route.ts:30` （同一代码存在于三处，另见 `src/app/api/admin/providers/[id]/route.ts` 同路径下的 config 子路由）
- **证据：**
  ```ts
  // PATCH /api/admin/providers/:id/config
  const body = await request.json();
  const config = await prisma.providerConfig.upsert({
    where: { providerId: params.id },
    update: body,         // ← 直接将 body 传入 update
    create: { providerId: params.id, ...body },
  });
  ```
- **影响：** 管理员账户一旦被接管（或内部人员操作），可以向 ProviderConfig 写入任意字段，包括内部记录字段（如 `createdAt`、`id`）；更重要的是，`apiKey` 存储在 ProviderConfig 中，攻击者可以将任何服务商的 API Key 替换为自己控制的值，从而将所有流量代理到受控端点（SSRF / Key 劫持）。
- **建议：** 在 PATCH 中建立字段白名单，只允许更新预定义字段（如 `apiKey`、`baseUrl`、`rateLimit` 等），而不是 `update: body`。

---

## High

### [H1] Channel PATCH 无字段白名单——可改写 costPrice 等敏感字段

- **文件：** `src/app/api/admin/channels/[id]/route.ts:11`
- **证据：**
  ```ts
  const body = await request.json();
  delete body.sellPrice;  // 仅删除 sellPrice
  const channel = await prisma.channel.update({ where: { id: params.id }, data: body });
  ```
  只过滤了 `sellPrice`，`costPrice`、`status`、`providerId`、`modelId`、`realModelId`、`priority` 均可被覆盖。
- **影响：** 管理员可将 `costPrice` 设为 0，导致所有调用的成本计算为 0，掩盖实际成本；`status` 可绕过健康检查强制切换；`realModelId` 可将渠道重定向到其他模型。
- **建议：** 仅允许更新 `priority`、`status`、`costPrice`、`realModelId` 等明确可编辑字段，丢弃其余。

### [H2] 注册接口无速率限制——可被枚举/批量注册

- **文件：** `src/app/api/auth/register/route.ts:30`
- **证据：** POST `/api/auth/register` 无任何速率限制。`checkRateLimit` 仅在 `api/v1/*` 路由中使用，注册/登录接口没有。
- **影响：** 攻击者可以无限速地批量注册账号（每个账号获得欢迎余额 bonus），或对已知邮箱枚举是否已注册（409 响应会泄露）。同时由于登录接口也无限流，可暴力破解密码。
- **建议：** 在注册/登录接口加上 IP 级速率限制（如 Redis + Sliding Window），每 IP 每分钟不超过 5 次请求。

### [H3] 图片代理未限制 Content-Type——可代理非图片响应

- **文件：** `src/app/api/v1/images/proxy/[traceId]/[idx]/route.ts:47`
- **证据：**
  ```ts
  const contentType = upstreamRes.headers.get("content-type") ?? "application/octet-stream";
  return new Response(upstreamRes.body, {
    status: 200,
    headers: { "Content-Type": contentType, ... },
  });
  ```
  上游 Content-Type 直接透传，未校验是否是图片类型（`image/*`）。
- **影响：** 若上游 URL 返回 `text/html` 或 `application/javascript`，代理会将其透传给调用方，浏览器在某些嵌入场景下可能执行（存储型 XSS 路径）；同时任何 `application/json` 格式的错误响应也会被透传，泄露上游内部信息。
- **建议：** 强制校验 `contentType.startsWith("image/")`，否则返回 `502`。

### [H4] 登录后未检查软删除状态顺序——已删除用户可获得 JWT

- **文件：** `src/app/api/auth/login/route.ts:23`
- **证据：**
  ```ts
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) { return errorResponse(401, ...) }
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) { return errorResponse(401, ...) }

  if (user.deletedAt) { return errorResponse(403, "account_deleted", ...) }
  if (user.suspended) { return errorResponse(403, "account_suspended", ...) }
  ```
  `deletedAt`/`suspended` 检查在 `bcrypt.compare` 之后进行。虽然最终会被拒绝，但攻击者可以通过返回 401 vs 403 的差异判断一个已删除账号的密码是否正确（Oracle 攻击）。
- **影响：** 信息泄露：可确认已删除账号的密码，为账号接管/内鬼操作提供参考。
- **建议：** 将 `deletedAt`/`suspended` 检查移到密码验证之前（先查状态，再做 bcrypt 比较），对外统一返回 `invalid_credentials`。

### [H5] bcrypt 轮数降级——安全强度降低

- **文件：** `src/app/api/auth/login/route.ts:40`
- **证据：**
  ```ts
  // Rehash 存量 cost=12 的密码为 cost=10，降低后续登录延迟
  if (currentRounds !== 10) {
    const newHash = await bcrypt.hash(password, 10);
    prisma.user.update(...).catch(() => {});
  }
  ```
  将 cost=12 的哈希降级为 cost=10，理由是"降低延迟"。
- **影响：** bcrypt cost 12 vs 10 在破解速度上相差 4 倍，降级使离线字典攻击更容易。且此操作是静默的（`.catch(() => {})`），无审计。
- **建议：** 删除此降级逻辑。如果登录延迟确实是问题，应将 cost 固定在合理值（10-12 均可），但不应降级已有的更高安全强度。

### [H6] 通知 test-webhook 无 URL 白名单——可被用作 SSRF 探针

- **文件：** `src/app/api/notifications/test-webhook/route.ts:37`
- **证据：**
  ```ts
  const res = await fetch(pref.webhookUrl, { method: "POST", ... });
  ```
  `webhookUrl` 来自数据库，由用户在偏好设置中配置（`/api/notifications/preferences`），无任何域名/IP 白名单校验。
- **影响：** 已登录用户可将 `webhookUrl` 设为内网地址（`http://169.254.169.254/`、`http://localhost:5432/` 等），借助服务端向内网发起请求（SSRF），探测内网服务或泄露云实例 metadata。
- **建议：** 在保存 `webhookUrl` 时（`notifications/preferences` PATCH）和发送请求前，验证 URL 是否为合法的外部 HTTPS 地址，拒绝私有 IP 段（RFC 1918 + 169.254.x.x + ::1 等）。

---

## Medium

### [M1] 注册接口返回 verificationToken 明文

- **文件：** `src/app/api/auth/register/route.ts:121`
- **证据：**
  ```ts
  return NextResponse.json({
    id: user.id, email: user.email, name: user.name,
    emailVerified: user.emailVerified,
    defaultProjectId: user.defaultProjectId,
    verificationToken,  // ← 明文令牌直接返回
  }, { status: 201 });
  ```
- **影响：** 验证 token 本应通过邮件发送，在注册响应中明文返回会导致 token 泄露在 HTTP 响应日志、CDN 访问日志、前端 network 面板中。
- **建议：** 注册响应中去掉 `verificationToken`，通过邮件发送链接。如果邮件功能尚未实现，至少不要在响应中暴露 token。

### [M2] 管理员日志搜索存在 ILIKE 注意事项（但已参数化）

- **文件：** `src/app/api/admin/logs/search/route.ts:18` / `src/app/api/projects/[id]/logs/search/route.ts:22`
- **证据：**
  ```ts
  const likePattern = `%${q}%`;
  // ...用于 Prisma $queryRaw tagged template（参数化）
  WHERE cl."traceId" ILIKE ${likePattern} OR ...
  ```
  使用了 Prisma tagged template（`$queryRaw` 配合 `${}`）正确参数化，不存在 SQL 注入。但 `q` 未限制长度，极长的 `q` 会产生超大 LIKE 模式，触发 DB 全表扫描。
- **影响：** DoS：恶意请求可提交数千字符的 `q`，结合 ILIKE 导致 PG 全表扫描耗尽 CPU。
- **建议：** 对 `q` 加长度上限（如 200 字符），超过则返回 400。

### [M3] 充值接口缺少幂等保护——重复提交可能创建多个订单

- **文件：** `src/app/api/projects/[id]/recharge/route.ts:40`
- **证据：** 每次 POST 都无条件创建新的 `RechargeOrder`，没有幂等键（`idempotency_key`）机制。
- **影响：** 网络抖动或前端重试可能产生多个等待支付的订单，混淆支付回调时的订单匹配。
- **建议：** 接受客户端 `idempotency_key` header 或参数，在 DB 中以 `(userId, idempotencyKey)` 唯一约束，重复请求直接返回已有订单。

### [M4] admin recharge 接口的 `amount` 未校验类型

- **文件：** `src/app/api/admin/users/[id]/recharge/route.ts:13`
- **证据：**
  ```ts
  const body = await request.json();
  const { amount, description } = body;
  if (!amount || amount <= 0) { ... }
  ```
  `amount` 没有 `typeof amount === 'number'` 检查。如果传入字符串 `"9999999999999"` 或 `Infinity`，`!amount || amount <= 0` 会通过，Prisma Decimal 会按字符串解析（可能导致意外大额充值）。
- **影响：** 边界充值值绕过校验，管理员界面 bug 可能导致非预期充值。
- **建议：** 增加 `typeof amount !== 'number' || !isFinite(amount)` 的严格检查，并设置上限（如 $100,000）。

### [M5] Provider PATCH 不验证 baseUrl 格式——可设为非 HTTP(S) URL

- **文件：** `src/app/api/admin/providers/[id]/route.ts:154`
- **证据：**
  ```ts
  if (baseUrl !== undefined) data.baseUrl = baseUrl;
  ```
  无 URL 格式校验，管理员可将 `baseUrl` 设为 `file:///etc/passwd` 或 `javascript:...`，下游 adapter 在发起 fetch 时可能导致意外行为。
- **影响：** 内部 SSRF（file:// 协议）或注入风险，取决于 adapter 的 fetch 实现。
- **建议：** 校验 `baseUrl` 必须是合法 `https://` 地址（或配置允许的 `http://` 地址），拒绝其他协议。

### [M6] 模板测试错误直接暴露内部错误信息

- **文件：** `src/app/api/templates/[templateId]/test/route.ts:55`
- **证据：**
  ```ts
  console.error("[templates/test] unexpected error:", err);
  return errorResponse(500, "internal_error", (err as Error).message);
  ```
  未预期错误的 `.message` 直接返回给客户端（含堆栈路径、DB 错误详情等）。
- **影响：** 内部实现细节泄露，如 Prisma 错误消息可能包含表名、字段名、DB 连接信息。
- **建议：** 对非 `TemplateTestError` 的错误，返回通用 `"An internal error occurred"` 而非 `err.message`。

### [M7] 流式 SSE 中 controller.error(err) 后资源未保证释放

- **文件：** `src/app/api/v1/chat/completions/route.ts:359` / `src/app/api/v1/actions/run/route.ts:112`
- **证据：**
  ```ts
  } catch (err) {
    controller.error(err);
    // rollback, processChatResult...
  }
  ```
  `controller.error(err)` 会关闭 stream 并触发 abort，但 `reader`（upstream ReadableStream reader）在异常路径没有显式 `reader.releaseLock()` 或 `reader.cancel()`。
- **影响：** 若 upstream 连接不响应 abort，reader lock 可能无法释放，潜在内存泄漏（并发流请求多时积累）。
- **建议：** 在 catch 块中加 `reader.releaseLock()` 或将 reader 放在 `try/finally` 中确保释放。

### [M8] `v1/models` 无认证时任意访问模型列表（信息泄露）

- **文件：** `src/app/api/v1/models/route.ts:188`
- **证据：**
  ```ts
  const authHeader = request.headers.get("authorization");
  if (authHeader) {
    const auth = await authenticateApiKey(request);
    if (!auth.ok) return auth.error;
  }
  // 无 token 时完全放行
  ```
  注释写"可选鉴权"，无 token 时直接返回模型列表（含价格、capabilities 等）。
- **影响：** 任何人无需认证即可获取所有可用模型信息，包含 pricing 信息，可用于竞争情报。这是设计决策问题，但应明确评估是否合适。
- **建议：** 若非有意设计为公开 API，应要求认证。若有意公开，在文档中明确并考虑是否公开 pricing 字段。

---

## Low

### [L1] 多个 admin 路由缺少请求体解析错误处理

- **文件：** `src/app/api/admin/channels/[id]/route.ts:11`、`src/app/api/admin/model-aliases/merge/route.ts:18` 等约 12 处
- **证据：** `const body = await request.json()` 没有 try/catch，若 Content-Type 不匹配或 body 为空，会返回未格式化的 500 错误。
- **建议：** 为所有 admin PATCH/POST 路由的 `request.json()` 加 try/catch，返回标准 400 错误。

### [L2] `admin/providers/[id]/config/route.ts` 存在重复文件（3 份相同代码）

- **文件：** `src/app/api/admin/providers/[id]/config/route.ts`（与另外两个位置的内容完全相同）
- **建议：** 提取为共享的 `providerConfigHandler` 函数，消除重复。

### [L3] TODO 注释未关联工单

- **文件：** `src/app/api/webhooks/alipay/route.ts:32`、`src/app/api/webhooks/wechat/route.ts:31`
- **证据：** `// TODO: P2 实现...` 没有 issue 编号。
- **建议：** 创建跟踪工单并在注释中引用，如 `// TODO: BL-xxx`。

### [L4] bcrypt.getRounds 在某些边界情况下可能抛出

- **文件：** `src/app/api/auth/login/route.ts:40`
- **证据：** `bcrypt.getRounds(user.passwordHash)` — 若 `passwordHash` 格式不合法（数据迁移遗留数据），会抛出异常，但外层没有 try/catch。
- **建议：** 将此调用包在 try/catch 中。

### [L5] 查询参数 status 过滤未白名单校验（admin/logs/route.ts）

- **文件：** `src/app/api/admin/logs/route.ts:14`
- **证据：**
  ```ts
  const status = url.searchParams.get("status")?.toUpperCase();
  // ...
  ...(status ? { status: status as "SUCCESS" | "ERROR" | "TIMEOUT" | "FILTERED" } : {}),
  ```
  类型强转 `as` 不做运行时白名单校验，传入不合法值会导致 Prisma 枚举错误（500 响应）。
- **建议：** 加白名单检查：`const VALID_STATUSES = ["SUCCESS","ERROR","TIMEOUT","FILTERED"]; if (status && !VALID_STATUSES.includes(status)) return errorResponse(400, ...)`。

---

## Info

### [I1] 充值创建接口存在 placeholder 支付链接

- **文件：** `src/app/api/projects/[id]/recharge/route.ts:53`
- **证据：** `paymentUrl = "https://openapi.alipay.com/gateway.do?out_trade_no=..."` — 这是 mock URL，不是真实支付链接（注释也说明"生产环境需替换"）。
- **观察：** 若生产环境已上线，用户点击后会跳转到无效链接。

### [I2] 支付宝 webhook 幂等依赖 paymentOrderId 而非 tradeNo

- **文件：** `src/lib/billing/payment.ts:20`
- **证据：** 幂等 key 是 `paymentOrderId`（内部订单 ID），而支付宝实际使用 `out_trade_no`（也是内部订单 ID），两者恰好相同（L59 存的是 `order.id`）。但微信 `out_trade_no` 行为相同。如果未来订单 ID 生成策略变化，需保持一致。
- **观察：** 当前实现逻辑正确，但依赖于 `paymentOrderId` 在创建时被设为 `order.id` 的隐式假设。

### [I3] 模型列表接口缓存使用 in-process 字符串拼接作为 cacheKey

- **文件：** `src/app/api/v1/models/route.ts:206`
- **证据：** `const cacheKey = modalityFilter ? "models:list:${modalityFilter}" : "models:list"` — `modalityFilter` 来自用户输入（`url.searchParams.get("modality")?.toUpperCase()`），未净化直接作为 Redis key。若攻击者传入 `:lock` 后缀，会触碰分布式锁 key。
- **观察：** 实际上 `modalityFilter` 用于 Prisma 查询前被强转为 enum，不合法值不会入库，Redis key 污染概率极低，但仍应对 `modalityFilter` 值做白名单约束。

---

## 附：未覆盖鉴权的路由（均属预期行为）

| 路由 | 原因 |
|------|------|
| `auth/login` | 公开登录入口 |
| `auth/register` | 公开注册入口 |
| `auth/verify-email` | 邮件验证，token 即凭证 |
| `v1/images/proxy/[traceId]/[idx]` | HMAC 签名鉴权（非 Bearer） |
| `webhooks/alipay` | 支付平台回调（应验签，见 C1） |
| `webhooks/wechat` | 支付平台回调（应验签，见 C1） |
| `mcp` | `authenticateMcp` 内部鉴权 |

