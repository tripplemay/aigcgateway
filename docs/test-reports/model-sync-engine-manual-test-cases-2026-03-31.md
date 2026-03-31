# AIGC Gateway 模型同步引擎完善手工测试用例

Summary
- Scope:
  - 模型同步后的控制台 Models & channels 页面
  - 开发者模型列表页
  - 各服务商模型数量、价格、来源显示与去重展示
- Documents:
  - 用户提供需求《AIGC Gateway — 模型同步引擎完善》
  - 需求中的验证清单
- Environment:
  - 本文档仅生成测试用例，尚未执行
  - 预期使用本地测试环境 `http://localhost:3099`
- Result totals:
  - Planned cases: 10
  - Executed: 0

## 测试范围

- 自动同步后的模型可见性
- 管理端模型聚合展示
- 开发者模型列表展示
- 价格显示与空价格回退
- 跨服务商同模型去重
- 锁价保护后的页面回归

## 使用的源文档

- 本轮用户提供的完整需求文本
- 需求中的验证清单

## 覆盖摘要

- 核心主流程：已覆盖
- 非法输入与校验：部分覆盖，主要覆盖同步后展示与运营编辑回归
- 空状态 / 零数据状态：已覆盖价格缺失展示
- 权限与角色行为：已覆盖管理员页与开发者页
- 刷新或重新进入后的状态保持：已覆盖
- 重复操作：已覆盖重复同步/重复刷新观察
- 错误恢复路径：未覆盖服务商远程失败重试 UI，仅覆盖结果展示
- 高回归风险相邻流程：已覆盖锁价与开发者列表页

## 结构化测试用例列表

ID: MANUAL-SYNC-001
Title: 启动应用后控制台模型页能看到同步结果
Priority: Critical
Requirement Source:
- 验证清单第 1、11 条
Preconditions:
- 已启动应用并完成自动同步
- 可使用管理员账号登录控制台
Steps:
1. 访问登录页并使用管理员账号登录。
2. 进入 `/admin/models`。
3. 观察页面是否加载出模型列表。
Expected Result:
- 页面成功打开，无白屏或接口错误。
- 模型列表非空。
- 每行第一层为模型名，不是 Provider 名。
Post-conditions:
- 无
Notes / Risks:
- 若同步是异步启动，可先刷新一次再观察

ID: MANUAL-SYNC-002
Title: 管理端页面显示 7 家服务商的模型来源
Priority: High
Requirement Source:
- 7 家服务商逐家同步策略
- 验证清单第 1 条
Preconditions:
- `/admin/models` 页面已加载完成
Steps:
1. 在管理端模型页搜索 `openai/`、`anthropic/`、`deepseek/`、`zhipu/`、`volcengine/`、`siliconflow/`、`openrouter/`。
2. 分别展开命中的模型。
3. 观察通道卡片标题和来源名称。
Expected Result:
- 7 家服务商都能在页面上找到至少一个模型或来源。
- 通道卡片标题显示来源品牌名，如 `OpenAI`、`OpenRouter`、`智谱 AI`。
- 不显示错误的 Provider 推断名。
Post-conditions:
- 无
Notes / Risks:
- 若某家服务商因凭证缺失未同步成功，应记录为 BLOCKED

ID: MANUAL-SYNC-003
Title: OpenAI 模型白名单与价格展示正确
Priority: Critical
Requirement Source:
- OpenAI 同步策略
- 验证清单第 2 条
Preconditions:
- OpenAI 同步已成功
Steps:
1. 在 `/admin/models` 搜索 `openai/gpt-4o`。
2. 展开 `openai/gpt-4o`、`openai/gpt-4o-mini`、`openai/gpt-4.1`、`openai/o3`、`openai/o3-mini`、`openai/o4-mini`。
3. 观察上下文窗口和价格区域。
4. 搜索 `dall-e-3` 并观察是否为图片模型。
Expected Result:
- 上述模型均存在。
- 模型上下文窗口和价格已显示，不是空值。
- `dall-e-3` 显示为图片模型。
- 非白名单模型不会出现在最终同步结果中。
Post-conditions:
- 无
Notes / Risks:
- 价格若前端有格式化，按格式化后的可见值核对

ID: MANUAL-SYNC-004
Title: DeepSeek 与 Anthropic 命名和价格展示正确
Priority: High
Requirement Source:
- Anthropic、DeepSeek 同步策略
- 验证清单第 3、4 条
Preconditions:
- 对应服务商同步已成功
Steps:
1. 搜索 `deepseek/v3` 与 `deepseek/reasoner`。
2. 观察模型显示名、上下文窗口与价格。
3. 搜索 `anthropic/claude-opus-4-6`、`anthropic/claude-sonnet-4-6`、`anthropic/claude-haiku-4-5`。
4. 观察价格是否都有展示。
Expected Result:
- DeepSeek 不以 `deepseek-chat` 作为最终模型名展示。
- DeepSeek 与 Anthropic 目标模型都能找到。
- 价格完整可见。
Post-conditions:
- 无
Notes / Risks:
- 若能力字段在 UI 不展示，本用例不要求验证 capabilities

ID: MANUAL-SYNC-005
Title: 智谱与火山引擎人民币价格转换后展示正确
Priority: High
Requirement Source:
- 智谱、火山引擎同步策略
- 验证清单第 5、6 条
Preconditions:
- `EXCHANGE_RATE_CNY_TO_USD` 已配置
- 对应服务商同步已成功
Steps:
1. 搜索 `zhipu/glm-4-plus`、`zhipu/glm-4-air`、`zhipu/cogview-3-plus`。
2. 观察文本模型价格和图片模型展示。
3. 搜索 `volcengine/doubao-1.5-pro-256k`、`volcengine/doubao-lite-128k`、`volcengine/seedream-4.0`。
4. 观察文本模型价格、图片模型标识。
Expected Result:
- 智谱文本模型价格不是空值，并已转换为美元展示口径。
- `cogview-3-plus` 为图片模型。
- 火山引擎静态模型都能看到，文本模型价格已显示。
- `seedream` 系列为图片模型。
Post-conditions:
- 无
Notes / Risks:
- 页面通常不直接展示原始人民币值，本用例关注换算后有值且相对正确

ID: MANUAL-SYNC-006
Title: 硅基流动和 OpenRouter 的过滤结果正确
Priority: High
Requirement Source:
- 硅基流动、OpenRouter 同步策略
- 验证清单第 7、8 条
Preconditions:
- 对应服务商同步已成功
Steps:
1. 在管理端搜索 `siliconflow/`。
2. 随机展开多条结果，观察是否仅为 chat/image 类模型。
3. 搜索 `openrouter/`。
4. 检查结果数量明显较多。
5. 随机查看多条 OpenRouter 模型价格。
Expected Result:
- 硅基流动列表中不出现 embedding、rerank、audio 类模型。
- OpenRouter 模型量明显多，且价格直接可见。
- 不显示免费或 deprecated 模型。
Post-conditions:
- 无
Notes / Risks:
- “明显较多”建议结合需求预期记录实际数量

ID: MANUAL-SYNC-007
Title: 同一底层模型跨服务商去重展示正确
Priority: Critical
Requirement Source:
- 跨服务商同模型去重
- 验证清单第 9 条
Preconditions:
- 至少有一个底层模型同时由直连 Provider 和 OpenRouter 提供
Steps:
1. 在管理端搜索 `openai/gpt-4o`。
2. 打开对应模型行。
3. 观察展开后的通道卡片来源。
4. 再搜索 `openrouter/openai/gpt-4o` 或类似重复命名。
Expected Result:
- `openai/gpt-4o` 只出现一个模型分组。
- 展开后能看到多个来源通道，例如 `OpenAI` 和 `OpenRouter`。
- 不存在额外重复的单独模型分组。
Post-conditions:
- 无
Notes / Risks:
- 若测试环境没有形成该样本，应标记 BLOCKED

ID: MANUAL-SYNC-008
Title: 锁价通道在同步后不被覆盖
Priority: Critical
Requirement Source:
- 验证清单第 10 条
Preconditions:
- 管理端支持编辑通道卖价
- 存在一个可编辑通道
Steps:
1. 在管理端选择一个通道，手动设置明显不同的卖价。
2. 打开锁价开关或设置 `sellPriceLocked=true`。
3. 触发一次手动同步或重启应用让同步重新执行。
4. 返回该通道查看卖价。
Expected Result:
- 同步后卖价保持为手工设置的值。
- 锁价状态仍然保持开启。
Post-conditions:
- 如需继续测试，可恢复原始卖价
Notes / Risks:
- 若 UI 没有显式锁价开关，可改为 API 设置后再回到页面验证

ID: MANUAL-SYNC-009
Title: pricingOverrides 缺失的模型显示为 “—”
Priority: High
Requirement Source:
- 合并逻辑
- 验证清单第 10 条
Preconditions:
- 环境中存在一个 API 无价格且 `pricingOverrides` 也无配置的模型
Steps:
1. 在管理端搜索该目标模型。
2. 观察模型行和通道卡片中的价格展示。
3. 如开发者页可见该模型，也在 `/models` 页面搜索该模型。
Expected Result:
- 成本或卖价缺失时，页面按需求显示 `—`，而不是误显示 `0` 美元的可销售价格。
Post-conditions:
- 无
Notes / Risks:
- 需要测试前准备好对应数据样本

ID: MANUAL-SYNC-010
Title: 开发者模型列表页显示正确且不重复
Priority: Critical
Requirement Source:
- 验证清单第 12 条
Preconditions:
- 开发者模型列表页可访问
- 已完成一次同步
Steps:
1. 访问 `/models`。
2. 搜索 `openai/gpt-4o`、`deepseek/v3`、`zhipu/glm-4-plus` 等代表模型。
3. 观察服务商名称显示、价格显示、模型是否重复。
4. 刷新页面后再次检查。
Expected Result:
- 页面可正常加载。
- `provider_name` 对应的品牌名显示正确。
- 同一底层模型不会以多个重复条目展示。
- 刷新后展示结果稳定一致。
Post-conditions:
- 无
Notes / Risks:
- 若开发者页只展示 ACTIVE 模型，需据此选择样本

## 执行结果

- 本文档仅生成手工测试用例，尚未执行测试。

## 缺陷列表

- 当前阶段未执行，不产出缺陷结论。

## 待确认问题或规格缺口

- 手动触发同步的实际入口路径需要以实现为准。
- 若某些服务商在测试环境没有真实 API Key，需要提前约定 mock 或录制响应方案。
- 需求定义了“同一底层模型去重”，但未给出完整映射表样本；执行前需要准备至少一组可稳定复现的重叠模型数据。
