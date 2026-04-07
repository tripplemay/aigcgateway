# AIGC Gateway MCP 端点逆向工程与 DX 审查报告

**审查日期**：2026-04-06  
**审查方式**：纯 MCP Tool 探索，零外部文档  
**平台**：AIGC Gateway (https://aigc.guangai.ai)

---

## 第一步：全量资产盘点 (Tool Discovery & Mapping)

共发现 **13 个 Tools**，按功能域分组如下：

| # | Tool 名称 | 功能说明 |
|---|-----------|---------|
| 1 | `get_balance` | 查询账户余额，可选附带最近 10 条交易流水 |
| 2 | `list_models` | 列出平台可用的 AI 模型（文本/图片），含价格和能力标签 |
| 3 | `chat` | 向指定文本模型发送对话请求，支持流式、JSON 结构化输出、温度控制 |
| 4 | `generate_image` | 调用图片模型生成图片，返回 URL |
| 5 | `list_actions` | 列出用户预定义的 Action（原子执行单元：模型+提示词+变量） |
| 6 | `get_action_detail` | 查看单个 Action 的详情（活跃版本、消息模板、变量定义、版本历史） |
| 7 | `run_action` | 传入变量执行一个 Action |
| 8 | `list_templates` | 列出 Template（多步骤编排工作流） |
| 9 | `get_template_detail` | 查看 Template 详情（执行模式、步骤列表、保留变量） |
| 10 | `run_template` | 执行一个 Template 工作流 |
| 11 | `list_logs` | 查询调用日志，支持全文搜索、状态/模型筛选 |
| 12 | `get_log_detail` | 查看单条调用的完整 prompt、response、性能指标、错误信息 |
| 13 | `get_usage_summary` | 用量与花费汇总，支持按模型/天/来源/Action/Template 分组 |

---

## 第二步：系统能力逆向推演 (Reverse Engineering)

### 平台定性

**AIGC Gateway 是一个 AI 模型聚合网关 / 统一代理平台。** 核心商业逻辑：

- **多供应商聚合**：将 OpenAI、火山引擎（豆包）、DeepSeek、OpenRouter（间接接入 Anthropic/Google/xAI/Qwen 等）等多家 AI 供应商统一到一个 API 入口
- **统一计费**：用户充值到平台的统一余额（美元计价），按模型调用量扣费，屏蔽各供应商的独立计费体系
- **Prompt 编排层**：通过 Action（单步）和 Template（多步/并行）实现可复用的 Prompt 工作流，类似低代码 AI 编排
- **可观测性**：提供日志、用量统计、性能指标（TTFT、TPS、延迟）

### 核心使用流程

```
1. get_balance          → 确认余额可用
2. list_models          → 浏览模型菜单，挑选性价比合适的模型
3. chat / generate_image → 直接调用模型（快速验证）
4. 控制台创建 Action    → 将验证好的 prompt 固化为可复用的 Action
5. run_action           → 通过变量注入批量执行
6. 控制台创建 Template  → 将多个 Action 编排成工作流
7. run_template          → 执行复杂的多步编排
8. list_logs / get_usage_summary → 监控与成本优化
```

### 模型生态快照

实际探测到的模型清单（截至审查日期）：

| 供应商 | 模型 | 类型 | 价格 |
|--------|------|------|------|
| OpenAI | gpt-4o | 文本 | $3 in / $12 out per 1M tokens |
| OpenAI | gpt-4o-mini | 文本 | $0.18 in / $0.72 out per 1M tokens |
| OpenAI | o3 | 文本 | $2.4 in / $9.6 out per 1M tokens |
| OpenAI | o4-mini | 文本 | $1.32 in / $5.28 out per 1M tokens |
| OpenAI | dall-e-3 | 图片 | $0.048/image |
| OpenAI | gpt-image-1 | 图片 | $0.048/image |
| OpenRouter/Anthropic | claude-3.5-haiku | 文本 | $0.96 in / $4.8 out |
| OpenRouter/Anthropic | claude-sonnet-4 | 文本 | $3.6 in / $18 out |
| OpenRouter/DeepSeek | deepseek-r1 | 文本 | $0.84 in / $3 out |
| OpenRouter/Google | gemini-2.0-flash | 文本 | $0.12 in / $0.48 out |
| OpenRouter/Google | gemini-2.5-pro | 文本 | $1.5 in / $12 out |
| OpenRouter/MiniMax | minimax-01 | 文本 | $0.24 in / $1.32 out |
| OpenRouter/MoonshotAI | kimi-k2 | 文本 | $0.684 in / $2.76 out |
| OpenRouter/Perplexity | sonar / sonar-pro | 文本 | $1.2~$18 out |
| OpenRouter/Qwen | qwen-max / qwen-plus | 文本 | $0.312~$4.992 out |
| OpenRouter/xAI | grok-3 / grok-3-mini | 文本 | $0.36~$18 out |
| 火山引擎 | doubao-pro-32k / 256k | 文本 | $0.066~$0.329 out |
| 火山引擎 | seedream-4.5 | 图片 | $0.018/image |

---

## 第三步：极客视角的吐槽与建议 (DX Critique & Suggestions)

### 🔴 严重问题

#### 1. 错误信息泄露上游供应商凭据和内部架构

调用 `openai/gpt-4o-mini` 时返回的错误：

> `账户余额过低...请前往 https://api.chatanywhere.tech/#/shop 充值...(当前请求使用的ApiKey: sk-e9T****yXf0)...加入QQ群：836739524`

这直接暴露了：
- 上游渠道商域名（chatanywhere.tech）
- 部分 API Key（`sk-e9T****yXf0`）
- 上游的客服 QQ 群号

**建议**：所有上游错误必须经过统一的错误包装层，绝不透传原始错误。用户应看到的是 `AIGC Gateway: model temporarily unavailable, please try another model or contact support` 这类平台级错误。

---

#### 2. `list_models` 返回的模型与实际可用的模型不一致

日志显示成功调用了 `deepseek/v3`、`deepseek/reasoner`、`zhipu/glm-4.7-flash`，但 `list_models` 返回的列表中**完全没有这三个模型**。而列表中存在的 `openai/gpt-4o-mini` 实际调用却因上游余额不足而失败。

这意味着：
- 模型目录与实际可路由的模型存在**脱节**
- 用户无法信赖 `list_models` 来做模型选择

**建议**：`list_models` 应反映真实可路由状态。建议增加 `status: "available" | "degraded" | "unavailable"` 字段，并做实时或近实时的健康检查。

---

### 🟡 中等问题

#### 3. `capabilities` 字段语义混乱

不同模型的 capabilities 表现不一致：
- GPT-4o: `{ tools: true, vision: true, streaming: true }` — 明确
- OpenRouter 模型: `{ unknown: true }` 或 `{ unknown: false, streaming: true }` — **什么是 `unknown: true`？**
- o3: `{}` — 空对象，是"无能力"还是"未检测"？
- 所有图片模型: `{}` — 图片模型难道没有任何 capability 值得标注（如 inpainting、editing、variations）？

**建议**：
- 删除 `unknown` 这个无意义字段
- 对空 `{}` 返回明确含义（如 `"capabilities": "not_available"` 或直接不返回该字段）
- 为图片模型增加有意义的 capability（`sizes`、`editing`、`variations` 等）

---

#### 4. `chat` 工具的 `model` 参数缺少枚举约束

`model` 参数是自由文本 `string`，没有 `enum` 限制。用户完全可能拼错模型名（如 `deepseek/v3` vs `deepseek/deepseek-chat`），而错误发生在运行时。

**建议**：虽然动态枚举在 JSON Schema 中不好做，但至少应该在 description 中列出 top 5 常用模型名，或提示用户 "Run list_models first to get valid model names"。当前描述 `e.g. openai/gpt-4o, deepseek/v3` 中的 `deepseek/v3` 甚至不在 `list_models` 的返回结果中，进一步加剧困惑。

---

#### 5. Action/Template 的创建被锁死在控制台

MCP 只暴露了 list / get / run，但 **create / update / delete 全部缺失**。这意味着通过 MCP 接入的开发者（包括 AI Agent）无法完成完整的工作流闭环，必须切换到 Web 控制台。

**建议**：至少提供 `create_action` 和 `update_action` 的 MCP Tool，让 Agent 能自主创建和迭代 prompt 模板。如果有安全顾虑，可以通过权限 scope 控制。

---

### 🟢 亮点

- **日志系统设计不错**：`list_logs` + `get_log_detail` 的二级结构、全文搜索、性能指标（ttftMs、tokensPerSecond）对调试非常有用
- **用量统计的分组维度丰富**：按 model/day/source/action/template 分组，覆盖了常见的成本分析场景
- **交易流水可追溯**：`get_balance(include_transactions=true)` 能看到充值和扣费明细
- **Schema 整体规范**：必填/选填区分清晰，分页参数有合理边界（pageSize max 100）

---

## DX 评分总结

| 维度 | 评分 (1-10) | 备注 |
|------|:-----------:|------|
| Tool 发现性 | 7 | 命名清晰，分类合理 |
| Schema 设计 | 5 | capabilities 混乱，model 缺少校验 |
| 错误处理 | **2** | 致命——泄露上游凭据和供应商信息 |
| 数据一致性 | 3 | list_models 与实际可用模型严重脱节 |
| 功能完整性 | 5 | CRUD 只有 R，写操作全锁控制台 |
| 可观测性 | 8 | 日志+用量统计做得好 |
| **综合** | **5 / 10** | **能用，但不可信赖** |

---

*报告由 Claude Opus 4.6 通过 MCP 自主探索生成，未参考任何外部文档。*
