# Redis 缓存迁移 + PM2 Cluster 最终复验报告 2026-04-03

## 测试目标

验证上一轮遗留的两个问题是否已修复：

1. `8301` 是否已直接走 cluster
2. 外部访问大响应体 `/v1/models` 的超时问题是否缓解

## 测试环境

- 外部入口：`http://154.40.40.116:8301`
- 服务器 SSH：`root@154.40.40.116`
- 执行时间：`2026-04-03`

## 执行步骤概述

1. 外部直接访问 `8301`
2. SSH 检查 nginx 反代目标与 PM2 进程形态
3. 外部对 `8301/v1/models` 跑一轮中压回归

## 通过项

- `8301` 反代目标已修复：
  - nginx 配置确认：`proxy_pass http://127.0.0.1:3000;`
- staging 单 fork 已删除：
  - `pm2 list` 只剩 `aigc-gateway` 两个 `cluster` worker
- worker guard 仍在：
  - `pm2 logs aigc-gateway` 可见 `Worker 1 — skip schedulers`
- 外部 `POST /api/auth/login` 可用：
  - `200 1.447475`
- 外部 `/v1/models` 中压可跑通：
  - 工作负载：`200 req / c=20`
  - avg `1230.64ms`
  - p50 `1137ms`
  - p97.5 `2076ms`
  - max `3165ms`
  - throughput `14.29 req/s`
- 与旧中压基线相比，`/v1/models` 外部性能已改善：
  - 旧基线 avg 约 `1702ms`
  - 本轮 avg `1230ms`

## 失败项

- 外部单次 `curl /v1/models` 仍出现超时：
  - `curl --max-time 20`
  - 实际结果：`curl: (28) Operation timed out after 20004 milliseconds with 0 bytes received`

## 风险项

- 当前出现“单次 curl 超时，但 autocannon 中压能跑通且指标改善”的不一致现象
- 这说明问题已不再像上一轮那样是明确的应用级阻塞，更像某种：
  - 单次连接路径异常
  - 首包返回行为差异
  - 或当前执行环境到目标机器的网络抖动

## 证据

- 外部中压原始输出：
  - `docs/test-reports/perf-raw/redis-cluster-ext-models-mid-2026-04-03.txt`
- SSH 验证汇总：
  - `docs/test-reports/perf-raw/redis-cluster-ssh-verification-2026-04-03.txt`

## 最终结论

本轮结论为 `PARTIAL PASS`。

可以确认已修复：

1. staging 入口 `8301` 已改为走 `3000 cluster`
2. 旧的单 fork staging 进程已移除
3. 外部 `/v1/models` 中压性能相对旧基线已有明显改善

但还不能完全签收为“外部超时问题彻底消失”，因为我这里单次 `curl /v1/models` 仍能稳定打出 20 秒超时。  
因此最准确的判断是：

- 部署形态问题：已修复
- 外部性能：已明显改善
- 外部单次探针稳定性：仍存在残留不一致，需要继续观察
