# Cost Optimization & Bug Fix Production Signoff 2026-04-04

## 测试目标

对 `docs/test-reports/cost-optimization-bugfix-signoff-2026-04-04.md` 对应的 2026-04-04 批次做生产环境复验，重点验证：

- `F-COST-01` OpenRouter 白名单收窄是否已在生产真正生效
- `F-COST-02` 图片健康检查是否止步 L2
- `F-COST-03` doc-enricher 跳过图片模型是否有生产侧证据
- `F-BUG-01` `list_logs` 搜索语义是否修复
- `F-BUG-02` `imageViaChat` URL 提取增强是否在生产可用
- `F-BUG-03` `generate_image` MCP 错误响应是否结构化

## 测试环境

- 生产开关：
  - `PRODUCTION_STAGE=RND`
  - `PRODUCTION_DB_WRITE=ALLOW`
  - `HIGH_COST_OPS=ALLOW`
- 控制台：`https://aigc.guangai.ai`
- 备用直连：`http://154.40.40.116:8301`
- API：`http://154.40.40.116:8301/v1/`
- MCP：`http://154.40.40.116:8301/mcp`
- 验收时间：`2026-04-04 09:37:19 CST`
- 使用账号 / Key：
  - `codex-admin@aigc-gateway.local`
  - `codex-dev@aigc-gateway.local`
  - 管理员 API Key：`pk_aa6b13e...`
  - 开发者 API Key：`pk_1ec762a...`

## 执行步骤概述

1. 读取本次签收参考文档 `cost-optimization-bugfix-signoff-2026-04-04.md`。
2. 使用生产 `POST /api/auth/login` 获取管理员 JWT。
3. 查询生产 `v1/models`、`api/admin/sync-status`、`api/admin/channels`、`api/admin/health`。
4. 手动触发一次生产图片健康检查，确认最新行为是否只到 L2。
5. 使用生产 MCP 验证 `list_logs` 搜索行为与 `generate_image` 结构化错误。
6. 使用生产 `/v1/chat/completions` 创建一条最小日志，再回查 `list_logs(search="Say OK")`。
7. 直接调用可用的 OpenRouter 图片模型，验证 `imageViaChat` 的生产表现。

## 通过项

### `F-COST-02` 图片健康检查封顶 L2

- 对生产图片 channel `openai/dall-e-3` 手动执行：
  - `POST /api/admin/health/cmnckvux5000on56ip8s82con/check`
- 返回结果只有：
  - `CONNECTIVITY = PASS`
  - `FORMAT = PASS`
- `GET /api/admin/health` 中该 channel 最新记录也只显示 `CONNECTIVITY / FORMAT`
- 判定：**PASS**

### `F-BUG-01` `list_logs` 搜索列错误修复

- 先执行最小真实调用：
  - `POST /v1/chat/completions`
  - `model = deepseek/v3`
  - `prompt = "Say OK"`
  - 实际返回 `"OK"`
- 再通过 MCP 查询：
  - `list_logs(search="Say OK")` 返回 2 条命中记录，`promptPreview = "Say OK"`
  - `list_logs(search="trc_")` 返回空数组
- 说明：
  - prompt 内容搜索可用
  - traceId 形式字符串不再通过 `search` 语义命中
- 判定：**PASS**

### `F-BUG-03` `generate_image` MCP 错误响应结构化

- MCP `generate_image(model="nonexistent/image-model")` 返回：
  - `isError = true`
  - `text` 为合法 JSON
  - `code = "model_not_found"`
- 不再是旧的纯文本 `Error: ...`
- 判定：**PASS**

## 失败项

### `F-COST-01` OpenRouter 白名单收窄仅部分落地，未达到目标口径

本轮生产观测相比上轮已有改善，但仍不能判定完全通过：

- `GET /api/admin/sync-status`
  - `openrouter.apiModels = 29`
  - `openrouter.modelCount = 29`
  - `disabledCount = 289`
- `GET /v1/models`
  - 当前可见 `openrouter/*` 模型数 = **34**
- `GET /api/admin/channels?pageSize=1000`
  - `openrouter_total = 354`
  - `openrouter_active = 34`
  - `openrouter_models = 354`
- 对外可见的 OpenRouter 模型虽然已从上轮的 `309` 显著下降到 `34`，但仍高于该批次的目标口径 `30`
- 且当前仍可见一些明显不属于“主流 30 模型”口径的模型，例如：
  - `openrouter/cognitivecomputations/dolphin-mistral-24b-venice-edition:free`
  - `openrouter/google/gemma-4-26b-a4b-it`
  - `openrouter/qwen/qwen3.5-9b`

这说明：

- 白名单收窄逻辑已部分生效
- 但生产对外模型集合仍未与目标口径完全对齐

判定：**FAIL**

### `F-BUG-02` `imageViaChat` URL 提取增强仍未通过生产关键场景

直接调用两个当前生产可用的 OpenRouter 图片模型：

1. `POST /v1/images/generations`
   - `model = "openrouter/google/gemini-2.5-flash-image"`
   - 实际返回：
     - `error.code = "provider_error"`
     - `message = "Image generation via chat returned no extractable image..."`

2. `POST /v1/images/generations`
   - `model = "openrouter/openai/gpt-5-image-mini"`
   - 实际返回：
     - `error.code = "provider_error"`
     - `message = "Image generation via chat returned no extractable image..."`

说明在当前生产真实场景中，`imageViaChat` 仍然无法从这两条 OpenRouter 图片链路中提取结果图片。

判定：**FAIL**

## 未完全验证项

### `F-COST-03` doc-enricher 跳过图片模型

本轮生产侧没有直接暴露“哪些模型进入 AI 丰富化”的可观测接口，无法仅凭现网接口独立证明“图片模型已被 doc-enricher 跳过”。

补充观测：

- `sync-status` 中 `openrouter.aiEnriched = 0`
- 但这不足以单独证明“图片模型被跳过”，因为它也可能来自其他同步条件

判定：**未完全验证**

### `F-ARCH-01` 白名单维护规范

这是代码与文档层规范项，不属于生产行为型验收主项。本轮未单独作为生产结论项判定。

## 风险项

- `F-COST-01` 已从“完全未落地”改善为“部分落地”，但仍存在目标口径偏差，说明生产同步与对外可见集合之间仍可能存在残留差异。
- `F-BUG-02` 在两个实际可用 OpenRouter 图片模型上同时失败，属于稳定可复现问题，不是单一模型偶发抖动。
- `F-COST-03` 仍缺少生产侧独立证据，不能因为“未观测到反证”就直接判通过。

## 最终结论

本轮生产验收结论：`FAIL`

结论依据：

- 通过：
  - `F-COST-02`
  - `F-BUG-01`
  - `F-BUG-03`
- 失败：
  - `F-COST-01`
  - `F-BUG-02`
- 未完全验证：
  - `F-COST-03`

与上轮相比，生产现网已有部分改善：

- OpenRouter 对外模型数已从 `309` 降到 `34`
- 但仍未收敛到目标口径
- `imageViaChat` 的 OpenRouter 图片提取问题仍未解决

因此当前生产版本仍**不能签收为本批需求已完整通过**。
