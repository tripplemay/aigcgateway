# Staging 完整性能测试报告

## 测试目标

在 staging 环境对 AIGC Gateway 执行一轮完整但保守的性能测试，覆盖：

- 公开接口
- 普通用户路径
- 管理员读路径
- 后台重任务触发

本轮重点是验证上一轮首轮压测暴露的慢路径是否已有改善，并补齐用户写路径、运行时 gate 路径与后台任务触发结果。

## 测试环境

- 环境：staging
- 地址：`http://154.40.40.116:8301`
- 执行日期：`2026-04-02`
- 工具：
  - `autocannon v8.0.0` 通过 `npx --yes autocannon`
  - 受控写路径探针通过 `curl + python3`

## 测试数据

- 管理员：
  - `admin@aigc-gateway.local / admin123`
- 隔离开发者：
  - `perf.staging.20260402-221725@example.com / Test1234`
- 测试项目：
  - `Perf Normal 20260402-221725`
  - `Perf Zero 20260402-221725`
- 测试 Key：
  - `Perf Normal Key`
  - `Perf Zero Key`
  - `Perf NoChat Key`

## 执行范围

### 已执行

#### 公开接口

1. `GET /api/v1/models`
   - `20 req / c=2`
   - `100 req / c=10`

#### 普通用户

2. `POST /api/auth/login`
   - `30 req / c=3`
3. `POST /api/projects`
   - 受控探针：10 次唯一请求，`max_workers=2`
4. `POST /api/projects/:id/keys`
   - 受控探针：10 次唯一请求，`max_workers=2`
5. `POST /api/v1/chat/completions`
   - 零余额 gate：`20 req / c=3`
   - 无聊天权限 gate：`20 req / c=3`
   - 真实聊天基线：单次请求

#### 管理员

6. `GET /api/admin/sync-status`
   - `50 req / c=5`
7. `GET /api/admin/channels`
   - `50 req / c=5`
8. `GET /api/admin/users?page=1&pageSize=20`
   - `50 req / c=5`

#### 后台任务

9. `POST /api/admin/sync-models`
   - 单次触发计时
10. `GET /api/admin/sync-status`
   - 复核后台任务是否最终完成

### 未执行

- 注册并发压测
- 真实聊天高并发 / SSE
- 健康检查任务批量压测
- 订单关闭 / 余额告警定时任务

未执行原因：

- staging 与生产共享宿主机资源
- 本轮以保守负载为原则
- 管理重任务已在单次触发下暴露清晰问题，不再继续放大

## 结果摘要

| 分组 | 场景 | 工作负载 | 结果 |
|---|---|---:|---|
| 公开接口 | `GET /api/v1/models` smoke | 20 req / c=2 | Pass |
| 公开接口 | `GET /api/v1/models` load | 100 req / c=10 | Pass |
| 普通用户 | `POST /api/auth/login` | 30 req / c=3 | Pass |
| 普通用户 | `POST /api/projects` | 10 次唯一请求 / c=2 | Pass |
| 普通用户 | `POST /api/projects/:id/keys` | 10 次唯一请求 / c=2 | Pass |
| 普通用户 | 零余额 gate | 20 req / c=3 | Pass |
| 普通用户 | 无聊天权限 gate | 20 req / c=3 | Pass |
| 普通用户 | 真实聊天基线 | 单次 | Pass |
| 管理员 | `GET /api/admin/sync-status` | 50 req / c=5 | Fail |
| 管理员 | `GET /api/admin/channels` | 50 req / c=5 | Fail |
| 管理员 | `GET /api/admin/users` | 50 req / c=5 | Fail |
| 后台任务 | `POST /api/admin/sync-models` 单次触发 | 1 次 | Fail |

## 逐项结果

### 一. 公开接口

#### 1. `GET /api/v1/models` smoke

- 工作负载：`20 req / c=2`
- 实测：
  - avg `459.95 ms`
  - p50 `389 ms`
  - p97.5 `1140 ms`
  - max `1140 ms`
  - throughput `4 req/s`
- 判定：`Pass`

说明：

- 按完整模型列表大小看，这个结果不算轻，但相对可接受
- 本轮把阈值按 staging 共享宿主机环境放宽到：
  - avg `< 600ms`
  - p97.5 `< 1500ms`

#### 2. `GET /api/v1/models` load

- 工作负载：`100 req / c=10`
- 实测：
  - avg `467.23 ms`
  - p50 `403 ms`
  - p97.5 `1181 ms`
  - max `1203 ms`
  - throughput `20 req/s`
- 判定：`Pass`

说明：

- 相比上一轮首轮报告，这个接口依然是本轮最稳的一类
- 在保守读压下没有出现 5xx，也没有非线性退化

### 二. 普通用户

#### 3. `POST /api/auth/login`

- 工作负载：`30 req / c=3`
- 实测：
  - avg `529 ms`
  - p50 `461 ms`
  - p97.5 `1117 ms`
  - max `1117 ms`
  - throughput `5 req/s`
- 判定：`Pass`

说明：

- 相比上一轮首轮压测中的 `avg 2927 ms`，改善非常明显
- 登录路径性能问题可以视为已明显缓解

#### 4. `POST /api/projects` 受控探针

- 工作负载：10 次唯一请求，`c=2`
- 实测：
  - status `201 x 10`
  - avg `657.73 ms`
  - p50 `656.74 ms`
  - max `690.37 ms`
- 判定：`Pass`

说明：

- 这里没有直接使用 `autocannon` 的固定 body 结果，因为固定请求体会造成业务冲突，不能代表真实性能

#### 5. `POST /api/projects/:id/keys` 受控探针

- 工作负载：10 次唯一请求，`c=2`
- 实测：
  - status `201 x 10`
  - avg `673.77 ms`
  - p50 `652.23 ms`
  - max `761.68 ms`
- 判定：`Pass`

#### 6. 零余额 gate

- 接口：`POST /api/v1/chat/completions`
- 工作负载：`20 req / c=3`
- 实测：
  - avg `344.7 ms`
  - p50 `283 ms`
  - p97.5 `709 ms`
  - `20/20` 非 2xx
- 复核：
  - 单次 curl 返回 `402 insufficient_balance`
- 判定：`Pass`

说明：

- gate 路径短路正常，未命中真实模型调用

#### 7. 无聊天权限 gate

- 接口：`POST /api/v1/chat/completions`
- 工作负载：`20 req / c=3`
- 实测：
  - avg `326.45 ms`
  - p50 `269 ms`
  - p97.5 `658 ms`
  - `20/20` 非 2xx
- 复核：
  - 单次 curl 返回 `403 forbidden`
- 判定：`Pass`

#### 8. 真实聊天基线

- 接口：`POST /api/v1/chat/completions`
- 工作负载：单次
- 结果：
  - 成功返回 `OK`
  - trace id: `trc_c1k8r88mbxjiewvchmnjo3tc`
- 判定：`Pass`

### 三. 管理员

#### 9. `GET /api/admin/sync-status`

- 工作负载：`50 req / c=5`
- 实测：
  - avg `2519.2 ms`
  - p50 `2441 ms`
  - p97.5 `4358 ms`
  - max `4359 ms`
- 判定：`Fail`

#### 10. `GET /api/admin/channels`

- 工作负载：`50 req / c=5`
- 实测：
  - avg `2552.04 ms`
  - p50 `2474 ms`
  - p97.5 `4792 ms`
  - max `5024 ms`
- 判定：`Fail`

#### 11. `GET /api/admin/users?page=1&pageSize=20`

- 工作负载：`50 req / c=5`
- 实测：
  - avg `1722.22 ms`
  - p50 `1908 ms`
  - p97.5 `3311 ms`
  - max `3318 ms`
- 判定：`Fail`

说明：

- 三个管理员读接口依旧显著慢于用户路径
- 当前主要瓶颈已经从“登录和普通用户链路”收敛到“管理员读路径”

### 四. 后台任务

#### 12. `POST /api/admin/sync-models` 单次触发

- 工作负载：单次
- 实测：
  - HTTP 请求在 `120.749s` 后返回 `504 Gateway Time-out`
- 判定：`Fail`

#### 13. `GET /api/admin/sync-status` 复核

- 结果：
  - `lastSyncTime = 2026-04-02T14:20:29.352Z`
  - `finishedAt = 2026-04-02T14:20:29.352Z`
  - `durationMs = 230199`
  - `totalFailedProviders = 0`
- 判定：`部分通过`

说明：

- 任务本身完成了
- 但 trigger HTTP 接口设计仍然不合格，因为它直接撞上代理超时
- 当前问题是：
  - “后台任务能跑完”
  - 但“触发接口不能在代理预算内返回”

## 与上一轮首轮压测对比

明确改善的项：

- `POST /api/auth/login`
  - 从 `avg 2927 ms` 降到 `avg 529 ms`
- 用户写路径：
  - 项目创建和 Key 创建在受控探针下均可稳定 `201`
- 运行时 gate 路径：
  - `402 / 403` 都能快速稳定返回

仍然突出的项：

- 管理员读接口整体较慢
- `sync-models` trigger 仍会超时

## 风险分类

### 应用瓶颈

高概率存在：

- 管理员查询路径聚合过重
- `sync-models` 触发接口没有和后台任务完全解耦

### 代理 / 网关瓶颈

已明确存在：

- `POST /api/admin/sync-models` 在大约 120 秒时返回 `504`
- 这说明至少 HTTP 层没有在代理预算内完成响应

### 第三方依赖瓶颈

存在但非唯一原因：

- `sync-status` 显示整次同步耗时 `230199 ms`
- 模型同步本身涉及多 provider 和 AI 提取
- 但触发接口本应先快速返回，而不是一直阻塞到超时

### 环境噪声 / 共机争用

仍需保留：

- staging 与生产共享宿主机 CPU / 内存 / Redis
- 但用户链路已明显改善，说明不能把管理员慢路径全部归因于环境噪声

## 最终结论

本轮 staging 完整性能测试结论为：`PARTIAL PASS`。

结论拆分如下：

- 公开接口：通过
- 普通用户链路：通过
- 运行时 gate 路径：通过
- 真实聊天基线：通过
- 管理员读接口：失败
- `sync-models` 触发接口：失败

因此当前 staging 的主要性能问题已经从“全局性慢”收敛为：

1. 管理员读路径仍慢
2. `sync-models` 触发接口仍会撞上 `504`

## 证据

原始输出：

- [staging-models-smoke-2026-04-02.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-models-smoke-2026-04-02.txt)
- [staging-models-load-2026-04-02.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-models-load-2026-04-02.txt)
- [staging-login-retest-2026-04-02.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-login-retest-2026-04-02.txt)
- [staging-admin-sync-status-2026-04-02.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-admin-sync-status-2026-04-02.txt)
- [staging-admin-channels-2026-04-02.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-admin-channels-2026-04-02.txt)
- [staging-admin-users-2026-04-02.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-admin-users-2026-04-02.txt)
- [staging-zero-balance-gate-2026-04-02.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-zero-balance-gate-2026-04-02.txt)
- [staging-nochat-gate-2026-04-02.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-nochat-gate-2026-04-02.txt)
- [staging-admin-sync-models-single-2026-04-02.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-admin-sync-models-single-2026-04-02.txt)
- [staging-write-probe-2026-04-02.json](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-write-probe-2026-04-02.json)
