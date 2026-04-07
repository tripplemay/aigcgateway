# MCP 端点逆向工程与 DX 审查报告

**审查日期**：2026-04-06
**目标系统**：aigc-gateway MCP Server
**审查方法**：纯黑盒探测，无源代码/文档参考

---

## 第一步：全量资产盘点 (Tool Discovery & Mapping)

共发现 **13 个 Tool**，可分为 4 个功能域：

| 功能域 | Tool | 用途 |
|---|---|---|
| **AI 调用** | `chat` | 向文本模型发起对话补全请求，支持流式、JSON 结构化输出 |
| | `generate_image` | 向图片模型发起图片生成请求 |
| **可复用编排** | `list_actions` | 列出所有 Action（绑定模型+提示词+变量的原子执行单元） |
| | `get_action_detail` | 查看 Action 详情（活跃版本的 messages/variables、版本历史） |
| | `run_action` | 执行 Action，传入变量渲染提示词模板 |
| | `list_templates` | 列出所有 Template（多 Action 串行/并行编排工作流） |
| | `get_template_detail` | 查看 Template 详情（执行模式、步骤列表） |
| | `run_template` | 执行 Template 工作流 |
| **可观测性** | `list_logs` | 搜索调用日志（trace ID、模型、状态、成本、延迟） |
| | `get_log_detail` | 按 trace ID 查看完整 prompt/response/性能指标 |
| | `get_usage_summary` | 按维度聚合的用量与花费汇总 |
| **账户** | `get_balance` | 查看余额，可选查看最近交易记录 |
| | `list_models` | 浏览可用模型清单，含价格和能力标签 |

---

## 第二步：系统能力逆向推演 (Reverse Engineering)

### 平台性质

这是一个 **AI 服务商聚合网关（AI Gateway）**。核心商业逻辑：

1. **统一接入层** — 将 OpenAI、Anthropic、Google、DeepSeek、通义千问、豆包、智谱、Moonshot、xAI 等十余家 AI 服务商聚合在一个 API 后面，用户无需分别对接。通过 `openrouter/`、`openai/`、`volcengine/` 等前缀路由到不同上游。
2. **成本管控** — 统一的余额/充值/扣费体系，按 token 或按图计费，提供用量分析（按模型/天/来源等维度）。
3. **提示词工程复用** — Action（原子提示词模板）+ Template（多步编排工作流，支持串行和 Fan-out 并行），让提示词可版本化、可复用、可组合。
4. **全链路可观测** — 每次调用生成 trace ID，可追溯完整 prompt/response、token 用量、延迟、TTFT 等性能指标。

### 新开发者核心 Workflow

```
get_balance → list_models → chat/generate_image → list_logs → get_log_detail
                                 ↑
                    (进阶) list_actions → run_action
                           list_templates → run_template
                                 ↓
                         get_usage_summary
```

1. `get_balance` 确认账户可用
2. `list_models` 获取模型名和价格
3. `chat` 或 `generate_image` 发起 AI 调用
4. `list_logs` / `get_log_detail` 排查问题
5. 进阶：用 Action/Template 复用和编排提示词

---

## 第三步：极客视角的吐槽与建议 (DX Critique & Suggestions)

### 吐槽 1：错误信息暴露了上游供应商内部细节，且缺乏自解释性

**问题**：`get_log_detail` 返回的 error 字段直接透传了上游供应商的原始错误：

> "账户余额过低...请前往 https://api.chatanywhere.tech/#/shop 充值...当前请求使用的ApiKey: sk-e9T****yXf0...加入QQ群：836739524"

这暴露了：
- 上游供应商是 ChatAnywhere（商业机密泄露）
- 实际使用的 API Key 片段
- 供应商的充值链接和客服 QQ 群

**建议**：Gateway 层应**拦截并翻译**上游错误，统一包装成自己的错误码体系。例如：
```json
{
  "error_code": "UPSTREAM_QUOTA_EXCEEDED",
  "message": "The selected model channel is temporarily unavailable. The gateway will automatically retry with an alternate channel.",
  "action": "If the issue persists, contact support at https://aigc.guangai.ai/support"
}
```

---

### 吐槽 2：`capabilities` 字段存在 `"unknown": true/false`，语义不清

**问题**：`list_models` 返回中，部分模型的 capabilities 为：
```json
{ "unknown": true }                        // claude-3.5-haiku
{ "unknown": false, "streaming": true }    // minimax-01
{ }                                        // deepseek-r1, o3
```

- `"unknown": true` 是什么意思？该模型能力未知？还是有一个叫 "unknown" 的能力？
- `"unknown": false` 出现在有明确能力的模型上，更加令人困惑
- 空对象 `{}` 和 `"unknown": true` 的区别是什么？

**建议**：
- 去掉 `unknown` 字段，改为用确定的能力枚举（`tools`, `vision`, `streaming`, `json_mode`）
- 对于无法确认能力的模型（如 OpenRouter 转发），标记 `"capabilities_source": "unverified"` 而不是用一个语义不明的 boolean
- 在 Schema 描述中列出所有可能的 capability key

---

### 吐槽 3：`list_models` 与 `get_usage_summary` 的模型名不一致

**问题**：
- `list_models` 返回的模型名：`openai/gpt-4o-mini`, `volcengine/doubao-pro-32k`
- `get_usage_summary` 中 topModels：`zhipu/glm-4.7-flash`, `deepseek/v3`, `volcengine/doubao-1.5-lite-32k`

`deepseek/v3`、`zhipu/glm-4.7-flash`、`volcengine/doubao-1.5-lite-32k` 在 `list_models` 中根本不存在。说明：
- 模型可能已下线但历史记录保留了旧名
- 或者 `list_models` 做了某种去重/筛选逻辑，隐藏了部分可用模型

**建议**：
- 下线模型在 `list_models` 中应可通过 `include_deprecated=true` 查询
- 或在 `get_usage_summary` 中标注 `"deprecated": true`，让开发者知道该模型已不可用

---

### 吐槽 4：图片模型缺少关键参数提示

**问题**：`generate_image` 的 `size` 参数是纯 string 类型，没有枚举值或说明哪些尺寸可用。不同模型支持的尺寸完全不同（DALL-E 3 只支持 1024x1024/1792x1024/1024x1792，Seedream 可能支持其他尺寸）。

**建议**：
- 在 `list_models` 对图片模型返回 `supportedSizes: ["1024x1024", "1792x1024", ...]`
- 或在 `generate_image` 的 Schema 中根据模型动态提示可用尺寸

---

### 吐槽 5：`get_usage_summary` 按天分组返回的 key 格式不友好

**问题**：按天分组返回的 key 是：
```
"Mon Apr 06 2026 00:00:00 GMT+0000 (Coordinated Universal Time)"
```

这是 JavaScript `Date.toString()` 的输出，既不是 ISO 8601，也不方便程序解析。

**建议**：改为 `"2026-04-06"` 格式（ISO 8601 date），简洁且通用。

---

### 吐槽 6：Action/Template 只能在控制台创建，MCP 层是"半残"的

**问题**：Action 和 Template 占了 13 个 Tool 中的 6 个（近一半），但创建/编辑/删除操作都必须去 Web 控制台完成。对于通过 MCP 接入的开发者来说，只能 list + run，无法完成完整的 CRUD 闭环。

**建议**：
- 如果是有意为之（避免 AI Agent 自行创建 Action），应在 Tool 描述中明确说明设计意图
- 长期应考虑提供 `create_action` / `update_action` 等写入端点，至少让 MCP 用户能做 prompt 版本迭代

---

## 总评

| 维度 | 评分 (1-10) | 说明 |
|---|---|---|
| **工具发现性** | 8 | 命名清晰，list/get/run 动词一致，新手容易上手 |
| **Schema 严谨度** | 6 | 缺少图片尺寸枚举、capabilities 语义不清、日期格式随意 |
| **错误自解释性** | 3 | 严重问题——直接透传上游错误，泄露供应商信息和 API Key |
| **功能完整度** | 6 | Action/Template 只读不写，模型列表与实际可用不一致 |
| **数据一致性** | 5 | list_models 和 usage 的模型名对不上，capabilities 有 unknown 噪音 |

**综合 DX 评分：5.6 / 10** — 骨架清晰、方向正确，但在错误处理、数据一致性和 Schema 严谨度上有明显短板，尤其是**上游错误透传问题属于 P0 级安全隐患**，建议优先修复。

---

## 探测数据快照

### 模型清单（探测时间 2026-04-06）

共 23 个模型：20 个文本模型 + 3 个图片模型

| 模型名 | 类型 | 上下文窗口 | 价格 |
|---|---|---|---|
| openai/gpt-4o | text | 128K | $3/$12 per 1M |
| openai/gpt-4o-mini | text | 128K | $0.18/$0.72 per 1M |
| openai/o3 | text | 200K | $2.4/$9.6 per 1M |
| openai/o4-mini | text | 200K | $1.32/$5.28 per 1M |
| openrouter/anthropic/claude-sonnet-4 | text | 200K | $3.6/$18 per 1M |
| openrouter/anthropic/claude-3.5-haiku | text | 200K | $0.96/$4.8 per 1M |
| openrouter/google/gemini-2.5-pro | text | 1M | $1.5/$12 per 1M |
| openrouter/google/gemini-2.5-flash | text | 1M | $0.36/$3 per 1M |
| openrouter/google/gemini-2.0-flash-001 | text | 1M | $0.12/$0.48 per 1M |
| openrouter/deepseek/deepseek-r1 | text | 64K | $0.84/$3 per 1M |
| openrouter/qwen/qwen-max | text | 32K | $1.248/$4.992 per 1M |
| openrouter/qwen/qwen-plus | text | 1M | $0.312/$0.936 per 1M |
| openrouter/x-ai/grok-3 | text | 131K | $3.6/$18 per 1M |
| openrouter/x-ai/grok-3-mini | text | 131K | $0.36/$0.6 per 1M |
| openrouter/perplexity/sonar | text | 127K | $1.2/$1.2 per 1M |
| openrouter/perplexity/sonar-pro | text | 200K | $3.6/$18 per 1M |
| openrouter/minimax/minimax-01 | text | 1M | $0.24/$1.32 per 1M |
| openrouter/moonshotai/kimi-k2 | text | 131K | $0.684/$2.76 per 1M |
| volcengine/doubao-pro-256k | text | 256K | $0.082/$0.329 per 1M |
| volcengine/doubao-pro-32k | text | 32K | $0.066/$0.197 per 1M |
| openai/dall-e-3 | image | - | $0.048/image |
| openai/gpt-image-1 | image | - | $0.048/image |
| volcengine/seedream-4.5 | image | - | $0.018/image |

### 账户状态
- 余额：$49.9998
- 7 天调用次数：11
- 7 天总花费：$0.0002
