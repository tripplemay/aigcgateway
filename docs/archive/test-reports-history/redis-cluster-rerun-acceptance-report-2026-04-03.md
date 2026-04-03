# Redis 缓存迁移 + PM2 Cluster 回归验收报告 2026-04-03

## 测试目标

按既定 API / 集成与性能用例，复验 staging 上“内存缓存迁移到 Redis + PM2 cluster 模式”的实际落地情况。

## 测试环境

- 目标入口：`http://154.40.40.116:8301`
- SSH 服务器：`root@154.40.40.116`
- 执行时间：`2026-04-03`
- 验证方式：
  - 外部 HTTP 探针
  - SSH 到服务器后本机 `curl`
  - SSH 到服务器后 `redis-cli`
  - SSH 到服务器后 `pm2`
  - SSH 到服务器后本机 `autocannon`

## 测试范围

- Redis 缓存写入 / TTL
- 关键接口 smoke
- PM2 cluster / scheduler guard
- 中压性能回归
- 外部入口可用性复查

## 执行步骤概述

1. 先从本地直接访问 staging 入口做 smoke
2. 使用 SSH 进入服务器，检查 Redis key、PM2、nginx 反向代理关系
3. 在服务器本机直接打 `127.0.0.1:3001` 和 `127.0.0.1:8301`，排除外部网络噪音
4. 在服务器本机执行中压 `autocannon`，与旧基线对比

## 通过项

- Redis 缓存迁移已落地：
  - `models:list` 存在，TTL 观测到 `119`
  - authenticated 访问后出现：
    - `cache:admin:sync-status`
    - `cache:admin:channels`
  - TTL 观测：
    - `cache:admin:sync-status = 29`
    - `cache:admin:channels = 30`
- 应用本机接口正常：
  - `127.0.0.1:3001/v1/models -> 200 0.036405`
  - `127.0.0.1:3001/api/auth/login -> 200 0.330396`
  - `127.0.0.1:3001/api/admin/sync-status -> 200 0.092906`
  - `127.0.0.1:3001/api/admin/channels -> 200 0.545763`
- nginx 到 staging 本机入口正常：
  - `127.0.0.1:8301/v1/models -> 200 0.041517`
  - `127.0.0.1:8301/api/auth/login -> 200 0.163803`
- worker guard 有证据表明已生效：
  - `pm2 logs aigc-gateway` 中看到 `Worker 1 — skip schedulers`
  - worker 0 日志中可见同步 / 健康检查相关输出
- 本机中压性能显著优于旧基线：
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

## 失败项

- staging 入口对应的应用进程形态与“cluster 模式部署到 staging”不一致：
  - `pm2 list` 显示：
    - `aigc-gateway` id `0`、`1` 为 `cluster`
    - 但 `aigc-staging` 为单独 `fork`
  - `ss -ltnp` 与 nginx 配置显示：
    - `8301 -> nginx`
    - nginx `proxy_pass http://127.0.0.1:3001`
    - `3001` 由 `aigc-staging` 单进程提供
  - 这意味着当前 staging 入口 `8301` 本身不是由 cluster 进程承载

## 风险项

- 从我当前执行环境直接访问外部 `8301` 时，`/v1/models` 仍会 15 秒超时：
  - `curl: (28) Operation timed out after 15005 milliseconds with 0 bytes received`
  - 同时外部 `POST /api/auth/login` 为 `200 1.222024`
- 结合服务器本机 `8301` 与 `3001` 都很快，当前更像是：
  - 外部网络路径问题
  - 或 nginx / 大响应体传输层问题
  - 而不是应用本身慢

## 证据

- 结构化证据：
  - [redis-cluster-ssh-verification-2026-04-03.txt](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/redis-cluster-ssh-verification-2026-04-03.txt)
- 先前采集的响应体：
  - [redis-cluster-admin-login-2026-04-03.json](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/redis-cluster-admin-login-2026-04-03.json)
  - [redis-cluster-sync-status-30s-2026-04-03.json](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/redis-cluster-sync-status-30s-2026-04-03.json)
  - [redis-cluster-channels-30s-partial-2026-04-03.json](/Users/yixingzhou/project/aigcgateway/docs/test-reports/perf-raw/redis-cluster-channels-30s-partial-2026-04-03.json)

## 最终结论

本轮结论为 `PARTIAL PASS`。

可以确认通过的部分：

- Redis 缓存迁移已经生效
- worker guard 已有正向证据
- 在服务器本机维度，关键接口性能相比旧基线显著改善

当前未完全通过的部分：

- staging 入口 `8301` 仍由 `aigc-staging` 单进程 `fork` 提供，而不是 cluster 进程
- 从我当前执行环境直接访问外部 `8301/v1/models` 仍存在超时

因此，这轮优化不能签收为“按方案完整落地到 staging 入口”，但可以确认“应用与缓存优化本身”已经产生明显效果。
