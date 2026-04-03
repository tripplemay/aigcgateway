# AIGC Gateway 完整性能测试计划

## 测试目标

基于 [AIGC-Gateway-Full-PRD.md](/Users/yixingzhou/project/aigcgateway/docs/AIGC-Gateway-Full-PRD.md) 为当前项目生成一版完整性能测试计划，覆盖：

- 公开接口
- 普通用户
- 管理员
- 后台任务

目标是建立一套可执行的性能场景矩阵，用于评估：

- 网关读路径的响应能力
- 鉴权 / 余额 / 限流中间件开销
- 写路径与异步后处理的吞吐能力
- 管理后台大表与重任务的稳定性
- 定时同步、健康检查、异步日志 / 扣费等后台链路的时延与堆积风险

## 依据文档

- [AIGC-Gateway-Full-PRD.md](/Users/yixingzhou/project/aigcgateway/docs/AIGC-Gateway-Full-PRD.md)
- `aigc-gateway-performance-testing/references/system-hot-paths.md`
- `aigc-gateway-performance-testing/references/scenario-matrix.md`
- `aigc-gateway-performance-testing/references/tool-selection.md`

## 计划原则

- 先测便宜路径，再测重路径
- 先读后写，先短压后长压
- 先验证平台自身瓶颈，再区分第三方依赖瓶颈
- 对会命中真实模型计费的场景，优先用零余额、权限拦截、限流拦截等低成本路径验证中间件能力
- 对后台任务，优先测“触发耗时、任务完成耗时、锁冲突、部分失败率”，而不是盲目放大并发

## 环境建议

### 首选环境

- 本地独立测试环境
- 专用 staging / perf 环境

### 生产环境限制

- 生产只允许最小必要负载
- 对 `POST /api/v1/chat/completions`、`POST /api/admin/sync-models`、支付相关接口，只有在明确授权且预算受控时才执行
- 若在生产执行，第一轮只做 smoke 与极小并发验证，不直接上负载

## 分层测试阶段

### Phase 0: Smoke

目标：

- 确认接口正确性
- 校准认证、测试账号、测试项目、零余额项目、管理员身份
- 确认 Nginx / Next.js / PM2 / DB / Redis 基本可用

建议工具：

- `scripts/http_load_probe.py`

### Phase 1: 读路径基线

目标：

- 找出公开读接口、管理读接口、普通用户读接口的基线延迟
- 建立缓存命中 / 未命中情况下的响应参考

建议工具：

- `autocannon`

### Phase 2: 中间件与轻写路径

目标：

- 测量登录、注册、项目创建、API Key 创建、零余额 fast-fail 的中间件成本
- 观察 DB / Redis / session / limiter 压力

建议工具：

- `autocannon`
- `k6`

### Phase 3: 重路径与管理重任务

目标：

- 验证真实网关调用链路
- 验证 admin sync trigger 的超时预算、锁冲突和降级保护

建议工具：

- `k6`

### Phase 4: Soak / 稳定性

目标：

- 验证 `CallLog`、余额扣减、限流器、健康检查、定时同步长时间运行是否出现延迟漂移、堆积或内存增长

建议工具：

- `k6`

## 全局指标标准

以下指标是本计划默认目标，可按环境级别调整：

- 成功率：
  - 读路径 `>= 99.9%`
  - 写路径 `>= 99.5%`
  - 后台任务触发 `>= 99%`
- 5xx：
  - 基线与负载阶段要求 `= 0`
  - 压测阶段允许在 Stop Condition 触发前短暂出现，但不能持续
- 超时率：
  - 读路径 `= 0`
  - 写路径 `< 0.5%`
- 延迟：
  - 简单 GET p95 `< 500ms`
  - 鉴权 / 登录 / 注册 p95 `< 800ms`
  - 项目 / Key 创建 p95 `< 1000ms`
  - 零余额 fast-fail 聊天请求 p95 `< 800ms`
  - 真实模型调用网关侧首包前处理 p95 `< 400ms`
  - 管理重查询 p95 `< 1200ms`
  - sync trigger HTTP 返回 `< 5000ms`，不得撞上代理超时
- 稳定性：
  - 30 分钟 soak 期间 p95 漂移不超过基线 30%
  - error rate 不随时间持续抬升

## Stop Conditions

出现以下任一情况应立即降载或停止：

- 连续出现 5xx
- 同级负载相比上一档 p95 非线性飙升超过 2 倍
- Nginx 出现 502 / 504
- 登录 / 鉴权出现异常失败
- 限流器误伤正常请求
- 第三方模型计费明显超出批准预算
- 后台 sync / health job 不再刷新状态
- DB 或 Redis 出现连接耗尽、锁等待明显上升

## 场景矩阵

### A. 公开接口

| 场景 ID | 场景 | 接口 / 作业 | 角色 | 代表请求 | 工作负载 | 目标指标 | 主要风险点 | 执行顺序 |
|---|---|---|---|---|---|---|---|---|
| PUB-01 | 模型公开列表 Smoke | `GET /api/v1/models` | 匿名 | 无鉴权 GET | 20 req / c=2 | p95 < 400ms, 5xx=0 | 模型表过大、聚合查询慢、缓存未命中 | 1 |
| PUB-02 | 模型公开列表负载 | `GET /api/v1/models` | 匿名 | 无鉴权 GET | 100 req / c=10 | p95 < 500ms, success >= 99.9% | DB 读放大、JSON 序列化开销、网关压缩开销 | 2 |
| PUB-03 | 模型公开列表压力上探 | `GET /api/v1/models` | 匿名 | 无鉴权 GET | 300 req / c=30 | 找到退化阈值，不接受持续 5xx | Nginx worker、Node event loop、模型结果集过大 | 3 |
| PUB-04 | 文档 / 控制台首页静态读 | `GET /` 或关键文档页 | 匿名 | 页面 GET | 50 req / c=5 | p95 < 300ms | SSR 冷启动、静态资源缓存策略 | 4 |

### B. 普通用户

| 场景 ID | 场景 | 接口 / 作业 | 角色 | 代表请求 | 工作负载 | 目标指标 | 主要风险点 | 执行顺序 |
|---|---|---|---|---|---|---|---|---|
| DEV-01 | 登录 Smoke | `POST /api/auth/login` | 普通用户 | 邮箱+密码 | 10 req / c=1 | p95 < 600ms, auth fail=0 | session / JWT 签发、DB 用户查询、密码 hash | 5 |
| DEV-02 | 登录负载 | `POST /api/auth/login` | 普通用户 | 邮箱+密码 | 50 req / c=5 | p95 < 800ms, success >= 99.5% | DB / Redis 压力、bcrypt 开销 | 6 |
| DEV-03 | 注册小负载 | `POST /api/auth/register` | 普通用户 | 新邮箱注册 | 20 req / c=2 | p95 < 1000ms, success >= 99% | 唯一索引竞争、密码 hash、脏数据清理 | 7 |
| DEV-04 | 项目创建小负载 | `POST /api/projects` | 普通用户 | 新建项目 | 10 req / c=2 | p95 < 1000ms, 5xx=0 | 项目表写入、用户-项目关系写入 | 8 |
| DEV-05 | API Key 创建小负载 | `POST /api/projects/:id/keys` | 普通用户 | 项目下创建 Key | 10 req / c=2 | p95 < 1000ms, 5xx=0 | hash 计算、唯一 keyPrefix、写放大 | 9 |
| DEV-06 | 用户侧余额读取 | `GET /api/projects/:id/balance` | 普通用户 | 已登录读取余额 | 50 req / c=5 | p95 < 500ms | 项目余额热点读、事务尾延迟 | 10 |
| DEV-07 | 用户侧日志列表读取 | `GET /api/projects/:id/logs?page=1&pageSize=20` | 普通用户 | 首屏日志页 | 50 req / c=5 | p95 < 800ms | CallLog 量增长后分页退化、排序索引 | 11 |
| DEV-08 | 用户侧用量汇总读取 | `GET /api/projects/:id/usage?period=7d` | 普通用户 | 7d 汇总 | 50 req / c=5 | p95 < 800ms | 聚合查询、日表缺索引、冷热数据混读 | 12 |
| DEV-09 | 零余额快速拒绝 | `POST /api/v1/chat/completions` | 普通用户 | 零余额项目 + 小 prompt | 30 req / c=3 | 402 一致性 >= 99.5%, p95 < 800ms | 余额检查路径慢、外部模型被误调用 | 13 |
| DEV-10 | 无权限快速拒绝 | `POST /api/v1/chat/completions` | 普通用户 | `chatCompletion=false` Key | 30 req / c=3 | 403 一致性 >= 99.5%, p95 < 700ms | 权限判断顺序错误、外部调用未被短路 | 14 |
| DEV-11 | 项目级 / Key级限流命中 | `POST /api/v1/chat/completions` | 普通用户 | 小 prompt + 低 RPM key | staged 1m / 2->10 VUs | 429 命中稳定, 误伤率=0 | Redis limiter 热点、限流窗口不准 | 15 |
| DEV-12 | 真实聊天调用基线 | `POST /api/v1/chat/completions` | 普通用户 | 小 prompt, 低成本模型 | 10 req / c=1 | 网关前处理 p95 < 400ms, 总成功率 >= 99% | Provider 延迟掩盖平台瓶颈、外部计费 | 16 |
| DEV-13 | 真实聊天小负载 | `POST /api/v1/chat/completions` | 普通用户 | 小 prompt, 低成本模型 | 30 req / c=3 | success >= 99%, 无明显队列堆积 | CallLog 异步写延迟、余额扣减并发冲突 | 17 |
| DEV-14 | 流式首 token 性能 | `POST /v1/chat/completions` SSE | 普通用户 | `stream=true` | 10 req / c=2 | TTFT p95 < 1500ms | SSE flush、provider 首包慢、代理缓冲 | 18 |
| DEV-15 | 长稳态写入 Soak | `POST /api/v1/chat/completions` + `GET /logs` | 普通用户 | 小 prompt, 低成本模型 | 20-30 min / 3 VUs | p95 漂移 < 30%, log lag 可控 | `CallLog` 堆积、余额扣减 lag、内存增长 | 19 |

### C. 管理员

| 场景 ID | 场景 | 接口 / 作业 | 角色 | 代表请求 | 工作负载 | 目标指标 | 主要风险点 | 执行顺序 |
|---|---|---|---|---|---|---|---|---|
| ADM-01 | 管理员登录 | `POST /api/auth/login` | 管理员 | 管理员账号登录 | 20 req / c=2 | p95 < 800ms | 与普通登录相同，外加 RBAC 分支 | 20 |
| ADM-02 | 同步状态读取 | `GET /api/admin/sync-status` | 管理员 | 读同步状态 | 50 req / c=5 | p95 < 500ms | 状态表热点读、锁状态查询 | 21 |
| ADM-03 | 通道列表读取 | `GET /api/admin/channels` | 管理员 | 通道列表 | 50 req / c=5 | p95 < 800ms | 结果集大、provider/model join | 22 |
| ADM-04 | 模型-通道大表读取 | `GET /api/admin/models-channels` | 管理员 | 大列表 | 30 req / c=3 | p95 < 1200ms | join 复杂、分页与筛选不走索引 | 23 |
| ADM-05 | 用户列表读取 | `GET /api/admin/users?page=1&pageSize=20` | 管理员 | 用户列表 | 50 req / c=5 | p95 < 800ms | 用户-项目聚合、统计字段联表 | 24 |
| ADM-06 | 健康面板读取 | `GET /api/admin/health` | 管理员 | 健康概览 | 30 req / c=3 | p95 < 1000ms | HealthCheck 聚合、通道数量增长 | 25 |
| ADM-07 | 手动同步触发 Smoke | `POST /api/admin/sync-models` | 管理员 | 触发同步 | 单次 | HTTP 返回 < 5000ms | 代理超时、任务锁失效、下游文档拉取慢 | 26 |
| ADM-08 | 手动同步稳定性 | `POST /api/admin/sync-models` | 管理员 | 串行重复触发 3 次 | 3 次 / 间隔执行 | 不重复并发执行, 状态刷新正常 | scheduler lock 冲突、重复任务污染 | 27 |
| ADM-09 | 管理员读接口 Soak | `sync-status + channels + users` | 管理员 | 读接口混合流量 | 20 min / 5 VUs | p95 漂移 < 25% | 后台任务与读请求争抢 DB 资源 | 28 |

### D. 后台任务

| 场景 ID | 场景 | 接口 / 作业 | 角色 | 代表请求 | 工作负载 | 目标指标 | 主要风险点 | 执行顺序 |
|---|---|---|---|---|---|---|---|---|
| JOB-01 | 应用启动自动同步 | startup auto-sync | 后台任务 | 应用启动后自动触发 | 单次计时 | 总耗时可观测，失败不阻塞启动 | 冷启动时长、同步锁、外部依赖超时 | 29 |
| JOB-02 | 每日 4:00 模型同步 | daily model sync | 后台任务 | 全量模型同步 | 单次 + 历史对比 | 总耗时、成功率、模型变更数可记录 | Jina / DeepSeek 慢、AI 提取失败、数据覆盖异常 | 30 |
| JOB-03 | AI 补全降级保护 | sync fallback | 后台任务 | 模拟 Jina/AI 异常 | 单次故障注入 | 现有数据不被清空, fallback 生效 | 0 模型写回、低于 50% 数据误覆盖 | 31 |
| JOB-04 | 健康检查任务 | health checks | 后台任务 | 批量探测 Channel | 单次 + 小并发 | 完成时长稳定, 写入无阻塞 | 大量通道探测、第三方 timeout、写入膨胀 | 32 |
| JOB-05 | 异步 CallLog 写入 lag | async log write | 后台任务 | 聊天请求后日志落库 | 结合 DEV-13/15 | log lag p95 < 3s | 异步队列堆积、日志表写放大 | 33 |
| JOB-06 | 异步余额扣减 lag | async balance deduction | 后台任务 | 聊天请求后扣费 | 结合 DEV-13/15 | 扣费延迟可控, 无并发超扣 | 并发安全、事务锁、余额读写竞争 | 34 |
| JOB-07 | 订单关闭 / 余额告警 | order close / balance alert | 后台任务 | 定时任务 | 单次 + 30min 观察 | 不出现明显 backlog | 定时任务堆叠、邮件/通知外部依赖慢 | 35 |

## 推荐执行顺序

按技能默认顺序和 PRD 热点链路，推荐正式执行顺序如下：

1. `PUB-01` 模型公开列表 Smoke
2. `PUB-02` 模型公开列表负载
3. `PUB-03` 模型公开列表压力上探
4. `DEV-01` 登录 Smoke
5. `DEV-02` 登录负载
6. `DEV-03` 注册小负载
7. `DEV-04` 项目创建小负载
8. `DEV-05` API Key 创建小负载
9. `DEV-06` 余额读取
10. `DEV-07` 日志列表读取
11. `DEV-08` 用量汇总读取
12. `DEV-09` 零余额快速拒绝
13. `DEV-10` 无权限快速拒绝
14. `DEV-11` 限流命中
15. `DEV-12` 真实聊天调用基线
16. `DEV-13` 真实聊天小负载
17. `DEV-14` 流式首 token 性能
18. `ADM-02` 同步状态读取
19. `ADM-03` 通道列表读取
20. `ADM-04` 模型-通道大表读取
21. `ADM-05` 用户列表读取
22. `ADM-06` 健康面板读取
23. `ADM-07` 手动同步触发 Smoke
24. `ADM-08` 手动同步稳定性
25. `JOB-01` 启动自动同步
26. `JOB-02` 每日 4:00 模型同步
27. `JOB-03` AI 补全降级保护
28. `JOB-04` 健康检查任务
29. `DEV-15` 长稳态写入 Soak
30. `ADM-09` 管理员读接口 Soak
31. `JOB-05` 异步 CallLog 写入 lag
32. `JOB-06` 异步余额扣减 lag
33. `JOB-07` 订单关闭 / 余额告警

## 场景与工具建议

| 场景类型 | 推荐工具 | 原因 |
|---|---|---|
| 单接口公开 GET | `autocannon` | 快速、便于比较不同版本 |
| 登录 / 注册 / 小写入 | `autocannon` 或 `http_load_probe.py` | 快速回归，易控制副作用 |
| 多阶段用户路径 | `k6` | 可以编排鉴权、创建项目、创建 Key、发起调用 |
| SSE / 流式 | `k6` | 更适合记录 TTFT、阶段阈值 |
| 管理重任务 | `k6` + 单次 timing 脚本 | 便于记录 trigger 返回时间与后台完成时间 |
| 后台任务 | 任务埋点 + shell timing + `k6` 辅助 | 需要区分触发耗时和任务完成耗时 |
| 陌生环境 first-pass | `scripts/http_load_probe.py` | 零依赖、风险低 |

## 关键观测指标

每个场景至少采集：

- total requests
- success rate
- status code distribution
- avg latency
- p50 latency
- p95 latency
- p99 latency
- max latency
- achieved throughput
- timeout / connection errors

以下场景额外采集：

- SSE：
  - TTFT
  - tokens per second
- 聊天写路径：
  - CallLog 写入延迟
  - 余额扣减延迟
  - provider latency 与 gateway latency 分离值
- sync / health job：
  - job start latency
  - total duration
  - partial failure rate
  - lock wait / overlap 情况

## 重点风险说明

### 1. 网关路径与第三方 provider 路径耦合

`POST /api/v1/chat/completions` 的总时延会被 provider 放大，因此测试时必须区分：

- 网关前处理耗时
- provider 调用耗时
- 异步日志 / 扣费后处理耗时

否则容易把第三方瓶颈误判为平台瓶颈。

### 2. `CallLog` 和扣费是写压核心

PRD 明确聊天完成后会异步写 `CallLog` 和执行 `deduct_balance`。所以即使同步响应时间正常，仍需要单独观察：

- 日志落库 lag
- 扣费 lag
- 高并发后是否出现余额错误、写入积压

### 3. 模型同步是最重管理任务

模型同步依赖：

- 各 provider `/models`
- Jina Reader
- 内部 DeepSeek 提取

它天然是多依赖长链路，测试必须关注：

- HTTP trigger 是否受 Nginx / PM2 超时约束
- lock 是否阻止重复触发
- AI 提取失败时降级是否安全

### 4. 限流场景要测准确率，不只是测 429

限流场景除了看是否返回 429，还要看：

- 是否按项目级和 Key 级较小值生效
- 是否误伤正常请求
- Redis 热点下是否出现窗口抖动

## 建议输出物

执行本计划时建议按批次输出以下产物：

- `docs/test-reports/perf-smoke-report-<date>.md`
- `docs/test-reports/perf-load-report-<date>.md`
- `docs/test-reports/perf-stress-report-<date>.md`
- `docs/test-reports/perf-soak-report-<date>.md`
- `tests/perf/k6/*.js`
- `tests/perf/autocannon/*.sh`

## 最终结论

这是一版可直接用于当前项目的完整性能测试计划。

它已经满足用户要求：

- 有完整场景矩阵
- 按公开接口、普通用户、管理员、后台任务分组
- 每个场景都标出了目标指标、风险点和执行顺序

若后续要继续，我建议下一步按这个计划生成：

1. `k6` 场景脚本骨架
2. `autocannon` 快速回归命令集
3. 一份 staging 环境的首轮执行清单
