# Redis 缓存迁移 + PM2 Cluster API / 集成测试执行报告 2026-04-03

## 测试目标

验证 staging 上“内存缓存迁移到 Redis + PM2 cluster 模式”部署后的基础接口可用性、关键 API 行为，以及是否满足继续进入性能回归的前置条件。

## 测试环境

- 环境：staging
- 基地址：`http://154.40.40.116:8301`
- 执行时间：`2026-04-03`
- 鉴权：管理员账号 `admin@aigc-gateway.local`

## 测试范围

- 已执行：
  - `POST /api/auth/login`
  - `GET /api/admin/sync-status`
  - `GET /api/admin/channels`
  - `GET /v1/models`
- 未执行：
  - Redis key / TTL / invalidate 直接检查
  - PM2 worker / logs 直接检查
  - 并发 singleflight / 分布式锁验证
  - `POST /api/admin/sync-models`

## 执行步骤概述

1. 执行管理员登录，获取 token
2. 执行基础 smoke
3. 对超时接口补充 30 秒单次探针
4. 根据 smoke gate 判断是否继续后续用例

## 通过项

- `POST /api/auth/login` 返回 `200`
- `GET /api/admin/sync-status` 在 30 秒探针中返回 `200`，耗时 `0.990145s`

## 失败项

- `GET /v1/models`
  - 12 秒探针：超时，无响应体
  - 30 秒探针：超时，无响应体
  - 实际结果：`curl: (28) Operation timed out after 30006 milliseconds with 0 bytes received`
- `GET /api/admin/channels`
  - 12 秒探针：超时
  - 30 秒探针：超时，收到部分响应体 `65536` 字节但未完成
  - 实际结果：`curl: (28) Operation timed out after 30006 milliseconds with 65536 bytes received`

## 风险项

- `models` 和 `channels` 作为本次优化的核心收益接口，目前连单次 smoke 都不稳定，说明部署后仍存在严重性能或响应链路问题
- 在这种状态下继续做中压/高压回归只会放大现场扰动，信息增益很低

## 阻塞项

- 无法直接访问 Redis shell，因此这些用例本轮阻塞：
  - `cache:admin:sync-status` key 写入 / TTL
  - `cache:admin:channels` key 与 lock key
  - `models:list*` key 与 lock key
  - invalidate 后 key 删除验证
- 无法直接访问 PM2 / 服务器日志，因此这些用例本轮阻塞：
  - 多 worker online 验证
  - 定时任务仅 worker 0 启动验证

## 证据

- 登录响应：
  - `docs/test-reports/perf-raw/redis-cluster-admin-login-2026-04-03.json`
- sync-status 成功响应：
  - `docs/test-reports/perf-raw/redis-cluster-sync-status-30s-2026-04-03.json`
- channels 部分响应体：
  - `docs/test-reports/perf-raw/redis-cluster-channels-30s-partial-2026-04-03.json`

## 最终结论

本轮 API / 集成验收结论为 `FAIL`。

虽然管理员登录和 `/api/admin/sync-status` 可用，但 `/v1/models` 与 `/api/admin/channels` 在单次探针下已经出现严重超时，不满足继续进入完整功能验收和性能回归的前置条件。

建议先由开发侧排查：

1. `/v1/models` 是否出现缓存未命中后长时间阻塞
2. `/api/admin/channels` 是否在 Redis 锁、缓存反序列化或响应输出阶段卡住
3. 反向代理、应用层与 Redis 之间是否存在新的长尾问题
