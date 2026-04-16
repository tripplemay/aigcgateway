# ROUTING-RESILIENCE — Evaluator 签收报告

**批次：** ROUTING-RESILIENCE  
**日期：** 2026-04-16  
**Evaluator：** Reviewer (Codex 代班)  
**Dev Server：** http://localhost:3099  

---

## 验收结论

**PASS**

全部 5 项验收点通过。Failover 逻辑正确：可重试错误自动换 channel，确定性错误（402/401/429）立即抛出不重试。Scheduler 已过滤孤儿 channel（本地 315/319 被跳过）。孤儿清理脚本 dry-run 输出正常。

---

## 验收项执行结果

### 验收 A: routeByAlias 返回 candidates 列表，排序正确

设置 `failover-test` alias（2 个 model + 2 个 ACTIVE channel，priority 1/2）：

```
best: ch1 priority=1
candidates: [ch1 priority=1, ch2 priority=2]
ROUTE_CANDIDATES_OK ✅
```

`candidates[0]` = `best`；priority ASC 排序；PASS health 优先于 NULL ✅

### 验收 B: withFailover — 第一 channel 失败自动换第二 channel

Mock PROVIDER_ERROR 在 ch1，ch2 正常返回：

```
[failover] Attempt 1 failed on openai/failover-test-model-a: upstream 503. Trying next channel...
result: success_from_ch2 | used: ch2 | attempts: 2
FAILOVER_OK ✅
```

### 验收 C: 确定性错误不触发 failover

INSUFFICIENT_BALANCE (`insufficient_balance`, 402):

```
callCount: 1 | code: insufficient_balance
NON_RETRYABLE_OK ✅
```

仅 1 次尝试即抛出，未切换 channel ✅

同理 AUTH_FAILED / RATE_LIMITED 在 `NON_RETRYABLE_CODES` Set 中，代码审阅确认 ✅

### 验收 D: MAX_FAILOVER_RETRIES = 3（最多 4 次尝试）

4 个 candidates 全部失败：

```
callCount3: 4 (max=4)
MAX_RETRY_OK ✅
```

### 验收 E: channel DISABLED → 路由自动跳过，调用成功

```
ch1 disabled → candidates: 1, best: ch2  → DISABLED_FAILOVER_OK ✅
ch1 restored → candidates: 2, best priority: 1 → RESTORED_OK ✅
```

### 验收 F: Scheduler 只检查 aliased channel

本地 DB：

```
Total ACTIVE channels: 319
Aliased channel count: 4
Orphan (would be skipped): 315
SCHEDULER_FILTER_OK ✅
```

MAX_CHECKS_PER_ROUND = 20，MAX_PROBES_PER_ROUND = 5（已从 5/2 提高）✅

### 验收 G: 孤儿清理脚本 dry-run

```
找到 2 个孤儿模型（enabled 但未挂到任何 enabled alias）
  IMAGE  openai/dall-e-3
  TEXT   openai/gpt-4o-mini
加 --apply 实际执行...
```

幂等、dry-run 默认、不删除数据 ✅  
（本地 DB 2 个，生产预计 ~300+）

### 验收 H: failover 接线全覆盖（代码审阅）

| 调用点 | withFailover | candidates 传入 |
|---|---|---|
| `v1/chat/completions` 非流式 | ✅ | ✅ |
| `v1/chat/completions` 流式 | ✅ | ✅ |
| `v1/images/generations` | ✅ | ✅ |
| MCP `chat` 非流式 | ✅ | ✅ |
| MCP `chat` 流式 | ✅ | ✅ |
| MCP `generate_image` | ✅ | ✅ |

---

## pre-existing tsc 错误

`src/lib/mcp/tools/get-balance.ts(74,13): error TS2353: 'batchId' does not exist`

此错误在 API-POLISH 批次（442e762）引入，早于 ROUTING-RESILIENCE，不属于本批次范围。

---

## 签收结论

| 验收点 | 结论 |
|---|---|
| routeByAlias 返回 candidates 列表，priority 排序正确 | ✅ PASS |
| 可重试错误 failover 到下一 channel | ✅ PASS |
| 确定性错误（402/401/429）不触发 failover | ✅ PASS |
| MAX_FAILOVER_RETRIES=3 上限生效 | ✅ PASS |
| channel DISABLED 后路由跳过，恢复后正常 | ✅ PASS |
| Scheduler 过滤孤儿 channel（315/319 被跳过） | ✅ PASS |
| 孤儿清理脚本 dry-run 正确报告 | ✅ PASS |
| failover 接线 6 个调用点全覆盖 | ✅ PASS |

**ROUTING-RESILIENCE 批次验收通过 → status: done**
