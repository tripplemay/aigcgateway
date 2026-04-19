# 压力测试报告 — 2026-04-19

> 目标服务器：http://localhost:3099
> 工具：autocannon (Node.js)
> 执行时间：2026-04-19T14:43:42.257Z

---

## A — /v1/models

| 指标 | Cold (Round 1) | Warm (Round 2) |
|---|---|---|
| RPS | 6009.3 | 6035.6 |
| Total Requests | 180256 | 181052 |
| P50 | 7ms | 7ms |
| P95 | 12ms | 12ms |
| P99 | 15ms | 15ms |
| Errors | 0 (0.00%) | 0 (0.00%) |

## B — /api/admin/models-channels

| 指标 | Cold (Round 1) | Warm (Round 2) |
|---|---|---|
| RPS | 8919.2 | 8959.2 |
| Total Requests | 267562 | 268774 |
| P50 | 2ms | 2ms |
| P95 | 3ms | 3ms |
| P99 | 4ms | 4ms |
| Errors | 0 (0.00%) | 0 (0.00%) |

## C — /api/admin/usage?period=7d

| 指标 | Cold (Round 1) | Warm (Round 2) |
|---|---|---|
| RPS | 8729.6 | 8986.9 |
| Total Requests | 261881 | 269573 |
| P50 | 2ms | 1ms |
| P95 | 3ms | 3ms |
| P99 | 4ms | 4ms |
| Errors | 0 (0.00%) | 0 (0.00%) |

## D — /api/admin/usage/by-model?period=7d

| 指标 | Cold (Round 1) | Warm (Round 2) |
|---|---|---|
| RPS | 8856.0 | 8876.3 |
| Total Requests | 265668 | 266273 |
| P50 | 1ms | 2ms |
| P95 | 3ms | 3ms |
| P99 | 4ms | 4ms |
| Errors | 0 (0.00%) | 0 (0.00%) |

## Scenario E — Mixed Concurrency (60s, 40 total connections)

| Sub-scenario | RPS | P99 | Errors |
|---|---|---|---|
| models (c=20) | 3389.1 | 11ms | 0 |
| models-channels (c=10) | 1755.3 | 11ms | 0 |
| usage (c=10) | 1762.2 | 11ms | 0 |

**Combined:** 414367 requests, 0 errors (0.00%), max P99: 11ms

---

## 结论

- 缓存命中后 P99 < 200ms: **PASS** (15ms, 4ms, 4ms, 4ms)
- 混合并发错误率 < 1%: **PASS** (0.00%)