# Redis 缓存迁移 + PM2 Cluster 性能测试执行报告 2026-04-03

## 测试目标

按既定性能用例，在 staging 上验证 Redis 缓存迁移与 PM2 cluster 是否带来中压 / 高压性能改善。

## 测试环境

- 环境：staging
- 基地址：`http://154.40.40.116:8301`
- 执行时间：`2026-04-03`

## 测试范围

- 已执行：
  - smoke gate
    - `GET /v1/models`
    - `GET /api/admin/sync-status`
    - `GET /api/admin/channels`
- 未执行：
  - `autocannon` 中压 / 高压场景
  - `sync-models` timing 回归

## 执行步骤概述

1. 先运行部署后 smoke gate
2. 发现关键接口单次探针已超时
3. 按性能计划 stop condition 停止进一步加压

## 结果

- `GET /api/admin/sync-status`
  - 单次探针 `200`
  - 耗时 `0.990145s`
  - 结果：`PASS`
- `GET /v1/models`
  - 12 秒探针超时
  - 30 秒探针仍超时
  - 结果：`FAIL`
- `GET /api/admin/channels`
  - 12 秒探针超时
  - 30 秒探针仍未完成，仅收到部分响应体
  - 结果：`FAIL`

## Stop Condition

已命中以下 stop condition：

- 核心目标接口单次 smoke 已严重超时
- 在未证明稳定性前，不应继续执行中压 / 高压 / soak

## 风险项

- 若继续压测，极可能只会把当前异常放大，而不是得到可解释的性能收益对比
- 由于本次优化的主要目标接口正是 `models` 与 `channels`，当前结果说明优化部署后至少没有达到“可进入回归压测”的最低门槛

## 证据

- 详见：
  - `docs/test-reports/perf-raw/redis-cluster-sync-status-30s-2026-04-03.json`
  - `docs/test-reports/perf-raw/redis-cluster-channels-30s-partial-2026-04-03.json`
  - 执行时观测到的超时结果：
    - `/v1/models`: `curl: (28) Operation timed out after 30006 milliseconds with 0 bytes received`
    - `/api/admin/channels`: `curl: (28) Operation timed out after 30006 milliseconds with 65536 bytes received`

## 最终结论

本轮性能验收结论为 `BLOCKED`。

阻塞原因不是“环境不可达”，而是核心接口在 smoke 阶段就已经表现出严重超时，因此不具备继续做中压 / 高压性能对比的条件。
