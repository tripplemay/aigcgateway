# Redis 缓存迁移 + PM2 Cluster 性能测试用例 2026-04-03

## Summary

- Scope:
  - 为“内存缓存迁移到 Redis + PM2 cluster 模式”准备部署后性能回归与对比用例
- Documents:
  - 用户提供的优化方案《内存缓存迁移到 Redis + 开启 PM2 cluster 模式》
  - `docs/AIGC-Gateway-Full-PRD.md`
  - 既有性能基线报告：
    - `docs/test-reports/perf-staging-rerun-report-2026-04-02.md`
    - `docs/test-reports/perf-staging-pressure-report-2026-04-02.md`
- Environment:
  - 目标环境：staging
  - 目标地址：待部署后提供
- Result totals:
  - 本文仅生成测试用例，尚未执行测试

## 基线参考

- `GET /api/v1/models`
  - 中压旧基线：`300 req / c=20`，avg 约 `1702ms`
  - 高压旧基线：`500 req / c=30`，avg `3038ms`
- `GET /api/admin/sync-status`
  - 中压旧基线：`100 req / c=10`，avg 约 `380ms`
  - 高压旧基线：`150 req / c=15`，avg `2602ms`
- `GET /api/admin/channels`
  - 中压旧基线：`100 req / c=10`，avg `2062ms`
  - 高压旧基线：`150 req / c=15`，avg `4605ms`
- `POST /api/auth/login`
  - 中压旧基线：`100 req / c=10`，avg 约 `1687ms`
  - 高压旧基线：`200 req / c=15`，avg `2685ms`

## 场景矩阵

| 场景 | 角色 | 端点 / 作业 | 工作负载 | 目标指标 | 主要风险 | 执行顺序 |
|---|---|---|---|---|---|---|
| P-01 smoke models | anonymous | `GET /v1/models` | `20 req / c=2` | `200` 成功率 100%，无 5xx | 部署后读路径直接异常 | 1 |
| P-02 smoke sync-status | admin | `GET /api/admin/sync-status` | `20 req / c=2` | `200` 成功率 100% | Redis 缓存迁移后接口异常 | 2 |
| P-03 smoke channels | admin | `GET /api/admin/channels` | `20 req / c=2` | `200` 成功率 100% | Redis 锁逻辑导致长尾或异常 | 3 |
| P-04 compare models | anonymous | `GET /v1/models` | `200 req / c=20` | avg 明显优于 `1702ms`，无 5xx | cluster 无收益或 Redis 锁引入退化 | 4 |
| P-05 compare sync-status | admin | `GET /api/admin/sync-status` | `100 req / c=10` | 持平或优于 `380ms` | Redis 替代内存缓存反而变慢 | 5 |
| P-06 compare channels | admin | `GET /api/admin/channels` | `100 req / c=10` | avg 明显优于 `2062ms`，无 5xx | Redis 锁未挡住击穿，cluster 下仍慢 | 6 |
| P-07 compare login | developer | `POST /api/auth/login` | `100 req / c=10` | avg 优于 `1687ms` 或至少不退化 | cluster 切换后 session / Redis 压力变差 | 7 |
| P-08 stress models | anonymous | `GET /v1/models` | `500 req / c=30` | avg 优于 `3038ms`，压后接口可恢复 | 高压下仍进入严重退化 | 8 |
| P-09 stress admin read | admin | `GET /api/admin/channels`, `GET /api/admin/sync-status`, `GET /api/admin/users` | 各 `150 req / c=15` | 无 5xx，延迟曲线优于旧基线 | cluster 后管理员路径共性资源争用 | 9 |
| P-10 sync trigger timing | admin | `POST /api/admin/sync-models` | 单次触发 + 状态轮询 | 快速返回 `200/202`，后台完成 | trigger 再次卡在代理超时 | 10 |

## 可执行测试用例

ID: PERF-RC-001
Title: `/v1/models` smoke
Priority: Critical
Requirement Source: 第一步验收
Preconditions:
- staging 已部署完成
Request Sequence:
1. `autocannon -c 2 -a 20 <base>/v1/models`
   Payload:
   Expected Status: success
   Assertions:
   - 成功率 100%
   - 无 5xx
   - 输出指标可正常生成
State Assertions:
- 无
Cleanup:
- 无
Notes / Risks:
- 若实际入口为 `/api/v1/models`，执行时替换

ID: PERF-RC-002
Title: `/api/admin/sync-status` smoke
Priority: Critical
Requirement Source: 第一步验收
Preconditions:
- admin token 可用
Request Sequence:
1. `autocannon -c 2 -a 20 -H "Authorization: Bearer <token>" <base>/api/admin/sync-status`
   Payload:
   Expected Status: success
   Assertions:
   - 成功率 100%
   - 无 5xx
State Assertions:
- 无
Cleanup:
- 无
Notes / Risks:
- 该用例同时用于确认 Redis 缓存迁移未引入明显异常

ID: PERF-RC-003
Title: `/api/admin/channels` smoke
Priority: Critical
Requirement Source: 第一步验收
Preconditions:
- admin token 可用
Request Sequence:
1. `autocannon -c 2 -a 20 -H "Authorization: Bearer <token>" <base>/api/admin/channels`
   Payload:
   Expected Status: success
   Assertions:
   - 成功率 100%
   - 无 5xx
State Assertions:
- 无
Cleanup:
- 无
Notes / Risks:
- 若 smoke 已失败，则后续负载测试停止

ID: PERF-RC-004
Title: `/v1/models` 中压对比
Priority: Critical
Requirement Source: 可选中压对比
Preconditions:
- smoke 已通过
Request Sequence:
1. `autocannon -c 20 -a 200 <base>/v1/models`
   Payload:
   Expected Status: success
   Assertions:
   - avg 应明显优于旧基线 `1702ms`
   - 无 5xx
   - p95 / p99 不出现非线性爆炸
State Assertions:
- 压后单次 `curl` 仍应返回 200
Cleanup:
- 无
Notes / Risks:
- 若只达到“持平”，也需标记 cluster 收益不足

ID: PERF-RC-005
Title: `/api/admin/sync-status` 中压对比
Priority: High
Requirement Source: 可选中压对比
Preconditions:
- admin token 可用
Request Sequence:
1. `autocannon -c 10 -a 100 -H "Authorization: Bearer <token>" <base>/api/admin/sync-status`
   Payload:
   Expected Status: success
   Assertions:
   - avg 持平或优于旧基线 `380ms`
   - 无 5xx
State Assertions:
- 压后单次请求仍返回 200
Cleanup:
- 无
Notes / Risks:
- 若 Redis 缓存迁移导致明显退化，应记录为回归失败

ID: PERF-RC-006
Title: `/api/admin/channels` 中压对比
Priority: Critical
Requirement Source: Redis 锁 + cluster 核心收益点
Preconditions:
- admin token 可用
Request Sequence:
1. `autocannon -c 10 -a 100 -H "Authorization: Bearer <token>" <base>/api/admin/channels`
   Payload:
   Expected Status: success
   Assertions:
   - avg 应明显优于旧基线 `2062ms`
   - 无 5xx
State Assertions:
- 压后单次请求仍返回 200
Cleanup:
- 无
Notes / Risks:
- 这是本轮最重要的对比项之一

ID: PERF-RC-007
Title: `/api/auth/login` 中压对比
Priority: High
Requirement Source: cluster 整体容量收益验证
Preconditions:
- 有可复用测试账号
Request Sequence:
1. `autocannon -c 10 -a 100 -m POST -H 'Content-Type: application/json' -b '<login-payload>' <base>/api/auth/login`
   Payload:
   Expected Status: success
   Assertions:
   - avg 优于旧基线 `1687ms` 或至少不退化
   - 无异常 auth failure
State Assertions:
- 压后登录接口仍可单次成功
Cleanup:
- 无
Notes / Risks:
- 该项用于验证 cluster 是否带来 CPU 利用改善

ID: PERF-RC-008
Title: `/v1/models` 高压回归
Priority: High
Requirement Source: 第二步 cluster 收益验证
Preconditions:
- 中压已通过或至少无明显异常
Request Sequence:
1. `autocannon -c 30 -a 500 <base>/v1/models`
   Payload:
   Expected Status: success
   Assertions:
   - avg 优于旧基线 `3038ms`
   - 无持续 5xx
   - 压后 10 秒内单次 `curl` 可恢复为 200
State Assertions:
- 接口不应进入长期不可恢复的高延迟区
Cleanup:
- 无
Notes / Risks:
- 命中 stop condition 时立即停止后续升压

ID: PERF-RC-009
Title: 管理员读接口高压回归
Priority: High
Requirement Source: cluster + Redis 共享缓存收益验证
Preconditions:
- admin token 可用
Request Sequence:
1. `autocannon -c 15 -a 150 -H "Authorization: Bearer <token>" <base>/api/admin/channels`
   Payload:
   Expected Status: success
   Assertions:
   - 无 5xx
   - 指标优于旧高压基线 `4605ms`
2. `autocannon -c 15 -a 150 -H "Authorization: Bearer <token>" <base>/api/admin/sync-status`
   Payload:
   Expected Status: success
   Assertions:
   - 指标优于旧高压基线 `2602ms`
3. `autocannon -c 15 -a 150 -H "Authorization: Bearer <token>" "<base>/api/admin/users?page=1&pageSize=20"`
   Payload:
   Expected Status: success
   Assertions:
   - 无 5xx
State Assertions:
- 压后 3 个接口均可正常单次返回
Cleanup:
- 无
Notes / Risks:
- 若 `/api/admin/channels` 仍最差，应单独升级为 P0

ID: PERF-RC-010
Title: `POST /api/admin/sync-models` trigger 时延与后台完成时长
Priority: High
Requirement Source: 历史 `504` 回归验证
Preconditions:
- admin token 可用
- 本轮允许执行 1 次同步
Request Sequence:
1. 单次 POST `/api/admin/sync-models`
   Payload:
   Expected Status: 200 或 202
   Assertions:
   - 在代理预算内快速返回
2. 轮询 GET `/api/admin/sync-status`
   Payload:
   Expected Status: 200
   Assertions:
   - 任务最终进入完成态
   - `lastSyncTime` 或等价字段刷新
State Assertions:
- 后台任务最终完成，且 trigger 不超时
Cleanup:
- 无
Notes / Risks:
- 只做 1 次，不做频繁触发

## Stop Conditions

- 任一关键接口持续出现 5xx
- `/v1/models` 在高压下再次出现压后 10 秒单次请求超时
- 登录出现异常鉴权失败
- `sync-models` 再次触发代理 `504`
- staging 出现明显环境噪音或共享宿主机资源异常

## 执行命令摘要

- `autocannon ... 2>&1 | tee docs/test-reports/perf-raw/<name>.txt`
- 压后复查：
  - `curl --max-time 10 -sS -o /tmp/out -w "%{http_code} %{time_total}\n" <url>`
- 任务轮询：
  - `curl -H "Authorization: Bearer <token>" <base>/api/admin/sync-status`

## 覆盖缺口和假设

- 本轮只准备部署后回归用例，不在当前阶段设计长时间 soak
- 若 cluster 后入口路由变化，执行时按真实基址修正
- 若 staging 与生产仍共享同机资源，执行时继续遵守最小必要原则
