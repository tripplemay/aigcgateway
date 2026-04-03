# 生产环境回归报告（Round 4）

## 测试目标

回归验证本轮修复：

- `FAIL-001` 火山引擎 `12 -> 14`
- `FAIL-002` 硅基流动 AI 超时修复
- `RISK-001` 手动同步 `504` 风险是否仍在

## 生产测试开关

- `PRODUCTION_STAGE=RND`
- `PRODUCTION_DB_WRITE=ALLOW`
- `HIGH_COST_OPS=ALLOW`

## 测试环境

- 生产地址：`https://aigc.guangai.ai`
- 测试时间：`2026-04-01`
- 管理员账号：`test-agent@aigc-gateway.local`

## 执行步骤概述

1. 检查站点与公开接口可用性
2. 管理员登录
3. 读取 `/api/v1/models`、`/api/admin/channels`、`/api/admin/sync-status`
4. 触发一次手动同步
5. 再次读取同步状态和模型结果

## 通过项

### PASS-001 生产站点本轮可用

- `HEAD /` 返回 `200`
- `HEAD /api/v1/models` 返回 `200`
- 管理员登录成功

### PASS-002 火山引擎 `12 -> 14` 已修复

- 当前 `/api/admin/channels`：
  - `volcengine_total=14`
  - `volcengine_active=14`
  - `volcengine_disabled=0`
- 当前 `/api/v1/models`：
  - `provider_name="火山引擎方舟"` 的模型数为 `14`
- 结论：
  - “删除 4 个旧遗留 DISABLED 通道”的修复已生效
  - 火山引擎对开发者实际可见模型数已从此前的 `12` 恢复到 `14`

### PASS-003 DeepSeek AI 文档提取仍正常

- `sync-status` 仍显示：
  - `deepseek.apiModels=2`
  - `deepseek.aiEnriched=2`
- `/api/v1/models` 中：
  - `deepseek/v3` 与 `deepseek/reasoner` 价格仍为非零

## 失败项

### FAIL-001 硅基流动 AI 超时修复未体现为业务结果改善

- 当前 `sync-status`：
  - `siliconflow.apiModels=95`
  - `siliconflow.aiEnriched=0`
  - `siliconflow.modelCount=95`
- 当前 `/api/v1/models`：
  - `provider_name="硅基流动"` 共 `95` 个模型
  - `siliconflow_zero_price=95`
- 结论：
  - 虽然代码层已调整 AI 超时 `60s -> 120s`、输入截断 `30k -> 10k`
  - 但从生产实测结果看，硅基流动价格补全仍未生效
  - 本轮不能判定该问题已修复

## 风险项

### RISK-001 手动同步 `504` 风险仍然存在

- 本轮 `POST /api/admin/sync-models` 的响应体再次落成 nginx `504 Gateway Time-out`
- 但随后读取 `sync-status`：
  - `lastSyncTime` 已更新到 `2026-03-31T17:08:21.435Z`
- 结论：
  - 同步任务仍可能在服务端实际执行
  - 但外部请求链路仍会因为 nginx 超时而返回 `504`
  - 该风险未消除

## 关键证据

- `HEAD /` → `200`
- `HEAD /api/v1/models` → `200`
- `POST /api/auth/login` → 成功返回管理员 token
- `GET /api/admin/channels`
  - `volcengine_total=14`
  - `volcengine_active=14`
  - `volcengine_disabled=0`
- `GET /api/v1/models`
  - `volcengine=14`
  - `siliconflow_total=95`
  - `siliconflow_zero_price=95`
- `GET /api/admin/sync-status`
  - `deepseek.aiEnriched=2`
  - `siliconflow.aiEnriched=0`
  - `volcengine.modelCount=14`
- `POST /api/admin/sync-models`
  - 响应体为 nginx `504 Gateway Time-out`
  - 但 `lastSyncTime` 实际发生更新

## 最终结论

本轮生产回归结论是：**部分通过。**

已确认修复：

- 火山引擎开发者可见模型数已恢复到 `14`
- 旧遗留 `DISABLED` 通道已清理

仍未修复：

- 硅基流动 AI 文档提取结果仍未体现，价格依旧全为 `0`

仍存在风险：

- 手动同步接口对外仍可能返回 nginx `504`
