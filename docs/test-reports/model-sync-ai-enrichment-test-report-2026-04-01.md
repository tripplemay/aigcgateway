# 模型同步引擎 AI 文档增强版测试报告

## 测试目标

严格按照以下两份既有测试用例，在本地 Codex 测试环境执行本轮正式测试：

- [model-sync-ai-enrichment-api-test-cases-2026-03-31.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/model-sync-ai-enrichment-api-test-cases-2026-03-31.md)
- [model-sync-ai-enrichment-manual-test-cases-2026-03-31.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/model-sync-ai-enrichment-manual-test-cases-2026-03-31.md)

## 测试环境

- 环境类型：本地 Codex 测试环境
- 初始化方式：`bash scripts/test/codex-setup.sh`
- 启动方式：为保证进程稳定，本轮执行时补充使用 PTY 直接启动 `node .next/standalone/server.js`
- 访问地址：`http://localhost:3099`
- 数据库：`postgresql://test:test@localhost:5432/aigc_gateway_test`
- 当前日期：`2026-04-01`

## 执行步骤概述

1. 重置测试库、执行迁移、种子、构建、启动本地服务
2. 管理员登录，读取 `sync-status`
3. 检查 `ProviderConfig.docUrls`、`pricingOverrides`
4. 执行 `POST /api/admin/sync-models`
5. 验证 `/api/v1/models`、`/api/admin/models-channels`、`/api/admin/channels`
6. 验证 `sellPriceLocked`
7. 验证 `CallLog` 是否被同步污染
8. 验证管理端与开发者侧页面可访问性

## 环境与运行时事实

- 构建通过，存在若干 `react-hooks/exhaustive-deps` warning，但无 TypeScript error
- 数据库迁移包含 `20260331100000_add_doc_urls`
- 种子中 7 家 Provider 已配置 `docUrls`
- `pricingOverrides` 默认均为 `null`
- 本地 `curl` 初始受 `http_proxy` 干扰，执行期已统一改用 `--noproxy '*'`
- `codex-setup.sh` 背景启动的 `node` 进程未稳定驻留，本轮测试执行时改为 PTY 常驻启动

## 核心执行结果

- 管理员登录：通过
- 启动后自动同步：执行了
- 手动同步：通过
- 当前环境同步结果：
  - `openrouter` 成功同步 `320` 个模型
  - `openai / anthropic / deepseek / zhipu / siliconflow` 的 `/models` 均返回 `401`
  - `volcengine` 因内部 AI 调用不可用未生成模型
- 当前 `GET /api/v1/models`：
  - 总数 `320`
  - `text=315`
  - `image=5`
- 当前 `GET /api/admin/models-channels`：
  - 总模型组 `320`
  - `multiChannelCount=0`

## 通过项

- `ProviderConfig.docUrls` 字段存在，种子中已正确落库
- `pricingOverrides` 未预填且为空时同步不报错
- 自动同步与手动同步都能执行
- OpenRouter 路径工作正常：
  - API 返回模型列表、价格、上下文
  - `/api/v1/models` 正常返回 `320` 条
  - `?modality=text` 返回 `315`
  - `?modality=image` 返回 `5`
- OpenRouter 未触发 AI enrichment
- AI enrichment 失败不会中断整体同步
- `sellPriceLocked=true` 在再次同步后保持不变
- 同步前后 `call_logs` 数量保持 `0`
- 管理端 `/admin/models` 与开发者 `/models` 页面可访问，返回 `200`
- 构建通过，无 TypeScript 编译错误

## 失败项

### FAIL-001 OpenAI 第 2 层文档抓取失败

- 现象：
  - 运行时日志显示 `Fetching https://platform.openai.com/docs/pricing for openai...`
  - 随后报错 `HTTP 403`
- 影响：
  - OpenAI 无法完成 AI 文档补全
  - 即使后续补齐内部 DeepSeek 凭证，OpenAI 文档抓取链路当前仍未打通

### FAIL-002 Volcengine docs-only 路径未产出任何模型

- 现象：
  - `volcengine` 同步结果 `apiModels=0`、`aiEnriched=0`、`modelCount=0`
  - 运行时日志显示 `Calling AI for volcengine...`
  - 随后报错 `DeepSeek API key not configured`
- 影响：
  - 未达到“火山引擎模型和价格全部由 AI 文档提取”的需求
  - 当前模型数量仍是 `0`，明显不符合预期

## 阻塞项

- `openai / anthropic / deepseek / zhipu / siliconflow` 第 1 层 `/models` 均因占位或无效凭证返回 `401`
- 内部 AI enrichment 依赖的 DeepSeek 内部调用未配置可用 API key，导致大部分第 2 层成功路径无法执行
- 当前没有多 Provider 同模型样本，因此无法完成跨服务商聚合的实测验收
- 无浏览器交互工具，本轮手工页测试以页面可访问性 + 后端接口数据一致性为主，未覆盖前端交互细节点击流

## 用例执行明细

### API / 集成测试

- `TC-API-001`：PASS
  - `ProviderConfig.docUrls` 已存在，迁移已落地
- `TC-API-002`：PASS
  - 7 家 Provider 的 `docUrls` 已写入，`pricingOverrides=null`
- `TC-API-003`：BLOCKED
  - OpenAI `/models` 返回 `401`
- `TC-API-004`：FAIL
  - OpenAI 文档页抓取 `403`，且内部 AI key 未配置
- `TC-API-005`：BLOCKED
  - Anthropic `/models` 返回 `401`
- `TC-API-006`：BLOCKED
  - Anthropic 第 1 层与第 2 层成功路径均未打通
- `TC-API-007`：BLOCKED
  - DeepSeek `/models` 返回 `401`
- `TC-API-008`：BLOCKED
  - DeepSeek 第 2 层因内部 AI key 未配置无法成功
- `TC-API-009`：BLOCKED
  - Zhipu `/models` 返回 `401`，AI enrichment 未成功
- `TC-API-010`：FAIL
  - Volcengine docs-only 路径未生成模型
- `TC-API-011`：BLOCKED
  - SiliconFlow `/models` 返回 `401`
- `TC-API-012`：PASS
  - OpenRouter 同步 `320` 模型，`aiEnriched=0`，价格和上下文来自 API
- `TC-API-013`：PASS
  - AI enrichment 失败时未中断同步，OpenRouter 数据仍保留
- `TC-API-014`：BLOCKED
  - 当前环境无任一 Provider 成功完成 AI 补全，无法验证“只补不覆盖”成功路径
- `TC-API-015`：PASS
  - `pricingOverrides=null` 时同步正常，`overrides=0`
- `TC-API-016`：BLOCKED
  - 本轮未配置手工 `pricingOverrides` 覆盖样本
- `TC-API-017`：PASS
  - `openai/gpt-4o` 卖价改为 `9.99 / 19.99` 后，再次同步仍保持且 `sellPriceLocked=true`
- `TC-API-018`：PARTIAL
  - 同步前后 `call_logs=0`，未观察到污染
  - 但内部 AI 成功调用路径未打通，无法验证成功场景
- `TC-API-019`：BLOCKED
  - 内部 AI 成功调用路径未打通，无法验证余额检查与鉴权绕过
- `TC-API-020`：BLOCKED
  - `multiChannelCount=0`
  - 当前环境仅 OpenRouter 有实质模型数据
- `TC-API-021`：PASS
  - `POST /api/admin/sync-models` 可成功触发并返回结构化结果
- `TC-API-022`：PARTIAL
  - 同步结果中包含 API / AI / override 统计字段
  - 但失败场景日志中显示 `AI: not needed`，表达不够准确
- `TC-API-023`：PARTIAL
  - `GET /api/admin/models-channels` 正常返回 `320` 组
  - 但仅有 OpenRouter 数据，未覆盖 docs-only Volcengine 和多来源聚合
- `TC-API-024`：PARTIAL
  - `GET /api/v1/models` 正常返回 `320` 条
  - 但仅验证到 OpenRouter 成功样本
- `TC-API-025`：PASS
  - 本轮构建通过，无 TypeScript error

### 手工测试

- `TC-MAN-001`：PASS
  - 启动后自动同步已执行
- `TC-MAN-002`：PASS
  - 管理端手动触发同步成功
- `TC-MAN-003`：BLOCKED
  - OpenAI 直连同步未成功，文档补全也未成功
- `TC-MAN-004`：BLOCKED
  - Anthropic 未产生可验收模型
- `TC-MAN-005`：BLOCKED
  - DeepSeek 未产生可验收模型
- `TC-MAN-006`：BLOCKED
  - Zhipu 未产生可验收模型
- `TC-MAN-007`：FAIL
  - Volcengine 当前无模型产出
- `TC-MAN-008`：BLOCKED
  - SiliconFlow 未产生可验收模型
- `TC-MAN-009`：PASS
  - OpenRouter 工作正常，且日志未显示 AI enrichment
- `TC-MAN-010`：PASS
  - AI 失败后整体同步未崩溃，页面与接口仍可访问
- `TC-MAN-011`：BLOCKED
  - 无成功 AI 补全样本，无法验证“只补不覆盖”
- `TC-MAN-012`：PASS
  - `pricingOverrides` 为空时页面和同步未报错
- `TC-MAN-013`：PASS
  - 锁价保护有效
- `TC-MAN-014`：PARTIAL
  - 同步状态可读，但 AI 失败场景统计表达不够完整
- `TC-MAN-015`：BLOCKED
  - 当前无多 Provider 聚合样本，无法验证一个 Model 下多 Channel 展示
- `TC-MAN-016`：PARTIAL
  - `/models` 页面可访问，且后端 `/api/v1/models` 数据正确
  - 但未做浏览器级交互细节核验
- `TC-MAN-017`：PARTIAL
  - `call_logs` 未增长
  - 但内部 AI 成功调用路径未打通
- `TC-MAN-018`：PASS
  - 构建通过，关键页面可访问

## 关键证据

- `GET /api/admin/sync-status`
  - 启动后同步结果中仅 `openrouter` 成功同步 `320` 模型
- `POST /api/admin/sync-models`
  - 手动同步返回 `durationMs=8728/9271ms`
  - `openrouter.apiModels=320`
  - 其余直连 Provider `401`
- 运行时日志
  - OpenAI 文档页抓取 `403`
  - Anthropic / DeepSeek / Zhipu / Volcengine / SiliconFlow 的 AI enrichment 均报 `DeepSeek API key not configured`
- 数据库
  - `call_logs` 同步前后均为 `0`
  - `channels` 当前 `ACTIVE=320, DEGRADED=0, DISABLED=0`
- `GET /api/admin/models-channels`
  - `count=320`
  - `multiChannelCount=0`
- `GET /api/v1/models`
  - 总数 `320`
  - `text=315`
  - `image=5`
- 锁价验证
  - `openai/gpt-4o` 通道卖价手工改为 `9.99 / 19.99`
  - 再次同步后仍保持该价格，且 `sellPriceLocked=true`

## 风险项

- 当前环境无法覆盖 6 家非 OpenRouter 的成功同步路径
- 当前环境无法覆盖任意一个“成功的 AI enrichment”正向样本
- 当前环境无法完成跨服务商同模型去重的真实验收
- OpenAI 定价页 `403` 可能意味着抓取策略仍需调整，即使后续补齐内部 AI key 也未必能通过

## 最终结论

本轮测试结论为：**部分通过，不能签收为完整通过。**

- 已通过：
  - 数据库字段与种子方向
  - 手动同步入口
  - OpenRouter API-only 路径
  - `pricingOverrides` 为空容错
  - AI 失败降级
  - `sellPriceLocked`
  - `CallLog` 未被同步污染
  - 管理端 / 开发者侧基础可访问性
  - TypeScript 编译通过

- 明确失败：
  - OpenAI 文档抓取失败
  - Volcengine docs-only AI 提取失败

- 大量关键需求仍被环境阻塞：
  - 5 家直连 Provider `/models` 401
  - 内部 DeepSeek AI key 未配置
  - 无法验证 AI 正向提取成功路径与跨服务商聚合
