# BL-INFRA-RESILIENCE Spec

**批次：** BL-INFRA-RESILIENCE（P1-data 第 2 批）
**负责人：** Planner = Kimi / Generator = 默认映射 / Evaluator = Reviewer
**创建：** 2026-04-19
**工时：** 1.5 day
**源：** `docs/code-review/batch-02-engine.md` H-21/22/26 + `batch-04-infra.md` H-4/23/24 + H-5/H-6

## 背景

Code Review 批次 2（引擎）+ 批次 4（基础设施）发现 7 个后端韧性问题，合并为本批次。所有 file:line 已核实（2026-04-19）。

### H-21 — `fetchWithProxy` 流式超时失效（`[已核实 openai-compat.ts:213-263]`）

```ts
// src/lib/engine/openai-compat.ts:213-263
protected async fetchWithProxy(url, init, route): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 60_000);
  try {
    response = await fetch(url, { ...init, signal: controller.signal });
    // ...
    return response;
  } finally {
    clearTimeout(timeoutId);  // ← 问题：流式响应 return 后 timeout 就清了
  }
}
```

流式 `chatCompletionsStream` 返回 Response 后 body 还在流式读取，但 timeout 已被 `clearTimeout`。上游挂起的情况下没有超时保护。

### H-22 — chat completions stream catch 未 reader.cancel()（`[已核实 chat/completions/route.ts:307]`）

`src/app/api/v1/chat/completions/route.ts:307` 有 `await reader.read()`，但某些 catch 分支未 `reader.cancel()`，导致上游 TCP 连接挂起泄漏。

### H-26 — `rpmCheck` TOCTOU（`[已核实 rate-limit.ts:174-201]`）

```ts
// src/lib/api/rate-limit.ts:174-201
const pipe = redis.pipeline();
pipe.zremrangebyscore(redisKey, 0, windowStart);
pipe.zcard(redisKey);              // 读 count，不含自己
pipe.zadd(redisKey, now, member);  // 后写
pipe.expire(redisKey, 120);
// currentCount 是 zadd 之前的读数
if (currentCount >= limit) {
  await redis.zrem(redisKey, member);  // 过限撤销
  return { ok: false };
}
```

并发下 pipeline 可交错（不是 MULTI 事务），count 反映旧状态。高并发时可超限放行。

### H-23 — dispatcher webhook fetch 无 AbortController（`[已核实 dispatcher.ts:116]`）

```ts
// src/lib/notifications/dispatcher.ts:116
const res = await deps.fetchImpl(job.url, { ... });  // 无 signal
```

### H-24 — health alert webhook 无超时（`[已核实 health/alert.ts:23]`）

```ts
// src/lib/health/alert.ts:23
await fetch(webhookUrl, { ... });  // 无 signal
```

### H-4 — model-sync reconcile N+1（`[已核实 model-sync.ts:171]`）

`reconcile()` 循环对每个 provider 的每个 model 发独立 upsert → 每日 400-600 次 DB 往返 × 11 家。

### H-5 — list-actions `include: { versions }` 无 take（`[Generator 核实 list-actions.ts 具体行号]`）

当前有 `take: pageSize` 但疑似是 template 层，versions 层未限制（单 action 有 100+ 版本时拉全量）。

### H-6 — post-process Project 查询（`[Generator 核实 post-process.ts 行号]`）

每次成功调用多一次 `prisma.project.findUnique` 查询（balance alert 检查需要 project 信息）。

## 目标

1. 统一外部 fetch 入口，强制 timeout + AbortController
2. 流式超时真正生效（首字节到达后 body 读取仍受 timeout 控制）
3. Stream reader catch 路径必 cancel
4. rpmCheck 原子化（Lua 或 ZADD 后 ZCARD 模式）
5. model-sync reconcile N+1 → batch upsert
6. list-actions versions take 限制
7. post-process Project 查询去重（请求级缓存）

## 改动范围

### F-IR-01：fetchWithTimeout 统一封装 + 3 处接入

**文件：** 新建 `src/lib/infra/fetch-with-timeout.ts` + 改 `src/lib/engine/openai-compat.ts` + `src/lib/notifications/dispatcher.ts` + `src/lib/health/alert.ts`

**新 helper：**

```ts
// src/lib/infra/fetch-with-timeout.ts
export interface FetchWithTimeoutOptions extends RequestInit {
  timeoutMs?: number;  // default 30_000
  onBodyTimeout?: () => void;  // 可选：body 读取超时回调
}

export async function fetchWithTimeout(
  url: string,
  options: FetchWithTimeoutOptions = {},
): Promise<Response> {
  const { timeoutMs = 30_000, onBodyTimeout, ...init } = options;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    // 注意：调用方决定何时 clearTimeout（流式场景在 body 读完后）
    // 由调用方自己管理 clearTimeout，避免流式被提前清除
    // 或返回 { response, clearTimeout } 让调用方显式清
  }
}

// 推荐 API：
export async function fetchWithTimeout(url, options): Promise<{
  response: Response;
  clearTimeout: () => void;
}>
```

实际设计决策（Generator 选择）：
- **方案 A：** helper 返回 `{ response, clearTimeout }`，调用方在流读完后显式 clear（流式场景保留 timeout）
- **方案 B：** 流式场景专用 `fetchWithTimeoutStream` 接收 `signal` 外部传入，不自动清理

**openai-compat fetchWithProxy 改动：**

- 非流式（chatCompletions / imageGenerations）：当前逻辑 OK（return 前 clear，可正常）
- 流式（chatCompletionsStream）：`timeoutId` 不得在 `finally` 清理，传到调用方（或 chat route stream handler）在 reader 结束时 clear

**dispatcher + health/alert 改动：**

替换 `fetch(url, {...})` 为 `const { response } = await fetchWithTimeout(url, { ...timeoutMs: 10_000 })`。

**单测：** fetchWithTimeout 正常返回 / timeout 触发 AbortError / 流式外部 signal 协议。

### F-IR-02：chat completions stream reader.cancel 补齐 + rpmCheck 原子化

**文件：** `src/app/api/v1/chat/completions/route.ts` + `src/lib/api/rate-limit.ts:174-201`

**stream reader catch 补 cancel：**

审计 stream 所有 catch 分支（包括 withFailover 错误、JSON 解析错误、客户端断开），每条都确保 `await reader.cancel()` 再抛。

**rpmCheck Lua 原子化：**

```ts
// 抽 Lua script（KEYS[1]=redisKey, ARGV[1]=windowStart, ARGV[2]=member, ARGV[3]=now, ARGV[4]=limit）
const RPMCHECK_LUA = `
redis.call('ZREMRANGEBYSCORE', KEYS[1], 0, ARGV[1])
local count = redis.call('ZCARD', KEYS[1])
if count >= tonumber(ARGV[4]) then
  return {0, count}
end
redis.call('ZADD', KEYS[1], ARGV[3], ARGV[2])
redis.call('EXPIRE', KEYS[1], 120)
return {1, count + 1}
`;
// redis.eval(RPMCHECK_LUA, 1, redisKey, windowStart, member, now, limit)
```

Lua script 在 Redis 内原子执行，消除 TOCTOU。

**单测：** rpmCheck 并发 10 req 同 key（limit=5）→ 恰 5 个 ok，5 个 over。

### F-IR-03：N+1 修复三处（reconcile / list-actions versions / post-process Project）

**文件：** `src/lib/sync/model-sync.ts` + `src/lib/mcp/tools/list-actions.ts` + `src/lib/api/post-process.ts`

**model-sync reconcile N+1：**

当前每 model 单独 upsert → 改 batch upsert：
```ts
// 原：for (const m of newModels) await prisma.model.upsert(...)
// 改：
const existing = await prisma.model.findMany({ where: { providerId, name: { in: newModels.map(m => m.name) } } });
const existingNames = new Set(existing.map(m => m.name));
const toCreate = newModels.filter(m => !existingNames.has(m.name));
const toUpdate = newModels.filter(m => existingNames.has(m.name));
await prisma.$transaction([
  toCreate.length ? prisma.model.createMany({ data: toCreate.map(m => ({ ...m, providerId })), skipDuplicates: true }) : noop,
  ...toUpdate.map(m => prisma.model.update({ where: { providerId_name: { providerId, name: m.name } }, data: {...} })),
]);
```

单次 provider 从 50+ 往返降到 2-3 次。

**list-actions versions take：**

Generator 核实 `src/lib/mcp/tools/list-actions.ts` 的 include.versions 语句，加 `take: 10`（最近 10 版本），配合 `orderBy: { versionNumber: 'desc' }`。

**post-process Project 查询缓存：**

Generator 核实 post-process.ts 的 Project 查询位置（Balance alert 检查）。改用请求级 WeakMap 缓存：同一请求上下文中 Project 只查一次。

### F-IR-04：全量验收（Evaluator）

**timeout / AbortController（4 项）：**
1. fetchWithTimeout helper 单测 PASS（正常返回 / timeout 触发 AbortError）
2. dispatcher webhook hang 模拟 → 10s timeout 触发 AbortError（可用 mock server 延迟 20s 测试）
3. health alert webhook 同上
4. openai-compat stream 场景：mock 上游 headers 到达后 body 挂起 60s → 连接被 abort（通过修改的 fetchWithProxy 验证）

**stream reader cancel（2 项）：**
5. chat completions stream 中途抛错 → 上游 TCP 连接被 cancel（netstat 观察或单测 mock）
6. withFailover 触发时前一个 candidate 的 reader 被 cancel

**rpmCheck 原子（2 项）：**
7. 单测并发 10 req 同 key limit=5 → 恰 5 个 ok，5 个 over（Lua 原子生效）
8. 生产 redis eval 脚本正常运行（Evaluator 生产 smoke）

**N+1 修复（3 项）：**
9. model-sync reconcile 单次 provider 同步日志 DB 往返数 < 10（原 50+）
10. list-actions 单 action 有 100+ 版本时仅返回最近 10 个 versions
11. post-process 同请求内 Project 查询 = 1 次（而非每 success 一次）

**构建 + 单测（3 项）：**
12. npm run build 通过
13. npx tsc --noEmit 通过
14. npx vitest run 全过（至少 +4 单测：fetchWithTimeout / rpmCheck Lua / reconcile batch / list-actions take）

**生成 signoff 报告。**

## 非目标

- 不重构整个 engine 层（仅 timeout 相关点）
- 不做 streaming 断线恢复（仍是"Once streaming begins we're committed"）
- 不做 rate limit 升级（仅 rpmCheck 原子化，不动 tpm/burst/spend）
- 不重写 model-sync 全流程（仅 reconcile batch 化）
- 不做 call_logs 查询缓存（单请求级就够）

## Risks

| 风险 | 缓解 |
|---|---|
| fetchWithTimeout 流式接口设计复杂 | 采用方案 A（返回 { response, clearTimeout }），调用方显式管理；新单测覆盖边界 |
| Lua script 在生产 Redis 首次执行加载时延 | EVALSHA + SCRIPT LOAD 优化（或直接 EVAL，Redis 自动缓存 script hash） |
| reconcile batch 导致存量 drift 修复不及时 | createMany 走 skipDuplicates；update 保持逐条（数据异常比性能优先） |
| list-actions take:10 截断用户需求 | 若用户要看全版本历史，另有 `get_action_detail` 走 versions 完整查询；take:10 仅列表优化 |
| post-process WeakMap 缓存内存泄漏 | WeakMap key 是请求 context 对象，请求结束自动 GC |

## 部署

- 纯代码改动 + 1 个新模块（fetch-with-timeout）+ rpmCheck Lua
- 部署：git pull + npm ci + npm run build + pm2 restart
- 回滚：revert commit

## 验收标准

- [ ] F-IR-04 的 14 项全 PASS
- [ ] 新增单测 ≥ 4 条，vitest 全过
- [ ] build + tsc 通过
- [ ] signoff 报告归档
