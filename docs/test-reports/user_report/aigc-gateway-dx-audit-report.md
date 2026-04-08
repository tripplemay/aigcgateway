# AIGC Gateway — MCP 端点逆向工程与 DX 审查报告

> **审查日期**：2026-04-07
> **审查方式**：纯 MCP Tool 探索，无外部文档/源代码
> **MCP Server**：`aigc-gateway` (https://aigc.guangai.ai/mcp)

---

## 第一步：全量资产盘点 (Tool Discovery & Mapping)

共发现 **20 个 MCP Tools**，按功能域分为 5 类：

### 1. 基础调用层（Core Invocation）

| Tool | 用途 |
|---|---|
| `chat` | 向指定文本模型发送对话请求，支持流式、JSON 模式、Function Calling、采样参数控制 |
| `generate_image` | 向图片模型发送生成请求，返回图片 URL |
| `list_models` | 列出平台可用的所有模型及其定价、能力标签（text/image） |

### 2. Action 管理层（原子执行单元 CRUD）

| Tool | 用途 |
|---|---|
| `create_action` | 创建一个 Action = 模型 + 提示词模板 + 变量定义，自动生成 v1 |
| `get_action_detail` | 查看 Action 详情：活跃版本的 messages/variables，以及版本历史 |
| `list_actions` | 分页列出项目内所有 Action |
| `update_action` | 更新 Action 元数据（name/description/model），不影响版本 |
| `delete_action` | 删除 Action（若被 Template 引用则阻止） |
| `create_action_version` | 为已有 Action 创建新版本（版本号自增），默认设为活跃 |
| `activate_version` | 切换 Action 的活跃版本（用于回滚/升级） |
| `run_action` | 执行 Action：注入变量渲染模板后调用模型；支持 `dry_run` 预览和指定版本 |

### 3. Template 管理层（多步编排工作流 CRUD）

| Tool | 用途 |
|---|---|
| `create_template` | 创建 Template：由多个 Action 按串行（SEQUENTIAL）或扇出（SPLITTER→BRANCH→MERGE）组合 |
| `get_template_detail` | 查看 Template 详情：执行模式、步骤列表、保留变量 |
| `list_templates` | 分页列出所有 Template |
| `update_template` | 更新 Template 的元数据或步骤（步骤为全量替换） |
| `delete_template` | 删除 Template（级联删除步骤） |
| `run_template` | 执行 Template 工作流，返回每步的 output/usage/latency |

### 4. 可观测性层（Observability）

| Tool | 用途 |
|---|---|
| `list_logs` | 列出近期调用日志：traceId、模型、状态、prompt 预览、cost、延迟 |
| `get_log_detail` | 按 traceId 查看完整的请求/响应/参数/错误详情 |
| `get_usage_summary` | 按模型/天/来源/Action/Template 维度聚合用量统计 |

### 5. 账户层（Billing）

| Tool | 用途 |
|---|---|
| `get_balance` | 查看项目余额，可选附带最近 10 笔交易明细 |

---

## 第二步：系统能力逆向推演 (Reverse Engineering)

### 这是什么平台？

**AIGC Gateway 是一个 AI 模型服务聚合网关 + Prompt 工程管理平台。**

核心商业逻辑：

1. **统一接入层**：将 OpenAI、DeepSeek、Google Gemini、Anthropic Claude、智谱、火山引擎、Moonshot、Perplexity、xAI 等 10+ 家供应商的 27 个模型聚合在一个 API 后面。开发者只需一个 API Key、一套统一的调用协议。
2. **Prompt 版本化管理**：通过 Action（原子执行单元）将"模型 + 提示词 + 变量"封装为可复用、可版本控制、可回滚的单元，分离了「提示词工程」和「业务代码」。
3. **工作流编排**：通过 Template 将多个 Action 组合为串行链或扇出并行流水线，实现复杂的多步 AI 处理逻辑。
4. **预付费账户体系**：余额制，按调用量实时扣费，价格透明。

### 核心使用流程（新开发者 Workflow）

```
① get_balance          → 确认账户可用
② list_models          → 浏览可用模型和价格
③ chat / generate_image → 直接调用模型，快速验证
④ create_action        → 将验证好的 prompt 封装为 Action
⑤ run_action(dry_run)  → 用 dry_run 预览变量渲染结果
⑥ run_action           → 正式执行
⑦ create_action_version → 迭代 prompt，版本管理
⑧ create_template      → 将多个 Action 编排成工作流
⑨ run_template         → 执行工作流
⑩ list_logs / get_usage_summary → 监控和成本分析
```

---

## 第三步：极客视角的吐槽与建议 (DX Critique & Suggestions)

### 吐槽 1：`list_models` 返回的 capabilities 极度残缺，几乎不可用

**现象**：27 个模型中，仅 `deepseek/v3`、`openrouter/qwen/qwen-max` 等少数几个标注了 `json_mode: true` 或 `streaming: true`。而 `openai/gpt-4o`——一个明确支持 JSON mode、streaming、function calling、vision 的模型——其 capabilities 返回是**空对象 `{}`**。

**后果**：开发者在做模型路由决策时完全无法信赖 capabilities 字段。到底是"不支持"还是"没填"？无法区分。这直接违背了 `chat` Tool 文档中"必须先 list_models"的引导。

**建议**：
- 为每个模型补全 capabilities：`json_mode`、`streaming`、`function_calling`、`vision`、`tool_use` 至少这 5 个布尔字段应全量填写。
- 如果确实未知，用 `null` 明确表示"未验证"，而非空对象（空对象语义是"什么都不支持"）。

---

### 吐槽 2：`generate_image` 的 `size` 参数无 Enum 约束，合法尺寸只有报错了才能知道

**现象**：Schema 中 `size` 定义为 `"type": "string"`，没有任何 enum 枚举。当传入非法值 `99999x99999` 时，错误消息才告诉你合法值是 `1024x1024`、`1024x1792`、`1792x1024`。但这只是 DALL-E 3 的尺寸——其他图片模型（Seedream、Cogview）的合法尺寸呢？开发者只能靠"trial and error"去撞。

**建议**：
- **方案 A（推荐）**：在 `list_models` 返回值中，为每个 image 模型增加 `supportedSizes: ["1024x1024", ...]` 字段。
- **方案 B**：至少在 `generate_image` 的 Schema description 中说明"不同模型支持不同尺寸，请参考 list_models 输出"。
- **方案 C（兜底）**：错误信息应包含模型名，当前错误信息是通用的，多模型场景下无法快速定位。

---

### 吐槽 3：错误信息混杂上游原始错误 + QQ 群号，缺乏结构化和排错引导

**现象**：
- `volcengine/doubao-pro-32k` 报错：`"The model or [infra removed] does not exist or you do not have access to it."` —— 但这个模型在 `list_models` 中**根本没有返回**。那用户是怎么调到这个模型的？是曾经可用后来下线了？错误没有任何引导。
- DALL-E 3 报错尾部拼接了 `【如果您遇到问题，欢迎加入QQ群咨询：836739524】`——这是上游供应商的原始错误信息被透传了。在一个面向国际开发者的 MCP 接口中泄漏中文 QQ 群号，非常不专业。

**建议**：
- 对上游错误进行**标准化包装**，返回统一的 error 结构：`{ code: "MODEL_NOT_FOUND", message: "...", suggestion: "Run list_models to see available models", upstream_error?: "..." }`。
- 过滤或隔离上游供应商的原始错误文本，不应直接透传给终端用户。
- 如果模型已下线，应在错误消息中明确说明 `"This model has been deprecated. Available alternatives: ..."`。

---

### 吐槽 4：`chat` 的 capabilities 字段与 Schema 定义脱节

**现象**：`chat` Tool 的 Schema 包含 `tools`（Function Calling）、`response_format`（JSON mode）、`stream` 等高级参数。但 `list_models` 返回的 capabilities 中，大多数模型这些字段都是缺失的。开发者无法判断：如果对一个 capabilities 为 `{}` 的模型传入 `tools` 参数，会发生什么？静默忽略？报错？降级？

**建议**：在 `chat` 的错误处理中，如果模型不支持某个传入的高级参数（如对不支持 function calling 的模型传了 `tools`），应返回明确的错误：`"Model X does not support function calling. See list_models for capability details."`。

---

### 吐槽 5：`list_models` 中存在「幽灵模型」——usage 日志中出现了 `list_models` 不返回的模型

**现象**：`get_usage_summary` 显示过去 30 天有 `zhipu/glm-4.7-flash`（5 次）、`volcengine/doubao-1.5-lite-32k`（2 次）、`volcengine/doubao-pro-32k`（1 次）的调用记录，但这些模型在当前 `list_models` 输出中**不存在**。

**后果**：这意味着模型可以在不通知用户的情况下被下架，且已有的 Action 如果绑定了这些模型，执行时会直接报错。开发者没有任何"模型即将下线"的预警机制。

**建议**：
- 增加模型状态字段：`status: "active" | "deprecated" | "removed"`，deprecated 模型仍可在 list_models 中展示但标注警告。
- 为已下线模型提供迁移建议：`"replacedBy": "zhipu/glm-5"`。
- 在 Action 绑定的模型下线时，应有通知或至少在 `get_action_detail` 中标注警告。

---

### 吐槽 6：`contextWindow` 字段部分模型为 `null`，image 模型出现语义错误

**现象**：
- `deepseek/reasoner` 的 `contextWindow: null`——这是一个纯文本推理模型，不标注上下文窗口大小是严重的信息缺失。
- `zhipu/cogview-3`（图片生成模型）的 `contextWindow: 1000`——图片模型的"上下文窗口"是什么含义？是 prompt 的最大字符数？token 数？这个字段语义在 image 模型上是模糊的。

**建议**：
- 文本模型必须填写 `contextWindow`，用 `-1` 或明确的 `"unknown"` 而非 `null`。
- 对 image 模型，要么不返回此字段，要么改为更准确的 `maxPromptLength`，并在 description 中注明单位。

---

## 综合评分

| 维度 | 评分 (1-10) | 说明 |
|---|---|---|
| **API 设计完整度** | 8/10 | 工具链完整，从调用到编排到可观测性一应俱全，Action/Template 的版本管理设计成熟 |
| **Schema 严谨度** | 5/10 | 关键枚举缺失（image size），capabilities 空缺严重，contextWindow 语义混乱 |
| **错误信息质量** | 3/10 | 上游错误直接透传，混入 QQ 群号，无结构化 error code，无排错引导 |
| **数据一致性** | 4/10 | list_models 与实际可调用模型不一致，幽灵模型问题，capabilities 与实际能力脱节 |
| **文档/自描述性** | 7/10 | MCP Server Instructions 写得不错，Tool 的 description 基本清晰，但依赖"先调 list_models"的引导在 capabilities 不可靠时形同虚设 |
| **新手上手体验** | 6/10 | Happy path 很顺畅（3 步就能发第一条消息），但一旦遇到错误就会掉进深坑 |

**总分：5.5 / 10** — 骨架优秀，血肉粗糙。

这是一个架构师想清楚了、但工程细节尚未打磨到位的产品。最紧迫的改进是：**错误信息标准化**和**模型 capabilities 补全**，这两项直接决定了开发者能否在没有人工客服的情况下自助排错。

---

## 附录：探索过程中获取的原始数据快照

### 可用模型列表（27 个）

| 模型名 | 类型 | 上下文窗口 | 价格 |
|---|---|---|---|
| deepseek/reasoner | text | null | $0.336 in / $0.504 out per 1M tokens |
| deepseek/v3 | text | 163,840 | $0.384 in / $1.068 out per 1M tokens |
| openai/dall-e-3 | image | null | $0.048 per image |
| openai/gpt-4o | text | 128,000 | $3 in / $12 out per 1M tokens |
| openai/gpt-4o-mini | text | 128,000 | $0.18 in / $0.72 out per 1M tokens |
| openai/gpt-image-1 | image | null | $0.048 per image |
| openai/o3 | text | 200,000 | $2.4 in / $9.6 out per 1M tokens |
| openai/o4-mini | text | 200,000 | $1.32 in / $5.28 out per 1M tokens |
| openrouter/anthropic/claude-3.5-haiku | text | 200,000 | $0.96 in / $4.8 out per 1M tokens |
| openrouter/anthropic/claude-sonnet-4 | text | 200,000 | $3.6 in / $18 out per 1M tokens |
| openrouter/deepseek/deepseek-r1 | text | 64,000 | $0.84 in / $3 out per 1M tokens |
| openrouter/google/gemini-2.0-flash-001 | text | 1,048,576 | $0.12 in / $0.48 out per 1M tokens |
| openrouter/google/gemini-2.5-flash | text | 1,048,576 | $0.36 in / $3 out per 1M tokens |
| openrouter/google/gemini-2.5-pro | text | 1,048,576 | $1.5 in / $12 out per 1M tokens |
| openrouter/minimax/minimax-01 | text | 1,000,192 | $0.24 in / $1.32 out per 1M tokens |
| openrouter/moonshotai/kimi-k2 | text | 131,072 | $0.684 in / $2.76 out per 1M tokens |
| openrouter/perplexity/sonar | text | 127,072 | $1.2 in / $1.2 out per 1M tokens |
| openrouter/perplexity/sonar-pro | text | 200,000 | $3.6 in / $18 out per 1M tokens |
| openrouter/qwen/qwen-max | text | 32,768 | $1.248 in / $4.992 out per 1M tokens |
| openrouter/qwen/qwen-plus | text | 1,000,000 | $0.312 in / $0.936 out per 1M tokens |
| openrouter/x-ai/grok-3 | text | 131,072 | $3.6 in / $18 out per 1M tokens |
| openrouter/x-ai/grok-3-mini | text | 131,072 | $0.36 in / $0.6 out per 1M tokens |
| volcengine/seedream-3.0 | image | null | Free |
| volcengine/seedream-4.5 | image | null | $0.018 per image |
| zhipu/cogview-3 | image | 1,000 | Free |
| zhipu/glm-4-flash | text | 8,000 | $0.0041 in / $0.0066 out per 1M tokens |
| zhipu/glm-5 | text | 200,000 | $1.3152 in / $3.9456 out per 1M tokens |

### 账户状态

- **余额**：$49.997
- **30 天总调用**：42 次
- **30 天总花费**：~$0.003

### 错误日志样本

| traceId | 模型 | 错误摘要 |
|---|---|---|
| `trc_zws3ruhwz6xc2q8m1sg2wewf` | volcengine/doubao-pro-32k | 模型不存在或无访问权限（该模型已从 list_models 下架） |
| `trc_ozu16kxs9k1nuhzno2ekx8ar` | openai/dall-e-3 | 非法 size 参数 + 透传上游 QQ 群号 |
| `trc_htl5dpm3dlqbbmape0cz1lyb` | volcengine/seedream-3.0 | 注入攻击测试被正确拦截（error） |
