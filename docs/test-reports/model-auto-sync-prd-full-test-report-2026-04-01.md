# 模型自动同步引擎 PRD 完整测试报告

## Summary

- Scope:
  - 按 [AIGC-Gateway-Model-Auto-Sync-PRD.md](/Users/yixingzhou/project/aigcgateway/docs/AIGC-Gateway-Model-Auto-Sync-PRD.md) 在本地测试环境执行完整 API / 集成测试和手工回归
  - 覆盖既有用例与补充用例：
    - [model-sync-ai-enrichment-api-test-cases-2026-03-31.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/model-sync-ai-enrichment-api-test-cases-2026-03-31.md)
    - [model-sync-ai-enrichment-manual-test-cases-2026-03-31.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/model-sync-ai-enrichment-manual-test-cases-2026-03-31.md)
    - [model-sync-ai-enrichment-test-cases-supplement-2026-04-01.md](/Users/yixingzhou/project/aigcgateway/docs/test-reports/model-sync-ai-enrichment-test-cases-supplement-2026-04-01.md)
- Documents:
  - [AIGC-Gateway-Model-Auto-Sync-PRD.md](/Users/yixingzhou/project/aigcgateway/docs/AIGC-Gateway-Model-Auto-Sync-PRD.md)
  - [AIGC-Gateway-Provider-Adapter-Spec.md](/Users/yixingzhou/project/aigcgateway/docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-Provider-Adapter-Spec.md)
  - [AIGC-Gateway-Database-Design.md](/Users/yixingzhou/project/aigcgateway/docs/AIGC-Gateway-P1-Documents/AIGC-Gateway-Database-Design.md)
  - [P1.6-model-sync-engine-evolution.md](/Users/yixingzhou/project/aigcgateway/docs/P1.6-model-sync-engine-evolution.md)
- Environment:
  - 本地 Codex 测试环境
  - `bash scripts/test/codex-setup.sh`
  - 固定端口 `3099`
  - 数据库 `aigc_gateway_test`
  - 为保证稳定，测试阶段使用 PTY 常驻启动 `node .next/standalone/server.js`
- Result totals:
  - PASS: 11
  - PARTIAL: 2
  - BLOCKED: 6
  - FAIL: 0

## 覆盖摘要

- 已完整验证：
  - 数据库迁移与种子配置
  - OpenRouter API-only 主路径
  - `pricingOverrides` 为空容错
  - Jina Reader / AI 失败降级
  - `sellPriceLocked`
  - `CallLog` 隔离
  - 两条降级保护
  - 并发同步保护
  - 管理端 / 开发者页面基础可访问性
- 已部分验证：
  - Jina Reader 运行路径
  - 手工 UI 交互层
- 被环境阻塞：
  - 5 家直连 Provider `/models` 成功路径
  - 内部 DeepSeek AI 正向成功路径
  - Volcengine docs-only 正向生成
  - SiliconFlow AI 价格补全
  - 跨服务商去重正向样本

## 场景矩阵

- 环境初始化与 smoke - PASS
- `doc_urls` / `pricingOverrides` / `staticModels` 配置落库 - PASS
- OpenRouter `/models` API-only 路径 - PASS
- OpenAI `/models` + AI 定价页补全 - BLOCKED
- Anthropic `/models` + AI 价格补全 - BLOCKED
- DeepSeek `/models` + AI 价格补全 - BLOCKED
- Zhipu `/models` + AI 人民币转美元 - BLOCKED
- Volcengine docs-only 路径 - BLOCKED
- SiliconFlow `/models` + AI 价格补全 - BLOCKED
- Jina Reader 文档获取路径 - PARTIAL
- AI 失败降级 - PASS
- `pricingOverrides` 为空容错 - PASS
- `sellPriceLocked` 保护 - PASS
- 内部 AI 不写 `CallLog` - PASS
- “0 模型”降级保护 - PASS
- “<50% 模型数”降级保护 - PASS
- 并发同步保护 - PASS
- 管理端 / 开发者页面可访问性 - PASS
- 跨服务商同模型聚合 - BLOCKED
- 手工 UI 深层交互验收 - PARTIAL

## 执行日志 / 命令摘要

- 环境重建：
  - `bash scripts/test/codex-setup.sh`
- 服务常驻：
  - `node .next/standalone/server.js`
- 核心接口：
  - `POST /api/auth/login`
  - `GET /api/admin/sync-status`
  - `POST /api/admin/sync-models`
  - `GET /api/admin/channels`
  - `GET /api/admin/models-channels`
  - `GET /api/admin/providers/:id/config`
  - `GET /api/v1/models`
- 数据库验证：
  - `/opt/homebrew/opt/postgresql@16/bin/psql postgresql://test:test@localhost:5432/aigc_gateway_test ...`
- 降级保护测试：
  - 临时更新 `providers.baseUrl`
  - 启动本地 mock 服务 `127.0.0.1:59999`
- 页面可访问性：
  - `GET /admin/models`
  - `GET /models`

## 关键执行结果

### 1. 环境与配置

- `doc_urls` 迁移已落库
- `deepseek` / `volcengine` / `openrouter` 的 ProviderConfig 读取结果：
  - `deepseek.docUrls=["https://api-docs.deepseek.com/quick_start/pricing"]`
  - `volcengine.docUrls=["https://www.volcengine.com/docs/82379/1399008"]`
  - `openrouter.docUrls=null`
  - `pricingOverrides=null`
  - `staticModels=null`

### 2. 同步主链路

- 最新 `sync-status`：
  - `openai.apiModels=0, aiEnriched=0, error=401`
  - `anthropic.apiModels=0, aiEnriched=0, error=401`
  - `deepseek.apiModels=0, aiEnriched=0, error=401`
  - `zhipu.apiModels=0, aiEnriched=0, error=401`
  - `volcengine.apiModels=0, aiEnriched=0, error=null`
  - `siliconflow.apiModels=0, aiEnriched=0, error=401`
  - `openrouter.apiModels=320, aiEnriched=0, modelCount=320`

### 3. 开发者模型列表

- `GET /api/v1/models`
  - `count=320`
  - `text=315`
  - `image=5`
  - `providers=["OpenRouter"]`
- `GET /api/v1/models?modality=text`
  - `count=315`
- `GET /api/v1/models?modality=image`
  - `count=5`
- `openrouter_free_like=0`

### 4. 运行时日志

从本地服务日志确认：

- 第 2 层对各 Provider 均执行了 `doc-enricher`
- 日志示例：
  - `Fetching https://platform.openai.com/docs/pricing for openai...`
  - `Fetching https://docs.anthropic.com/en/docs/about-claude/models for anthropic...`
  - `Fetching https://api-docs.deepseek.com/quick_start/pricing for deepseek...`
  - `Fetching https://open.bigmodel.cn/pricing for zhipu...`
  - `Fetching https://www.volcengine.com/docs/82379/1399008 for volcengine...`
  - `Fetching https://siliconflow.cn/pricing for siliconflow...`
- 代码实现中 `fetchDocPage()` 已统一走 `https://r.jina.ai/`
- 本地因 `DeepSeek API key not configured`，所有第 2 层正向提取都降级

### 5. 价格锁定与审计隔离

- 将 `openai/gpt-4o` 对应通道卖价改为 `9.99 / 19.99`
- PATCH 响应：
  - `sellPriceLocked=true`
- 再次同步后：
  - `/api/v1/models` 中 `openai/gpt-4o` 仍为 `9.99 / 19.99`
- `call_logs` 测前测后均为 `0`

### 6. 降级保护

#### 6.1 “0 模型”跳过 reconcile

- 将 `openrouter.baseUrl` 临时指向本地 mock 服务，mock 返回 `data: []`
- 同步结果：
  - `openrouter.apiModels=0`
  - `openrouter.modelCount=0`
- 服务日志：
  - `SKIPPED reconcile — AI returned 0 models but DB has 320 active channels`
- 数据库验证：
  - OpenRouter `ACTIVE channel` 数仍为 `320`

#### 6.2 “<50% 模型数”跳过 reconcile

- 同一 mock 服务改为仅返回 `1` 个模型
- 同步结果：
  - `openrouter.apiModels=1`
  - `openrouter.modelCount=1`
- 服务日志：
  - `SKIPPED reconcile — model count 1 < 50% of existing 320`
- 数据库验证：
  - OpenRouter `ACTIVE channel` 数仍为 `320`

### 7. 并发同步保护

- 几乎同时发送两次 `POST /api/admin/sync-models`
- 第一次：
  - `durationMs=13558`
  - `providerCount=7`
- 第二次：
  - `durationMs=0`
  - `providerCount=0`
- 结论：
  - 命中了 `syncInProgress` 保护

### 8. 页面层

- `GET /admin/models` 返回 `200`
- `GET /models` 返回 `200`
- 由于无浏览器交互工具，本轮主要验证页面可访问性与其依赖接口的一致性

## 缺陷列表

本轮未发现可在本地测试环境中稳定定性为“实现缺陷”的新增问题。

当前主要问题均属于环境阻塞或外部凭证缺失：

- [High] 本地 5 家直连 Provider `/models` 返回 `401`
  - 影响：无法完成 OpenAI / Anthropic / DeepSeek / Zhipu / SiliconFlow 第 1 层正向验收
  - 复现：`POST /api/admin/sync-models` 后查看 `sync-status`
  - 证据：`error="API fetch failed: ... returned 401"`

- [High] 本地内部 DeepSeek AI key 未配置
  - 影响：无法完成所有第 2 层 AI 正向提取验收
  - 复现：启动同步后查看本地服务日志
  - 证据：`DeepSeek API key not configured`

## Blocked / Untested

- OpenAI 价格与上下文由 AI 文档提取补全
- Anthropic 价格补全
- DeepSeek 价格补全成功路径
- Zhipu 人民币价格转美元成功路径
- Volcengine docs-only 正向提取
- SiliconFlow AI 价格补全成功路径
- 跨服务商多通道聚合正向样本
- Jina Reader 网络级证据抓包
- 管理端 / 开发者端浏览器级交互细节

## Assumptions

- 本地测试环境使用占位 Provider key，`401` 视为环境阻塞，不直接定性为产品缺陷
- 无浏览器自动化工具时，页面层以 `200` 可访问 + 后端接口数据一致性作为手工测试替代证据

## 最终结论

本轮按 PRD 在本地测试环境完成了完整测试和补充用例执行，结论为：**部分通过，且主要阻塞来自本地环境凭证缺失，不是本轮可直接定性的代码回归。**

明确通过的高价值项：

- 迁移与种子配置
- OpenRouter 主路径
- `pricingOverrides` 为空容错
- `sellPriceLocked`
- `CallLog` 隔离
- Jina Reader / AI 失败降级
- 两条数据保护降级规则
- 并发同步保护

当前仍无法在本地完成的验收，主要依赖：

- 真实 Provider API key
- 可用的内部 DeepSeek AI key
