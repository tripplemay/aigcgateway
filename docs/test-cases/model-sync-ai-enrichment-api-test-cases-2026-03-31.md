# 模型同步引擎 AI 文档增强版 API / 集成测试用例

## 测试目标

验证当前“模型自动同步引擎 AI 文档增强重构”需求的接口层、同步层、数据合并层和关键回归点，重点覆盖：

- 两层同步架构是否按设计执行
- 各 Provider 的 `/models` 抓取策略是否正确
- `doc-enricher.ts` 是否按 `docUrls` 读取文档并补全缺失数据
- AI 提取结果是否遵循“只补不覆盖”
- `pricingOverrides` 是否仅作为运营手动覆盖入口
- `sellPriceLocked=true` 的通道是否永远不被覆盖
- 内部 AI 调用是否绕过开发者鉴权、计费和 `CallLog`
- 管理端和开发者侧接口输出是否正确

## 测试环境

- 环境类型：本地 Codex 测试环境
- 推荐初始化方式：`bash scripts/test/codex-setup.sh`
- 默认端口：`3099`
- 数据源：本地 PostgreSQL / Redis
- 说明：本文件仅定义测试用例，当前未执行

## 测试范围

- 数据库结构与种子配置校验
- `ProviderConfig.docUrls` / `pricingOverrides` / `staticModels` 行为
- 同步调度器 `model-sync.ts`
- AI 文档提取层 `doc-enricher.ts`
- 7 家服务商同步逻辑
- 管理端同步与模型聚合接口
- 开发者模型列表接口
- 同步日志与内部 AI 调用副作用约束

## 前置条件

- 已拉取包含本需求实现的最新代码
- 本地测试数据库可重建
- 存在管理员测试账号
- 存在可用于同步的 Provider 种子数据
- 如需验证远程真实抓取，需准备各 Provider 可用测试 API Key
- 如需验证 AI 文档提取成功路径，内部 `deepseek-chat` 适配器通道需可用

## API / 集成测试用例

### TC-API-001 数据库结构新增 `doc_urls`

- 优先级：P0
- 目标：确认 `ProviderConfig` 已支持 `docUrls`
- 前置条件：完成数据库初始化
- 步骤：
  1. 检查 Prisma schema 中 `ProviderConfig` 字段定义
  2. 检查数据库表是否存在 `doc_urls`
- 断言：
  - `doc_urls` 字段存在
  - 字段类型为 JSON 或等价 JSONB
  - `static_models` 保留
  - `pricing_overrides` 保留

### TC-API-002 种子数据仅预填 `docUrls`

- 优先级：P0
- 目标：确认种子数据不再预填 `pricingOverrides`
- 前置条件：执行 `codex-setup.sh`
- 步骤：
  1. 查询 7 家 Provider 的 `ProviderConfig`
  2. 检查 `docUrls`、`pricingOverrides`、`staticModels`
- 断言：
  - OpenAI / Anthropic / DeepSeek / Zhipu / Volcengine / SiliconFlow 的 `docUrls` 非空
  - OpenRouter 的 `docUrls` 为空数组
  - `pricingOverrides` 默认为空或 `null`
  - 不存在历史硬编码价格种子残留

### TC-API-003 OpenAI 第 1 层 `/models` 过滤正确

- 优先级：P0
- 目标：验证 OpenAI 适配器只保留 chat / image 模型
- 前置条件：OpenAI API Key 可用
- 步骤：
  1. 触发单 Provider 同步或全量同步
  2. 抓取同步结果中的 OpenAI 模型列表
- 断言：
  - 保留 `gpt-*`、`o1*`、`o3*`、`o4*`、`dall-e-3`
  - 排除 `tts`、`whisper`、`embedding`、`babbage`、`davinci`
  - 第 1 层返回的价格字段允许为空

### TC-API-004 OpenAI 第 2 层 AI 文档补全价格与上下文

- 优先级：P0
- 目标：验证 OpenAI 价格与上下文来自文档提取，而非硬编码
- 前置条件：
  - OpenAI `/models` 成功
  - 内部 AI 通道可用
- 步骤：
  1. 触发同步
  2. 读取 OpenAI 同步后的模型数据
  3. 对比第 1 层原始结果与最终结果
- 断言：
  - `inputPricePerM` / `outputPricePerM` / `contextWindow` 被补全
  - 第 1 层已返回的字段不被第 2 层覆盖
  - 数据来源体现为 API + AI enrichment

### TC-API-005 Anthropic `/models` 请求头正确

- 优先级：P0
- 目标：验证 Anthropic 适配器携带 `anthropic-version: 2023-06-01`
- 前置条件：Anthropic API Key 可用
- 步骤：
  1. 触发 Anthropic 同步
  2. 检查请求日志或抓包
- 断言：
  - 请求头包含 `anthropic-version: 2023-06-01`
  - 能取回模型列表
  - `capabilities`、输入窗口、输出 token 字段正确映射

### TC-API-006 Anthropic 价格由 AI 文档提取补全

- 优先级：P0
- 目标：验证 Anthropic 价格不靠种子，来自文档提取
- 前置条件：Anthropic API 和内部 AI 通道可用
- 步骤：
  1. 触发同步
  2. 检查 `claude-*` 模型最终价格
- 断言：
  - 价格字段存在
  - 未发现预填硬编码来源
  - 第 1 层已有字段未被覆盖

### TC-API-007 DeepSeek 命名映射正确

- 优先级：P0
- 目标：验证 `deepseek-chat` 和 `deepseek-reasoner` 的友好名称映射
- 前置条件：DeepSeek API Key 可用
- 步骤：
  1. 触发同步
  2. 查询生成的 Model / Channel
- 断言：
  - `deepseek-chat` 对应 `deepseek/v3`
  - `deepseek-reasoner` 对应 `deepseek/reasoner`
  - 命名映射仅影响规范名称，不伪造不存在的额外模型

### TC-API-008 DeepSeek 价格与上下文由文档提取补全

- 优先级：P0
- 目标：验证 DeepSeek 第 2 层补全成功
- 前置条件：DeepSeek API 和内部 AI 可用
- 步骤：
  1. 触发同步
  2. 检查两个模型的价格与上下文
- 断言：
  - 模型数量为 2
  - 价格与上下文来自 AI enrichment
  - 缺失字段被填补

### TC-API-009 Zhipu 人民币价格自动换算为美元

- 优先级：P0
- 目标：验证 AI 提取出的人民币价格正确换算
- 前置条件：Zhipu API 和内部 AI 可用
- 步骤：
  1. 触发同步
  2. 抽查 2 到 3 个模型的文档提取价格与最终美元价格
- 断言：
  - 人民币价格被识别
  - 使用 `EXCHANGE_RATE_CNY_TO_USD` 转换
  - 存储结果为美元 / 百万 token

### TC-API-010 Volcengine 仅靠 AI 文档提取生成模型

- 优先级：P0
- 目标：验证火山引擎不依赖 `/models`，仅靠 AI 文档层生成模型
- 前置条件：内部 AI 通道可用
- 步骤：
  1. 触发 Volcengine 同步
  2. 查看同步结果统计
  3. 查询生成的模型与通道
- 断言：
  - 第 1 层 API 数量为 `0`
  - 第 2 层 AI 提取出模型列表与价格
  - 模型数量显著高于旧版本的 4 到 7 个
  - 通道 `realModelId` 在未人工回填 endpoint 时等于 `model_id`

### TC-API-011 SiliconFlow 第 1 层过滤非 chat / image

- 优先级：P0
- 目标：验证 SiliconFlow 过滤规则
- 前置条件：SiliconFlow API Key 可用
- 步骤：
  1. 触发同步
  2. 检查写入的模型类型
- 断言：
  - 仅保留 chat / image
  - 排除 embedding / rerank / audio
  - 缺失价格可由 AI 补充

### TC-API-012 OpenRouter 完全依赖 `/models`，不触发 AI

- 优先级：P0
- 目标：验证 OpenRouter 不走第 2 层
- 前置条件：OpenRouter API Key 可用
- 步骤：
  1. 触发同步
  2. 检查同步结果和日志
- 断言：
  - 模型、价格、上下文全部来自 `/models`
  - `docUrls` 为空时不触发 AI enrichment
  - 免费模型与 deprecated 模型被过滤
  - pricing 单位已由 `$ / token` 转成 `$ / 1M tokens`

### TC-API-013 AI 提取失败时降级到仅第 1 层

- 优先级：P0
- 目标：验证 AI enrichment 失败不影响同步主流程
- 前置条件：可模拟文档抓取失败或 AI 返回非法 JSON
- 步骤：
  1. 让一个 Provider 的 `docUrls` 指向不可达页面，或模拟 AI 返回非法 JSON
  2. 触发同步
  3. 读取同步结果与最终模型数据
- 断言：
  - 同步任务整体不失败
  - 错误写入同步结果或日志
  - 最终仍保留第 1 层数据
  - 缺失字段保持空值

### TC-API-014 AI 新增模型只添加，不覆盖已有 API 字段

- 优先级：P0
- 目标：验证 AI enrichment 合并规则
- 前置条件：存在一个 Provider，文档包含 API 未返回的新模型或额外字段
- 步骤：
  1. 触发同步
  2. 对比第 1 层结果与最终结果
- 断言：
  - API 已返回字段值不变
  - AI 仅补齐缺失字段
  - AI 发现的新模型会新增

### TC-API-015 `pricingOverrides` 为空时不报错

- 优先级：P1
- 目标：验证无覆盖配置时同步逻辑正常
- 前置条件：`pricingOverrides` 为 `null` 或空对象
- 步骤：
  1. 触发同步
  2. 观察结果
- 断言：
  - 不抛异常
  - 同步结果中的 `overrides=0`

### TC-API-016 运营手动覆盖优先级最高

- 优先级：P0
- 目标：验证 `pricingOverrides` 只作为手动覆盖入口，且优先级高于 API / AI
- 前置条件：某 Provider 存在手动覆盖配置
- 步骤：
  1. 设置指定模型的 `pricingOverrides`
  2. 触发同步
  3. 查询最终模型数据
- 断言：
  - 覆盖值优先于 API 与 AI 提取结果
  - 仅覆盖指定字段
  - 未配置字段继续遵循 API / AI 合并规则

### TC-API-017 `sellPriceLocked=true` 永不被同步覆盖

- 优先级：P0
- 目标：验证通道锁价保护
- 前置条件：存在已同步通道
- 步骤：
  1. 手动修改某通道卖价并锁定
  2. 再次触发同步
  3. 查询通道与 `/v1/models`
- 断言：
  - `sellPriceLocked=true` 保持不变
  - 卖价保持手工值
  - 成本价可按同步逻辑更新，但卖价不回退

### TC-API-018 内部 AI 调用不写 `CallLog`

- 优先级：P0
- 目标：验证基础设施内部 AI 调用不计入开发者调用链路
- 前置条件：内部 AI enrichment 成功执行
- 步骤：
  1. 记录同步前 `CallLog` 数量
  2. 触发文档增强同步
  3. 再次查询 `CallLog`
- 断言：
  - 不新增由同步任务产生的 `CallLog`
  - 不产生开发者侧调用记录

### TC-API-019 内部 AI 调用不走鉴权和余额检查

- 优先级：P0
- 目标：验证同步内部调用绕过 API Gateway 中间件
- 前置条件：可观测内部调用链路日志
- 步骤：
  1. 触发需要 AI enrichment 的同步
  2. 查看日志或观测点
- 断言：
  - 不要求开发者 API Key
  - 不做余额检查
  - 不触发开发者扣费

### TC-API-020 跨服务商同模型去重生效

- 优先级：P0
- 目标：验证 OpenAI / OpenRouter 等同底层模型聚合为一个 Model
- 前置条件：至少两个 Provider 同时同步到同底层模型
- 步骤：
  1. 触发全量同步
  2. 查询 `GET /api/admin/models-channels`
  3. 抽查 `gpt-4o` 等跨 Provider 模型
- 断言：
  - `openai/gpt-4o` 为主命名
  - OpenRouter 的同模型形成同一 Model 下多 Channel
  - 不再出现无必要的重复模型

### TC-API-021 手动触发同步接口正常

- 优先级：P0
- 目标：验证 `POST /api/admin/sync-models` 正常工作
- 前置条件：管理员已登录
- 步骤：
  1. 调用 `POST /api/admin/sync-models`
  2. 查询 `GET /api/admin/sync-status`
- 断言：
  - 返回成功
  - 可看到每个 Provider 的统计
  - 同步日志包含 API / AI / override 维度

### TC-API-022 同步日志记录每层来源统计

- 优先级：P1
- 目标：验证日志格式与统计字段
- 前置条件：已完成一次全量同步
- 步骤：
  1. 读取同步日志或管理端同步结果
  2. 检查 7 家 Provider 的统计
- 断言：
  - 包含每家 Provider 总模型数
  - 包含 API 数量
  - 包含 AI 补充数量或价格补全数量
  - OpenRouter 体现 AI not needed

### TC-API-023 管理端模型聚合接口正确展示来源与价格

- 优先级：P0
- 目标：验证 `GET /api/admin/models-channels` 输出正确
- 前置条件：已完成同步
- 步骤：
  1. 调用 `GET /api/admin/models-channels`
  2. 抽查多 Provider 模型与 docs-only 模型
- 断言：
  - 模型按聚合结果返回
  - 通道来源正确
  - 缺失价格显示为空值而不是错误值
  - Volcengine 通道存在可识别的待补 endpoint 样本

### TC-API-024 开发者模型列表接口正确显示

- 优先级：P0
- 目标：验证 `GET /v1/models` 输出与同步结果一致
- 前置条件：开发者 API Key 可用
- 步骤：
  1. 调用 `GET /v1/models`
  2. 抽查模型数量、价格、来源、图片模型
- 断言：
  - 仅返回 active 模型
  - 卖价展示符合锁价与成本逻辑
  - 火山引擎 docs-only 模型可见
  - OpenRouter 模型价格正确换算

### TC-API-025 TypeScript 编译通过

- 优先级：P0
- 目标：验证实现满足编译要求
- 前置条件：依赖安装完成
- 步骤：
  1. 执行项目 TypeScript / build 校验命令
- 断言：
  - TypeScript 0 error
  - 不因新增 `doc-enricher.ts`、类型扩展、ProviderConfig 变更而失败

## 重点异常场景

- 文档页面 10 秒超时
- 文档页面返回 404 / 500
- HTML 内容过长
- AI 返回非 JSON
- AI 返回空数组
- AI 提取出价格单位为人民币
- AI 提取出图片模型按 token 以外单位计价
- OpenRouter `docUrls=[]`
- Volcengine 无 endpoint ID
- `pricingOverrides` 为空
- `sellPriceLocked=true`
- API 第 1 层失败但第 2 层仍有文档结果

## 覆盖与未覆盖说明

已纳入本轮用例设计的需求点：

- 两层同步架构
- 7 家 Provider 分策略同步
- AI 文档增强补全
- 运营手动覆盖
- 锁价保护
- 内部 AI 调用副作用隔离
- 同步日志
- 管理端和开发者端展示
- 编译校验

当前未执行，后续执行时可能受环境阻塞的点：

- 各 Provider 真实 API Key 可用性
- 内部 AI 通道可用性
- 文档页面在线可访问性
- 生产 / 测试环境数据规模差异

## 结论

本文件为“模型同步引擎 AI 文档增强版”API / 集成测试用例设计稿。

- 当前状态：已撰写，未执行
- 后续执行建议：先本地 `codex-setup.sh`，再按 P0 用例优先执行 smoke 与主流程验证
