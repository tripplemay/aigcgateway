# ROUTING-RESILIENCE-V2 Spec

**批次：** ROUTING-RESILIENCE-V2
**负责人：** Planner = Kimi / Generator = Kimi / Evaluator = Reviewer
**创建：** 2026-04-17

## 背景

2026-04-17 生产故障：用户调用 `glm-4.7-flash` 模板，zhipu 通道被智谱平台限流，返回 429 + "您的账户已达到速率限制"，但 alias 挂的第二候选 `openrouter/z-ai/glm-4.7-flash`（ACTIVE + health PASS + enabled）从未被调用，用户直接看到限流错误。

生产数据库验证（2026-04-17）：
- alias `glm-4.7-flash` → zhipu + openrouter 两通道，链接完好、status=ACTIVE、model.enabled=true、health check 均 PASS
- call_logs：最近 24h 所有 `glm-4.7-flash` 错误 provider 均为 zhipu，openrouter 零调用

根因定位：`src/lib/engine/failover.ts:22` 将 `RATE_LIMITED` 列入 `NON_RETRYABLE_CODES`，注释理由 "switching channels won't help"。该假设对**单 provider 多 key** 正确，对**跨 provider 别名**完全错误：openrouter 是独立的上游配额池。

进一步审视发现 4 类覆盖盲点，本批次一次性处理。

## 目标

保证"有备用通道时服务健康"——跨 provider 别名任一 provider 失败（除真正 deterministic 错误），自动 failover 到下一候选；失败通道短期冷却，避免下一请求雪崩重试同一故障 provider。

## 问题清单

### P0-1 非重试码黑名单对跨 provider 场景误杀

| Code | HTTP | 跨 provider 实际情况 |
|---|---|---|
| `RATE_LIMITED` | 429 | Zhipu / openrouter / 任何第三方 provider 独立配额池 |
| `AUTH_FAILED` | 401/403 | 每个 provider 独立 key；一方 key 失效 ≠ 全部失效 |
| `INSUFFICIENT_BALANCE` | 402 | 我方在 Zhipu 的充值 ≠ 在 openrouter 的充值 |
| `CONTENT_FILTERED` | — | 政策相关性高但 provider 间有差异；本轮保守保留全程不重试（避免 prompt-bombing） |

### P0-2 失败通道无冷却机制（雪崩风险）

三处 `withFailover` 调用点（`v1/chat/completions` 非流 + 流 + `v1/images/generations`, 及 MCP 对应工具）**全部未传 `onRetry` 回调**。后果：

- Zhipu 刚返回 429，下一请求进入 `routeByAlias` **仍然先挑 Zhipu**（health_checks 表无新 FAIL 记录，最新仍是旧 PASS）
- 每个请求都要先打 zhipu 失败再 failover 到 openrouter
- 放大 2× 延迟 + 2× 浪费 zhipu 上游配额

### P1-1 INVALID_REQUEST (400) 默认可重试浪费配额

`isRetryable` 只排除黑名单，默认 true。400 通常是参数本身错（max_tokens 超限、temperature 超界、messages 为空）——跨 provider 切换救不了。连试 4 家浪费上游 quota 和用户等待时间。

### P1-2 部分 provider "HTTP 200 + body.error" 场景映射

OpenAI 兼容协议标准是错误走 HTTP 4xx/5xx，但个别 provider（historically Zhipu 部分接口、部分国产适配）会 HTTP 200 + body.error。如果 adapter 未解包，用户侧看到 "Empty response / no choices"，走 `PROVIDER_ERROR` 或直接抛，但可能丢失 429/401 等语义 → `isRetryable` 判断失真。

## 设计

### F-RR2-01：Provider-aware failover

**文件：** `src/lib/engine/failover.ts`

重构 `isRetryable` 签名，增加 current/next route 比较 provider.id：

```typescript
const NEVER_RETRY: Set<string> = new Set([
  ErrorCodes.CONTENT_FILTERED,
  ErrorCodes.INVALID_REQUEST,  // F-RR2-03 合入本项
  ErrorCodes.INVALID_SIZE,
]);

const CROSS_PROVIDER_ONLY: Set<string> = new Set([
  ErrorCodes.AUTH_FAILED,
  ErrorCodes.INSUFFICIENT_BALANCE,
  ErrorCodes.RATE_LIMITED,
]);

function isRetryable(
  err: unknown,
  currentRoute: RouteResult,
  nextRoute: RouteResult | null,
): boolean {
  // Network / generic errors
  if (!(err instanceof EngineError)) {
    if (err instanceof Error) {
      const msg = err.message.toLowerCase();
      return msg.includes("timeout") || msg.includes("econnrefused") || msg.includes("fetch failed");
    }
    return false;
  }
  if (NEVER_RETRY.has(err.code)) return false;
  if (CROSS_PROVIDER_ONLY.has(err.code)) {
    return nextRoute !== null && nextRoute.provider.id !== currentRoute.provider.id;
  }
  // MODEL_NOT_FOUND / PROVIDER_ERROR / TIMEOUT / CHANNEL_UNAVAILABLE / MODEL_NOT_AVAILABLE
  return true;
}
```

`withFailover` 循环改写：每轮调用 `isRetryable(err, candidates[i], candidates[i + 1] ?? null)`。

### F-RR2-02：Redis 失败冷却池

**新文件：** `src/lib/engine/cooldown.ts`

```typescript
const TTL_SECONDS = 300;
const KEY_PREFIX = "channel:cooldown:";

export async function markChannelCooldown(channelId: string, reason: string): Promise<void>;
export async function getCooldownChannelIds(channelIds: string[]): Promise<Set<string>>;
```

- `markChannelCooldown`：`SET key "<reason>:<ISO-timestamp>" EX 300`，Redis 不可用时 console.warn 不抛
- `getCooldownChannelIds`：MGET 批查，Redis 不可用返回空 Set

**修改：** `src/lib/engine/failover.ts` — `withFailover` 内置 `onRetry` 默认写冷却（不依赖调用方显式传入，保证三处调用全覆盖）。外部 `onRetry` 参数保留但去重。

**修改：** `src/lib/engine/router.ts` — `routeByAlias` 查出 candidateChannels 后，batch 查询冷却集，排序规则变为：

```
priority ASC
  → 非冷却 优先于 冷却中
    → health PASS 优先于 NULL/未测
```

冷却中的 channel **不从候选移除**（否则全冷却时整个 alias 挂掉），只降权——保持"所有候选都会被 failover 遍历到"的铁律。

### F-RR2-03：Adapter 200+error 场景审计

**审计文件：** `src/lib/engine/openai-compat.ts`、`adapters/volcengine.ts`、`adapters/siliconflow.ts`

每家 adapter 在非流响应处理分支，确认：HTTP 200 但 body 含 `error` 字段时抛 `EngineError` + 合适的 code（mapProviderError 逻辑复用）。缺失则补。

**F-RR2-01 已合入** `INVALID_REQUEST` (400) 加入 `NEVER_RETRY`，本项不再独立 PR。

### F-RR2-04：验收

**Integration test**（新增 `src/lib/engine/__tests__/failover.test.ts`）：

| 用例 | 场景 | 期望 |
|---|---|---|
| 1 | mock candidate A (provider-a) 抛 429，B (provider-b) 成功 | 返回 B 结果，attempts=2，A 写入冷却 |
| 2 | mock candidate A (provider-a) 抛 401，B (provider-b) 成功 | 同上 |
| 3 | mock candidate A (provider-a) 抛 402，B (provider-b) 成功 | 同上 |
| 4 | mock candidate A (provider-a) 抛 500，B 成功 | 同上 |
| 5 | mock candidate A 抛 timeout (generic Error)，B 成功 | 同上 |
| 6 | 同 provider 下 2 候选，A 抛 429 | **不重试**，直接抛给调用方（429 同 provider 不切） |
| 7 | A 抛 CONTENT_FILTERED | 永不重试，直接抛 |
| 8 | A 抛 INVALID_REQUEST (400) | 永不重试，直接抛 |
| 9 | Redis 不可用时 A 抛 429，B 成功 | failover 正常，不写冷却但不中断 |

**生产烟测**（Evaluator 执行）：
- 使用 codex-dev 账号在生产对 `glm-4.7-flash` 高频触发 zhipu 429
- 断言：call_logs 后续记录 provider=openrouter（自动切换生效）
- 断言：`redis-cli --scan 'channel:cooldown:*'` 存在 zhipu 通道 key
- 断言：5 分钟后冷却过期，再次请求回到 zhipu（可手动清 key 验证）

## 非目标

- 不实现"流中断后 token 回放"（技术成本过高，当前"Once streaming begins we're committed"可接受）
- 不放宽 `MAX_FAILOVER_RETRIES = 3`（别名候选最多 3，足够）
- 不改 `CONTENT_FILTERED` 策略（保守全程不重试，避免 prompt 穿透多家）
- 不做"同 provider 多 key channel-level"限流追踪（目前每个 provider+model 只一个 channel，待未来需求触发）
- 不做 cooldown TTL 的 admin 可配置（300s 是经验值，future work）

## Risks

| 风险 | 缓解 |
|---|---|
| Redis 不可用时冷却失效 | 回落到"每请求都先试失败 provider"行为，但不中断服务；console.warn 由 Ops 观察 |
| 冷却 TTL 过长导致 provider 恢复后仍被跳过 | 300s 是平衡值；候选不移除只降权，cooldown 内真正全 FAIL 时仍会重试 |
| failover 增加 p99 延迟 | 单请求 max 4 次上游调用；chat 非流 / images 同步模式影响明显；文档化提醒 |
| `INVALID_REQUEST` 一刀切不重试可能误杀 provider-specific quirk | 此类应由 adapter 内部处理（参数改写），不应依赖 failover 救场；如有 case-by-case 再特例化 |

## 部署

- 纯代码变更，无 migration、无 schema 修改、无 env 新增
- 上线：push main → CI (lint + tsc) → 用户手动触发 GitHub Actions deploy
- 回滚：revert commit，Redis cooldown key 自然过期
- **依赖环境：** Redis 已在生产可用（现有健康检查 / rate-limit / session 使用）；cooldown 复用同一实例
