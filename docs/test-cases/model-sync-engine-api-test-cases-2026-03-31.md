# AIGC Gateway 模型同步引擎完善 API / 集成测试用例

Summary
- Scope:
  - `lib/sync/model-sync.ts` 重构后的自动同步链路
  - 7 家服务商专属 Sync Adapter 的模型抓取、价格合并、命名映射、去重与落库
  - 管理端 `models-channels` 与开发者 `v1/models` 的回归验证
- Documents:
  - 用户提供需求《AIGC Gateway — 模型同步引擎完善》
  - 需求中的“7 家服务商逐家同步策略”
  - 需求中的“跨服务商同模型去重”“合并逻辑”“数据库变更”“种子数据更新”“验证清单”
- Environment:
  - 本文档仅生成测试用例，尚未执行
  - 预期使用 Codex 测试环境 `http://localhost:3099`
- Result totals:
  - Planned scenarios: 12
  - Executed: 0

## 测试范围和源文档

- 功能范围：
  - OpenAI / Anthropic / DeepSeek / 智谱 / 火山引擎 / 硅基流动 / OpenRouter 同步适配器
  - `ProviderConfig.pricingOverrides`
  - `staticModels`
  - 跨服务商同模型去重
  - `sellPriceLocked` 保护
  - 控制台与开发者模型列表数据契约
- 源文档：
  - 本轮用户提供的完整需求文本

## 接口或场景矩阵

Scenario: SYNC-001 启动后自动同步 smoke  
Business Requirement: 应用启动后自动执行模型同步，生成各 Provider 的模型与 Channel  
Endpoints: 应用启动链路、`GET /api/admin/models-channels`  
Auth Context: ADMIN  
Primary Risk: 同步未触发或只跑默认 OpenAI 兼容逻辑

Scenario: SYNC-002 OpenAI 适配器  
Business Requirement: `/v1/models` 仅保留白名单 chat/image 模型，价格和上下文来自 `pricingOverrides`  
Endpoints: 远程 OpenAI `/v1/models`，本地 `GET /api/admin/models-channels`  
Auth Context: ADMIN  
Primary Risk: 非 chat 模型未过滤，价格缺失

Scenario: SYNC-003 Anthropic 适配器  
Business Requirement: 读取 `/v1/models` + `anthropic-version`，价格来自 `pricingOverrides`  
Endpoints: 远程 Anthropic `/v1/models`，本地 `GET /api/admin/models-channels`  
Auth Context: ADMIN  
Primary Risk: Header 缺失、价格未补齐

Scenario: SYNC-004 DeepSeek 适配器  
Business Requirement: `deepseek-chat` / `deepseek-reasoner` 映射为友好模型名并补齐价格  
Endpoints: 远程 DeepSeek `/v1/models`，本地 `GET /api/admin/models-channels`  
Auth Context: ADMIN  
Primary Risk: 命名未映射，仍保留原始 ID

Scenario: SYNC-005 智谱适配器  
Business Requirement: `/models` 列表 + 人民币价格转美元  
Endpoints: 远程 Zhipu `/models`，本地 `GET /api/admin/models-channels`  
Auth Context: ADMIN  
Primary Risk: 汇率换算错误，图片模型漏同步

Scenario: SYNC-006 火山引擎适配器  
Business Requirement: 完全依赖 `staticModels`，不访问远程 `/models`  
Endpoints: 本地 `GET /api/admin/models-channels`  
Auth Context: ADMIN  
Primary Risk: 仍错误发起远程请求，静态模型未完整落库

Scenario: SYNC-007 硅基流动适配器  
Business Requirement: 过滤 embedding / rerank / audio，只保留 chat / image  
Endpoints: 远程 SiliconFlow `/v1/models`，本地 `GET /api/admin/models-channels`  
Auth Context: ADMIN  
Primary Risk: 模型过滤不正确

Scenario: SYNC-008 OpenRouter 适配器  
Business Requirement: 使用 API 返回的价格与上下文，过滤免费和 deprecated 模型  
Endpoints: 远程 OpenRouter `/api/v1/models`，本地 `GET /api/admin/models-channels`  
Auth Context: ADMIN  
Primary Risk: 价格单位换算错误，免费模型未过滤

Scenario: SYNC-009 跨服务商同模型去重  
Business Requirement: 同一底层模型只创建一个 Model，可关联多个 Channel  
Endpoints: `GET /api/admin/models-channels`  
Auth Context: ADMIN  
Primary Risk: 产生重复 Model

Scenario: SYNC-010 价格合并规则  
Business Requirement: API 值优先，缺失时回退 `pricingOverrides`，再缺失则 `costPrice=0`  
Endpoints: `GET /api/admin/models-channels`  
Auth Context: ADMIN  
Primary Risk: 成本价和展示价错误

Scenario: SYNC-011 `sellPriceLocked` 保护  
Business Requirement: 锁价通道同步后不覆盖卖价  
Endpoints: `PATCH /api/admin/channels/:id`，同步链路，`GET /api/admin/models-channels`  
Auth Context: ADMIN  
Primary Risk: 同步覆盖运营手工价格

Scenario: SYNC-012 前台回归  
Business Requirement: 控制台页面与开发者模型列表页正确显示同步结果  
Endpoints: `GET /api/admin/models-channels`，`GET /v1/models`  
Auth Context: ADMIN / Public  
Primary Risk: API 数据契约变化导致前端显示异常

## 可执行测试用例

ID: API-SYNC-001
Title: 应用启动后自动同步 smoke
Priority: Critical
Requirement Source:
- 验证清单第 1 条
- 架构设计与同步调度器要求
Preconditions:
- 已运行 `bash scripts/test/codex-setup.sh`
- 测试环境启动在 `3099`
- 数据库与 Redis 可用
Request Sequence:
1. GET /api/auth/login
   Payload:
   - 不适用，本步骤改为先执行管理员登录
   Expected Status:
   - 不适用
   Assertions:
   - 不适用
2. POST /api/auth/login
   Payload:
   ```json
   { "email": "admin@aigc-gateway.local", "password": "admin123" }
   ```
   Expected Status:
   - `200`
   Assertions:
   - 返回 `token`
   - `user.role = ADMIN`
3. GET /api/admin/models-channels
   Payload:
   - Header: `Authorization: Bearer <token>`
   Expected Status:
   - `200`
   Assertions:
   - `data.length > 0`
   - 至少包含 7 家 Provider 中的多家来源
State Assertions:
- 启动后的首次查询即可看到模型与通道数据
Cleanup:
- 无
Notes / Risks:
- 若启动时同步异步执行，可增加轮询等待

ID: API-SYNC-002
Title: OpenAI 适配器白名单过滤与 pricingOverrides 合并
Priority: Critical
Requirement Source:
- OpenAI 同步策略
Preconditions:
- OpenAI Provider 已配置可用凭证或已准备远程响应 mock
- 已完成一次同步
Request Sequence:
1. GET /api/admin/models-channels
   Payload:
   - Header: `Authorization: Bearer <token>`
   Expected Status:
   - `200`
   Assertions:
   - 存在 `openai/gpt-4o`
   - 存在 `openai/gpt-4o-mini`
   - 存在 `openai/gpt-4.1`
   - 存在 `openai/o3`、`openai/o3-mini`、`openai/o4-mini`
   - 存在 `openai/dall-e-3`
   - 不存在 embedding、moderation、tts、whisper 等非白名单模型
   - `gpt-4o` 的 `contextWindow=128000`
   - `gpt-4o` 的 `costPrice.inputPer1M=2.5`
   - `gpt-4o` 的 `costPrice.outputPer1M=10`
State Assertions:
- OpenAI 模型名格式为 `openai/{model_id}`
Cleanup:
- 无
Notes / Risks:
- 若远程 API 返回更多模型，断言以白名单与价格字段为主

ID: API-SYNC-003
Title: Anthropic 适配器 header、能力与价格合并
Priority: High
Requirement Source:
- Anthropic 同步策略
Preconditions:
- Anthropic Provider 可访问或已准备远程响应 mock
- 已完成一次同步
Request Sequence:
1. GET /api/admin/models-channels
   Payload:
   - Header: `Authorization: Bearer <token>`
   Expected Status:
   - `200`
   Assertions:
   - 存在 `anthropic/claude-opus-4-6`
   - 存在 `anthropic/claude-sonnet-4-6`
   - 存在 `anthropic/claude-haiku-4-5`
   - 这些模型均有非空 `providerName`
   - 成本价取自 `pricingOverrides`
   - `contextWindow` 或能力字段来自远程 API
State Assertions:
- 模型名格式为 `anthropic/{model_id}`
Cleanup:
- 无
Notes / Risks:
- 若缺少 `anthropic-version` header，期望同步日志可定位失败原因

ID: API-SYNC-004
Title: DeepSeek 模型 ID 映射与价格补齐
Priority: Critical
Requirement Source:
- DeepSeek 同步策略
Preconditions:
- DeepSeek Provider 可访问或已准备远程响应 mock
- 已完成一次同步
Request Sequence:
1. GET /api/admin/models-channels
   Payload:
   - Header: `Authorization: Bearer <token>`
   Expected Status:
   - `200`
   Assertions:
   - 存在 `deepseek/v3`
   - 存在 `deepseek/reasoner`
   - 不以 `deepseek-chat`、`deepseek-reasoner` 作为最终 `Model.name`
   - `deepseek/v3` 的 `displayName = DeepSeek V3.2`
   - `costPrice.inputPer1M=0.28`
   - `costPrice.outputPer1M=0.42`
   - `contextWindow=131072`
State Assertions:
- Channel 的 `realModelId` 仍可保留原始服务商 ID
Cleanup:
- 无
Notes / Risks:
- 需要区分 `Model.name` 与 `Channel.realModelId`

ID: API-SYNC-005
Title: 智谱价格人民币转美元与图片模型同步
Priority: Critical
Requirement Source:
- 智谱同步策略
Preconditions:
- `EXCHANGE_RATE_CNY_TO_USD` 已设置
- 已完成一次同步
Request Sequence:
1. GET /api/admin/models-channels
   Payload:
   - Header: `Authorization: Bearer <token>`
   Expected Status:
   - `200`
   Assertions:
   - 存在 `zhipu/glm-4-plus`
   - 存在 `zhipu/glm-4-air`
   - 存在 `zhipu/glm-4-long`
   - 存在 `zhipu/cogview-3-plus`
   - `glm-4-plus` 的 `costPrice.inputPer1M = 50 * EXCHANGE_RATE_CNY_TO_USD`
   - `glm-4-plus` 的 `costPrice.outputPer1M = 50 * EXCHANGE_RATE_CNY_TO_USD`
   - `cogview-3-plus` 的模型 `modality=image`
State Assertions:
- 人民币价格必须已完成汇率换算后落库
Cleanup:
- 无
Notes / Risks:
- 断言时允许小数精度误差，建议按两位或四位小数比对

ID: API-SYNC-006
Title: 火山引擎仅从 staticModels 同步
Priority: Critical
Requirement Source:
- 火山引擎同步策略
Preconditions:
- `ProviderConfig.staticModels` 已按需求预填
- 可通过 mock / 日志确认未调用远程 `/models`
Request Sequence:
1. GET /api/admin/models-channels
   Payload:
   - Header: `Authorization: Bearer <token>`
   Expected Status:
   - `200`
   Assertions:
   - 存在 `volcengine/doubao-1.5-pro-256k`
   - 存在 `volcengine/doubao-1.5-pro-32k`
   - 存在 `volcengine/doubao-lite-128k`
   - 存在 `volcengine/doubao-pro-256k`
   - 存在 `volcengine/seedream-3.0`
   - 存在 `volcengine/seedream-4.0`
   - 存在 `volcengine/seedream-4.5`
   - 文本模型价格已由人民币转换为美元
State Assertions:
- 无需远程 API 也能完整生成 Volcengine 模型列表
Cleanup:
- 无
Notes / Risks:
- 若能读取同步日志，应补充“未发起远程请求”的证据

ID: API-SYNC-007
Title: 硅基流动过滤非 chat / image 模型
Priority: High
Requirement Source:
- 硅基流动同步策略
Preconditions:
- SiliconFlow Provider 可访问或已准备远程响应 mock
- 已完成一次同步
Request Sequence:
1. GET /api/admin/models-channels
   Payload:
   - Header: `Authorization: Bearer <token>`
   Expected Status:
   - `200`
   Assertions:
   - 存在若干 `siliconflow/` 前缀模型
   - 不存在 embedding、rerank、audio 类模型
   - 仅保留 chat / image 类模型
State Assertions:
- 过滤后模型总数明显少于远程原始列表
Cleanup:
- 无
Notes / Risks:
- 若远程返回格式兼容 OpenAI，需要单独断言类型字段判断逻辑

ID: API-SYNC-008
Title: OpenRouter 价格单位换算与免费模型过滤
Priority: Critical
Requirement Source:
- OpenRouter 同步策略
Preconditions:
- OpenRouter Provider 可访问或已准备远程响应 mock
- 已完成一次同步
Request Sequence:
1. GET /api/admin/models-channels
   Payload:
   - Header: `Authorization: Bearer <token>`
   Expected Status:
   - `200`
   Assertions:
   - 存在 `openrouter/` 前缀模型，且总量较大
   - `pricing.prompt` 和 `pricing.completion` 已乘 `1000000`
   - 免费模型未出现在结果中
   - deprecated 模型未出现在结果中
State Assertions:
- OpenRouter 模型价格直接取远程 API，不依赖 `pricingOverrides`
Cleanup:
- 无
Notes / Risks:
- 断言时至少抽样 3 个模型校验价格转换

ID: API-SYNC-009
Title: 同一底层模型跨服务商只创建一个 Model
Priority: Critical
Requirement Source:
- 跨服务商同模型去重
Preconditions:
- 至少存在一个同时可由直连 Provider 与 OpenRouter 提供的底层模型，如 `gpt-4o`
- 已完成一次同步
Request Sequence:
1. GET /api/admin/models-channels
   Payload:
   - Header: `Authorization: Bearer <token>`
   Expected Status:
   - `200`
   Assertions:
   - 仅存在一个 `Model.name = openai/gpt-4o`
   - 该模型下 `channels.length >= 2`
   - Channel 的 `providerName` 至少包含 `OpenAI` 与 `OpenRouter`
   - 不应额外存在一个独立 `openrouter/openai/gpt-4o` 作为重复 Model
State Assertions:
- 直连服务商命名优先作为 `Model.name`
Cleanup:
- 无
Notes / Risks:
- 若样本数据不足，此用例应标记 BLOCKED，不应跳过

ID: API-SYNC-010
Title: 合并规则回退到 pricingOverrides 与默认 0 成本
Priority: High
Requirement Source:
- 合并逻辑
Preconditions:
- 准备一个 API 不返回价格但 `pricingOverrides` 有值的模型
- 准备一个 API 与 `pricingOverrides` 都无价格的模型
- 已完成一次同步
Request Sequence:
1. GET /api/admin/models-channels
   Payload:
   - Header: `Authorization: Bearer <token>`
   Expected Status:
   - `200`
   Assertions:
   - 第一类模型使用 `pricingOverrides` 值
   - 第二类模型的 `costPrice` 为 0 或等价零值
   - 第二类模型的前台卖价显示逻辑可输出 “—”
State Assertions:
- 价格优先级必须是 API > `pricingOverrides` > 0
Cleanup:
- 无
Notes / Risks:
- “控制台显示 —” 属于 UI 断言，API 侧关注零值落库

ID: API-SYNC-011
Title: `sellPriceLocked=true` 的通道同步不覆盖卖价
Priority: Critical
Requirement Source:
- 验证清单第 9 条
Preconditions:
- 已存在一个通道
- 该通道允许管理员修改卖价与锁定状态
- 已拿到管理员 token
Request Sequence:
1. PATCH /api/admin/channels/:id
   Payload:
   ```json
   {
     "sellPrice": { "unit": "token", "inputPer1M": 9.99, "outputPer1M": 19.99 },
     "sellPriceLocked": true
   }
   ```
   Expected Status:
   - `200`
   Assertions:
   - 更新成功
2. 触发同步
   Payload:
   - 使用系统已有的手动同步入口，如 `POST /api/admin/sync-models`
   Expected Status:
   - `200`
   Assertions:
   - 同步成功
3. GET /api/admin/models-channels
   Payload:
   - Header: `Authorization: Bearer <token>`
   Expected Status:
   - `200`
   Assertions:
   - 目标通道卖价仍为 `9.99 / 19.99`
   - `sellPriceLocked` 保持 `true`
State Assertions:
- 同步只更新成本，不覆盖锁定卖价
Cleanup:
- 可选恢复原始卖价
Notes / Risks:
- 若当前手动同步接口不存在，应改用应用重启触发同步

ID: API-SYNC-012
Title: 同步结果对管理端与开发者接口的回归
Priority: High
Requirement Source:
- 验证清单第 11、12 条
Preconditions:
- 已完成一次同步
Request Sequence:
1. GET /api/admin/models-channels
   Payload:
   - Header: `Authorization: Bearer <token>`
   Expected Status:
   - `200`
   Assertions:
   - 管理端结果包含 `providerName`
   - 模型按模型名聚合，通道按来源展开
2. GET /v1/models
   Payload:
   - 无
   Expected Status:
   - `200`
   Assertions:
   - 返回开发者可见模型列表
   - `provider_name` 正确反映服务商显示名
   - 不泄漏重复模型
State Assertions:
- 前后端消费的模型数据契约保持一致
Cleanup:
- 无
Notes / Risks:
- 若前台仅显示 ACTIVE 模型，应根据产品规则筛选比对

## 执行日志或命令摘要

Command / Tool:
- 未执行
Environment:
- 用例规划阶段
Observed Status:
- N/A
Observed Body / Key Fields:
- N/A
Observed Side Effects:
- N/A

## 测试结果

- 本文档仅生成可执行测试用例，尚未执行测试。

## 缺陷列表

- 当前阶段未执行，不产出缺陷结论。

## 覆盖缺口和假设

- 假设系统存在管理员登录与手动同步入口，若实际接口不同，执行时需按实际实现调整请求路径。
- 假设管理端接口可返回模型、通道、价格、来源名称等字段。
- 若部分服务商在测试环境无真实凭证，建议使用录制响应或 mock server 执行适配器级集成测试。
- “控制台显示 `—`” 和页面正确显示属于 UI 验收，已在手工测试文档覆盖。
