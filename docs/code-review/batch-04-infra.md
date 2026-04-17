# Code Review — Batch 04: Infrastructure Layer

**Date:** 2026-04-17  
**Reviewer:** Claude (Sonnet 4.6)  
**Scope:**  
- `src/lib/health/**/*.ts` (health checker + scheduler)  
- `src/lib/sync/**/*.ts` (model sync, adapters, doc-enricher)  
- `src/lib/cache/models-cache.ts`  
- `src/lib/billing/payment.ts` + `billing/scheduler.ts`  
- `src/lib/notifications/dispatcher.ts` + `triggers.ts` + `defaults.ts`  
- `src/lib/action/runner.ts` + `action/inject.ts`  
- `src/lib/template/sequential.ts` + `fanout.ts` + `test-runner.ts`  
- `src/middleware.ts` + `src/instrumentation.ts`

---

## CRITICAL

### [CRITICAL-1] Scheduler 无分布式锁 — 多进程竞态

**File:** `src/lib/health/scheduler.ts:35-48` / `src/lib/sync/model-sync.ts:44-46` / `src/instrumentation.ts:14-17`

**Issue:**  
`syncInProgress` 和 `schedulerTimer` 都是进程内模块变量。`instrumentation.ts` 通过 `NODE_APP_INSTANCE === "0"` 来跳过 worker 1+，但这只适用于 PM2 cluster 模式。若部署方式变为 Docker 多副本（无 `NODE_APP_INSTANCE` 环境变量），**所有实例的 `NODE_APP_INSTANCE` 均为 `undefined`**，`isWorkerZero` 恒为 `true`，导致所有副本都启动调度器，并发执行：

- 健康检查同一通道被多个节点并发探测，同一批次结果写入 DB 多份，`consecutivePermFailures` 批次计数翻倍，可能触发误判 DISABLED。
- `runModelSync` 的 `syncInProgress` 锁仅进程内有效，多副本同时执行 reconcile，`channel.upsert` / `channel.updateMany` 并发冲突，可能出现脏数据或下架不该下架的通道。

```typescript
// src/instrumentation.ts:16
const isWorkerZero =
  process.env.NODE_APP_INSTANCE === "0" || process.env.NODE_APP_INSTANCE === undefined;
//                                          ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
// Docker 多副本下 NODE_APP_INSTANCE 均未定义 → 所有副本都执行
```

**Fix:** 在 Redis 中用 `SET NX EX` 实现分布式单实例调度锁（选主模式）：

```typescript
const redis = getRedis();
if (redis) {
  const acquired = await redis.set("scheduler:leader", "1", "NX", "EX", 70);
  if (!acquired) return; // 本轮跳过
}
```

---

## HIGH

### [HIGH-1] billing/scheduler.ts — checkBalanceAlerts 无去重，每小时重复告警

**File:** `src/lib/billing/scheduler.ts:72-119`

**Issue:**  
`checkBalanceAlerts` 每小时扫描所有余额低于阈值的项目并推送 webhook。没有任何去重机制（无 Redis NX key，无告警历史表）。一旦余额持续低于阈值，每小时发送一次告警，直到充值为止。这与 `triggers.ts` 中 `checkAndSendBalanceLowAlert` 的 24 小时 Redis NX 去重形成功能重叠和行为不一致：同一余额低报可能一天被发送多次（billing/scheduler 每小时 + notifications/triggers 首次扣费时）。

**Fix:** 在 `checkBalanceAlerts` 中复用同样的 Redis NX 去重逻辑（key: `alert:balance_low:{userId}:{thresholdMicro}`, EX 86400），或统一走 `sendNotification` 路径而非直接调 webhook。

---

### [HIGH-2] model-sync reconcile — N+1 查询

**File:** `src/lib/sync/model-sync.ts:196-229`

**Issue:**  
`reconcile` 函数在一个 `for...of` 循环内对每个 `remoteModel` 分别执行：
1. `prisma.model.upsert` (1 次查询)
2. `prisma.channel.findUnique` (1 次查询)
3. `prisma.channel.update` 或 `prisma.channel.create` (1 次查询)

加上前面的 `resolveCanonicalName`（目前是纯内存操作），一个服务商如果有 200 个模型，reconcile 会产生 400-600 次 DB 往返。每日 04:00 11 家服务商并行同步时，DB 连接池压力明显。

**Fix:** 先批量拉取现有 channels 和 models（已有 `existingChannels`），利用 Map 做内存查找，将 upsert 拆成先查后批量 `createMany` + `updateMany`，或者至少减少 `findUnique` 的单条查询，改用已拉取的 `existingChannels` Map。

---

### [HIGH-3] processPaymentCallback — 幂等窗口竞态

**File:** `src/lib/billing/payment.ts:20-98`

**Issue:**  
当前幂等逻辑：先读订单状态，若 `PENDING` 则进事务处理。两个并发回调在几乎同时到达时（支付宝/微信有重试机制），都可能读到 `PENDING` 状态，然后都进入 `$transaction`，导致**余额被充值两次**。事务内没有对 `rechargeOrder` 加 `SELECT FOR UPDATE`，无法阻止并发进入。

```typescript
// payment.ts:22-38 — 非原子的 check-then-act
const order = await prisma.rechargeOrder.findUnique({ where: { paymentOrderId } });
if (order.status !== "PENDING") return { success: true, alreadyProcessed: true, ... };
// ← 此处两个并发请求都通过了 PENDING 检查
await prisma.$transaction(async (tx) => {
  // 两个事务都会执行余额增加
```

**Fix:** 在事务内用 `updateMany` 做条件更新（原子 CAS），只有成功更新到 `COMPLETED` 才继续执行余额增加：

```typescript
await prisma.$transaction(async (tx) => {
  const updated = await tx.rechargeOrder.updateMany({
    where: { id: order.id, status: "PENDING" }, // atomic CAS
    data: { status: "COMPLETED", paidAt: new Date(), paymentRaw: paymentRaw as object },
  });
  if (updated.count === 0) return; // 已被其他请求处理，幂等跳出
  // ...余额增加和 Transaction 写入
});
```

---

### [HIGH-4] template/test-runner.ts — waitForCallLog 轮询竞态 + 超时未报错

**File:** `src/lib/template/test-runner.ts:292-308`

**Issue:**  
`waitForCallLog` 轮询最多 30 次（100ms 间隔，约 3 秒），若 CallLog 未写入（例如 `processChatResult` 异步写入失败），返回 `null`。此时 `cost` 字段取值为 `"0"`，不反映真实扣费，用户看到错误的成本显示。更严重的是：即使 `callLog` 为 null，后续 `totalCostUsd` 不会增加，`totalTokens` 也不准确，但 `steps` 中 `status` 仍标记为 `"success"`，与实际情况不符。

**Fix:** 在 `waitForCallLog` 返回 `null` 时，至少打印 WARN 日志，并在 step 结果中标注 `cost_unavailable: true`，避免 "成功但 cost=0" 的误导。

---

### [HIGH-5] notifications/dispatcher.ts — webhook 调用无超时

**File:** `src/lib/notifications/dispatcher.ts:118-133`

**Issue:**  
`dispatchWebhook` 中的 `deps.fetchImpl(job.url, ...)` 没有设置 `AbortController` 超时。若用户配置的 webhook URL 挂起（慢响应），后台协程会永久阻塞等待，积累大量悬挂 Promise，最终可能导致内存泄漏或 Node.js 事件循环拥塞。重试最多 3 次，每次无超时，最坏情况单个 webhook 事件可以长时间占用协程。

**Fix:** 为每次 `fetchImpl` 添加超时（建议 10 秒）：

```typescript
const ctrl = new AbortController();
const timeoutId = setTimeout(() => ctrl.abort(), 10_000);
try {
  const res = await deps.fetchImpl(job.url, { ..., signal: ctrl.signal });
} finally {
  clearTimeout(timeoutId);
}
```

---

### [HIGH-6] middleware.ts — JWT 未做签名验证（Edge Runtime）

**File:** `src/middleware.ts:4-13`

**Issue:**  
`decodeJwtPayload` 只做 base64 解码，**不验证 JWT 签名**。注释表明这是 Edge Runtime 兼容的权衡，但这意味着任何人可以伪造 `{ userId, role: "ADMIN", exp: 9999999999 }` 的 JWT payload 来绕过 `/admin/*` 路由的中间件保护。中间件只做重定向，实际数据保护依赖 API 路由内的 `verifyApiKey` / session 验证，但 UI 层的 admin 路由（Server Components 渲染的管理页面）如果自身没有二次鉴权，存在越权访问风险。

**Fix:** 在具体 admin API handler 和 Server Component 数据获取层追加 `role === "ADMIN"` 的 DB 查询验证（不信任 JWT payload），或在 middleware 使用 `jose` 库（Edge 兼容）做 signature verify：

```typescript
import { jwtVerify } from "jose";
const secret = new TextEncoder().encode(process.env.NEXTAUTH_SECRET);
await jwtVerify(token, secret);
```

---

## MEDIUM

### [MEDIUM-1] health/scheduler.ts — 批次时间分组逻辑不健壮

**File:** `src/lib/health/scheduler.ts:418-433`

**Issue:**  
`handleFailure` 用"同秒内的 HealthCheck 记录属于同一批次"来分组。若健康检查执行时间跨越秒边界（在 23:59:59.999 开始，23:59:59 完成但 00:00:00 写入），同一批次的多条记录会被分到不同秒 bucket，导致批次计数比实际多，可能提前触发 DISABLE。

**Fix:** 在 `writeHealthRecords` 中使用同一个 `new Date()` 时间戳写入批次内所有记录，或用 `checkBatchId`（UUID）字段标记同批次检查。

---

### [MEDIUM-2] health/alert.ts — webhook 调用无超时、无重试

**File:** `src/lib/health/alert.ts:18-31`

**Issue:**  
`sendAlert` 调用 `fetch(webhookUrl, ...)` 无超时配置。若 webhook 服务不可用，这个 `await fetch` 可能阻塞 `updateChannelStatus` 中调用链路数十秒（Node.js 默认无请求超时），进而阻塞健康检查循环的当前项目。

---

### [MEDIUM-3] sync/doc-enricher.ts — 外部 Jina Reader 调用无速率限制

**File:** `src/lib/sync/doc-enricher.ts:136-161`

**Issue:**  
`fetchDocPage` 通过 `https://r.jina.ai/` 抓取服务商文档页面，没有速率限制也没有熔断。每日同步时多个服务商并行（`Promise.allSettled`），每个服务商可能有多个 `docUrls`，全部同时发出请求，可能触发 Jina Reader 的频率限制或被 IP 封锁，导致所有服务商的 AI 丰富化层静默失败。

---

### [MEDIUM-4] action/runner.ts — runAction / runActionNonStream 代码重复

**File:** `src/lib/action/runner.ts:46-207` vs `213-307`

**Issue:**  
`runAction`（streaming）和 `runActionNonStream`（non-streaming）前半段（步骤 1-3：加载 action/version、注入变量、resolve engine）完全相同，约 40 行重复。将来若需修改权限检查或增加参数验证，需要同步修改两处，存在维护遗漏风险。

---

### [MEDIUM-5] billing/scheduler.ts — checkBalanceAlerts 无分页，全表扫描

**File:** `src/lib/billing/scheduler.ts:72-82`

**Issue:**  
`prisma.project.findMany({ where: { alertThreshold: { not: null } } })` 不带 LIMIT，若项目数量增长到数千，每小时执行一次全表 JOIN 查询（`project + user`），存在性能风险。

---

### [MEDIUM-6] template/fanout.ts — SPLITTER 输出 parse 失败时 SSE 已有部分输出

**File:** `src/lib/template/fanout.ts:91-103`

**Issue:**  
SPLITTER 输出解析失败时，代码先 `write(error SSE)` 再 `throw InjectionError`。调用方（HTTP handler）在 throw 后关闭连接，但此时 SSE 流中已经写入了 `step_start` 和部分 `content` 事件，客户端可能收到不完整的流然后被强制断开，无法区分"正常结束"和"解析失败"。建议在 error SSE 事件中增加 `fatal: true` 字段，让客户端知道流不会继续。

---

## LOW

### [LOW-1] health/checker.ts — QUALITY 检查标准过低

**File:** `src/lib/health/checker.ts:281-289`

**Issue:**  
L3 QUALITY 检查只要求 `content.trim().length >= 1`，即模型只要返回任意一个非空字符就通过。这无法检测到"模型返回乱码/单个标点/重复字符"等质量问题，与"质量检查"的设计意图不符。

---

### [LOW-2] sync/model-sync.ts — syncInProgress 在异常时的重置依赖 finally

**File:** `src/lib/sync/model-sync.ts:396-627`

**Issue:**  
`syncInProgress = false` 在 `finally` 中重置，设计正确。但若 `prisma.provider.findMany` 本身抛出异常（数据库连接失败），`syncInProgress` 会在 `finally` 前已抛出，但因为 `syncInProgress = true` 已设置，下一次调度会跳过同步，需等到下一次重试（如次日 04:00）。建议在 catch 中打印更具体的错误并考虑缩短下次重试时间。

---

### [LOW-3] billing/scheduler.ts — closeExpiredOrders 依赖 expiresAt，但订单创建时是否保证该字段存在未验证

**File:** `src/lib/billing/scheduler.ts:52-65`

**Issue:**  
`closeExpiredOrders` 查询条件是 `expiresAt: { lt: new Date() }`，但没有检查 `expiresAt` 是否为 null，若创建订单时未设置该字段，这些订单会永远保持 PENDING 状态。建议增加 `expiresAt: { not: null }` 条件或 DB 约束。

---

### [LOW-4] action/inject.ts — {{variable}} 模板注入不支持嵌套或转义

**File:** `src/lib/action/inject.ts:57-62`

**Issue:**  
当前实现用 `/\{\{(\w+)\}\}/g` 替换，不支持字面量 `{{` 的转义写法（如用户想在 prompt 中输出 `{{example}}` 文本而不被替换）。这是一个已知限制，但没有文档说明，可能导致用户困惑。

---

### [LOW-5] sync/doc-enricher.ts — callInternalAI 硬编码使用 deepseek-chat

**File:** `src/lib/sync/doc-enricher.ts:67-83`

**Issue:**  
`callInternalAI` 硬编码 `model: "deepseek-chat"`。若 DeepSeek Provider 未配置或 API Key 过期，整个 Layer 2 会静默失败（已有 try/catch 处理），但运营可能不知道哪些模型的价格数据来自 AI 提取、哪些是空的。建议在同步结果中明确标注 Layer 2 失败原因。

---

## Review Summary

| Severity | Count | Status  |
|----------|-------|---------|
| CRITICAL | 1     | block   |
| HIGH     | 6     | warn    |
| MEDIUM   | 6     | info    |
| LOW      | 5     | note    |

**Verdict: BLOCK — CRITICAL-1（多副本调度器重入）+ HIGH-3（支付幂等竞态）必须在合并/部署前修复。**

---

## 优先修复顺序

1. **CRITICAL-1** — 分布式调度锁（Redis SET NX），防止 Docker 多副本并发健康检查/同步
2. **HIGH-3** — 支付回调事务内 CAS，防止余额双充
3. **HIGH-6** — middleware JWT 签名验证（或确认 admin Server Components 有二次鉴权）
4. **HIGH-1** — billing 余额告警去重，与 notifications/triggers 对齐
5. **HIGH-5** — dispatcher webhook 超时，防止协程泄漏
6. **HIGH-2** — reconcile N+1 优化（可延迟，但每日同步时 DB 压力真实存在）
