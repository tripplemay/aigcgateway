# 性能优化批次 Production Acceptance 2026-04-04

> 状态：**FAIL（三轮复验后仍未通过）**
> 环境：`https://aigc.guangai.ai`
> 备用地址：`http://154.40.40.116:8301`
> 触发：外网更新后三轮生产复验

## 测试目标

验证以下 3 项修改在生产环境的外部可观测结果：

- `F-PERF-01` Prisma 连接池保活
- `F-PERF-02` 模型页 Redis 缓存
- `F-PERF-03` 用量页查询优化

## 测试环境

- 控制台：`https://aigc.guangai.ai`
- API：`https://aigc.guangai.ai/v1/`
- 管理员账号：`codex-admin@aigc-gateway.local`
- 执行边界：按 `AGENTS.md` 当前开关
  - `PRODUCTION_STAGE=RND`
  - `PRODUCTION_DB_WRITE=ALLOW`
  - `HIGH_COST_OPS=ALLOW`

## 执行步骤概述

1. 管理员登录生产控制台 API
2. 做最小 smoke：`/v1/models`
3. 对管理员读接口做时延采样：
   - `/api/admin/sync-status`
   - `/api/admin/models-channels`
   - `/api/admin/usage?period=7d`
   - `/api/admin/usage/by-model?period=7d`
   - `/api/admin/usage/by-provider?period=7d`
4. 采集成功返回样本，确认不是空响应
5. 额外尝试一次 `POST /api/admin/sync-models`，用于观察缓存失效链路

## 通过项

- 生产管理员登录成功
- `GET /v1/models` 正常返回，样本中模型总数为 `144`
- `GET /api/admin/models-channels` 可成功返回业务数据，样本中 `provider_count = 7`
- `GET /api/admin/usage?period=7d` 可成功返回统计
- `GET /api/admin/usage/by-model?period=7d` 可成功返回统计，样本中 `count = 6`
- `GET /api/admin/usage/by-provider?period=7d` 可成功返回统计，样本中 `count = 3`

## 失败项

### F-PERF-02 — FAIL

规格要求：
- 模型页第二次加载 `< 200ms`
- `sync-models` 后缓存失效，下次加载重新回源

生产结果：
- 首轮样本：`4.65s`、`3.17s`
- 次轮复验样本：`2.82s`、`2.10s`、`1.93s`
- 第三轮复验样本：`2.12s`、`1.50s`、`1.38s`
- 另一次 post-sync 采样：第一次 `2.04s`，第二次直接超时（`10.00s`, `code=000`）

结论：
- 生产环境下无法满足“第二次加载 `< 200ms`”
- `sync-models -> invalidation -> reload` 链路也没有拿到稳定通过证据

### F-PERF-03 — FAIL

规格要求：
- `by-model / by-provider` 响应时间 `< 1s`
- 缓存命中后 `by-model < 100ms`

生产结果：
- 首轮样本：
  - `usage?period=7d`：一次成功样本 `1.40s`；其他样本出现 `10.00s` 超时
  - `usage/by-model?period=7d`：`2.83s`、`7.65s`、`11.43s`
  - `usage/by-provider?period=7d`：`8.29s`、一次超时 `10.00s`、`1.54s`
- 次轮复验样本：
  - `usage?period=7d`：`1.49s`，另两次 `10.00s` 超时
  - `usage/by-model?period=7d`：`14.01s`，另两次分别为 `10.00s` 超时和 `5.00s` 连接重置
  - `usage/by-provider?period=7d`：三次均失败，`5.00s` 连接重置
- 第三轮复验样本：
  - 管理员登录：首试 `20.00s` 超时，第二次成功
  - `/v1/models` smoke：`20.00s` 超时
  - `usage?period=7d`：再次 `10.00s` SSL 超时
- `usage?period=7d` 与 `usage?period=30d` 返回结构正常，但仅能证明时间过滤仍可用，不能证明性能目标达标

结论：
- 生产外部可观测时延显著高于本轮阈值
- 即使缓存存在，至少当前生产入口侧仍未体现出可验收的命中效果

## 风险项

### F-PERF-01 — PARTIAL

我能确认的只有：
- 登录成功
- `sync-status` 有多次成功样本，约 `1.55s / 1.58s / 2.12s / 1.50s / 1.38s`

我不能在生产上直接做这些动作，因此只能给 `PARTIAL`：
- 无法安全地“停止服务 15 分钟后”再做两次冷启动探针
- 无法直接读取生产 PM2 / 应用日志去证伪 `PrismaClientInitializationError`

因此，`F-PERF-01` 只能算“外部时延样本看起来正常，但缺少冷启动和日志证据”。

## 证据

- 登录成功：`token_present = true`
- `/v1/models`：`count = 144`
- `sync-status`：
  - 首轮：`1.585s`、`1.545s`，另一次连接超时
  - 次轮：`2.120s`、`1.502s`、`1.380s`
- `models-channels`：
  - 首轮：`4.650s`、`3.169s`
  - 次轮：`2.816s`、`2.100s`、`1.935s`
  - post-sync：`2.040s`，随后一次 `10.00s` 超时
- `usage?period=7d`：
  - 首轮：成功样本 `1.396s`，另有两次 `10.00s` 超时
  - 次轮：`1.492s`，另有两次 `10.00s` 超时
  - 第三轮：再次 `10.00s` SSL 超时
- `usage/by-model?period=7d`：
  - 首轮：`2.835s`、`7.646s`、`11.427s`
  - 次轮：`14.005s`，另有 `10.00s` 超时和 `5.00s` 连接重置
- `usage/by-provider?period=7d`：
  - 首轮：`8.292s`、`1.542s`，另有一次 `10.00s` 超时
  - 次轮：三次均失败，`5.00s` 连接重置
- 第三轮补充：
  - 管理员登录：第 1 次 `20.00s` 超时，第 2 次成功
  - `/v1/models`：`20.00s` 超时
- `usage?period=7d` 样本：`totalCalls = 30`
- `usage/by-model?period=7d` 样本首项：`openai/dall-e-3`
- `usage/by-provider?period=7d` 样本首项：`openai`

## 最终结论

本轮生产验收结论为：

- `F-PERF-01`：`PARTIAL`
- `F-PERF-02`：`FAIL`
- `F-PERF-03`：`FAIL`

所以整批生产验收结果为 `FAIL`。

当前更像是“生产入口层仍存在明显时延/连接抖动”，而不是本地优化完全没有实现；但从验收视角，只看生产外部可观测结果，这一版还不能签收为通过。

第二轮和第三轮复验都没有推翻首轮结论。`models-channels` 虽然比首轮略快，但仍远高于缓存命中目标；`usage` 相关接口持续存在高时延、超时和连接重置，第三轮连登录和 `/v1/models` smoke 都出现超时，因此本次修改在生产环境下依然不能签收。
