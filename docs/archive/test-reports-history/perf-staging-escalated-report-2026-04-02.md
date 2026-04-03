# Staging 加压回归报告

## 测试目标

在上一轮 [perf-staging-full-report-2026-04-02.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-staging-full-report-2026-04-02.md) 基础上，按更高一档负载继续验证：

- 公开接口容量上限
- 普通用户路径在中压下是否仍稳定
- 管理员读接口在中压下是否仍可用

## 测试环境

- 环境：staging
- 地址：`http://154.40.40.116:8301`
- 执行日期：`2026-04-02`
- 工具：`autocannon v8.0.0`

## 测试范围

### 已执行

- `GET /api/v1/models`
  - `300 req / c=20`
- `POST /api/auth/login`
  - `100 req / c=10`
- `POST /api/v1/chat/completions`
  - 零余额 gate：`100 req / c=10`
  - 无聊天权限 gate：`100 req / c=10`
- `GET /api/admin/sync-status`
  - `100 req / c=10`
- `GET /api/admin/channels`
  - `100 req / c=10`
- `GET /api/admin/users?page=1&pageSize=20`
  - `100 req / c=10`

### 未继续执行

- soak
- 更高并发 stress
- `sync-models` 多次触发

未继续原因：

- `GET /api/admin/channels` 已出现明确 `500`
- 已命中 stop condition，不再扩大压力

## 结果摘要

| 场景 | 工作负载 | 结果 |
|---|---:|---|
| `GET /api/v1/models` | 300 req / c=20 | Fail |
| `POST /api/auth/login` | 100 req / c=10 | Fail |
| 零余额 gate | 100 req / c=10 | Pass |
| 无聊天权限 gate | 100 req / c=10 | Pass |
| `GET /api/admin/sync-status` | 100 req / c=10 | Pass |
| `GET /api/admin/users` | 100 req / c=10 | Pass |
| `GET /api/admin/channels` | 100 req / c=10 | Fail |

## 详细结果

### 1. `GET /api/v1/models`

- 工作负载：`300 req / c=20`
- 实测：
  - avg `1702.49 ms`
  - p50 `1760 ms`
  - p97.5 `2937 ms`
  - p99 `3796 ms`
  - max `4009 ms`
  - throughput `10.72 req/s`
- 结果：`Fail`

结论：

- `/api/v1/models` 在 `c=20` 已明显进入退化区
- 尾延迟和平均延迟都不再适合视作稳定读路径

### 2. `POST /api/auth/login`

- 工作负载：`100 req / c=10`
- 实测：
  - avg `1840.58 ms`
  - p50 `1832 ms`
  - p97.5 `2493 ms`
  - p99 `2646 ms`
  - max `2775 ms`
  - throughput `5 req/s`
- 结果：`Fail`

结论：

- 登录路径在中压下再次出现明显退化
- 说明它虽然已经比最初版本好很多，但容量余量仍不够

### 3. 零余额 gate

- 工作负载：`100 req / c=10`
- 实测：
  - avg `1656.71 ms`
  - p50 `1701 ms`
  - p97.5 `2227 ms`
  - max `2339 ms`
  - `100/100` 非 2xx
- 单次复核：
  - 返回 `402 insufficient_balance`
- 结果：`Pass`

说明：

- 性能不算好，但功能正确，且 fast-fail 一致性稳定

### 4. 无聊天权限 gate

- 工作负载：`100 req / c=10`
- 实测：
  - avg `1653.2 ms`
  - p50 `1710 ms`
  - p97.5 `2336 ms`
  - max `2377 ms`
  - `100/100` 非 2xx
- 单次复核：
  - 返回 `403 forbidden`
- 结果：`Pass`

### 5. `GET /api/admin/sync-status`

- 工作负载：`100 req / c=10`
- 实测：
  - avg `441.69 ms`
  - p50 `342 ms`
  - p97.5 `1341 ms`
  - max `1351 ms`
  - throughput `20 req/s`
- 结果：`Pass`

说明：

- 这条管理员读路径相比上一轮已明显改善

### 6. `GET /api/admin/users?page=1&pageSize=20`

- 工作负载：`100 req / c=10`
- 实测：
  - avg `568.84 ms`
  - p50 `480 ms`
  - p97.5 `1429 ms`
  - max `1446 ms`
  - throughput `16.67 req/s`
- 结果：`Pass`

说明：

- 这条路径也已明显优于上一轮

### 7. `GET /api/admin/channels`

- 工作负载：`100 req / c=10`
- 压测结果：
  - `100 non 2xx responses`
  - avg `637.03 ms`
  - p50 `558 ms`
  - p97.5 `1445 ms`
- 单次复核：
  - 直接返回 `HTTP/1.1 500 Internal Server Error`
- 结果：`Fail`

结论：

- 这是本轮最明确的阻塞项
- 不是“慢但还能用”，而是接口已经错误

## Stop Condition 触发

已触发：

- 管理员关键接口出现明确 `500`

因此本轮按计划停止，不继续执行：

- soak
- 更高并发
- 更重管理员路径

## 风险结论

### 已改善的项

- `sync-status`
- `admin/users`
- 登录相比最初首轮已大幅改善

### 仍然不足的项

- `/api/v1/models` 在中压下明显退化
- `/api/auth/login` 在中压下容量余量不足
- `/api/admin/channels` 直接 500

## 最终结论

本轮加压回归结论为：`FAIL`。

原因不是系统全局崩溃，而是到了中压档之后已经暴露明确容量和稳定性边界：

1. `/api/v1/models` 无法稳定承受 `c=20 / a=300`
2. `/api/auth/login` 无法稳定承受 `c=10 / a=100`
3. `/api/admin/channels` 在 `c=10 / a=100` 下直接返回 `500`

在这些问题修复前，不建议继续扩大压力或做更长 soak。

## 证据

- [staging-models-stress-2026-04-02.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-models-stress-2026-04-02.txt)
- [staging-login-stress-2026-04-02.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-login-stress-2026-04-02.txt)
- [staging-zero-balance-stress-2026-04-02.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-zero-balance-stress-2026-04-02.txt)
- [staging-nochat-stress-2026-04-02.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-nochat-stress-2026-04-02.txt)
- [staging-admin-sync-status-stress-2026-04-02.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-admin-sync-status-stress-2026-04-02.txt)
- [staging-admin-channels-stress-2026-04-02.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-admin-channels-stress-2026-04-02.txt)
- [staging-admin-users-stress-2026-04-02.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-admin-users-stress-2026-04-02.txt)
