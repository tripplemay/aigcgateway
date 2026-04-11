# AIGC Gateway — 模型自动同步引擎 PRD

> AI 驱动的服务商模型与定价自动发现系统
> Version 1.0 | 2026-04-01
> 配套文档：AIGC-Gateway-Provider-Adapter-Spec · AIGC-Gateway-Database-Design
> 方案演进记录：P1.6-model-sync-engine-evolution.md

---

## 1. 功能概述

### 1.1 解决什么问题

AIGC Gateway 接入 11 家 AI 服务商（OpenAI / Anthropic / DeepSeek / Zhipu / Volcengine / SiliconFlow / OpenRouter / MiniMax / Moonshot / Qwen / StepFun），每家有不同的模型和定价。这些信息持续变化——服务商上新模型、调整价格、下架旧模型。

P1 版本的模型数据完全依赖人工维护（种子数据中硬编码），导致：
- 火山引擎实际提供 30+ 模型，平台只有 4-7 个
- OpenAI、Anthropic、DeepSeek 等模型缺少价格信息
- 服务商更新价格后平台不知道，运营需要逐家手动核对
- 新增服务商时需要人工查阅文档并填充大量数据

### 1.2 目标

让同步引擎**自动探查**每家服务商的完整模型列表和定价信息，不依赖硬编码数据，不依赖人工猜测。

### 1.3 核心设计原则

- **自动优先** — 能从 API 或文档自动获取的信息，不手动维护
- **只补不覆盖** — AI 提取的数据不覆盖已有的 API 数据或运营手动设置的数据
- **降级安全** — AI 提取失败时保留现有数据，不做破坏性更新
- **插件化扩展** — 新增服务商只需一个 Adapter 文件 + 一个文档 URL

---

## 2. 系统架构

### 2.1 两层同步架构

```
第 1 层：/models API（自动，免费，实时性高）
  ↓ 调用服务商标准 API，获取模型列表
  ↓ 数据质量取决于各家 API 的完整度
  
第 2 层：AI 读服务商文档（自动，低成本，覆盖面广）
  ↓ 通过 Jina Reader 渲染服务商文档页面为 Markdown
  ↓ 调用平台内部 AI（DeepSeek）提取模型和定价的结构化数据
  ↓ 与第 1 层数据合并，补全缺失的价格、上下文窗口、新模型
```

### 2.2 数据合并优先级

| 优先级 | 数据来源 | 说明 |
|--------|---------|------|
| 最高 | 运营手动设置 | sellPriceLocked=true 的通道永远不被覆盖 |
| 高 | /models API 返回 | 服务商官方接口，最可信 |
| 中 | AI 从文档提取 | 只填充缺失字段，不覆盖已有值 |
| 兜底 | pricingOverrides | 字段保留但正常情况下为空，仅 AI 出问题时运营手动补 |
| 默认 | 无数据 | costPrice=0，控制台显示 "—" |

### 2.3 Per-Provider 同步适配器

每家服务商一个专属的 Sync Adapter（`lib/sync/adapters/`），封装该服务商 /models API 的调用方式、响应格式解析、白名单过滤等逻辑。

```
lib/sync/
  model-sync.ts          # 同步调度器
  doc-enricher.ts        # AI 文档提取层
  types.ts               # 类型定义
  adapters/
    base.ts              # SyncAdapter 接口
    openai.ts            # OpenAI 适配器
    anthropic.ts         # Anthropic 适配器
    deepseek.ts          # DeepSeek 适配器
    zhipu.ts             # 智谱 AI 适配器
    volcengine.ts        # 火山引擎适配器
    siliconflow.ts       # 硅基流动适配器
    openrouter.ts        # OpenRouter 适配器
```

---

## 3. AI 文档提取层

### 3.1 内容获取：Jina Reader

服务商文档页面多为 SPA（React/Vue 动态渲染）或设有反爬保护，Node.js `fetch()` 无法获取有效内容。通过 Jina Reader（`https://r.jina.ai/`）解决：

| 服务商 | 原始 fetch 结果 | Jina Reader 结果 |
|--------|----------------|-----------------|
| OpenAI | 403 反爬 | 定价数据完整 |
| Anthropic | SPA 空壳 | 模型信息完整 |
| 智谱 | SPA 空壳（4.6KB） | 定价表完整 |
| 硅基流动 | 754KB SPA | 24KB 干净 Markdown |
| 火山引擎 | SPA 空壳 | 29KB 模型列表完整 |

调用方式：

```typescript
const response = await fetch(`https://r.jina.ai/${url}`, {
  headers: { Accept: "text/plain" },
});
const markdown = await response.text();
```

Jina Reader 是免费服务，无 SLA。故障时同步引擎降级为仅第 1 层数据。

### 3.2 AI 结构化提取

获取 Markdown 文本后，调用平台内部 AI（DeepSeek `deepseek-chat`）提取结构化数据：

**提取 Prompt：**

```
你是一个 API 定价数据提取助手。请从以下网页内容中提取所有可通过 API 调用的 AI 模型信息。

对每个模型，提取以下字段（如果页面中有的话）：
- model_id: 模型的 API 调用 ID
- display_name: 模型显示名称
- modality: "text" 或 "image"
- context_window: 上下文窗口大小（token 数）
- max_output_tokens: 最大输出 token 数
- input_price: 输入价格（数字）
- output_price: 输出价格（数字）
- price_unit: 价格单位（如 "USD/1M tokens"、"CNY/1M tokens"）

只返回 JSON 数组，不要任何其他文字。如果页面中没有模型信息，返回 []。

网页内容：
{markdown_content}
```

**AI 调用方式：** 使用平台内部通道，直接调用适配器引擎。绕过 API Key 鉴权、余额检查、限流中间件。不写 CallLog，不扣费。这是基础设施内部调用。

**参数：** `temperature: 0`（确定性输出）、`response_format: { type: "json_object" }`、`max_tokens: 8192`

### 3.3 人民币价格自动转换

智谱和火山引擎的定价为人民币。AI 提取结果中 `price_unit` 包含 "CNY" 时，自动使用环境变量 `EXCHANGE_RATE_CNY_TO_USD` 转换为美元。

---

## 4. 11 家服务商同步策略

### 4.1 策略总览

| 服务商 | 第 1 层（API） | 第 2 层（Jina + AI） | 特殊处理 |
|--------|-------------|---------------------|---------|
| OpenAI | /models + 白名单过滤 | AI 提取价格和上下文 | 排除 tts/whisper/embedding |
| Anthropic | /models（含 context、capabilities） | AI 补充价格 | 需 anthropic-version header |
| DeepSeek | /models（仅 2 个 ID） | AI 补充价格和上下文 | 友好名称映射 |
| 智谱 | /models | AI 补充价格（人民币→美元） | 汇率转换 |
| 火山引擎 | 无 API（返回空数组） | AI 提取全部模型和价格 | endpoint-based，需运营回填 endpoint ID |
| 硅基流动 | /models（100+ 模型） | AI 补充价格 | 过滤 embedding/rerank |
| OpenRouter | /models（含完整价格） | 不需要（docUrls 为空） | pricing 单位转换 $/token → $/M |
| MiniMax | /models 返回 404 → staticModels | AI 补充价格 | 需手动配置 ProviderConfig.staticModels |
| Moonshot/Kimi | /models | AI 补充价格 | OpenAI 兼容 |
| 阿里云百炼/Qwen | /models | AI 补充价格 | OpenAI 兼容 |
| 阶跃星辰/StepFun | /models | AI 补充价格 | OpenAI 兼容 |

### 4.1.1 别名分类推断（alias-classifier）

sync 完成后自动执行，将未挂载的 Model 归入 ModelAlias：
- **锚定模式**：已有别名时，LLM 将新模型分类到已有别名或建议新别名
- **冷启动模式**：无别名时，LLM 从零推断所有模型的别名和品牌
- 批次大小：每批 15 个模型（防止 DeepSeek 60 秒超时）
- 版本号区分规则：仅日期后缀和服务商前缀差异归入同一别名，不同大版本号必须独立别名
- Model 名称统一小写（resolveCanonicalName 归一化）

### 4.2 各服务商文档 URL

| 服务商 | docUrls |
|--------|---------|
| OpenAI | `https://platform.openai.com/docs/pricing` |
| Anthropic | `https://docs.anthropic.com/en/docs/about-claude/models` |
| DeepSeek | `https://api-docs.deepseek.com/quick_start/pricing` |
| 智谱 | `https://open.bigmodel.cn/pricing` |
| 火山引擎 | `https://www.volcengine.com/docs/82379/1399008` |
| 硅基流动 | `https://siliconflow.cn/pricing` |
| OpenRouter | （空，不需要 AI 提取） |
| MiniMax | `https://platform.minimaxi.com/document/Price` |
| Moonshot | `https://platform.moonshot.cn/docs/pricing` |
| 阿里云百炼 | `https://help.aliyun.com/zh/model-studio/billing` |
| StepFun | `https://platform.stepfun.com/docs/pricing` |

### 4.3 DeepSeek 友好名称映射

DeepSeek /models 只返回 `deepseek-chat` 和 `deepseek-reasoner`，映射为开发者友好名称：

| API 返回 ID | 平台模型名 | 说明 |
|------------|----------|------|
| deepseek-chat | deepseek/v3 | V3.2 非思考模式 |
| deepseek-reasoner | deepseek/reasoner | V3.2 思考模式 |

### 4.4 火山引擎特殊处理

火山引擎使用 endpoint-based 调用模式，开发者需要在方舟控制台创建推理接入点后才能调用。AI 能从文档提取 model_id 和价格，但无法提取 endpoint ID。

同步引擎创建 Channel 时，如果没有 endpoint ID，将 `realModelId` 暂设为 model_id，运营需在控制台手动回填为实际的 endpoint ID。

### 4.5 跨服务商同模型去重

同一底层模型可能通过多家服务商可用（如 gpt-4o 同时在 OpenAI 和 OpenRouter）：

- 创建一个 Model 记录，以直连服务商命名（如 `openai/gpt-4o`）
- 创建多个 Channel，分别关联各自的 Provider
- 同步引擎维护映射表识别跨服务商同模型

---

## 5. 同步触发方式

| 触发方式 | 时机 | 执行范围 |
|---------|------|---------|
| 启动同步 | 应用启动时 | 全部 7 家服务商 |
| 定时同步 | 每天凌晨 4:00（node-cron） | 全部 7 家服务商 |
| 手动同步 | Admin 控制台点击 "Sync models" | 全部 7 家服务商 |

三种触发方式走同一个两层同步流程。

---

## 6. 安全防护

### 6.1 降级保护

AI 提取结果异常时保留现有数据，不做破坏性更新：

| 场景 | 处理 |
|------|------|
| AI 提取返回 0 个模型，但数据库已有 N 个（N > 0） | 跳过本次更新，记录日志警告 |
| AI 提取返回的模型数 < 数据库现有数的 50% | 跳过本次更新，记录日志警告 |
| Jina Reader 请求超时或返回错误 | 跳过第 2 层，仅使用第 1 层数据 |
| AI 返回非法 JSON | 跳过第 2 层，记录日志 |
| DeepSeek 内部调用失败 | 跳过第 2 层，记录日志 |

### 6.2 数据保护

| 规则 | 说明 |
|------|------|
| 只补不覆盖 | AI 提取的数据只填充 undefined 字段，不替换已有值 |
| 手动优先 | sellPriceLocked=true 的通道价格永远不被自动更新 |
| 不删除模型 | 服务商不再返回某模型时，Channel 设为 DISABLED，不删除记录 |
| pricingOverrides 兜底 | 字段保留为运营手动覆盖入口，正常情况下为空 |
| staticModels 兜底 | 字段保留为火山引擎等无 API 服务商的备用数据源 |

### 6.3 内部 AI 调用安全

| 约束 | 说明 |
|------|------|
| 不经过 API Key 鉴权 | 直接调用适配器引擎 |
| 不做余额检查 | 基础设施内部调用 |
| 不写 CallLog | 不记录到审计日志 |
| 不扣费 | 不影响任何项目余额 |
| 不计入限流 | 绕过 RPM/TPM 限制 |

---

## 7. 数据模型变更

### 7.1 ProviderConfig 新增字段

```prisma
model ProviderConfig {
  // ... 已有字段
  staticModels      Json?   @map("static_models")      // 无 API 服务商的备用数据源
  pricingOverrides  Json?   @map("pricing_overrides")   // 运营手动覆盖入口
  docUrls           Json?   @map("doc_urls")            // 服务商文档页面 URL 列表
}
```

### 7.2 Channel 新增字段

```prisma
model Channel {
  // ... 已有字段
  sellPriceLocked   Boolean @default(false) @map("sell_price_locked")
}
```

---

## 8. 同步日志

每次同步完成后记录结果明细，在控制台可查看：

```
[2026-04-01 04:00:00] Model sync completed:
  OpenAI:      12 models (API: 12, AI: 12 prices filled)
  Anthropic:    3 models (API: 3, AI: 3 prices filled)
  DeepSeek:     2 models (API: 2, AI: 2 prices filled)
  Zhipu:       25 models (API: 7, AI: +18 new models, 22 prices filled)
  Volcengine:  14 models (API: 0, AI: +14 models, 14 prices filled)
  SiliconFlow: 95 models (API: 95, AI: 85 prices filled)
  OpenRouter: 320 models (API: 320 with prices)
  Total: 471 models, 0 errors
```

每家服务商记录：
- API 获取的模型数
- AI 新发现的模型数
- AI 补充的价格数
- 错误信息（如有）

---

## 9. 扩展性

### 9.1 新增服务商

新增一家服务商只需要：

1. 在 `lib/sync/adapters/` 下新建 Adapter 文件，实现 `SyncAdapter` 接口
2. 在种子数据中添加 Provider + ProviderConfig，配置 `docUrls` 指向该服务商的定价/模型文档页面
3. 在适配器注册表中加一行映射

不需要修改同步调度器、AI 提取层、数据库或其他服务商的代码。

### 9.2 文档 URL 更新

服务商文档页面 URL 变更时，运营在控制台修改 ProviderConfig.docUrls 即可，不需要改代码。

---

## 10. 已知局限

| 局限 | 影响 | 缓解措施 |
|------|------|---------|
| Jina Reader 无 SLA | Jina 故障时第 2 层不可用 | 降级保护：保留现有数据 |
| AI 提取偶尔不稳定 | Anthropic、火山引擎有时返回 0 | 50% 阈值防护，不做破坏性更新 |
| AI 返回非法 JSON | 提取失败 | try-catch + 日志，跳过本次 |
| 火山引擎 endpoint ID | AI 无法从文档提取 | 运营在控制台手动回填 |
| 人民币汇率波动 | 转换后价格不精确 | 运营可通过 pricingOverrides 手动修正 |

---

## 11. 方案演进历程

| 版本 | 方案 | 自动价格覆盖率 | 被替代原因 |
|------|------|-------------|----------|
| P1 | 种子数据硬编码 | 1/7（仅 OpenRouter） | 数据不完整，无法自动更新 |
| P1.5 | pricingOverrides 手动维护 | 2/7（+ DeepSeek） | 仍依赖人工维护 |
| P1.6 v1 | fetch HTML + AI 提取 | 2/7 | SPA 页面无法 fetch |
| P1.6 v2 | 分类处理：能自动的自动 | 2/7 | 大部分服务商无法自动化 |
| **P1.6 v3** | **Jina Reader + AI 提取** | **7/7** | **最终方案** |

---

## 12. 验收标准

- [ ] 7 家服务商全部通过两层同步（OpenRouter 仅第 1 层）
- [ ] 火山引擎模型数 ≥ 14（之前仅 4-7）
- [ ] OpenAI / Anthropic / DeepSeek / 智谱 / 硅基流动价格自动填充，不为 0
- [ ] AI 提取失败时现有数据不丢失（降级保护生效）
- [ ] sellPriceLocked=true 的通道同步后价格不变
- [ ] 内部 AI 调用不写 CallLog、不扣费
- [ ] 手动同步按钮（Admin → Sync models）正常工作
- [ ] 同步日志正确记录每层数据来源统计
- [ ] pricingOverrides 和 staticModels 字段为空时不报错
- [ ] 控制台 Models & channels 页面正确显示所有同步到的模型和价格
- [ ] 开发者模型列表页正确显示可用模型和价格
- [ ] 新增服务商只需添加 Adapter + docUrls，不改现有代码
