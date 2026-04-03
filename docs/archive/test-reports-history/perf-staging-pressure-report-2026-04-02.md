# Staging 压力测试报告 2026-04-02

## 测试目标

对当前 staging 热点接口执行一轮更高一档的压力测试，确认上一轮已收敛问题在更高压力下的稳定性，并判断是否还能继续升压。

## 测试环境

- 环境：Staging
- 基地址：`http://154.40.40.116:8301`
- 执行时间：`2026-04-02 23:20` 左右（Asia/Shanghai）
- 工具：`npx --yes autocannon`
- 说明：本轮所有原始输出均使用 `2>&1 | tee` 落盘，证据文件不再为空。

## 测试范围

- 公开接口
  - `GET /api/v1/models`
- 普通用户
  - `POST /api/auth/login`
- 管理员
  - `GET /api/admin/channels`
  - `GET /api/admin/sync-status`
  - `GET /api/admin/users?page=1&pageSize=20`

## 执行步骤概述

1. 压前 smoke 检查确认上述 5 个接口均可返回 `200`
2. 依次执行更高一档压力场景
3. 压后复查 `models` 与 `channels`
4. 命中 stop condition 后停止继续升压，不执行 soak

## 场景与结果

### 1. `GET /api/v1/models`

- 负载：`500 req / c=30`
- 结果：
  - avg `3038.07ms`
  - p50 `3191ms`
  - p97.5 `4670ms`
  - p99 `4800ms`
  - max `5639ms`
  - throughput `9.62 req/s`
- 压后复查：
  - 使用 `curl --max-time 10` 单次请求，`10.006s` 超时，无响应体返回
- 结论：
  - 严重退化，已进入 stop condition

### 2. `POST /api/auth/login`

- 负载：`200 req / c=15`
- 结果：
  - avg `2685.36ms`
  - p50 `2630ms`
  - p97.5 `3615ms`
  - p99 `4011ms`
  - max `4628ms`
- 结论：
  - 功能可用，但中高压下延迟仍明显偏高

### 3. `GET /api/admin/channels`

- 负载：`150 req / c=15`
- 结果：
  - avg `4605ms`
  - p50 `4478ms`
  - p97.5 `5966ms`
  - p99 `6327ms`
  - max `6453ms`
- 压后复查：
  - 单次复查仍返回 `200`
- 结论：
  - 本轮未复现上一轮 `500`
  - 但性能仍然不可接受，是当前管理员接口的主要瓶颈

### 4. `GET /api/admin/sync-status`

- 负载：`150 req / c=15`
- 结果：
  - avg `2602.34ms`
  - p50 `2795ms`
  - p97.5 `3195ms`
  - p99 `3202ms`
  - max `3221ms`
- 结论：
  - 在本轮压力下也出现明显退化

### 5. `GET /api/admin/users?page=1&pageSize=20`

- 负载：`150 req / c=15`
- 结果：
  - avg `2727.14ms`
  - p50 `2701ms`
  - p97.5 `3491ms`
  - p99 `3530ms`
  - max `3708ms`
- 结论：
  - 在本轮压力下也出现明显退化

## 通过项

- 压前 smoke 检查通过，5 个目标接口均可访问
- 本轮原始证据已正确写入文件，不再出现 `0` 字节问题
- `/api/admin/channels` 本轮未再复现 `500`

## 失败项

- `/api/v1/models` 在 `c=30 / a=500` 下严重退化，压后 10 秒单次请求超时
- `/api/auth/login` 在 `c=15 / a=200` 下平均延迟仍接近 `2.7s`
- `/api/admin/channels` 在 `c=15 / a=150` 下平均延迟升至 `4.6s`
- `/api/admin/sync-status` 与 `/api/admin/users` 在本轮压力下均退化到 `2.6s+`

## 风险项

- `models` 已表现出明显容量瓶颈，不适合继续直接升压
- 管理员读接口在更高并发下整体一起退化，说明瓶颈很可能不只在单一 SQL，而是共享资源、缓存、数据库或事件循环层面的系统性问题
- 由于 staging 与生产共享同一台宿主机资源，再继续升压的风险和信息增益不成比例

## 证据

- 原始输出：
  - `docs/test-reports/perf-raw/staging-models-pressure-20260402-232008.txt`
  - `docs/test-reports/perf-raw/staging-login-pressure-20260402-232008.txt`
  - `docs/test-reports/perf-raw/staging-admin-channels-pressure-20260402-232008.txt`
  - `docs/test-reports/perf-raw/staging-admin-sync-status-pressure-20260402-232008.txt`
  - `docs/test-reports/perf-raw/staging-admin-users-pressure-20260402-232008.txt`

## 最终结论

本轮压力测试结论为 `FAIL`。

和上一轮中压结果相比，当前系统在更高一档压力下出现明显退化：

- `GET /api/v1/models` 已触发明确 stop condition
- `POST /api/auth/login` 仍缺乏足够容量余量
- 管理员读接口整体在 `c=15` 时退化到 `2.6s` 到 `4.6s`

当前不建议继续升压或进入 soak。更合理的下一步是先针对：

1. `/api/v1/models`
2. `/api/admin/channels`
3. `/api/auth/login`
4. 管理员读接口共性资源瓶颈

做定点排查和修复，然后再做回归压测。
