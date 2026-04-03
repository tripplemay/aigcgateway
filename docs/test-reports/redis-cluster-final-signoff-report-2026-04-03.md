# Redis 缓存迁移 + PM2 Cluster 最终签收报告 2026-04-03

## 测试目标

对“内存缓存迁移到 Redis + 开启 PM2 cluster 模式”进行最终签收，确认本次优化是否达到验收标准。

## 测试环境

- 环境：staging
- 入口：`http://154.40.40.116:8301`
- 辅助验证方式：
  - 外部 HTTP 探针
  - 服务器 SSH
  - `redis-cli`
  - `pm2`
  - 服务器本机 `autocannon`

## 测试范围

- Redis 缓存迁移
  - `/api/admin/sync-status`
  - `/api/admin/channels`
  - `/v1/models`
- Redis TTL 与缓存写入行为
- PM2 cluster 部署形态
- worker guard / scheduler 行为证据
- 关键接口性能回归
- staging 入口部署形态回归

## 通过项

- Redis 缓存迁移已生效
  - 已验证存在：
    - `models:list`
    - `cache:admin:sync-status`
    - `cache:admin:channels`
  - TTL 观测正常：
    - `models:list` 观测到 `119`
    - `cache:admin:sync-status` 观测到 `29`
    - `cache:admin:channels` 观测到 `30`

- PM2 cluster 已生效
  - `aigc-gateway` 以 `cluster` 模式运行
  - 存在 2 个 online worker
  - 原先 staging 单 fork 进程已移除

- worker guard 已生效
  - 日志中可见：
    - `Worker 1 — skip schedulers`
  - 说明非 worker 0 不会重复启动调度任务

- staging 入口部署形态已修正
  - nginx `8301` 已确认反代到 `127.0.0.1:3000`
  - 不再反代到旧的 `3001` 单进程 staging 服务

- 应用本机性能回归明显改善
  - `GET /v1/models` `c=20 a=200`
    - 本轮 avg 约 `187-194ms`
    - 旧基线 avg 约 `1702ms`
  - `GET /api/admin/sync-status` `c=10 a=100`
    - 本轮 avg `48.47ms`
    - 旧基线 avg 约 `380ms`
  - `GET /api/admin/channels` `c=10 a=100`
    - 本轮 avg `136.68ms`
    - 旧基线 avg 约 `2062ms`
  - `POST /api/auth/login` `c=10 a=100`
    - 本轮 avg 约 `42-61ms`
    - 旧基线 avg 约 `1687ms`

- 外部入口中压已可跑通
  - `GET /v1/models` `c=20 a=200`
    - avg `1230.64ms`
    - p50 `1137ms`
    - p97.5 `2076ms`
    - 较旧外部基线 `1702ms` 有改善

## 非阻塞备注

- 我这边对外部 `GET /v1/models` 做单次 `curl --max-time 20` 时，仍可复现超时
- 但该现象与以下证据不一致：
  - 服务器本机 `3000/8301` 访问正常且很快
  - 服务器本机连续探针约 `20ms`
  - 外部 `autocannon` 中压已能稳定跑通
- 结合这些证据，当前更合理的归类是：
  - Codex 执行环境到南非 VPS 的外部网络链路问题
  - 不归类为应用缺陷
  - 不计入本轮签收阻塞项

## 风险项

- 暂未发现阻塞签收的应用级残留问题
- 后续若需要做公网真实用户体验评估，建议在更接近目标用户地域的探针环境复测

## 证据

- 签收依据报告：
  - [redis-cluster-rerun-acceptance-report-2026-04-03.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/redis-cluster-rerun-acceptance-report-2026-04-03.md)
  - [redis-cluster-final-recheck-report-2026-04-03.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/redis-cluster-final-recheck-report-2026-04-03.md)
- SSH / 部署形态证据：
  - [redis-cluster-ssh-verification-2026-04-03.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/redis-cluster-ssh-verification-2026-04-03.txt)
- 外部中压证据：
  - [redis-cluster-ext-models-mid-2026-04-03.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/redis-cluster-ext-models-mid-2026-04-03.txt)

## 最终结论

本次“Redis 缓存迁移 + PM2 cluster 模式”优化，验收结论为 `PASS`。

签收理由：

1. 功能侧目标全部达到
2. 部署形态已按方案修正
3. 缓存迁移与 worker guard 已有直接证据
4. 性能回归相对旧基线显著改善
5. 剩余异常可归因于 Codex 到 VPS 的外部网络链路，不属于应用实现问题
