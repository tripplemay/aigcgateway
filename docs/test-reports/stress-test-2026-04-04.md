# 压力测试报告 — 2026-04-04

> 目标服务器：https://aigc.guangai.ai
> 工具：autocannon (Node.js)
> 执行时间：2026-04-04T23:37:49.202Z

---

## A — /v1/models

| 指标 | Cold (Round 1) | Warm (Round 2) |
|---|---|---|
| RPS | 46.0 | 46.5 |
| Total Requests | 1379 | 1395 |
| P50 | 1027ms | 1021ms |
| P95 | 1718ms | 1618ms |
| P99 | 1815ms | 1762ms |
| Errors | 0 (0.00%) | 0 (0.00%) |

## B — /api/admin/models-channels

| 指标 | Cold (Round 1) | Warm (Round 2) |
|---|---|---|
| RPS | 15.2 | 19.6 |
| Total Requests | 457 | 588 |
| P50 | 1006ms | 1010ms |
| P95 | 2302ms | 1564ms |
| P99 | 8034ms | 1621ms |
| Errors | 18 (3.94%) | 0 (0.00%) |

## C — /api/admin/usage?period=7d

| 指标 | Cold (Round 1) | Warm (Round 2) |
|---|---|---|
| RPS | 110.1 | 110.2 |
| Total Requests | 3304 | 3307 |
| P50 | 186ms | 185ms |
| P95 | 379ms | 386ms |
| P99 | 685ms | 668ms |
| Errors | 0 (0.00%) | 0 (0.00%) |

## D — /api/admin/usage/by-model?period=7d

| 指标 | Cold (Round 1) | Warm (Round 2) |
|---|---|---|
| RPS | 112.1 | 114.2 |
| Total Requests | 3364 | 3427 |
| P50 | 177ms | 180ms |
| P95 | 388ms | 375ms |
| P99 | 686ms | 726ms |
| Errors | 0 (0.00%) | 0 (0.00%) |

## Scenario E — Mixed Concurrency (60s, 40 total connections)

| Sub-scenario | RPS | P99 | Errors |
|---|---|---|---|
| models (c=20) | 29.3 | 1332ms | 0 |
| models-channels (c=10) | 7.9 | 2283ms | 0 |
| usage (c=10) | 47.5 | 948ms | 0 |

**Combined:** 5083 requests, 0 errors (0.00%), max P99: 2283ms

---

## 结论

- 缓存命中后 P99 < 200ms: **FAIL** (1762ms, 1621ms, 668ms, 726ms)
- 混合并发错误率 < 1%: **PASS** (0.00%)
- 瓶颈: A — /v1/models warm P99=1762ms, B — /api/admin/models-channels warm P99=1621ms, C — /api/admin/usage?period=7d warm P99=668ms, D — /api/admin/usage/by-model?period=7d warm P99=726ms