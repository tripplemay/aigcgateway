# AIGC Gateway MCP 端点逆向工程与 DX 审查报告

> **审查时间：** 2026-04-08 11:21
> **审查方式：** 纯 MCP Tool 探索，无外部文档
> **审查对象：** aigc-gateway MCP Server

---

## 第一步：全量资产盘点 (Tool Discovery & Mapping)

共发现 **20 个 Tools**，按功能域分类如下：

### 基础调用层（Core AI Calls）
| Tool | 用途 |
|---|---|
| `chat` | 向文本模型发送对话请求，支持流式、JSON 模式、Function Calling |
| `generate_image` | 调用图片模型生成图像，返回图片 URL |
| `list_models` | 列出所有可用模型（含价格、capabilities、支持的图片尺寸） |

### Action 管理（原子执行单元）
| Tool | 用途 |
|---|---|
| `create_action` | 创建一个绑定模型+提示词模板+变量的可复用单元 |
| `list_actions` | 列出当前项目的所有 Action |
| `get_action_detail` | 获取 Action 详情（活跃版本的 messages/variables、版本历史） |
| `update_action` | 更新 Action 元数据（名称、描述、模型），不影响版本 |
| `delete_action` | 删除 Action（被 Template 引用时会阻止） |
| `run_action` | 执行 Action，注入变量渲染模板，支持 dry_run 预览 |
| `create_action_version` | 为 Action 创建新版本（版本号自增） |
| `activate_version` | 切换 Action 的活跃版本（版本回滚/升级） |

### Template 管理（多步编排工作流）
| Tool | 用途 |
|---|---|
| `create_template` | 创建多步工作流，步骤引用已有 Action |
| `list_templates` | 列出所有 Template |
| `get_template_detail` | 获取 Template 详情（执行模式、步骤列表） |
| `update_template` | 更新 Template 元数据和步骤（步骤为全量替换） |
| `delete_template` | 删除 Template |
| `run_template` | 执行 Template 工作流（支持串行和 Fan-out 并行） |

### 可观测性与计费层（Observability & Billing）
| Tool | 用途 |
|---|---|
| `get_balance` | 查看账户余额和最近交易记录 |
| `list_logs` | 查看最近 AI 调用日志（支持按 prompt 全文搜索） |
| `get_log_detail` | 通过 traceId 查看完整请求/响应详情 |
| `get_usage_summary` | 获取用量统计（支持按模型/天/来源/Action/Template 分组） |

---

## 第二步：系统能力逆向推演 (Reverse Engineering)

### 这是什么平台？

**AIGC Gateway 是一个 AI 模型聚合网关 + Prompt 编排平台。** 核心商业逻辑：

1. **模型聚合**：统一接口对接多家 AI 供应商（OpenAI、DeepSeek、Google Gemini、Anthropic Claude、智谱、火山引擎、xAI、Perplexity、MiniMax、Qwen、Moonshot），开发者不需要分别管理各家 API Key
2. **成本优化**：同一模型可能有多个 channel（`show_all_channels` 参数暗示了底层的智能路由），平台自动选择最佳通道
3. **Prompt 工程产品化**：通过 Action（原子提示词单元）+ Template（多步编排）将 prompt 从代码中抽离，支持版本管理、A/B 切换、dry_run 预览
4. **统一计费 + 可观测性**：余额制预付费，所有调用都有 traceId 追踪，可按多维度分析用量

### 探索时的系统数据快照

- **账户余额：** $49.99573890
- **可用文本模型：** 22 个（覆盖 OpenAI、DeepSeek、Google、Anthropic、智谱、xAI、Perplexity、MiniMax、Qwen、Moonshot）
- **可用图片模型：** 5 个（DALL-E 3、GPT Image 1、Seedream 3.0/4.5、Cogview-3）
- **已创建 Action：** 0 个
- **已创建 Template：** 0 个
- **近 7 日调用：** 47 次，总花费 $0.00434403，总 Token 15,980，平均延迟 5.2s
- **Top 模型：** deepseek/v3 (19 次)、openai/gpt-4o-mini (14 次)

### 核心使用流程 (Developer Workflow)

```
1. get_balance         → 确认账户可用
2. list_models         → 浏览可用模型和价格
3. chat / generate_image  → 直接调用（快速验证）
4. create_action       → 将验证过的 prompt 封装为可复用 Action
5. run_action          → 通过变量注入执行 Action
6. create_template     → 将多个 Action 编排为工作流
7. run_template        → 执行工作流
8. list_logs / get_usage_summary → 监控质量和成本
```

---

## 第三步：极客视角的吐槽与建议 (DX Critique & Suggestions)

### 吐槽 1：`list_models` 返回的模型信息不完整且不一致

**问题：**
- `contextWindow` 在 deepseek/reasoner 上是 `null`，但 DeepSeek R1 实际支持 64K。这对开发者选型是关键信息，缺失会导致误判。
- `capabilities` 字段不完整 — 有些模型标了 `vision: true/false`，有些压根没有 `vision` 字段。缺失和 `false` 语义不同（"不支持" vs "未知"），但目前无法区分。
- `openai/o4-mini` 标了 `reasoning: false`，但 o4-mini 是 OpenAI 的推理模型，这明显有误。
- 用量统计里出现了 `zhipu/glm-4.7-flash` 和 `volcengine/doubao-1.5-lite-32k`，但它们没出现在 `list_models` 中且标记为 `deprecated`。**已下线模型完全不可见**——如果我是新开发者查 usage，会困惑这些调用去了哪个模型。

**建议：**
- `contextWindow` 必填，至少标注为 `"unknown"`。
- `capabilities` 采用完整枚举，缺失即 `false`，而非省略字段。
- 增加 `deprecated` 模型列表（`list_models(include_deprecated=true)`）或在 usage 中展示 displayName。

### 吐槽 2：Action/Template 的 CRUD 与执行 API 设计存在摩擦点

**问题：**
- `update_template` 的 `steps` 是**全量替换**（destructive PUT 语义），但没有任何确认机制。一次误传就丢掉所有步骤——这对有 10+ 步的复杂 Template 是灾难性的。
- `create_action` 必须传 `model`，但如果我想让 Action 运行时动态选模型（比如 A/B 测试不同模型），目前无法实现。Action 与模型是硬绑定的。
- `delete_action` 在被 Template 引用时会失败，但没有 Tool 可以查询"哪些 Template 引用了这个 Action"。开发者只能盲猜。
- `run_action` 没有 `temperature`、`max_tokens` 等运行时参数覆盖能力——一旦 Action 创建，采样参数就锁死在创建时的值里（实际上创建时甚至**无法指定这些参数**）。

**建议：**
- `update_template` 增加 `steps_patch` 操作（增/删/移动单个步骤），或至少返回更新前的旧步骤供回滚。
- `run_action` 增加 `model_override`、`temperature`、`max_tokens` 等运行时参数。
- `get_action_detail` 返回 `referenced_by_templates` 字段。

### 吐槽 3：错误处理和引导严重不足

**问题：**
- 空 Action 列表返回的引导信息是 `"Create your first Action in the console at https://aigc.guangai.ai/actions"` — 但我是 MCP 用户，我正在用 Tool 接口。告诉我去 Web 控制台是一种**割裂体验**。应该告诉我如何用 `create_action` Tool。
- 整个系统没有一个 `get_help` 或 `describe_workflow` Tool。对于通过 MCP 接入的 AI Agent 来说，缺少一个自描述入口意味着它必须靠猜测来编排调用链。
- `chat` 的 Tool description 说 "IMPORTANT: Call list_models first"，但如果我直接传了一个错误的 model name，返回的错误信息是什么？从 Schema 上看没有任何关于错误格式的约定。

**建议：**
- 空列表的引导信息改为展示 MCP Tool 用法示例（当检测到来源是 MCP 时）。
- 增加一个 `get_quickstart` Tool，返回面向 AI Agent 的使用流程说明。
- 所有 Tool 的错误返回遵循统一结构：`{ "error": { "code": "MODEL_NOT_FOUND", "message": "...", "suggestion": "Call list_models to see available models" } }`。

### 吐槽 4：可观测性有盲区

**问题：**
- `get_usage_summary` 能按 `source` 过滤（`api` / `mcp`），但 `list_logs` 不能。想排查 "MCP 渠道的失败调用" 需要逐条翻日志。
- `list_logs` 的 `search` 是全文搜索 prompt 内容，但无法搜索 response 内容。调试时经常需要找"哪次调用返回了某个异常内容"。
- 日志中 `cost` 为 `$0.00000000` 的图片模型调用（dall-e-3、seedream-3.0）——是真的免费还是计费未接入？开发者无法区分。
- 没有告警/阈值机制 — 余额低于某值时无法提前感知。

**建议：**
- `list_logs` 增加 `source` 过滤参数，与 `get_usage_summary` 对齐。
- 增加 `search_response` 参数或将搜索范围扩展至响应内容。
- 免费模型在 `list_models` 的 price 字段已标注 "Free"，但日志中的 `cost: $0` 应额外标注 `"billing": "free_tier"` 以消除歧义。

### 吐槽 5：Template Fan-out 模式的 Schema 设计缺乏约束

**问题：**
- `create_template` 的 steps 中 `role` 可选值为 `SEQUENTIAL | SPLITTER | BRANCH | MERGE`，但没有任何 Schema 级约束来保证它们的组合合法性。比如：
  - 能创建一个只有 BRANCH 没有 SPLITTER 的 Template 吗？
  - MERGE 必须在 BRANCH 之后吗？
  - 一个 Template 能有多个 SPLITTER 吗？
- 这些规则完全靠猜测或运行时报错发现，DX 极差。

**建议：**
- 在 `create_template` 的 description 中明确列出合法的步骤角色组合模式。
- 或者更好的方案：将 `mode` 提升为 Template 级参数（`sequential` / `fan_out`），由系统自动推断步骤角色，减少用户心智负担。

---

## 总评

| 维度 | 评分 (1-10) | 说明 |
|---|---|---|
| **Tool 命名与组织** | 8/10 | 命名清晰，CRUD 一致，功能分域合理 |
| **Schema 严谨度** | 6/10 | 基础参数校验到位，但枚举缺失、capabilities 字段不一致、Template 步骤缺组合约束 |
| **Description 质量** | 7/10 | 大部分描述清楚，但缺乏错误场景说明和调用链引导 |
| **错误引导** | 4/10 | 空列表引导指向 Web 控制台（与 MCP 场景割裂），缺乏统一错误结构 |
| **可观测性** | 7/10 | 日志、用量、traceId 追踪体系完整，但过滤维度不对齐、免费/计费边界模糊 |
| **Workflow 编排** | 6/10 | Action 版本管理和 Template 编排理念先进，但缺运行时参数覆盖、步骤局部更新、反向引用查询 |

**综合 DX 评分：6.3 / 10** — 一个功能基本完备但打磨不够的产品。核心路径（list_models → chat）体验顺畅，但进入 Action/Template 编排和可观测性深水区后，摩擦点显著增多。最大的短板是**面向 MCP/AI Agent 的自描述能力不足**——一个以 MCP 为接入方式的平台，却在错误信息和引导中把用户推向 Web 控制台，这是一个值得优先修复的体验断裂。
