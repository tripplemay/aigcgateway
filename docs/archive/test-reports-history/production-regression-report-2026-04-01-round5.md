# 生产环境回归报告（Round 5）

## 测试目标

再次在生产环境回归以下关键点：

- 火山引擎是否继续稳定为 `14` 个可见模型
- 硅基流动 AI 文档提取是否终于补全价格
- 手动同步接口是否仍会返回 nginx `504`

## 生产测试开关

- `PRODUCTION_STAGE=RND`
- `PRODUCTION_DB_WRITE=ALLOW`
- `HIGH_COST_OPS=ALLOW`

## 测试环境

- 生产地址：`https://aigc.guangai.ai`
- 测试时间：`2026-04-01`
- 管理员账号：`test-agent@aigc-gateway.local`

## 执行步骤概述

1. 检查首页与 `/api/v1/models` 可用性
2. 管理员登录
3. 读取 `/api/v1/models`、`/api/admin/channels`、`/api/admin/sync-status`
4. 触发 `POST /api/admin/sync-models`
5. 再次读取 `sync-status` 与 `/api/v1/models`

## 通过项

### PASS-001 生产站点本轮稳定可用

- `HEAD /` 返回 `200`
- `HEAD /api/v1/models` 返回 `200`
- 管理员登录成功

### PASS-002 火山引擎 `14` 个可见模型继续稳定

- `/api/admin/channels`：
  - `volcengine_total=14`
  - `volcengine_active=14`
  - `volcengine_disabled=0`
- `/api/v1/models`：
  - `provider_name="火山引擎方舟"` 的模型数为 `14`

### PASS-003 DeepSeek AI 文档提取仍正常

- `/api/v1/models` 中：
  - `deepseek/v3` 价格仍为非零
  - `deepseek/reasoner` 价格仍为非零
- `sync-status` 中：
  - `deepseek.aiEnriched=2`

### PASS-004 手动同步接口本轮直接返回了成功 JSON

- `POST /api/admin/sync-models` 返回：
  - `HTTP/1.1 200 OK`
  - JSON body
  - `durationMs=12468`
- `sync-status.lastSyncTime` 更新到：
  - `2026-03-31T17:53:55.334Z`

结论：

- 上一轮反复出现的 nginx `504` 本轮未复现
- 但这只能说明“本轮未复现”，不能证明风险已彻底消除

## 失败项

### FAIL-001 硅基流动 AI 文档提取仍未体现为价格补全

- `/api/admin/sync-status`：
  - `siliconflow.apiModels=95`
  - `siliconflow.aiEnriched=0`
  - `siliconflow.modelCount=95`
- `/api/v1/models`：
  - `siliconflow_total=20`
  - `siliconflow_zero_price=20`

结论：

- 对开发者实际可见的硅基流动模型来说，价格仍然全部为 `0`
- 这轮仍不能判定“硅基流动 AI 超时修复”已经生效

## 风险项

### RISK-001 手动同步稳定性仍需继续观察

- 本轮 `sync-models` 返回 `200 JSON`
- 但上一轮同一接口仍出现过 nginx `504`
- 因此当前更准确的状态是：
  - “本轮未复现”
  - 不是“风险已消失”

## 关键证据

- `HEAD /` → `200`
- `HEAD /api/v1/models` → `200`
- `POST /api/auth/login` → 返回管理员 token
- `GET /api/admin/channels`
  - `volcengine_total=14`
  - `volcengine_active=14`
  - `volcengine_disabled=0`
- `GET /api/v1/models`
  - `volcengine=14`
  - `siliconflow_total=20`
  - `siliconflow_zero_price=20`
- `POST /api/admin/sync-models`
  - `HTTP 200`
  - `durationMs=12468`
- `GET /api/admin/sync-status`
  - `lastSyncTime=2026-03-31T17:53:55.334Z`
  - `deepseek.aiEnriched=2`
  - `siliconflow.aiEnriched=0`
  - `volcengine.modelCount=14`

## 最终结论

本轮生产回归结论是：**部分通过。**

已确认通过：

- 生产站点可用
- 火山引擎 `14` 个可见模型稳定保持
- DeepSeek AI 文档提取继续生效
- 手动同步接口本轮成功返回 JSON

仍未通过：

- 硅基流动 AI 文档提取仍未补全价格

风险状态更新：

- `sync-models 504` 风险本轮未复现，但仍需继续观察
