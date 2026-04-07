# AIGC Gateway MCP 端点逆向工程与 DX 审查报告

> 审查日期：2026-04-06
> 审查方式：纯通过 MCP Tools 探索，无外部文档或源代码

---

## 第一步：全量资产盘点 (Tool Discovery & Mapping)

共发现 **19 个 Tools**，按功能域分组如下：

### 1. 基础 AI 调用（2 个）

| Tool | 用途 |
|---|---|
| `chat` | 向文本模型发送对话补全请求，支持流式、JSON 模式、Function Calling |
| `generate_image` | 向图片模型发送图片生成请求，返回图片 URL |

### 2. Action 管理 — 原子执行单元（7 个）

| Tool | 用途 |
|---|---|
| `list_actions` | 列出当前项目的所有 Action |
| `get_action_detail` | 获取 Action 详情（活跃版本的 messages、variables、版本历史） |
| `create_action` | 创建新 Action（绑定模型 + 提示词模板 + 变量），自动生成 v1 |
| `update_action` | 更新 Action 元数据（名称/描述/模型），不影响版本 |
| `delete_action` | 删除 Action（被 Template 引用时阻止删除） |
| `create_action_version` | 为 Action 新建版本，版本号自增，默认设为活跃版本 |
| `run_action` | 执行 Action，注入变量到提示词模板 |

### 3. Template 管理 — 多步编排工作流（5 个）

| Tool | 用途 |
|---|---|
| `list_templates` | 列出所有 Template |
| `get_template_detail` | 获取 Template 详情（步骤列表、执行模式、保留变量） |
| `create_template` | 创建 Template，步骤引用已有 Action ID |
| `update_template` | 更新 Template（steps 全量替换） |
| `delete_template` | 删除 Template（级联删除步骤） |
| `run_template` | 执行 Template，支持串行和 Fan-out 并行模式 |

### 4. 可观测性与账务（5 个）

| Tool | 用途 |
|---|---|
| `list_models` | 列出可用模型及价格、capabilities、上下文窗口 |
| `get_balance` | 查询余额，可附带最近 10 条交易流水 |
| `list_logs` | 查询调用日志，支持按模型/状态/内容搜索 |
| `get_log_detail` | 按 traceId 获取单次调用的完整 prompt、response、耗费和延迟 |
| `get_usage_summary` | 用量聚合统计，支持按模型/天/来源/Action/Template 分组 |

---

## 第二步：系统能力逆向推演 (Reverse Engineering)

### 平台性质

**AIGC Gateway 是一个 AI 模型服务商聚合网关平台**，核心商业逻辑：

1. **统一接入层**：将 OpenAI、DeepSeek、Anthropic (Claude)、Google Gemini、智谱、火山引擎（豆包/Seedream）、Perplexity、xAI (Grok)、MiniMax、Kimi、通义千问等 10+ 家供应商的 28 个模型统一在一套 API 下，开发者无需分别对接各厂 SDK。
2. **渠道智能路由**：每个模型可有多个 channel（`show_all_channels` 参数暗示），平台自动选择最优渠道（价格/可用性）。
3. **预付费余额体系**：管理员手动充值，按调用扣费，有完整的交易流水。
4. **Prompt 工程平台**：通过 Action（原子提示词模板 + 版本管理）和 Template（多步编排工作流）提供 prompt-as-code 的管理能力，类似 LangChain 的云托管版。
5. **全链路可观测**：每次调用生成 traceId，记录 prompt、response、token 用量、延迟、TTFT 等性能指标。

### 实际探索发现的数据

- **可用模型**：28 个（24 个文本模型 + 4 个图片模型）
- **供应商**：OpenAI、DeepSeek、Anthropic、Google、智谱、火山引擎、Perplexity、xAI、MiniMax、Kimi、通义千问
- **账户余额**：$49.9998（管理员手动充值 $50）
- **近 7 天调用**：11 次，总花费 $0.0002，平均延迟 8.3s
- **当前 Action/Template**：均为空（新项目）

### 核心使用流程（Developer Workflow）

```
┌─────────────┐
│ get_balance  │ ← 确认账户可用
└──────┬──────┘
       ▼
┌─────────────┐
│ list_models  │ ← 浏览可用模型、价格、能力
└──────┬──────┘
       ▼
┌──────┴──────────────────────────────┐
│  路径 A: 直接调用                     │
│  chat() / generate_image()          │
├─────────────────────────────────────┤
│  路径 B: Prompt 工程化                │
│  create_action → run_action         │
│  create_template → run_template     │
└──────┬──────────────────────────────┘
       ▼
┌─────────────────────────────┐
│ list_logs / get_log_detail  │ ← 调试与追踪
│ get_usage_summary           │ ← 成本分析
└─────────────────────────────┘
```

---

## 第三步：极客视角的吐槽与建议 (DX Critique & Suggestions)

### 吐槽 1：`chat` 的 capabilities 字段不一致，开发者无法判断模型能力

**问题**：`list_models` 返回的 `capabilities` 严重不完整。例如：
- `openai/gpt-4o` 的 capabilities 为 `{}`（空对象），但 GPT-4o 明确支持 streaming、json_mode、function calling、vision。
- `deepseek/v3` 标注了 `json_mode: true, streaming: true`，但 `openrouter/qwen/qwen-max` 也标了同样的字段，其他大多数模型却什么都没标。
- `chat` tool 提供了 `tools`/`tool_choice` 参数（Function Calling），但没有任何模型在 capabilities 里声明支持 `function_calling`。

**建议**：为 capabilities 定义完整的枚举集（`streaming`, `json_mode`, `function_calling`, `vision`, `reasoning`），并确保每个模型都填写完整。否则开发者只能靠试错。

### 吐槽 2：错误信息可读但缺乏 actionable 的排错引导

**问题**：错误日志中的 error message 是：
> `"Provider temporarily unavailable. The upstream channel returned an authentication error."`

这对开发者来说意味着什么？是我的 API Key 错了？是平台侧的 Key 过期了？还是供应商在维护？开发者完全无法 self-service 排错。

**建议**：
- 区分「平台侧故障」和「用户侧错误」。如果是平台渠道 Key 失效，告知用户「请稍后重试或切换模型」；如果是用户的项目被封禁则明确说明。
- 在 error 对象中增加 `error_code`（如 `UPSTREAM_AUTH_FAILED`、`BALANCE_INSUFFICIENT`、`MODEL_NOT_FOUND`）和 `suggestion` 字段。

### 吐槽 3：`list_models` 缺少关键筛选和排序能力

**问题**：当前只有 `modality` 一个过滤条件。28 个模型全量返回，开发者无法快速找到「支持 Function Calling 的最便宜的模型」或「上下文窗口最大的模型」。

**建议**：
- 增加 `capability` 过滤参数（如 `capability=function_calling`）
- 增加 `sort_by` 参数（如 `sort_by=price_input_asc`）
- 增加 `provider` 过滤参数（如 `provider=openai`）

### 吐槽 4：`contextWindow: null` 含义模糊

**问题**：`deepseek/reasoner` 的 `contextWindow` 为 `null`。这是「不详」还是「不适用」还是「无限制」？对于图片模型为 null 尚可理解，但文本模型的 context window 是核心参数，不应该缺失。

**建议**：文本模型必须填写 contextWindow；如果确实未知，使用 `-1` 或增加 `contextWindowUnknown: true` 标志，而不是 `null`。

### 吐槽 5：Action/Template 的「空状态」体验很好，但 `run_action` 缺少 dry-run 能力

**问题**：`list_actions` 和 `list_templates` 在空结果时返回了带 console URL 的引导信息（`"Create your first Action at https://..."`），这是亮点。但 `run_action` 没有 dry-run/preview 模式 — 开发者无法在不消耗 token 的情况下预览变量注入后的最终 prompt。

**建议**：增加 `dry_run: true` 参数，返回渲染后的 messages 但不实际调用模型。这对 prompt 调试极有价值。

### 吐槽 6：`update_template` 的 steps 是全量替换，缺少局部更新能力

**问题**：`update_template` 的 steps 字段描述明确说是 "full replacement"。如果一个 Template 有 10 步，只想改第 3 步的 action_id，也必须传全部 10 步。这在 MCP 场景下特别痛苦，因为 AI agent 需要先读取全部步骤再重新构造。

**建议**：考虑增加 `patch_steps` 模式（如传入 `[{index: 2, action_id: "new_id"}]`），或提供 `add_step` / `remove_step` / `reorder_steps` 等细粒度操作。

### 吐槽 7：价格字段是 string 而非结构化数据

**问题**：`price` 字段返回的是人类可读的 string（`"$0.336 in / $0.504 out per 1M tokens"`），无法被程序直接用于成本计算或比价。图片模型的格式又不同（`"$0.048 per image"` / `"Free"`），解析逻辑会很脆弱。

**建议**：增加结构化价格字段：
```json
{
  "pricing": {
    "type": "token",
    "inputPerMillion": 0.336,
    "outputPerMillion": 0.504,
    "currency": "USD"
  }
}
```

---

## 总评

| 维度 | 评分 | 说明 |
|---|---|---|
| **API 设计完整度** | ⭐⭐⭐⭐ | 覆盖了从调用、管理到可观测的完整闭环，CRUD + Run 的设计清晰 |
| **Schema 严谨度** | ⭐⭐⭐ | 基础校验有（min/max/enum），但 capabilities 和 price 缺少结构化 |
| **错误可自解释性** | ⭐⭐ | 错误信息可读但不 actionable，缺少 error code 和排错建议 |
| **空状态引导** | ⭐⭐⭐⭐⭐ | 空列表返回 console URL 引导，这是亮点 |
| **可发现性（Discoverability）** | ⭐⭐⭐ | Tool 描述清晰，但模型能力不透明导致开发者需要试错 |
| **Prompt 工程支持** | ⭐⭐⭐⭐ | Action 版本管理 + Template 编排是差异化优势，缺 dry-run |

**综合 DX 评分：3.5 / 5** — 一个功能完整、设计思路正确的平台，但在数据结构化、错误引导和模型元数据完整性上还有明显提升空间。
