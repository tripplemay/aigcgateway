# AIGC Gateway — MCP 端点逆向工程与 DX 审查报告

> **审查时间**：2026-04-12 09:35 (CST)
> **审查方式**：纯 MCP Tool 探索，无外部文档
> **审查人**：Claude Opus 4.6 (DX Auditor)

---

## 第一步：全量资产盘点 (Tool Discovery & Mapping)

共发现 **24 个 MCP Tools**，按功能域分类如下：

### 1. 基础查询 (Account & Project)

| Tool | 用途 |
|------|------|
| `get_balance` | 查看用户余额，可选附带最近 10 笔交易流水 |
| `get_project_info` | 获取当前项目的名称、描述、调用量等元数据 |
| `create_project` | 创建新项目并设为当前用户默认项目 |
| `list_api_keys` | 列出当前用户的所有 API Key（脱敏显示） |
| `create_api_key` | 创建新 API Key（完整 Key 只返回一次） |
| `revoke_api_key` | 吊销一个 API Key，立即失效 |

### 2. 模型与直接调用 (Model & Inference)

| Tool | 用途 |
|------|------|
| `list_models` | 浏览可用 AI 模型，含价格、capabilities、支持的图片尺寸 |
| `chat` | 向文本模型发送对话请求，支持流式、JSON 模式、Function Calling、采样参数 |
| `generate_image` | 向图片模型发送生成请求，返回图片 URL |

### 3. Action 管理 (原子执行单元)

| Tool | 用途 |
|------|------|
| `list_actions` | 列出当前项目的所有 Action |
| `get_action_detail` | 获取单个 Action 详情（活跃版本的 messages/variables + 版本历史） |
| `create_action` | 创建 Action（绑定模型 + 提示词模板 + 变量），自动创建 v1 |
| `update_action` | 更新 Action 元数据（名称/描述/模型），不影响版本 |
| `delete_action` | 删除 Action（被 Template 引用时会阻止） |
| `create_action_version` | 为 Action 创建新版本（版本号自增，默认设为活跃） |
| `activate_version` | 切换 Action 的活跃版本（版本回滚/升级） |
| `run_action` | 执行一个 Action，注入变量，支持 dry_run 预览模式 |

### 4. Template 管理 (多步编排工作流)

| Tool | 用途 |
|------|------|
| `list_templates` | 列出当前项目的所有 Template |
| `get_template_detail` | 获取 Template 详情（执行模式、步骤列表、保留变量） |
| `create_template` | 创建 Template，引用已有 Action 组成串行或并行工作流 |
| `update_template` | 更新 Template 的名称/描述/步骤（步骤为全量替换） |
| `delete_template` | 删除 Template 及其所有步骤 |
| `run_template` | 执行 Template 工作流，自动检测串行/Fan-out 模式 |

### 5. 公共市场与可观测性

| Tool | 用途 |
|------|------|
| `list_public_templates` | 浏览管理员发布的公共模板库（含质量评分、Fork 数） |
| `fork_public_template` | 将公共模板 Fork 到自己项目，生成独立副本 |
| `list_logs` | 查看最近的 AI 调用日志（支持按 prompt 全文搜索） |
| `get_log_detail` | 按 trace_id 获取单次调用的完整 prompt、response、耗时、花费 |
| `get_usage_summary` | 获取用量统计，支持按模型/天/来源/Action/Template 分组 |

---

## 第二步：系统能力逆向推演 (Reverse Engineering)

### 平台性质

这是一个 **AI 模型服务聚合网关 (AI Gateway)**。核心商业逻辑：

> 将多家 AI 服务商（OpenAI、Anthropic、Google、DeepSeek、ByteDance、百度、智谱、阿里通义、Moonshot、Minimax、xAI）的模型统一到一个入口，用户通过统一的 API 和余额体系调用任意模型，按 token 计费。

平台在"裸调用"之上构建了两层抽象：

- **Action** — 原子提示词模板（模型 + prompt + 变量），可版本化管理
- **Template** — 多 Action 编排工作流（串行链式 / Fan-out 并行），类似 LangChain 的 Chain

附加能力：公共模板市场（Fork 机制）、调用日志回溯、用量分析看板。

### 已发现的模型清单 (22 个)

**文本模型 (17 个)**：

| 模型 | 品牌 | 上下文窗口 | 价格 (per 1M tokens) | 关键能力 |
|------|------|-----------|---------------------|---------|
| claude-haiku-4.5 | Anthropic | 200K | 免费 | vision, function_calling |
| claude-sonnet-4.6 | Anthropic | 1M | $3.6 in / $18 out | reasoning, vision, function_calling |
| deepseek-r1 | DeepSeek | 164K | $0.84 in / $3 out | reasoning（无 function_calling） |
| deepseek-v3 | DeepSeek | 164K | $0.33 in / $1.32 out | function_calling |
| doubao-pro | ByteDance | 262K | $0.08 in / $0.33 out | vision, function_calling |
| ernie-4.5 | Baidu | 131K | $0.34 in / $1.32 out | reasoning, vision, function_calling |
| gemini-2.5-flash-lite | Google | 1M | $0.12 in / $0.48 out | search, reasoning, vision |
| gemini-3-flash | Google | 1M | 免费 | search, reasoning, vision |
| glm-4.7-flash | 智谱AI | 203K | 免费 | function_calling |
| glm-5 | 智谱AI | 203K | $0.86 in / $2.76 out | search, reasoning |
| gpt-4o-mini | OpenAI | 1M | $0.18 in / $0.72 out | vision, function_calling |
| gpt-5 | OpenAI | 1M | 免费 | search, reasoning, vision, function_calling |
| grok-4.1-fast | xAI | N/A | $0.24 in / $0.6 out | search, vision, function_calling |
| kimi-k2-thinking | Moonshot AI | 262K | 免费 | search, reasoning, vision, function_calling |
| minimax-m2.5 | Minimax | N/A | 免费 | vision, function_calling |
| qwen3.5-flash | Qwen | 1M | $0.08 in / $0.31 out | reasoning, vision, function_calling |
| qwen3.5-plus | Qwen | 1M | 免费 | reasoning, vision, function_calling |

**图片模型 (5 个)**：

| 模型 | 品牌 | 价格 | 支持尺寸 |
|------|------|------|---------|
| gemini-3-pro-image | Google | 免费 | 1024x1024, 1024x1536, 1536x1024 |
| gpt-image | OpenAI | 免费 | 1024x1024, 1024x1536, 1536x1024 |
| gpt-image-mini | OpenAI | 免费 | 1024x1024, 1024x1536, 1536x1024, auto |
| qwen-image | Qwen | 免费 | 1024x1024, 1024x1792, 1792x1024 |
| seedream-3 | ByteDance | 免费 | 1024x1024, 1280x960, 960x1280 |

### 核心使用流程 (Developer Workflow)

```
1. get_balance            → 确认账户有余额
2. list_models            → 选择合适的模型
3. chat / generate_image  → 直接调用（快速验证）
   ─── 或者进入 Action/Template 工作流 ───
4. create_action          → 将 prompt 封装为可复用 Action
5. run_action             → 执行，dry_run 预览
6. create_template        → 将多个 Action 编排为工作流
7. run_template           → 执行工作流
8. list_logs / get_usage_summary → 监控与优化
```

---

## 第三步：极客视角的吐槽与建议 (DX Critique & Suggestions)

### BUG 级问题

#### 1. `supportedSizes` 数据源自相矛盾 — 严重

`seedream-3` 模型返回了**两组不同的尺寸数据**：

```json
"capabilities": {
  "supported_sizes": ["1024x1024", "2048x2048"]    // ← 位置 A
},
"supportedSizes": ["1024x1024", "1280x960", "960x1280"]  // ← 位置 B，完全不同！
```

`gpt-image-mini` 也有类似问题：`capabilities.supported_sizes` 没有 `"auto"`，但顶层 `supportedSizes` 有。而 `gpt-image`、`gemini-3-pro-image`、`qwen-image` 则**只有** `capabilities.supported_sizes`，没有顶层字段。

开发者到底该信哪个？MCP Server 的 instruction 说"从 `supportedSizes` 中选择"，但多数模型根本没有这个顶层字段。

**建议**：统一为单一字段，推荐保留顶层 `supportedSizes`，废弃 `capabilities.supported_sizes`。所有模型必须一致返回。

---

#### 2. 公共模板不可预览 — 功能缺失

`list_public_templates` 返回了 3 个公共模板，但 `get_template_detail` 查询公共模板 ID 直接返回 **"Template not found"**。也就是说：

> 用户在 Fork 之前，无法查看公共模板的步骤组成、使用的 Action 或变量定义。相当于让用户"盲 Fork"。

**建议**：要么让 `get_template_detail` 支持跨项目查看公共模板（只读），要么在 `list_public_templates` 的返回中内联步骤摘要。

---

#### 3. `get_project_info` 返回错误 — 数据一致性问题

当前 MCP 会话绑定的项目 ID `cmnfnuhvi015qrndh8w618u6e` 查不到，返回 `[not_found] Project not found`。这意味着 MCP 会话绑定了一个**已删除或不存在的项目**，但系统没有做启动校验。

**建议**：MCP 会话初始化时应校验项目有效性。项目不存在时应返回引导信息（如"请先 `create_project`"），而不是让后续调用逐个失败。

---

### 设计级问题

#### 4. 价格展示格式不可解析

模型价格以人类可读字符串返回：`"$0.84 in / $3 out per 1M tokens"`、`"Free"`。

对于 MCP 消费者（Agent / 程序），这个字符串需要正则解析才能比价或做成本预估。

**建议**：增加结构化字段：

```json
"pricing": {
  "inputPerMillion": 0.84,
  "outputPerMillion": 3.0,
  "currency": "USD"
}
```

保留人类可读的 `price` 字符串作为 display 用途即可。

#### 5. `list_models` 缺少关键过滤维度

当前只支持按 `modality` 过滤（text/image）。但 22 个模型中能力差异巨大（有的支持 function_calling，有的支持 vision，有的支持 reasoning/search）。

如果开发者想找"支持 function_calling 的文本模型"或"免费模型"，只能全量拉取后自行筛选。

**建议**：增加 `capability` 过滤参数（如 `?capability=function_calling`）和 `free_only=true` 过滤。

#### 6. `chat` 的 `model` 参数没有 Enum 约束

Schema 中 `model` 只是 `"type": "string"`。对于 MCP Agent 来说，它无法从 schema 本身得知合法值——必须先调用 `list_models`。这在 tool_choice="auto" 的场景下很容易导致 Agent 瞎猜模型名。

**建议**：虽然模型列表是动态的，但可以在 `description` 中给出 2-3 个典型模型名作为示例（当前 description 只说了"call list_models first"）。或者考虑服务端根据当前可用模型动态生成 enum。

#### 7. 空结果的引导信息不一致

- `list_actions` 空结果时返回 `"message": "No Actions found. Create your first Action..."`  — 好，有引导
- `list_templates` 同上 — 好
- `list_logs` 空结果返回 `[]` — 没有任何引导
- `get_usage_summary` 空结果返回 `"groups": []` — 没有引导

**建议**：统一空结果行为。要么都加引导 message，要么都不加。当前的不一致会让开发者困惑"是我调错了还是真的没数据"。

#### 8. Template 步骤更新是全量替换，缺乏安全提示

`update_template` 的 `steps` 参数描述为 "full replacement"。如果开发者只想加一个步骤，必须先 `get_template_detail` 取回所有步骤，手动 append 后再全量提交。一旦忘记带上旧步骤，原有编排会被覆盖。

**建议**：至少在 description 中强调 "WARNING: omitting a step removes it"，或提供增量操作（`add_step` / `remove_step`）。

---

## 综合评分

| 维度 | 评分 (10分制) | 说明 |
|------|:---:|------|
| 工具覆盖度 | **8** | CRUD 完整，Action/Template/Log/Usage 全链路覆盖 |
| Schema 质量 | **6** | 基础类型约束到位，但缺 enum、结构化价格、一致的 supportedSizes |
| 错误信息 | **5** | project not found 没有引导，公共模板 404 无解释 |
| 数据一致性 | **4** | supportedSizes 两个字段互相矛盾，空结果行为不统一 |
| 可发现性 | **7** | MCP instructions 写得不错，空结果引导部分到位 |
| **综合 DX** | **6 / 10** | 骨架扎实，细节粗糙。修好上述问题后可到 8 分 |

---

*报告生成于 2026-04-12 09:35 CST，基于 AIGC Gateway MCP Server 实时探索数据。*
