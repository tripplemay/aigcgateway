# 模型同步引擎修复后回归测试报告

Summary
- Scope:
  - 上轮失败项回归：手动同步后 `/v1/models` 是否清空
  - 跨服务商同模型聚合
  - `sellPriceLocked` 锁价保护
- Documents:
  - `docs/test-reports/model-sync-engine-test-report-2026-03-31.md`
  - 用户提供需求《AIGC Gateway — 模型同步引擎完善》
- Environment:
  - 本地测试环境 `http://localhost:3099`
  - 通过 `bash scripts/test/codex-setup.sh` 重建
- Result totals:
  - PASS：1
  - FAIL：2
  - BLOCKED：1

## 执行摘要

- 初始状态：
  - `/v1/models` 返回 `328`
  - 来源分布：`OpenRouter=321`、`火山引擎方舟=7`
  - `/api/admin/models-channels` 中 `multiChannelCount=0`
- 手动同步后：
  - `/v1/models` 仍返回 `328`
  - `activeModelCount=328`
  - 不再出现“全部降为 DEGRADED、开发者模型列表清空”的问题

## 结果

### PASS-001 手动同步后开发者模型列表不再清空
- Steps:
  1. 登录管理员
  2. 调用 `POST /api/admin/sync-models`
  3. 调用 `GET /v1/models`
- Expected:
  - `/v1/models` 保持非空
- Actual:
  - `/v1/models` 返回 `328`
  - provider 分布维持 `OpenRouter=321`、`火山引擎方舟=7`
- Conclusion:
  - 上轮关键回归已修复

### FAIL-001 跨服务商同模型聚合仍未形成多通道
- Severity: High
- Steps:
  1. 登录管理员
  2. 调用 `GET /api/admin/models-channels`
  3. 检查 `summary.channelCount > 1` 的模型数量
- Expected:
  - 至少存在一批同模型多通道聚合结果
  - 如 `openai/gpt-4o` 应可聚合直连与 OpenRouter
- Actual:
  - `multiChannelCount=0`
  - 数据库中：
    - `openrouter` 通道 `321`
    - `volcengine` 通道 `7`
    - 其余 5 家 provider 通道 `0`
- Impact:
  - “同一模型跨服务商只创建一个 Model + 多个 Channel”验收项仍未通过

### FAIL-002 锁价保护回归失效
- Severity: Critical
- Steps:
  1. 找到 `openai/gpt-4o` 的 channel
  2. `PATCH /api/admin/channels/:id`，设置：
     - `sellPrice.inputPer1M=9.99`
     - `sellPrice.outputPer1M=19.99`
  3. 确认 PATCH 返回 `sellPriceLocked=true`
  4. 调用 `POST /api/admin/sync-models`
  5. 再查询 `GET /api/admin/models-channels`
- Expected:
  - 同步后保留手工卖价
  - `sellPriceLocked=true`
- Actual:
  - 同步后价格被覆盖回默认值：
    - `inputPer1M=3`
    - `outputPer1M=12`
  - `sellPriceLocked=false`
- Impact:
  - 运营手工锁价会被同步覆盖，直接违反验收要求

### BLOCKED-001 5 家直连服务商仍因测试凭证问题无法完整验收
- Severity: Medium
- Evidence:
  - `POST /api/admin/sync-models` 返回 `totalFailedProviders=5`
  - 错误：
    - `OpenAI /models returned 401`
    - `Anthropic /models returned 401`
    - `DeepSeek /models returned 401`
    - `Zhipu /models returned 401`
    - `SiliconFlow /models returned 401`
- Impact:
  - 无法验证这 5 家直连 provider 的真实远程抓取结果
  - 但不影响对“锁价保护失效”与“多通道聚合缺失”的定性

## 结论

- 上轮最严重的“手动同步后 `/v1/models` 清空”问题已经修复。
- 当前仍有 2 个未通过项：
  - 跨服务商同模型聚合仍未实现
  - `sellPriceLocked` 锁价保护回归失效
