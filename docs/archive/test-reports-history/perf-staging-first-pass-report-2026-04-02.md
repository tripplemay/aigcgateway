# Staging 首轮性能测试报告

## 测试目标

在 staging 环境对 AIGC Gateway 执行首轮低风险性能试跑，优先验证：

- 公开读路径
- 登录路径
- 管理员读路径

本轮不继续扩展到写路径、真实模型高并发和后台重任务，原因是首轮结果已暴露明显性能瓶颈，需要先收敛问题。

## 测试环境

- 环境：staging
- 地址：`http://154.40.40.116:8301`
- 执行日期：`2026-04-02`
- 工具：`autocannon v8.0.0`（通过 `npx --yes autocannon` 执行）

已确认：

- `GET /v1/models` 返回 `200`
- `POST /api/auth/login` 返回 `200`
- `GET /api/admin/sync-status` 返回 `200`
- `GET /api/admin/channels` 返回 `200`
- `GET /api/admin/users?page=1&pageSize=20` 返回 `200`

## 执行范围

### 已执行

1. `GET /api/v1/models`
   - smoke：`20 req / c=2`
   - load：`100 req / c=10`
2. `POST /api/auth/login`
   - `50 req / c=5`
3. `GET /api/admin/sync-status`
   - `50 req / c=5`
4. `GET /api/admin/channels`
   - `50 req / c=5`
5. `GET /api/admin/users?page=1&pageSize=20`
   - `50 req / c=5`

### 未执行

- 项目创建
- API Key 创建
- 零余额 / 无权限 fast-fail
- 真实聊天调用压测
- `POST /api/admin/sync-models`

未执行原因：

- 共享宿主机资源
- 首轮低负载下已出现明显延迟超标
- 按性能计划的 Stop Condition，先停止扩压

## 结果摘要

| 场景 | 工作负载 | p50 | p95 近似 | Avg | 吞吐 | 结果 |
|---|---:|---:|---:|---:|---:|---|
| `GET /api/v1/models` smoke | 20 req / c=2 | 389 ms | 1140 ms | 460 ms | 4 req/s | Fail |
| `GET /api/v1/models` load | 100 req / c=10 | 403 ms | 1181 ms | 467 ms | 20 req/s | Fail |
| `POST /api/auth/login` | 50 req / c=5 | 2937 ms | 3974 ms | 2927 ms | 1.62 req/s | Fail |
| `GET /api/admin/sync-status` | 50 req / c=5 | 2441 ms | 4358 ms | 2519 ms | 1.86 req/s | Fail |
| `GET /api/admin/channels` | 50 req / c=5 | 2474 ms | 4792 ms | 2552 ms | 1.67 req/s | Fail |
| `GET /api/admin/users` | 50 req / c=5 | 1908 ms | 3311 ms | 1722 ms | 2.5 req/s | Fail |

## 逐项结果

### 1. `GET /api/v1/models` smoke

- 工作负载：`20 req / c=2`
- 阈值：`p95 < 400ms`
- 实测：
  - avg `459.95 ms`
  - p50 `389 ms`
  - p97.5 `1140 ms`
  - max `1140 ms`
  - throughput `4 req/s`
- 结果：`Fail`

判断：

- 在非常轻的读取负载下，尾延迟已经远高于计划阈值
- 说明问题不只是高并发容量不足，更像是单请求处理成本本身偏高

### 2. `GET /api/v1/models` load

- 工作负载：`100 req / c=10`
- 阈值：`p95 < 500ms`
- 实测：
  - avg `467.23 ms`
  - p50 `403 ms`
  - p97.5 `1181 ms`
  - max `1203 ms`
  - throughput `20 req/s`
- 结果：`Fail`

判断：

- 平均值变化不大，但尾延迟继续维持在 1.1s 以上
- 更像是固定成本 + 少量排队，而不是纯 CPU 被打满后的完全崩溃

### 3. `POST /api/auth/login`

- 工作负载：`50 req / c=5`
- 阈值：`p95 < 800ms`
- 实测：
  - avg `2927 ms`
  - p50 `2937 ms`
  - p97.5 `3974 ms`
  - max `4500 ms`
  - throughput `1.62 req/s`
- 结果：`Fail`

判断：

- 登录路径明显偏慢
- 初步怀疑点：
  - 密码 hash 成本
  - 用户查询与会话 / JWT 逻辑
  - 共机环境 CPU 争用

### 4. `GET /api/admin/sync-status`

- 工作负载：`50 req / c=5`
- 阈值：`p95 < 500ms`
- 实测：
  - avg `2519.2 ms`
  - p50 `2441 ms`
  - p97.5 `4358 ms`
  - max `4359 ms`
  - throughput `1.86 req/s`
- 结果：`Fail`

判断：

- 对应的是一个本应很轻的管理员读接口
- 这说明管理员面板的状态读取链路可能存在较重聚合、锁等待或慢查询

### 5. `GET /api/admin/channels`

- 工作负载：`50 req / c=5`
- 阈值：`p95 < 800ms`
- 实测：
  - avg `2552.04 ms`
  - p50 `2474 ms`
  - p97.5 `4792 ms`
  - max `5024 ms`
  - throughput `1.67 req/s`
- 结果：`Fail`

判断：

- 这是本轮最接近 5 秒级尾延迟的场景
- 由于该接口通常涉及较大结果集和 join，优先怀疑：
  - 通道表 / 模型表 join 成本高
  - 缺索引或排序分页不佳
  - JSON 序列化负担重

### 6. `GET /api/admin/users?page=1&pageSize=20`

- 工作负载：`50 req / c=5`
- 阈值：`p95 < 800ms`
- 实测：
  - avg `1722.22 ms`
  - p50 `1908 ms`
  - p97.5 `3311 ms`
  - max `3318 ms`
  - throughput `2.5 req/s`
- 结果：`Fail`

判断：

- 相比其他管理员接口略好，但仍远超阈值
- 初步怀疑点：
  - 用户 + 项目统计聚合
  - count / 分页统计开销

## 风险分类

### 应用侧瓶颈

高概率存在：

- 登录路径处理成本高
- 管理员读接口查询或聚合过重
- `GET /api/v1/models` 自身读路径尾延迟偏高

### 网关 / 反向代理瓶颈

当前证据不足：

- 本轮没有出现 502 / 504
- 所有场景都还能返回 `200`

因此更像“应用慢”，而不是代理直接超时。

### 第三方依赖瓶颈

当前基本无关：

- 本轮没有压真实 provider 调用
- 测到的主要是本地应用、数据库、Redis 和共机资源争用

### 环境噪声 / 资源争用

中高风险：

- 该 staging 与生产共享同机 CPU / 内存 / Redis
- 即使没有真实用户，共机部署仍可能带来系统资源抖动
- 但考虑到轻载下也普遍 >1s，不能仅把问题归因于环境噪声

## 结论

本轮首轮 staging 性能试跑结论为：`FAIL`。

原因：

- 所有已执行核心场景都未达到计划阈值
- 问题在很低负载下就已出现
- 登录和管理员读接口尤其慢

因此当前不建议继续扩大到：

- 写路径压力
- 真实聊天高并发
- `sync-models` 重任务压测

应先由开发 / 运维侧优先排查：

1. 登录路径耗时拆解
2. `/api/admin/sync-status`、`/api/admin/channels`、`/api/admin/users` 的查询计划和索引
3. `/v1/models` 的缓存与序列化成本
4. staging 与生产共机资源争用是否明显

## 证据

原始输出文件：

- [staging-models-smoke-2026-04-02.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-models-smoke-2026-04-02.txt)
- [staging-models-load-2026-04-02.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-models-load-2026-04-02.txt)
- [staging-login-load-2026-04-02.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-login-load-2026-04-02.txt)
- [staging-admin-sync-status-2026-04-02.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-admin-sync-status-2026-04-02.txt)
- [staging-admin-channels-2026-04-02.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-admin-channels-2026-04-02.txt)
- [staging-admin-users-2026-04-02.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/staging-admin-users-2026-04-02.txt)
