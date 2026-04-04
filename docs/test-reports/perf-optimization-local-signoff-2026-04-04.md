# 性能优化批次 Local Signoff 2026-04-04

> 状态：**PASS**
> 环境：`localhost:3099`（Codex 测试环境）
> 触发：`progress.json status=verifying`，对性能优化批次做首轮正式验收

## 测试目标

验证以下 3 项优化是否按规格落地并可用：

- `F-PERF-01` Prisma 连接池保活（冷启动慢）
- `F-PERF-02` 模型页 Redis 缓存（持续慢）
- `F-PERF-03` 用量页查询优化（时间过滤 + 索引 + 缓存）

## 测试环境

- 本地测试服务：`http://localhost:3099`
- 启动方式：`bash scripts/test/codex-setup.sh`
- 测试账号：`admin@aigc-gateway.local`
- Redis：本地 `6379`
- 数据库：`scripts/test/codex-env.sh` 指向的 `aigc_gateway_test`

## 执行步骤概述

1. 重建本地测试环境并确认 `3099` 就绪
2. 验证 `prisma.ts` 单例实现与连接池参数注释
3. 重启服务，测登录与首个管理接口响应
4. 验证 `models-channels` 缓存主 key、过滤 key、TTL、Redis 降级和 sync invalidation
5. 注入本地 `call_logs` 测试数据，验证 `usage` / `by-model` / `by-provider` 的时间过滤、缓存、索引与时延
6. 清理本轮注入的本地测试数据

## 通过项

### F-PERF-01 — PASS

- [src/lib/prisma.ts](/Users/yixingzhou/project/aigcgateway/src/lib/prisma.ts) 已将 `PrismaClient` 挂到 `globalThis`
- 文件内已明确注明 `DATABASE_URL` 追加 `connection_limit=5&pool_timeout=2` 的预期格式
- 基于已构建产物重启本地服务后：
  - Next Ready：`57ms`
  - 登录接口：`128ms`
  - 首个管理接口 `GET /api/admin/sync-status`：`5.6ms`
- 启动日志未出现 `PrismaClientInitializationError` 或 `Can't reach database server`

### F-PERF-02 — PASS

- `GET /api/admin/models-channels` 首次请求：`12.5ms`
- 第二次请求（缓存命中）：`2.7ms`，满足 `< 200ms`
- Redis 主 key 已写入：`cache:admin:channels`，TTL=`300`
- 带过滤请求已写入参数化 key：`cache:admin:channels:TEXT:gemini`
- 在本地暂时关闭 Redis 后再次请求：
  - HTTP `200`
  - 接口仍返回有效数据，确认能降级走 DB
- 手动触发 `POST /api/admin/sync-models` 后：
  - `cache:admin:channels` 被删除
  - 下一次访问重新回源并重建缓存，TTL 重新为 `300`

### F-PERF-03 — PASS

- `by-model / by-provider / usage` 均支持 `period` 参数，默认 `7d`
- 运行时验证：
  - `usage?period=7d` 返回 `totalCalls=600`
  - `usage?period=30d` 返回 `totalCalls=900`
  - 证明时间过滤已生效
- 缓存 key 已写入：
  - `cache:admin:usage:7d`
  - `cache:admin:usage:by-model:7d`
  - `cache:admin:usage:by-provider:7d`
- 时延：
  - `usage` 首次 `26.1ms`，缓存命中 `1.8ms`
  - `by-model` 首次 `8.1ms`，缓存命中 `1.6ms`
  - `by-provider` 首次 `7.0ms`，缓存命中 `1.7ms`
  - 均满足本地 `< 1 秒`，且 `by-model` 缓存命中 `< 100ms`
- 索引：
  - migration 已存在：[20260404120000_add_call_logs_status_created_at_index/migration.sql](/Users/yixingzhou/project/aigcgateway/prisma/migrations/20260404120000_add_call_logs_status_created_at_index/migration.sql)
  - 数据库中已生效：`call_logs_status_createdAt_idx`
- `ANALYZE call_logs` 后的执行计划显示：
  - `by-model` 使用 `Bitmap Index Scan on "call_logs_createdAt_idx"`
  - `by-provider` 使用 `Bitmap Index Scan on "call_logs_createdAt_idx"`
  - `usage` 的成功数查询使用 `Index Only Scan using "call_logs_status_createdAt_idx"`

## 失败项

- 无

## 风险项

- `F-PERF-01` 的规格原文提到“停止服务 15 分钟后”的冷启动场景；本轮在本地只做了服务重启后的首请求探针，没有做 15 分钟空闲等待。当前结论建立在单例实现、启动日志和首请求时延都正常的前提上。
- `F-PERF-03` 的执行计划在刚插入大批历史数据但未 `ANALYZE` 前，会因为统计信息未刷新而选择顺序扫描；刷新统计后已按预期走时间索引。这不构成产品缺陷，但说明本地性能验证时要注意统计信息状态。

## 证据

- `models-channels` 首次/命中：`12.5ms / 2.7ms`
- `models-channels` Redis down 降级：HTTP `200`
- `models-channels` sync invalidation：删 key 后下次访问重建，TTL=`300`
- `usage` 首次/命中：`26.1ms / 1.8ms`
- `by-model` 首次/命中：`8.1ms / 1.6ms`
- `by-provider` 首次/命中：`7.0ms / 1.7ms`
- 首次登录：`128ms`
- 首个管理请求：`5.6ms`

## 最终结论

本轮本地首轮验收结果为 `3 PASS / 0 PARTIAL / 0 FAIL`。

性能优化批次已满足当前规格中的本地验收标准，可将 Harness 状态推进到 `done`。
