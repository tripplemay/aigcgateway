# 压力测试报告 — 2026-04-19

> 目标服务器：http://localhost:3099
> 工具：autocannon (Node.js)
> 执行时间：2026-04-19T15:35:24.429Z

---

## A — /v1/models

| 指标 | Cold (Round 1) | Warm (Round 2) |
|---|---|---|
| RPS | 6128.4 | 6300.4 |
| Total Requests | 183845 | 189005 |
| P50 | 7ms | 7ms |
| P95 | 12ms | 12ms |
| P99 | 15ms | 15ms |
| Errors | 0 (0.00%) | 0 (0.00%) |

## B — /api/admin/models-channels

| 指标 | Cold (Round 1) | Warm (Round 2) |
|---|---|---|
| RPS | 8991.6 | 9216.0 |
| Total Requests | 269738 | 276447 |
| P50 | 1ms | 1ms |
| P95 | 3ms | 3ms |
| P99 | 4ms | 4ms |
| Errors | 0 (0.00%) | 0 (0.00%) |

## C — /api/admin/usage?period=7d

| 指标 | Cold (Round 1) | Warm (Round 2) |
|---|---|---|
| RPS | 8868.7 | 8937.6 |
| Total Requests | 266066 | 268077 |
| P50 | 2ms | 2ms |
| P95 | 3ms | 3ms |
| P99 | 4ms | 4ms |
| Errors | 0 (0.00%) | 0 (0.00%) |

## D — /api/admin/usage/by-model?period=7d

| 指标 | Cold (Round 1) | Warm (Round 2) |
|---|---|---|
| RPS | 8915.2 | 8931.7 |
| Total Requests | 267429 | 267926 |
| P50 | 2ms | 2ms |
| P95 | 3ms | 3ms |
| P99 | 4ms | 4ms |
| Errors | 0 (0.00%) | 0 (0.00%) |

## Scenario E — Mixed Concurrency (60s, 40 total connections)

| Sub-scenario | RPS | P99 | Errors |
|---|---|---|---|
| models (c=20) | 3468.1 | 10ms | 0 |
| models-channels (c=10) | 1802.6 | 10ms | 0 |
| usage (c=10) | 1804.5 | 9ms | 0 |

**Combined:** 424483 requests, 0 errors (0.00%), max P99: 10ms

---

## 结论

- 缓存命中后 P99 < 200ms: **PASS** (15ms, 4ms, 4ms, 4ms)
- 混合并发错误率 < 1%: **PASS** (0.00%)