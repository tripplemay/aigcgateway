# AIGC Gateway MCP 端点逆向工程与 DX 审查报告

**审查日期**：2026-04-08
**审查方式**：纯 MCP 端点探索，无外部文档/源代码辅助

---

## 第一步：全量资产盘点 (Tool Discovery & Mapping)

共发现 **20 个 Tools**，可归为 5 大类：

### 1. 基础 AI 调用（2 个）
| Tool | 用途 |
|------|------|
| `list_models` | 列出平台可用的 AI 模型，含价格、上下文窗口、能力标签，支持按 modality 过滤 |
| `chat` | 向指定模型发送聊天补全请求，支持流式、JSON mode、function calling、采样参数 |

### 2. 图片生成（1 个）
| Tool | 用途 |
|------|------|
| `generate_image` | 根据文本 prompt 调用图片模型生成图片，返回 URL |

### 3. Action 管理（8 个）
| Tool | 用途 |
|------|------|
| `list_actions` | 列出当前项目下所有 Action（原子执行单元） |
| `get_action_detail` | 获取单个 Action 的详情（活跃版本的 messages/variables、版本历史） |
| `create_action` | 创建新 Action，绑定模型 + 提示词模板 + 变量，自动生成 v1 |
| `update_action` | 更新 Action 元数据（名称/描述/模型），不影响版本 |
| `delete_action` | 删除 Action（被 Template 引用时会阻止） |
| `create_action_version` | 为已有 Action 创建新版本（版本号自增，默认激活） |
| `activate_version` | 切换 Action 的活跃版本（版本回滚/升级） |
| `run_action` | 执行某个 Action，注入变量，支持 dry_run 预览模式 |

### 4. Template 管理（5 个）
| Tool | 用途 |
|------|------|
| `list_templates` | 列出当前项目下所有 Template（多步编排工作流） |
| `get_template_detail` | 获取 Template 详情（执行模式、步骤列表） |
| `create_template` | 创建新 Template，步骤引用已有 Action，支持串行/扇出模式 |
| `update_template` | 更新 Template 的名称/描述/步骤（步骤为全量替换） |
| `delete_template` | 删除 Template |
| `run_template` | 执行 Template 工作流，注入变量，自动检测串行/扇出模式 |

### 5. 可观测性与计费（4 个）
| Tool | 用途 |
|------|------|
| `get_balance` | 查询账户余额，可选附带最近 10 笔交易明细 |
| `list_logs` | 列出近期 AI 调用日志（trace ID、模型、状态、cost、延迟） |
| `get_log_detail` | 根据 trace ID 获取完整调用详情（全量 prompt、response、参数、性能指标） |
| `get_usage_summary` | 按维度（模型/天/来源/action/template）聚合用量统计 |

---

## 第二步：系统能力逆向推演 (Reverse Engineering)

### 这是什么平台？

**AIGC Gateway 是一个 AI 服务商聚合网关 + Prompt 编排平台。** 核心商业逻辑包含三层：

1. **统一模型网关层** — 将 OpenAI、DeepSeek、智谱、火山引擎、OpenRouter（间接接入 Anthropic/Google/xAI/Perplexity/Qwen/MiniMax/MoonshotAI 等）聚合在一个统一 API 下，用户无需管理多个 API Key，平台自动选择最优渠道（"best channel selected automatically"）
2. **Prompt 资产管理层（Action）** — 将 "模型 + 系统提示词 + 变量" 封装为可版本化的原子单元，支持版本回滚、dry_run 预览，实现 prompt-as-code
3. **工作流编排层（Template）** — 将多个 Action 编排为串行链（自动注入 `{{previous_output}}`）或扇出（SPLITTER → BRANCH → MERGE），实现复杂 AI pipeline

**商业模式**：预充值余额制，按调用量扣费（token 计费 + 图片按张计费），平台赚取渠道价差。

### 实际探索数据

- **可用模型**：27 个（22 个文本 + 5 个图片），覆盖 OpenAI、DeepSeek、Anthropic、Google、xAI、智谱、火山引擎、Qwen、MiniMax、MoonshotAI、Perplexity
- **账户余额**：$49.99（已消费 $0.01）
- **30 天用量**：47 次调用，$0.0043 总消费，跨 8 个模型
- **调用来源**：MCP 41 次 / API 6 次
- **Actions / Templates**：均为空（新项目）

### 核心使用流程 (Developer Workflow)

```
1. get_balance          → 确认余额可用
2. list_models          → 浏览可用模型及价格
3. chat / generate_image → 直接调用模型（快速验证）
4. create_action        → 将验证好的 prompt 封装为 Action
5. run_action           → 通过变量注入复用 Action
6. create_template      → 将多个 Action 编排为 Pipeline
7. run_template         → 一键执行整个工作流
8. list_logs / get_usage_summary → 监控用量与成本
```

---

## 第三步：极客视角的吐槽与建议 (DX Critique & Suggestions)

### 总体印象

**优点**：工具命名清晰、分类合理、CRUD 完备，有 dry_run 预览、版本管理、多维度用量统计等高级特性，MCP 指令文档写得详尽。是一套设计用心的系统。

---

### 建议 1: `list_models` 返回的 `capabilities` 严重不一致

**问题**：27 个模型中，只有 `deepseek/v3`、`openrouter/qwen/qwen-max`、`openrouter/qwen/qwen-plus` 返回了 `json_mode: true`，只有少数模型标注了 `streaming: true`。但实际上 GPT-4o、Claude Sonnet 4、Gemini 2.5 Pro 都支持 function calling、JSON mode、streaming、vision。大量模型的 `capabilities` 是空对象 `{}`。

**影响**：开发者看到 `capabilities: {}` 会以为该模型什么高级功能都不支持，实际上可能只是未标注。这比没有 capabilities 字段更糟糕——它传递了错误信息。

**建议**：要么保证每个模型的 capabilities 严格准确填充，要么在 description 中明确说明 "capabilities 为 best-effort 标注，空值不代表不支持"。

---

### 建议 2: 图片模型缺少 `supportedSizes` 字段

**问题**：MCP 指令文档明确说 "list_models 返回的 image 模型包含 **supportedSizes** 字段"，但实际返回中 5 个图片模型**均无此字段**。`generate_image` 的 `size` 参数说 "Check supportedSizes in list_models"，但开发者根本查不到。

**影响**：开发者只能盲猜尺寸（如 `1024x1024`），传错就报错，体验极差。文档与实际不符是 DX 大忌。

**建议**：`list_models(modality='image')` 返回结构中必须包含 `supportedSizes` 数组，或至少在 `generate_image` 的 Schema 中把 `size` 改为 enum。

---

### 建议 3: `chat` 工具缺少关键的 Capability 感知

**问题**：`chat` 的 Schema 暴露了 `tools`/`tool_choice` 参数（function calling），但没有任何机制告知开发者哪些模型支持 function calling。调用不支持的模型时，错误信息不确定是否有足够引导。

**建议**：
- `list_models` 的 capabilities 应至少包含 `function_calling`、`vision`、`json_mode`、`streaming` 四个布尔值
- `chat` 在收到不支持 function calling 的模型 + tools 参数时，返回明确的错误："Model X does not support function calling. Models with this capability: [...]"

---

### 建议 4: `get_balance` 的 transactions 缺少模型信息

**问题**：交易记录只有 `traceId` 和 `amount`，没有 `model` 字段。开发者想知道 "钱花在哪了" 需要拿 traceId 再去 `get_log_detail` 逐条查。

**建议**：在 transaction 对象中增加 `model` 字段（一个字符串，零成本），省去二次查询。对于 FinOps 场景，这是刚需。

---

### 建议 5: 空列表的引导信息很好，但 URL 未做上下文适配

**问题**：`list_actions` 返回空时提示 "Create your first Action in the console at https://aigc.guangai.ai/actions"——这很贴心。但作为 MCP 工具的调用者（通常是 AI Agent），它不能打开浏览器。更好的引导应该是告诉它如何用 MCP 工具本身来创建。

**建议**：空列表时返回：
```json
{
  "hint": "No Actions yet. Use create_action(name, model, messages) to create one, or visit https://aigc.guangai.ai/actions in a browser."
}
```
同时指出必须先 `list_models` 获取可用模型名。

---

### 建议 6: `update_template` 的 steps 是全量替换，缺少防误操作机制

**问题**：`update_template` 中 steps 参数是"全量替换"语义。如果开发者只想改一个步骤的 action_id，必须传入所有步骤。如果遗漏了某个步骤，它会被静默删除。

**建议**：
- 方案 A：增加 `patch_steps` 操作（按 index 或 step_id 更新单个步骤）
- 方案 B：在 description 中加粗警告："steps replaces ALL existing steps. Omitting a step will permanently delete it."
- 方案 C：返回被删除步骤的 diff，让调用者确认

---

## DX 评分

| 维度 | 得分 (10分制) | 说明 |
|------|:---:|------|
| **工具命名与分类** | 9 | 命名一致、语义清晰、分组合理 |
| **Schema 设计** | 7.5 | 参数类型和约束基本完备，但缺少关键 enum（如 size） |
| **文档与描述** | 7 | MCP 指令文档详尽，但与实际返回有偏差（supportedSizes） |
| **错误引导** | 6 | 空列表有引导，但未验证到错误场景下的提示质量 |
| **数据一致性** | 5.5 | capabilities 大量空值、文档承诺的字段缺失 |
| **可组合性** | 8.5 | Action → Template 的编排模型设计优雅，版本管理是亮点 |
| **FinOps 可观测性** | 8 | 多维度用量统计、trace 级详情，设计用心 |
| **综合 DX 分** | **7.4** | 骨架优秀，需在数据一致性和 Schema 严谨性上打磨 |

---

## 总结

AIGC Gateway 的架构设计是出色的——统一网关 + Action 版本化 + Template 编排的三层模型非常优雅。主要短板集中在 **数据层面的一致性**：capabilities 空值、supportedSizes 缺失、文档与实际不符。这些都是不改架构、只需补数据的低成本修复，修好后 DX 分可以轻松到 8.5+。
