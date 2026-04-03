# Staging 继续压测与证据补录报告

## 测试目标

在上一轮压测基础上继续执行中压场景，并修正 `perf-raw` 取证方式，确保原始证据文件不再为空。

本轮重点：

- 重新落盘关键中压场景证据
- 继续验证用户路径与管理员路径
- 重新验证 `sync-models` trigger 行为

## 测试环境

- 环境：staging
- 地址：`http://154.40.40.116:8301`
- 执行日期：`2026-04-02`
- 工具：`autocannon v8.0.0`

## 说明

上一轮 `perf-raw` 文件为空的直接原因是：

- `autocannon` 结果主要输出到 `stderr`
- 当时命令使用了 `tee` 但未合并 `stderr`

本轮已统一改为：

```bash
autocannon ... 2>&1 | tee file.txt
```

因此本轮原始文件均有内容，可作为正式证据。

## 执行范围

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
- `POST /api/admin/sync-models`
  - 单次触发
- `GET /api/admin/sync-status`
  - 触发后状态复核

## 结果摘要

| 场景 | 工作负载 | 结果 |
|---|---:|---|
| `/api/v1/models` | 300 req / c=20 | Fail |
| `/api/auth/login` | 100 req / c=10 | Fail |
| 零余额 gate | 100 req / c=10 | Pass |
| 无聊天权限 gate | 100 req / c=10 | Pass |
| `/api/admin/sync-status` | 100 req / c=10 | Pass |
| `/api/admin/users` | 100 req / c=10 | Pass |
| `/api/admin/channels` | 100 req / c=10 | Fail |
| `/api/admin/sync-models` trigger | 单次 | Pass |

## 详细结果

### 1. `GET /api/v1/models`

- avg `1702.49 ms`
- p50 `1760 ms`
- p97.5 `2937 ms`
- p99 `3796 ms`
- max `4009 ms`
- 结果：`Fail`

结论：

- 读路径在 `c=20` 已明显退化，不适合视作可承载中压流量

### 2. `POST /api/auth/login`

- avg `1687.35 ms`
- p50 `1655 ms`
- p97.5 `2569 ms`
- p99 `2701 ms`
- max `2722 ms`
- 结果：`Fail`

结论：

- 登录路径比最初首轮已有改善，但中压下仍明显偏慢

### 3. 零余额 gate

- avg `1463.66 ms`
- p50 `1491 ms`
- p97.5 `2034 ms`
- `100/100` 非 2xx
- 单次复核：`402 insufficient_balance`
- 结果：`Pass`

### 4. 无聊天权限 gate

- avg `1496.07 ms`
- p50 `1505 ms`
- p97.5 `1977 ms`
- `100/100` 非 2xx
- 单次复核：`403 forbidden`
- 结果：`Pass`

### 5. `GET /api/admin/sync-status`

- avg `379.51 ms`
- p50 `308 ms`
- p97.5 `970 ms`
- 结果：`Pass`

结论：

- 该管理员读接口当前已恢复到可接受水平

### 6. `GET /api/admin/users?page=1&pageSize=20`

- avg `488.27 ms`
- p50 `354 ms`
- p97.5 `1303 ms`
- 结果：`Pass`

结论：

- 相比之前明显改善，当前不是阻塞项

### 7. `GET /api/admin/channels`

- avg `2062.13 ms`
- p50 `2019 ms`
- p97.5 `3341 ms`
- max `3682 ms`
- 结果：`Fail`

结论：

- 这次没有复现上一轮的 `500`
- 但性能仍显著不达标，依然是当前最慢的管理员读接口

### 8. `POST /api/admin/sync-models`

- 单次触发：
  - `duration_sec=0.69`
  - HTTP `202`
  - 返回：`{"message":"Sync started","status":"in_progress"}`
- 触发后复核 `sync-status`：
  - 最新一次同步已完成
  - `durationMs=244863`
  - `totalFailedProviders=0`
- 结果：`Pass`

结论：

- 与上一轮“约 120 秒后 504”相比，trigger 接口已经明显修复
- 当前行为符合“快速返回 + 后台执行”的正确方向

## 最终结论

本轮继续压测结论为：`PARTIAL PASS`。

明确已修复或已改善的项：

- `perf-raw` 证据落盘问题已修复
- `/api/admin/sync-models` trigger 已修复为快速 `202`
- `/api/admin/sync-status` 已恢复正常
- `/api/admin/users` 已恢复正常

当前仍然未过的主要问题只剩：

- `/api/v1/models` 中压下退化明显
- `/api/auth/login` 中压下退化明显
- `/api/admin/channels` 中压下明显偏慢

## 证据

- [staging-models-stress-20260402-230007.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-models-stress-20260402-230007.txt)
- [staging-login-stress-20260402-230007.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-login-stress-20260402-230007.txt)
- [staging-zero-balance-stress-20260402-230007.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-zero-balance-stress-20260402-230007.txt)
- [staging-nochat-stress-20260402-230007.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-nochat-stress-20260402-230007.txt)
- [staging-admin-sync-status-stress-20260402-230007.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-admin-sync-status-stress-20260402-230007.txt)
- [staging-admin-channels-stress-20260402-230007.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-admin-channels-stress-20260402-230007.txt)
- [staging-admin-users-stress-20260402-230007.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-admin-users-stress-20260402-230007.txt)
- [staging-admin-sync-models-single-20260402-230007.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-admin-sync-models-single-20260402-230007.txt)
- [staging-admin-sync-status-after-trigger-20260402-230007.json](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-admin-sync-status-after-trigger-20260402-230007.json)
