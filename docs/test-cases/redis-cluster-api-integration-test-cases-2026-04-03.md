# Redis 缓存迁移 + PM2 Cluster API / 集成测试用例 2026-04-03

## Summary

- Scope:
  - 验证本次“内存缓存迁移到 Redis + PM2 cluster 模式”改动在 staging 部署后的接口可用性、缓存行为、失效逻辑和后台任务单实例约束
- Documents:
  - 用户提供的优化方案《内存缓存迁移到 Redis + 开启 PM2 cluster 模式》
  - `docs/AIGC-Gateway-Full-PRD.md`
- Environment:
  - 目标环境：staging
  - 目标地址：待部署后提供
- Result totals:
  - 本文仅生成测试用例，尚未执行测试

## 场景矩阵

Scenario: Redis 缓存 key 写入与命中
Business Requirement: `/api/admin/sync-status`、`/api/admin/channels`、`/v1/models` 在迁移后应优先命中 Redis 缓存
Endpoints: `GET /api/admin/sync-status`, `GET /api/admin/channels`, `GET /api/v1/models`
Auth Context: admin / anonymous
Primary Risk: 缓存未写入、key 命名错误、TTL 不生效、命中后返回异常数据

Scenario: Redis 锁替代进程内 singleflight
Business Requirement: `/api/admin/channels` 与 `/v1/models` 在 cluster 模式下避免多 worker 并发击穿
Endpoints: `GET /api/admin/channels`, `GET /api/v1/models`
Auth Context: admin / anonymous
Primary Risk: 锁未生效、锁释放错误、等待重试分支失效、并发下重复打 DB

Scenario: 缓存失效覆盖
Business Requirement: 模型同步完成后应删除 `models:list*` 与 `cache:admin:channels`
Endpoints: `POST /api/admin/sync-models`, `GET /api/admin/sync-status`, `GET /api/admin/channels`, `GET /api/v1/models`
Auth Context: admin
Primary Risk: invalidate 漏 key，导致旧数据长时间滞留

Scenario: cluster 模式下只启动一套定时任务
Business Requirement: 仅 worker 0 启动健康检查、模型同步、订单清理等任务
Endpoints: `pm2 list`, `pm2 logs`
Auth Context: server shell / admin observer
Primary Risk: 多 worker 重复执行任务，引起重复同步、重复清理、重复告警

Scenario: cluster 部署后基础功能不回退
Business Requirement: cluster 模式下基础接口仍可正常工作
Endpoints: `GET /api/v1/models`, `GET /api/admin/channels`, `GET /api/admin/sync-status`
Auth Context: anonymous / admin
Primary Risk: cluster 配置导致路由异常、session 异常、Redis 读写异常

## 可执行测试用例

ID: API-RC-001
Title: `/api/admin/sync-status` 首次请求写入 Redis 缓存
Priority: Critical
Requirement Source: 改动 1
Preconditions:
- staging 已完成部署并可访问
- 可获取 admin token
- 可访问目标 Redis
Request Sequence:
1. Redis 删除 `cache:admin:sync-status`
   Payload:
   Expected Status: success
   Assertions:
   - 删除后 `redis-cli GET cache:admin:sync-status` 为空
2. GET `/api/admin/sync-status`
   Payload:
   Expected Status: 200
   Assertions:
   - 返回 JSON 结构合法
3. Redis 读取 `cache:admin:sync-status`
   Payload:
   Expected Status: success
   Assertions:
   - key 存在
   - TTL 在 `1..30` 秒区间内
State Assertions:
- 第二步返回结果与 Redis 中缓存值语义一致
Cleanup:
- 无
Notes / Risks:
- 若环境无法直接访问 Redis，则此用例阻塞

ID: API-RC-002
Title: `/api/admin/sync-status` 第二次请求命中 Redis 缓存
Priority: High
Requirement Source: 改动 1
Preconditions:
- `cache:admin:sync-status` 已写入
Request Sequence:
1. GET `/api/admin/sync-status`
   Payload:
   Expected Status: 200
   Assertions:
   - 返回体与首次请求一致或符合时间窗口内的同值期望
2. 记录两次响应时间
   Payload:
   Expected Status: success
   Assertions:
   - 第二次请求不应显著慢于第一次
State Assertions:
- 缓存仍存在且 TTL 递减
Cleanup:
- 无
Notes / Risks:
- 该用例关注命中行为，不要求绝对耗时阈值

ID: API-RC-003
Title: `/api/admin/channels` 首次请求写入 Redis 缓存
Priority: Critical
Requirement Source: 改动 2
Preconditions:
- admin token 可用
- Redis 可访问
Request Sequence:
1. Redis 删除 `cache:admin:channels` 与 `cache:admin:channels:lock`
   Payload:
   Expected Status: success
   Assertions:
   - 两个 key 均不存在
2. GET `/api/admin/channels`
   Payload:
   Expected Status: 200
   Assertions:
   - 返回数组或分页结构合法
3. Redis 读取 `cache:admin:channels`
   Payload:
   Expected Status: success
   Assertions:
   - key 存在
   - TTL 在 `1..30` 秒区间
State Assertions:
- 返回体与缓存值一致
Cleanup:
- 无
Notes / Risks:
- 若 lock key 残留，需要记录 TTL 与残留时长

ID: API-RC-004
Title: `/api/admin/channels` 并发请求只应出现 1 次建缓存窗口
Priority: Critical
Requirement Source: 改动 2
Preconditions:
- 已清空 `cache:admin:channels`
- 可以执行并发 GET
Request Sequence:
1. 并发发起 5 到 10 个 GET `/api/admin/channels`
   Payload:
   Expected Status: 全部 200
   Assertions:
   - 无 5xx
   - 无异常长尾超时
2. Redis 检查 `cache:admin:channels` 与 `cache:admin:channels:lock`
   Payload:
   Expected Status: success
   Assertions:
   - 缓存 key 存在
   - lock key 最终已消失
State Assertions:
- 并发完成后缓存可稳定命中
Cleanup:
- 无
Notes / Risks:
- 若无法直接观测 DB 查询次数，用“无大量超时、无残留锁、后续命中正常”作为替代证据

ID: API-RC-005
Title: `/v1/models` 首次请求写入 Redis 缓存且不回退 contract
Priority: Critical
Requirement Source: 改动 3
Preconditions:
- Redis 可访问
Request Sequence:
1. Redis 删除 `models:list`, `models:list:TEXT`, `models:list:IMAGE`, 对应 `:lock` key
   Payload:
   Expected Status: success
   Assertions:
   - 目标 key 不存在
2. GET `/v1/models`
   Payload:
   Expected Status: 200
   Assertions:
   - 返回模型列表
   - contract 不回退
3. Redis 查询 `models:list*`
   Payload:
   Expected Status: success
   Assertions:
   - 至少出现对应场景下应写入的缓存 key
   - TTL 在 `1..120` 秒区间
State Assertions:
- 返回值可被后续请求复用
Cleanup:
- 无
Notes / Risks:
- 若路由基址实际为 `/api/v1/models`，执行时按真实入口调整并记录

ID: API-RC-006
Title: `/v1/models` 并发请求使用 Redis 锁防击穿
Priority: Critical
Requirement Source: 改动 3
Preconditions:
- 目标缓存 key 已清空
Request Sequence:
1. 并发发起 10 到 20 个 GET `/v1/models`
   Payload:
   Expected Status: 全部 200
   Assertions:
   - 无 5xx
   - 无异常长尾超时
2. 检查 `models:list*:lock`
   Payload:
   Expected Status: success
   Assertions:
   - lock key 最终被清理
3. 再次单次 GET `/v1/models`
   Payload:
   Expected Status: 200
   Assertions:
   - 第二轮为缓存命中路径
State Assertions:
- 缓存存在
Cleanup:
- 无
Notes / Risks:
- 若支持 modality 区分，可按 `TEXT`、`IMAGE` 再各补一轮

ID: API-RC-007
Title: 模型同步完成后正确失效 models 与 channels 缓存
Priority: Critical
Requirement Source: 改动 4
Preconditions:
- admin token 可用
- Redis 可访问
- `models:list*` 与 `cache:admin:channels` 已经存在
Request Sequence:
1. POST `/api/admin/sync-models`
   Payload:
   Expected Status: 200 或 202
   Assertions:
   - 触发成功
2. 轮询 GET `/api/admin/sync-status`
   Payload:
   Expected Status: 200
   Assertions:
   - 最终到达 completed / idle / 等价完成态
3. Redis 查询上述缓存 key
   Payload:
   Expected Status: success
   Assertions:
   - 同步完成后 key 已被删除，或在下一次读取前为空
4. 再次请求 GET `/v1/models` 与 GET `/api/admin/channels`
   Payload:
   Expected Status: 200
   Assertions:
   - 可重新建缓存
State Assertions:
- invalidate 覆盖 `models:list`, `models:list:TEXT`, `models:list:IMAGE`, `cache:admin:channels`
Cleanup:
- 无
Notes / Risks:
- 若实际同步流程较重，应控制只跑 1 次

ID: API-RC-008
Title: PM2 cluster 模式启动多个 worker 且状态 online
Priority: Critical
Requirement Source: 改动 6
Preconditions:
- staging 已切换到 PM2 cluster
- 可执行 `pm2 list`
Request Sequence:
1. 执行 `pm2 list`
   Payload:
   Expected Status: success
   Assertions:
   - `aigc-gateway` 存在多个实例
   - 所有实例 `online`
State Assertions:
- 实例数量大于 1
Cleanup:
- 无
Notes / Risks:
- 若 PM2 进程名有变更，执行时按实际名称记录

ID: API-RC-009
Title: cluster 模式下定时任务只在 worker 0 启动
Priority: Critical
Requirement Source: 改动 5
Preconditions:
- 可访问 `pm2 logs`
Request Sequence:
1. 执行 `pm2 logs aigc-gateway --lines 100 | grep "health check\\|model sync\\|order cleanup"`
   Payload:
   Expected Status: success
   Assertions:
   - 每类任务只出现 1 条启动日志，或只来自同一 worker
State Assertions:
- 不存在每个 worker 都打印一份启动日志的现象
Cleanup:
- 无
Notes / Risks:
- 若日志格式不含 worker id，应改为观察重复启动次数

ID: API-RC-010
Title: cluster 模式部署后基础接口不回退
Priority: High
Requirement Source: 改动 1-6
Preconditions:
- 应用已稳定运行
Request Sequence:
1. GET `/v1/models`
   Payload:
   Expected Status: 200
   Assertions:
   - 返回模型列表
2. GET `/api/admin/channels`
   Payload:
   Expected Status: 200
   Assertions:
   - 返回 channels 数据
3. GET `/api/admin/sync-status`
   Payload:
   Expected Status: 200
   Assertions:
   - 返回同步状态
State Assertions:
- 无明显 session / 路由 / Redis 异常
Cleanup:
- 无
Notes / Risks:
- 这是部署后 smoke gate，用于决定是否进入后续性能测试

## 执行命令摘要

- Redis key 检查：
  - `redis-cli keys "cache:*"`
  - `redis-cli keys "models:*"`
  - `redis-cli ttl <key>`
- PM2 检查：
  - `pm2 list`
  - `pm2 logs aigc-gateway --lines 100`
- HTTP 检查：
  - `curl -s -o /dev/null -w "%{http_code}" <url>`
  - 并发读取可用 `autocannon` 或 `xargs -P`

## 覆盖缺口和假设

- 若 staging 不开放 Redis / PM2 shell 访问，则涉及 key 与 worker 的用例会阻塞
- 本轮只准备“部署后验收”用例，不覆盖代码级单元测试
- 若 `/v1/models` 实际部署入口仍为 `/api/v1/models`，执行时按真实环境修正并在报告里注明
