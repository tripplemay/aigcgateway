# 模型同步引擎 AI 文档增强版回归报告

## 测试目标

在重启本地测试环境后，对上一轮 [model-sync-ai-enrichment-test-report-2026-04-01.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/model-sync-ai-enrichment-test-report-2026-04-01.md) 中的关键结论做回归确认，重点覆盖：

- 同步主链路是否稳定
- OpenRouter 成功路径是否保持
- OpenAI 文档抓取与 Volcengine docs-only 是否有变化
- AI 失败降级是否仍然生效
- `sellPriceLocked` 是否继续受保护
- `CallLog` 是否仍未被同步污染

## 测试环境

- 环境类型：本地 Codex 测试环境
- 启动方式：`bash scripts/test/codex-restart.sh`
- 访问地址：`http://localhost:3099`
- 数据库：`aigc_gateway_test`
- 当前日期：`2026-04-01`

## 执行步骤概述

1. 执行 `codex-restart.sh`
2. 验证 `3099` 端口就绪与管理员登录
3. 读取 `sync-status`、`models-channels`、`/api/v1/models`
4. 再次执行 `POST /api/admin/sync-models`
5. 复查 `openai/gpt-4o` 锁价、`call_logs`、通道状态与页面可访问性

## 通过项

- 测试环境重启成功，`3099` 正常监听
- 管理员登录正常
- `GET /api/v1/models` 仍正常返回 `320` 条
- `GET /api/v1/models?modality=image` 仍正常返回 `5` 条
- OpenRouter 成功路径保持稳定
- `sellPriceLocked` 继续通过：
  - `openai/gpt-4o` 价格仍是 `9.99 / 19.99`
  - `sellPriceLocked=true` 仍保持
- `call_logs` 仍为 `0`
- 通道状态稳定：
  - `ACTIVE=320`
  - `DEGRADED=0`
  - `DISABLED=0`
- `/admin/models` 和 `/models` 页面均返回 `200`
- 未发现 OpenRouter 免费 / deprecated 模型残留命中

## 未修复 / 未变化项

### FAIL-001 直连 Provider 仍然无法完成第 1 层成功同步

- `openai / anthropic / deepseek / zhipu / siliconflow` 的 `apiModels` 仍为 `0`
- 同步结果中的错误仍为对应 `/models returned 401`

### FAIL-002 Volcengine docs-only 路径仍未产出模型

- `volcengine` 仍为：
  - `apiModels=0`
  - `aiEnriched=0`
  - `modelCount=0`

### FAIL-003 跨服务商聚合仍无法验收

- `GET /api/admin/models-channels` 仍是：
  - `count=320`
  - `multiChannelCount=0`
- 当前环境仍只有 OpenRouter 形成有效模型样本

## 关键证据

- `GET /api/admin/sync-status`
  - `openrouter.apiModels=320`
  - 其余 5 家直连 Provider `401`
  - `volcengine.modelCount=0`
- `POST /api/admin/sync-models`
  - `durationMs=9173`
  - `totalNewModels=0`
  - `totalNewChannels=0`
  - `totalDisabledChannels=0`
- `GET /api/v1/models`
  - `count=320`
  - `text=315`
  - `image=5`
- `GET /api/admin/models-channels`
  - `multiChannelCount=0`
- `GET /api/admin/channels`
  - `openai/gpt-4o` 仍显示：
    - `sellPrice.inputPer1M=9.99`
    - `sellPrice.outputPer1M=19.99`
    - `sellPriceLocked=true`
- 数据库：
  - `call_logs=0`
  - `ACTIVE=320, DEGRADED=0, DISABLED=0`

## 风险项

- 当前回归环境仍缺少直连 Provider 的可用凭证
- 当前回归环境仍缺少内部 DeepSeek AI 通道成功调用条件
- 因此 AI 文档增强成功路径、人民币转美元成功路径、Volcengine docs-only 正向路径、跨服务商聚合，仍无法做完整正向验收

## 最终结论

本轮回归结论是：**无新增退化，但核心阻塞项仍未解除。**

- 已确认继续稳定：
  - OpenRouter 主路径
  - `sellPriceLocked`
  - AI 失败降级不清空模型
  - `CallLog` 不被同步污染

- 仍未通过：
  - 5 家直连 Provider 第 1 层成功同步
  - Volcengine docs-only 自动提取
  - 跨服务商多通道聚合实测验收
