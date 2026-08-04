# [URGENT] AIGC Gateway 全量后端 Code Review 报告

**审查日期：** 2026-08-04
**审查基线：** `main` @ 281ce16
**审查范围：** 全后端约 29,000 行（`src/lib/` + `src/app/api/` 共 310 个 TS 文件，不含前端页面与组件）
**审查方式：** 7 个 subagent 按子系统并行深读 + 引擎层由审查人手工审读（该 agent 两次因 API 连接错误中断）+ 审查人对全部 Critical / 部分 High 的独立复核（读源码、读 nginx 配置、读 migration SQL、追调用链、写最小复现脚本）
**上次全量审查：** `backend-fullscan-2026-04-17.md`（本报告含对其 Critical 项的回归核对）

---

## 执行摘要

**整体结论：BLOCK — 存在 6 个可直接造成资金损失或权限突破的 Critical 缺陷，其中 C1 可被任意匿名用户在生产环境上零成本利用，C6 可被任意持 Key 用户以一行参数改动触发。**

| 严重度 | 数量 | 说明 |
|---|---|---|
| **Critical** | **6** | 资金安全 / 认证边界突破，均已由审查人独立复核确认（C3 / C6 附可运行复现） |
| **High** | **13** | 有明确利用路径或确定性触发的正确性、成本、泄漏问题 |
| **Medium** | **14** | 健壮性、性能、一致性问题 |

**最紧急的四条（建议 24 小时内处理）：**

1. **C1 支付 webhook 零验签** — 任何人可无限充值任意账户。生产 nginx 明确公开暴露该路径。这是 2026-04-17 报告的 CRIT-1，**4 个月未修**。
2. **C6 底层模型名零计费旁路** — 把 `model` 参数从别名换成底层模型名（如 `gpt-4o` → `gpt-4o-2024-08-06`），调用照常成功但**完全不扣费**，同时绕过别名停用开关。已用可运行脚本证明 `sellUsd=0`。
3. **C3 扣费失败连带回滚 CallLog** — 用户把余额停在 $0.01 即可无限次免费调用付费模型，且调用完全不落库（审计断档 + 收入泄漏）。
4. **C5 MCP `create_api_key` 权限提升** — 一把只有 `keyManagement` 权限的受限 Key 可铸造出全权限 Key。

---

## 对 2026-04-17 报告 Critical 项的回归核对

| 上次编号 | 问题 | 当前状态 |
|---|---|---|
| CRIT-1 | 支付 webhook 未验签 | ❌ **仍未修复**（本报告 C1） |
| CRIT-2 | `deduct_balance` 缺行级锁 | ✅ 已修复（`20260418_deduct_balance_for_update` 加了 `SELECT ... FOR UPDATE`） |
| CRIT-3 | 支付回调幂等竞态 | ❌ **仍未修复**（本报告 C2） |
| CRIT-4 | CallLog 与扣费非原子 | ⚠️ 已包进事务，但引入了新缺陷（本报告 C3） |
| CRIT-5 | 硬编码 admin 密码 | ⚠️ 源码已清理，但 `.auto-memory/environment.md`（git-tracked）仍存生产管理员明文密码（本报告 M11） |
| CRIT-6 | 图片代理 HMAC secret 硬编码 fallback | ✅ 已修复（`image-proxy.ts:16-23` 改为缺失即 throw） |
| CRIT-7 | JWT 写入非 httpOnly cookie | ⚠️ 部分修复（cookie 已 httpOnly/secure/sameSite，但 `localStorage` 副本仍在，本报告 M6） |
| CRIT-8 | ProviderConfig PATCH 无白名单 | ✅ 已修复（改为显式字段解构） |
| CRIT-9 | 调度器无分布式锁 | ✅ 已修复（Redis leader-lock，含丢锁后待命重抢） |
| CRIT-10 | 运维脚本 shell 注入 | — 本次未覆盖 `scripts/`（范围为后端服务代码） |

**回归结论：** 10 项中 4 项确认修复、3 项部分修复、2 项仍完全未修（均为支付链路）、1 项超出本次范围。支付模块是唯一一个跨越两次全量审查、Critical 缺陷零修复的模块。

---

## Critical

### C1 | 支付回调零验签 + 订单号自助获取 = 任意用户无限充值

- **文件：** `src/app/api/webhooks/alipay/route.ts:30-41`、`src/app/api/webhooks/wechat/route.ts:29-45`
- **类别：** security / billing
- **缺陷：** 两个支付回调端点均无签名校验（代码里是 `// TODO: P2 实现` 注释）。微信分支更进一步，把 `resource.ciphertext` 当明文 JSON 直接 `JSON.parse`（注释自称"仅开发环境"，但**没有任何 `NODE_ENV` 判断**，生产同样生效）。

- **完整攻击链（已逐环确认）：**
  1. 任意已登录用户 `POST /api/projects/:id/recharge`，body `{"amount":10000,"paymentMethod":"alipay"}`。该接口上限 $10,000，**并在响应体中直接返回 `orderId`**，而 `recharge/route.ts:59` 把 `paymentOrderId` 就设为这个 `order.id`。
  2. 该用户直接 `POST https://aigc.guangai.ai/api/webhooks/alipay`，body 为 `out_trade_no=<上一步的orderId>&trade_status=TRADE_SUCCESS`。
  3. 无验签 → `processPaymentCallback` → 事务内订单置 COMPLETED、`User.balance += 10000`、写 RECHARGE Transaction。全程未支付一分钱，可无限重复。

- **暴露面确认：** `deploy/nginx/aigc.conf:103` 有独立的 `location /api/webhooks/ { proxy_pass ... }` 块，无 IP 白名单、无鉴权；`src/middleware.ts` 的 matcher 也不覆盖 `/api/webhooks/*`。该端点在生产上对公网完全开放。
- **修复：** 立即实现支付宝 RSA2 与微信 WECHATPAY2-SHA256-RSA2048 验签 + AEAD-AES-256-GCM 解密；验签失败一律 400。在验签上线前，建议先在 nginx 层对 `/api/webhooks/` 加支付平台官方回调 IP 白名单作为临时止血。

### C2 | 支付回调幂等判断在事务外，并发重放导致多次入账

- **文件：** `src/lib/billing/payment.ts:21-36`（事务外读状态）、`:41-48`（事务内无条件 update）
- **类别：** concurrency / billing
- **缺陷：** `processPaymentCallback` 先在事务**外** `findUnique` 判断 `order.status !== "PENDING"` 做幂等，再进 `$transaction` 执行「订单置 COMPLETED + 加余额 + 写 Transaction」。事务内用的是 `update({ where: { id } })`，**没有把 `status: "PENDING"` 作为更新条件**。行锁只会让并发事务串行，不会阻止后续事务继续成功。
- **失败场景：** 对同一 `orderId` 并发发起 N 个回调（配合 C1 可自助触发；即使 C1 修复后，真实支付网关在网络抖动下的重试也会并发触达），N 个请求都读到 `PENDING` → 各自跑完事务 → 余额被增加 N × amount，产生 N 条 RECHARGE Transaction。
- **注意：** 这是独立于 C1 的第二个根因，**修复验签并不能消除它**，必须单独修。
- **修复：** 把幂等判断移入事务，改用条件 CAS：`tx.rechargeOrder.updateMany({ where: { id, status: "PENDING" }, data: {...} })`，`count === 0` 则直接返回"已处理"。

### C3 | 扣费失败连带回滚 CallLog + 余额预检不估成本 = 可确定性复现的免费调用通道

- **文件：** `src/lib/api/post-process.ts:404-415`（chat）、`:554-565`（image）、`:639-649`（embedding）；`src/lib/api/balance-middleware.ts:18-36`；`prisma/migrations/20260418_deduct_balance_for_update/migration.sql:30-32`
- **类别：** billing / correctness
- **缺陷：** 三条后处理路径都是 `await prisma.$transaction(async (tx) => { const callLog = await tx.callLog.create(...); await deductBalance(tx, ...) })`。`deduct_balance` 在 `v_balance < p_amount` 时 `RAISE EXCEPTION` → **整个事务回滚，刚创建的 CallLog 一并消失**，异常仅被上层 `.catch(err => console.error(...))` 吞掉。而入口的 `checkBalance()` 只判断 `balance > 0`，完全不预估本次请求成本。
- **失败场景：** 用户把余额停在 $0.01，发起一个真实成本 $0.20 的请求。`checkBalance` 通过（0.01 > 0）→ 上游真实调用并成功返回给用户（响应体里 `cost` 字段都算好了）→ 扣费时余额不足抛异常 → 事务回滚 → CallLog、Transaction 均未落库，余额仍是 $0.01。**该请求可无限重复**，每次都拿到真实模型输出，且 `recordSpending`（消费速率限流）也在同一分支被跳过，管理端 `admin/finance` 汇总与 `bill_reconciliation` 对账都看不到这批调用。
- **与既有设计决策的关系：** `docs/specs/BL-SEC-BILLING-AI-spec.md:245` 明确写了"余额不足时 callLog 被回滚丢弃是当前行为，保持"。但该 spec 的场景建模针对的是"余额耗尽边界的并发竞态"（10 并发 $0.15 打 $1 余额），**未识别到**：因为预检不比较成本，这个行为可被单线程、确定性、无限次地重放，从边缘个案变成可持续利用的免费通道。建议重新审视这条决策。
- **修复方向（三选一或组合）：** ① 预检改为对比保守的费用上限估算（如 `max_tokens × 卖价`）；② 允许余额扣至负值，由下一次请求的预检拒绝，保证扣费不失败；③ 扣费失败时把 CallLog 以 `status=FAILED` / 零金额单独落库（事务外补写），至少保住审计轨迹。

### C4 | 模板"测试"通道绕过余额检查与限流，两个入口均可无限免费调用付费模型

- **文件：** `src/app/api/templates/[templateId]/test/route.ts:15-49`（REST 入口）、`src/lib/mcp/tools/run-template.ts:104-138`（MCP 入口）
- **类别：** billing / security
- **缺陷：** `runTemplateTest(mode: "execute")` 会对模板每一步执行 `runActionNonStream` → 真实模型调用 → `processChatResult` → `deductBalance`（`test-runner.ts:196-229`，文件头注释也写明"execute：真实调用每步"）。但两个入口的护栏都不完整：
  - **REST `/api/templates/:id/test`：** 全程只有 `verifyJwt`，**没有任何 `checkBalance`、没有任何限流**。对比同样触发真实调用的 `/v1/templates/run`、`/v1/actions/run`，两者都在入口做了余额检查 + RPM + TPM + 消费速率四道门。
  - **MCP `run_template`：** `if (test_mode) { ... return; }` 在 `checkTokenLimit`（TPM）和 `checkSpendingRate`（消费速率）**之前** return，两道限流永远执行不到。代码注释声称"runTemplateTest internals still skip deduct_balance"和"no token usage during test_mode"——**这个前提对 `mode:"execute"` 是错的**，已通过读 `test-runner.ts:177/273-275` 的 mode 分支确认。
- **失败场景：** 余额为 $0 的用户直接 `POST /api/templates/{id}/test` 带 `{"mode":"execute"}`，模板每一步都真实调用付费模型并返回结果；扣费因余额不足在事务中回滚（见 C3），既不计费也不留痕。MCP 侧则可在远超 TPM/消费速率上限的速度下持续产生真实计费调用，只受 RPM 与总余额约束。
- **修复：** REST 入口补齐与 `/v1/templates/run` 对等的余额检查与限流；MCP 入口把 `test_mode` 分支移到 TPM/消费速率检查**之后**，并修正那段与实现不符的注释。

### C5 | MCP `create_api_key` 权限提升 — 受限 Key 可铸造全权限 Key

- **文件：** `src/lib/mcp/tools/manage-api-keys.ts:60-107`（关键在 `:104` 的 `permissions: {}`）
- **类别：** security
- **缺陷：** 该 tool 的 zod schema 不接受 `permissions` 参数，写库时硬编码 `permissions: {}`。而 `checkMcpPermission`（`src/lib/mcp/auth.ts:110-119`）的语义是"仅 `=== false` 才拒绝，`undefined`/`true` 一律放行"，因此 `{}` 等价于**全部权限**。整个创建流程既不校验也不继承调用方当前 Key 的权限范围。
- **失败场景：** 账号所有者按最小权限原则签发一把仅 `keyManagement: true`、其余全 `false` 的 Key 给自动化脚本轮换密钥用，明确不允许它花钱或读日志。该脚本（或劫持它的攻击者）调用 MCP `create_api_key`，即可得到一把 `permissions: {}` 的新 Key，可 chat、可生成图片、可读日志——完全突破原 Key 的权限边界。
- **修复：** 新 Key 的权限继承调用方 Key 的权限（取交集），或显式接受 `permissions` 参数并校验其不超出调用方权限范围。

### C6 | 用底层模型名代替别名调用 → 完全不扣费，并绕过别名停用开关与 modality 门禁

- **文件：** `src/lib/engine/router.ts:217-233`（`resolveEngine` 的 fallback）、`:152-202`（`routeByModelName`）；计费后果在 `src/lib/api/post-process.ts:656-690`（`calculateTokenCost`）
- **类别：** billing / security
- **缺陷：** `resolveEngine(body.model)` 先走 `routeByAlias`；别名不存在**或被停用**时抛 `MODEL_NOT_FOUND`，而 `resolveEngine` 恰好捕获这个错误码并回退到 `routeByModelName(aliasName)` —— 按**底层 `Model.name`** 直接选一条 ACTIVE 通道返回。该回退路径返回的 `RouteResult` **没有 `alias` 字段**。

- **计费后果（已用可运行脚本证明）：** `calculateTokenCost` 的卖价来源是 `alias.sellPrice`，缺失时回退 `channel.sellPrice`。而 `model-sync.ts:13` 明确写着「sellPrice 不再由 sync 管理，统一在 ModelAlias.sellPrice 设置」——**同步创建的通道 `channel.sellPrice` 为 null**。于是 `route.alias` 缺失 → 两个来源都没有 token 字段 → `sellPrice = {}` → `sellUsd = 0` → `shouldDeduct = false` → **CallLog 照写、Transaction 不写、余额不扣**，而 `costUsd` 仍按真实成本计算（网关照付上游钱）。

  实测输出（同一份 usage 与通道配置，唯一差异是有无 alias）：

  ```
  路径 A（走别名）      cost=0.00042  sell=0.0015   → shouldDeduct: true
  路径 B（走底层模型名） cost=0.00042  sell=0        → shouldDeduct: false
  ```

- **触发条件有多常见：** 需要一个「不是启用中的别名，但是启用中的 `Model.name`」的字符串。这恰恰是**常态**而非边缘情况：
  - `alias-classifier` 的核心职责就是把带日期/前缀的模型 ID 归一化成别名（`router.ts` 邻近代码与 `alias-classifier.ts:95-99` 的 prompt 明确写了 `gpt-4o-2024-08-06 → gpt-4o`、`openai/gpt-4o → gpt-4o`）。而 `resolveCanonicalName`（`model-sync.ts:239-244`）保存的 `Model.name` 是**未归一化的裸 modelId**。所以每一个带日期/版本后缀的模型，其原始名字天然就是"是 Model.name 但不是别名"。
  - 通用 fallback provider 的 `Model.name` 形如 `${provider.name}/${modelId}`，同样几乎不会与别名重名。
  - 这些名字都是上游公开的标准模型名，无需从本网关探测即可猜到。
- **附带影响：** 该路径上 `route.alias` 为 undefined，因此 ① 管理员把别名 `enabled=false` **并不能真正停用**该模型（只要底层 Model 仍 enabled）；② `chat/completions:105` 的 `route.alias?.modality === "IMAGE"` 与 `image-generation-core.ts:91` 的 `=== "TEXT"` 两个 modality 门禁被整体跳过（vision / i2i 能力门禁因为有 `route.model.capabilities` 回退，不受影响）；③ 没有 failover 候选（`candidates: [route]`）、不参与健康过滤与 cooldown 排序。
- **修复：** `routeByModelName` 的定位是"供健康检查等内部调用"，不应出现在面向用户的 `resolveEngine` 回退路径上。建议移除该 fallback（或加开关，仅在内部调用时启用）；若要保留，必须在该路径上解析出对应 alias 的定价并施加同等门禁，且尊重 `alias.enabled=false`。**修复前建议先查生产 `call_logs` 中 `sellPrice=0 且 costPrice>0` 的成功调用，评估已发生的损失。**

---

## High

### H1 | X-Forwarded-For 可伪造 → API Key IP 白名单绕过 + 注册限流绕过

- **文件：** `src/lib/api/ip-utils.ts:32-41`（`getClientIp`）、`src/lib/api/auth-rate-limit.ts:118-124`（`extractClientIp`）
- **类别：** security
- **缺陷：** 两处都取 `X-Forwarded-For` 的**最左值**且不校验来源。生产 nginx 用的是 `proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for`（**追加**语义），客户端自带的 XFF 会被保留在最前面，nginx 只在末尾追加真实出口 IP。取 `split(",")[0]` 等于直接信任客户端自报值。同文件里 nginx 强制覆盖的 `X-Real-IP`（`$remote_addr`，不可伪造）才是可信源，但判断顺序把不可信的放在了前面。
- **失败场景：** ① 拿到一把配置了 `ipWhitelist` 的泄漏 Key，携带 `X-Forwarded-For: <白名单内IP>` 即可从任意来源绕过白名单；② `/api/auth/register` **只有 IP 维度限流**（无账号维度，代码注释也承认），每次请求随机化 XFF 即可让限流桶永远是新的，实现批量注册。
- **修复：** 优先读 `X-Real-IP`；或引入受信任代理跳数配置，从 XFF 右侧倒数第 N 个取值。

### H2 | `/v1/embeddings` 未纳入权限门禁，`chatCompletion:false` 的 Key 仍可调用并扣费

- **文件：** `src/lib/api/auth-middleware.ts:41-52`（`detectEndpoint`）
- **类别：** security
- **缺陷：** `detectEndpoint` 把 `/chat/completions`、`/actions/run`、`/templates/run` 映射为 `"chat"`，`/images/generations`、`/images/edits` 映射为 `"image"`，但 `/v1/embeddings` 完全没有映射，落入 `"unknown"` → 不触发任何权限检查。该路由自身有 `checkBalance` 和 `checkRateLimit`，唯独缺权限门。
- **同类前科：** 这与 `auth-middleware.ts:48-50` 注释里记录的 IIV-DEF-01（"edits 与 generations 同属 image 权限域——漏掉此映射会让 imageGeneration=false 的 Key 越权调用并扣费"）是**同一类缺陷**，这次发生在 embeddings 上。
- **修复：** 把 `/embeddings` 加入 `"chat"` 权限域（或新增独立权限位并同步前端 Key 创建 UI）。建议同时把 `detectEndpoint` 改为白名单穷举 + 未匹配路径默认拒绝，防止下一个新端点再漏。

### H3 | 健康检查 `handleFailure` 的 DISABLED→DEGRADED 路径绕过目录权威性闸门

- **文件：** `src/lib/health/scheduler.ts:741-760`（`allTransient` 分支）；对照闸门位置 `:639-653`
- **类别：** correctness
- **缺陷：** commit 281ce16 把"目录权威性"判据收敛到 `isCatalogAuthoritative` / `vetoRecovery`，但只接在 `executeCheckWithRetry` 的探测**成功**分支上（`catalogGateApplies = status === "DISABLED" && checkMode === "reachability"`）。而 `handleFailure` 里对 DISABLED 通道探测**失败但判为 transient** 时，会直接 `updateChannelStatus(route, "DEGRADED")`，**完全不经过目录闸门**。`routeByAlias`（`router.ts:59`）把 DEGRADED 与 ACTIVE 一并纳入候选池，转正即可承接真实流量。
- **失败场景：** `seedream-4-5` 这类因"已从上游目录消失"而被 DISABLED 的通道，其 reachability 探测打 provider 通用 `/models` 端点时偶发一次 timeout / ECONNREFUSED（与该模型是否存在无关，纯网络抖动）→ `isTransientFailureReason` 判为 transient → DISABLED 直接翻成 DEGRADED → 重新进入路由候选池，用户请求被打到已确认下架的模型上。本批次刚做的统一判据被绕过。
- **修复：** 在 `handleFailure` 的 `status === "DISABLED"` 分支同样调用 `vetoRecovery`。

### H4 | 管理员手动健康检查未复用调度器的成本护栏，可重现两次已修复的烧钱事故

- **文件：** `src/lib/health/scheduler.ts:219-252`（`checkChannel`）；对照 `planChannelCheck` 的完整判据在 `:383-413`
- **类别：** correctness / 成本
- **缺陷：** 调度路径 `runScheduledChecks → planChannelCheck` 有两道护栏：`isExpensiveModel` → `skip`（F-HPL-02，修复 openrouter search-preview 82 次调用 / $2.25），`status === "DISABLED"` → 只跑零成本 reachability（F-HPE-01，修复 chatanywhere 535 次调用 / $11.71）。但管理员手动触发走的 `checkChannel` 是一套**独立、简化过**的判断，只看 `isProbableModality && isAliased`，**既不检查 status 也不检查 isExpensiveModel**，一律走 `"full"`（真实计费调用）。
- **失败场景：** Admin 在 `/admin/health` 页面对一个已 DISABLED 或高价（`-search` / `o1-` / `-pro-preview`）的文本通道点"手动检查"（前端按钮无禁用条件）→ 对上游发起真实计费调用，重现上述两次事故。
- **修复：** `checkChannel` 改为复用 `planChannelCheck` 的返回值决定 checkMode。

### H5 | model-sync 对 TEXT/EMBEDDING 通道无条件重写 costPrice，AI 补价单轮失败即把已生效价格清零

- **文件：** `src/lib/sync/model-sync.ts:156-167`（`buildCostPrice`，TEXT 无价时回退 `{0,0}`）、`:359-370`（reconcile 更新路径每轮必写 costPrice）
- **类别：** correctness（成本记账）
- **缺陷：** F-BIPOR-04 已为 IMAGE 模态修过"sync 覆盖人工设值"（`buildCostPrice` 对 IMAGE 返回 `null` 跳过写入），但 TEXT/EMBEDDING 未做同等处理：这些通道的 `costPrice` 完全由**本轮**同步结果决定，不读回 DB 已落库的旧值。对 zhipu 这类 `/models` API 本身不返回定价、依赖 Layer-2 AI 文档抓取（`doc-enricher.ts`，Jina Reader + LLM，两者都有独立失败路径且都被 catch 后静默跳过）补价的 provider，只要这一轮抓取失败且无 `pricingOverrides`，`?? 0` 回退就会把此前成功写入的正确价格覆盖为 `{inputPer1M:0, outputPer1M:0}`。
- **失败场景：** 每日 04:00 定时 sync 时 Jina 超时或 LLM 三跳 fallback 全部 `MODEL_NOT_FOUND`（代码注释里已承认这个 "chain rot" 风险会发生）→ 该 provider 下相关 ACTIVE 通道 costPrice 被静默清零 → 这段时间的真实调用成本记账为 $0，直到下次补价恰好成功。
- **修复：** 无新价格时跳过 `costPrice` 写入（对齐 IMAGE 的处理），而不是回退 0。

### H6 | Template fan-out 分支数无上限，单次调用可放大为数百次并发付费调用

- **文件：** `src/lib/template/fanout.ts:90-116`
- **类别：** billing / performance
- **缺陷：** `runFanout` 把 SPLITTER 的输出 `JSON.parse` 后直接 `Promise.all(parts.map(...))` 并发跑 BRANCH，`parts.length` **无任何上限校验**。而调用方（`/v1/templates/run`、MCP `run_template`）的 RPM / TPM / 消费速率限流与余额检查都只在收到这一次请求时判定一次，不按分支数缩放。
- **失败场景：** SPLITTER 被诱导（prompt injection 或异常输入）输出几百上千元素的 JSON 数组 → 一次调用在毫秒级内并发触发同等数量的真实模型调用与数据库事务，绕开"每次调用一次限流"的设计假设，成本失控，并可能耗尽 Prisma 连接池（`DATABASE_URL` 的 `connection_limit=5` 很小）影响其他请求。
- **修复：** 对 `parts.length` 设硬上限（超出即报错），并用有界并发池（如 p-limit）替代裸 `Promise.all`。

### H7 | Provider 创建/更新接口明文回显 authConfig（上游 API Key、结算凭证）

- **文件：** `src/app/api/admin/providers/route.ts:88`、`src/app/api/admin/providers/[id]/route.ts:212-217`
- **类别：** security
- **缺陷：** `POST /api/admin/providers` 与 `PATCH /api/admin/providers/:id` 直接 `NextResponse.json(provider)` 返回完整 Prisma 记录，其中 `authConfig`（含 `apiKey`、PATCH 时还会 merge 进 `billingAccessKeyId` / `billingSecretAccessKey` / `provisioningKey`）被原样回显。同目录的 `GET /api/admin/providers`（`route.ts:19-31`）明确手工挑选字段、刻意不返回 `authConfig`——可见这是疏漏而非设计。
- **失败场景：** 管理员在 `/admin/providers` 页面新建或编辑服务商时，上游密钥以明文出现在 HTTP 响应体，可被浏览器扩展、前端监控（Sentry / LogRocket）、代理日志捕获留存。
- **修复：** 两处改为与 GET 一致的字段白名单序列化。

### H8 | `POST /api/admin/channels` 缺 IMAGE 价格校验，可重现 2026-04-24 生产事故

- **文件：** `src/app/api/admin/channels/route.ts:116-139`
- **类别：** correctness
- **缺陷：** `admin-schemas.ts:96-109` 明确记录了 2026-04-24 事故（40 条 IMAGE channel `costPrice.perCall=0` 导致成功调用不计费），修复方式是 `validateChannelPriceForModality`。但 channel **创建**接口完全绕开该校验：`costPrice: body.costPrice ?? {}` 直接落库，既无 zod schema 也不调校验函数（对比 PATCH 在 `channels/[id]/route.ts:30-52` 做了）。
- **失败场景：** 为 IMAGE 模态新建 channel 且不传 `costPrice` → 落库 `{}` → `normalizePriceObject` 也无法从空对象推断 unit → 该 channel 成功路由但计费读不到 `perCall`，重现"成功调用不计费"。
- **修复：** 创建路径接入与 PATCH 相同的 zod schema + `validateChannelPriceForModality`。

### H9 | Suspend 用户与修改密码均不使已签发的控制台 JWT 失效

- **文件：** `src/app/api/admin/users/[id]/suspend/route.ts:25-37`、`src/app/api/auth/change-password/route.ts:1-39`、`src/lib/api/jwt-middleware.ts:28-55`
- **类别：** security
- **缺陷：** `verifyJwt` 只校验签名与 `exp`，**从不查库确认 `user.suspended` / `user.deletedAt`**（对比 `authenticateApiKey` 在 `auth-middleware.ts:100-111` 明确查了这两个字段）。suspend 接口只把 `ApiKey` 批量置 REVOKED，不撤销 JWT；change-password 只更新 `passwordHash`，JWT payload 里也没有 `tokenVersion` 之类可失效字段。
- **失败场景：** ① 管理员 suspend 某用户后，该用户凭旧 token 仍可访问全部控制台功能（含 `POST /api/keys` 创建新 Key，该路由只校验 JWT 不查 suspended）长达 7 天（`JWT_EXPIRES_IN` 默认 `"7d"`）；② 用户怀疑账号被盗后改密码，攻击者手里的旧 JWT 依然有效至自然过期，"改密踢人"完全无效。
- **修复：** `verifyJwt` 增加轻量库查（可加 Redis 缓存）校验 suspended/deletedAt；或在 JWT 中引入 `tokenVersion`，suspend 与改密时递增。

### H10 | MCP 多处未脱敏地把上游原始错误回传给客户端

- **文件：** `src/lib/mcp/tools/chat.ts:332-336`、`embed-text.ts:143-147`、`run-action.ts:219-231`、`run-template.ts:125-137`
- **类别：** security
- **缺陷：** 这几处 catch 直接把 `(err as Error).message` 拼进返回文本，未过 `sanitizeErrorMessage()`（专门剥离 `ApiKey:xxx`、`sk-/pk-/key-` 前缀、`Bearer xxx`、URL 等）。同文件其它 catch（`chat.ts:657`、`embed-text.ts:262`）以及 `generate-image.ts` 全部分支都正确调用了——是遗漏而非设计。对照 REST 侧四个等价端点无一例外都脱敏了。
- **失败场景：** 当底层抛出非 `EngineError`（网络层异常、未经 `mapProviderError` 预清洗的错误、Prisma 异常）时，MCP 客户端收到未脱敏原始 message；同一份错误走 REST 则会被脱敏。
- **修复：** 四处补 `sanitizeErrorMessage`。

### H11 | Template steps 更新"先删后建"未包事务，失败即把线上模板清空

- **文件：** `src/app/api/projects/[id]/templates/[templateId]/route.ts:90-102`
- **类别：** correctness
- **缺陷：** `PUT` 更新 steps 时 `deleteMany` 紧接 `createMany`，两条语句**没有** `$transaction` 包裹（同文件的 rate 打分、fork 复制都用了事务）。
- **失败场景：** `createMany` 因任意原因失败（进程崩溃、连接抖动、并发唯一约束冲突），`deleteMany` 已提交 → 模板在 DB 中只剩 0 个 step → 后续所有 `runSequential` / `runFanout` 立即抛 "Template has no steps"，线上模板被清空且无法自愈。
- **修复：** 用 `prisma.$transaction([deleteMany, createMany])` 包裹。

### H12 | admin channels 与 models-channels 共用同一 Redis key 但写入不兼容结构

- **文件：** `src/app/api/admin/channels/_cache.ts:6`、`src/app/api/admin/models-channels/route.ts:18-21`
- **类别：** correctness
- **缺陷：** 两者都用字面量 `"cache:admin:channels"` 作缓存 key，但前者存**扁平 channel 列表** `{data: Channel[]}`（TTL 30s），后者存**按 provider→model 分组**的 `{data: ProviderGroup[]}`（TTL 300s）。
- **失败场景：** 管理员打开 `/admin/models` 触发 models-channels 写入分组 JSON（TTL 300s）后，5 分钟内任何对裸 `GET /api/admin/channels` 的调用都会读到分组格式而非期望的扁平列表，调用方解析失败；反之亦然。一旦触发 100% 复现。
- **修复：** 两者使用不同 key（如 `cache:admin:channels:flat` / `cache:admin:channels:grouped`），失效逻辑同时清理两者。

### H13 | SSE 解析器跨 chunk 丢帧 — 流式响应静默缺内容，末帧丢失时该请求零计费

- **文件：** `src/lib/engine/sse-parser.ts:30-31`（`currentEvent` / `dataLines` 的声明位置）
- **类别：** correctness / billing
- **缺陷：** `buffer` 正确地声明在闭包里跨 chunk 保留，但 `currentEvent` 和 `dataLines` 声明在 `transform()` **内部**，每个 chunk 调用都会重置。若某个 chunk 以一条**完整的 `data:` 行**结尾、而其终止空行落在下一个 chunk，则本次积累的 `dataLines` 在 `transform` 返回时被直接丢弃，该事件永远不会 `enqueue`——无任何报错。
- **可运行复现（实测输出）：**

  ```
  [A] 每帧独立到达
    chunks = ["data: {\"i\":1}\n\n", "data: {\"i\":2}\n\n"]
    解析出 = ["{\"i\":1}", "{\"i\":2}"]              ← 正常

  [B] 边界落在帧内两个换行之间
    chunks = ["data: {\"i\":1}\n", "\ndata: {\"i\":2}\n\n"]
    解析出 = ["{\"i\":2}"]                          ← 丢了第 1 帧

  [C] 多帧合并，chunk 以完整 data 行结尾
    chunks = ["data: {\"i\":1}\n\ndata: {\"i\":2}\n", "\ndata: {\"i\":3}\n\n"]
    解析出 = ["{\"i\":1}", "{\"i\":3}"]              ← 丢了第 2 帧
  ```

- **影响面：** 该 parser 位于流式聊天主路径上（`openai-compat.ts:96`，`chatCompletionsStream` 唯一实现），所有 `stream:true` 的 `/v1/chat/completions` 与 MCP chat 都经过它。后果有两层：
  1. **内容静默丢失** — 用户收到的回答缺一段 token，无任何错误提示。
  2. **该次调用零计费** — 多数 OpenAI 兼容服务商把 `usage` 放在 `[DONE]` 之前的**最后一个 data 帧**。该帧一旦被丢，`route.ts:365` 的 `lastUsage` 保持 null → `calculateTokenCost(null, …)` 直接返回 `{costUsd:0, sellUsd:0}`（`post-process.ts:661-663`）→ `shouldDeduct=false` → 不扣费、不写 Transaction。
- **触发概率：** 取决于 TCP/chunked 分片恰好落在帧内两个 `\n` 之间或一帧末尾。单次请求概率不高，但分片边界由网络决定、每个流有成百上千次，在生产流量下会稳定地持续发生。
- **修复：** 把 `currentEvent` 与 `dataLines` 提到闭包里（与 `buffer` 同级），并在 `flush()` 中补发残留的 `dataLines`。这是一处几行的改动，建议配单元测试覆盖上述三个分片场景。

---

## Medium

| 编号 | 位置 | 问题 | 影响 |
|---|---|---|---|
| M1 | `src/app/api/v1/templates/run/route.ts:157`、`actions/run/route.ts:124` | SSE 错误分支用 `!controller.desiredSize` 判"已关闭"，但背压时该值同样为 0，两种状态无法区分 | 客户端消费慢时若下游抛错，既不发 error 事件也不 close，连接挂起到超时 |
| M2 | `src/lib/api/rate-limit.ts:352-364` | `checkRateLimit` 内部对 project/user/key 三层都自增计数，但只把 project 层的 key/member 返回给调用方 | 所有下游失败场景的 `rollbackRateLimit` 只回滚 project 层，user/key 层计数永久占用到自然过期，失败请求也消耗配额 |
| M3 | `src/instrumentation.ts:80-90` + `src/lib/health/scheduler.ts:322-328` vs `src/lib/maintenance/archive-cleanup.ts:29-40` | health_checks 存在两套并行清理任务：7 天（旧，instrumentation 里的裸 setInterval）与 30 天（新，maintenance scheduler），前者总是先删 | 文档声明 30 天留存，实际只有 7 天；排障时查不到 8-29 天前的健康检查历史 |
| M4 | `src/app/api/auth/register/route.ts:146` | 注册响应体直接返回明文 `verificationToken`，且仓库内无任何邮件发送实现 | 无需拥有邮箱即可自助把 `emailVerified` 置 true，邮箱验证机制被架空 |
| M5 | `src/app/api/auth/register/route.ts:68-71` | 邮箱已注册返回 409，与成功的 201 明确区分（login 侧做了常数时间防枚举，register 未做） | 可批量探测任意邮箱是否为平台用户 |
| M6 | `src/app/(auth)/login/page.tsx:134` | JWT 明文写入 `localStorage`，而控制台所有 API 请求实际用的是这份副本（`jwt-middleware` 只读 `Authorization` 头不读 cookie） | cookie 侧已正确 httpOnly/secure/sameSite，但被并行的 localStorage 副本绕过，任意 XSS 即可窃取完整会话 |
| M7 | `src/app/api/auth/change-password/route.ts:8-30` | 未接入 `checkAuthRateLimit`（login/register 都接了），`bcrypt.compare(oldPassword, ...)` 可无限尝试 | 持有被盗 JWT 的攻击者可对该会话无限猜测旧密码 |
| M8 | `src/app/api/notifications/test-webhook/route.ts:11-68` | 仅 JWT 鉴权 + SSRF 校验，无任何速率限制，middleware matcher 也不覆盖该路径 | 可被滥用为对任意公网 HTTPS 目标的请求放大器，网关出口 IP 有被拉黑风险 |
| M9 | `src/app/api/admin/logs/search/route.ts:18,38-50` | 对 `call_logs` 用前导通配符 `ILIKE '%q%'` 且无 `createdAt` 范围限制，schema 内无 pg_trgm/GIN 索引 | 表增长到百万行后全表顺序扫描，`connection_limit=5` 的连接池易被长查询耗尽 |
| M10 | `src/lib/mcp/tools/chat.ts:502-519`、`generate-image.ts:319-334` | 未接收/透传 MCP SDK tool handler 的 `extra.signal`，`processChatResult` 拿不到 `clientSignal` | MCP 客户端中途取消后仍按 SUCCESS 扣费；同场景走 REST 不扣费 |
| M11 | `.auto-memory/environment.md:31-32` | git-tracked 文件中存放生产管理员账号明文密码 `Codex@2026!` 及 API Key 前缀 | 4 月 CRIT-5 的残留：源码已清理但共享记忆文件仍是明文，任何有仓库读权限者可直接登录生产管理后台 |
| M12 | `src/lib/engine/openai-compat.ts:372-373` | 每次请求都 `new ProxyAgent(proxyUrl)`，agent 从不复用也从不 `destroy()` | 配了 `proxyUrl` 或 `PROXY_URL_PRIMARY` 的服务商，每次调用都新建连接池 + 重做 TLS 握手，keep-alive 完全失效，socket 直到 GC 才回收 |
| M13 | `src/lib/engine/openai-compat.ts:314,341` | 非流式与流式共用 `3_600_000`ms（1 小时）超时 | 上游挂起时，非流式请求会占住客户端连接与内存长达一小时才超时；流式场景 1 小时合理，非流式应远小于此 |
| M14 | `src/lib/engine/adapters/volcengine.ts:25-44` | 图片生成对 3 个尺寸 × 2 个端点循环重试，不区分错误是否确定性；且 `chatError` 被吞、最终只抛最后一个 `fallbackError` | 401/内容策略这类重试无意义的错误也会打满 6 次上游调用；排障时看不到 chat 路径的原始失败原因 |

---

## 依赖漏洞（npm audit）

`npm audit` 报告 **34 个漏洞：17 high / 13 moderate / 4 low，0 critical**。

运行时相关的 high 项：`next`（当前 14.2.35）、`undici`（7.25.0）、`@grpc/grpc-js`、`protobufjs`、`ws`、`form-data`、`js-yaml`、`ip-address`、`hono`。其余（`vite`、`postcss`、`eslint-config-next`、`glob`、`tmp`、`brace-expansion`）主要在构建/开发链路。

`npm audit` 报告全部 `fixAvailable: true`。建议单独开一个依赖升级批次，先升 `next` 与 `undici`（直面公网请求的两个组件），升级后跑完整 E2E 回归。

---

## 修复优先级建议

**P0（24 小时内，建议单独开 hotfix 批次）**
1. C1 支付 webhook 验签 — 在验签代码上线前，先用 nginx IP 白名单临时止血
2. C6 移除 `resolveEngine` 的模型名 fallback（改动极小，收益最大）+ 排查生产已发生的零计费调用
3. C2 支付回调幂等 CAS
4. C3 计费回滚白嫖通道
5. C5 MCP `create_api_key` 权限继承

**P1（本周）**
6. C4 模板测试通道补齐余额/限流
7. H13 SSE 解析器丢帧（几行改动 + 单测，同时止住内容丢失与零计费）
8. H1 XFF 信任链
9. H2 embeddings 权限门
10. H9 suspend / 改密的 JWT 失效
11. M11 生产管理员密码轮换 + 从 git 移除

**P2（下个批次）**
12. H3 / H4 / H5 健康检查与同步的三条护栏遗漏（都是"新护栏没覆盖到旧路径"的同一类问题）
13. H6 fanout 分支上限
14. H7 / H8 admin 接口的回显与校验
15. 其余 High + Medium

**建议一并做的生产数据排查（不改代码，先摸清损失面）：**

```sql
-- C6 / H13 共同的指纹：成功调用但卖价为 0，而成本 > 0
SELECT "modelName", COUNT(*), SUM("costPrice")
FROM call_logs
WHERE status = 'SUCCESS' AND "sellPrice" = 0 AND "costPrice" > 0
GROUP BY "modelName" ORDER BY 2 DESC;

-- C1 / C2 的指纹：同一 paymentOrderId 出现多条 RECHARGE，或充值无对应真实支付
SELECT "paymentOrderId", COUNT(*) FROM transactions
WHERE type = 'RECHARGE' GROUP BY 1 HAVING COUNT(*) > 1;
```

---

## 一个跨条目的共性观察

本次 6 个 Critical 里有 4 个（C3、C4、C5、C6）、13 个 High 里有 4 个（H2、H3、H4、H8）属于**同一种失效模式：某个安全/计费护栏被正确实现在主路径上，但存在一条平行的次要路径没有接入同一护栏。**

- `routeByAlias` 承载定价、停用开关与 modality 门禁，`routeByModelName` 这条 fallback 一样都没有（C6）
- `planChannelCheck` 有成本护栏，手动触发的 `checkChannel` 没有（H4）
- PATCH channel 有价格校验，POST channel 没有（H8）
- `/v1/templates/run` 有四道门，`/api/templates/:id/test` 一道都没有（C4）
- `detectEndpoint` 覆盖了 chat/image，漏了 embeddings（H2）——而且这是第二次，上次漏的是 `/images/edits`
- `executeCheckWithRetry` 的成功分支有目录闸门，`handleFailure` 的 transient 分支没有（H3）
- REST 创建 Key 走 JWT（创建者本就是所有者），MCP 创建 Key 没有对应的权限继承（C5）

值得注意的是，这些平行路径大多是**为便利而生的兜底**——`routeByModelName` 的注释写着"避免测试/脚本直接传模型名时触发 404"，`checkChannel` 是为管理员手动按钮准备的简化版。它们在被写下时都不承载生产流量，护栏因此显得多余；但它们最终都暴露在了用户可达的面上，而护栏没有跟着走。

建议在修复这些具体条目之外，考虑一个结构性改进：把"余额检查 + 限流 + 权限门"收敛成一个所有计费入口都必须穿过的公共前置函数（而不是各路由自行拼装），让新增入口默认继承全部护栏、需要显式声明才能豁免。否则每加一个新端点/新入口，都会以相同方式复发。

---

*本报告仅产出结论，不修改源码、不改状态机文件。修复由 Planner 评估后分发给 Generator 走状态机流程。*
