# 审计执行报告
> **审计时间**：2026-04-13 18:07:13 (UTC+8)
> **审计角色**：dx-audit-prompt.md
---

所有探测完成。现在编写完整审计报告。

---

# AIGC Gateway MCP 端点逆向工程与 DX 审查报告

---

## 第一步：全量资产盘点 (Tool Discovery & Mapping)

共发现 **26 个 MCP Tools**，分为 6 个功能域：

### 1. 模型与基础调用（4 个）
| Tool | 用途 |
|------|------|
| `list_models` | 浏览可用 AI 模型，支持按 modality（text/image）和 capability 过滤，返回定价、能力标签、上下文窗口等 |
| `chat` | 向文本模型发送对话请求，支持流式、JSON 格式输出、function calling、采样参数控制 |
| `generate_image` | 向图片模型发送生成请求，需要指定 prompt 和可选 size |
| `get_balance` | 查询用户级余额，可附带最近 10 笔交易流水 |

### 2. Action 管理（7 个）—— 原子执行单元
| Tool | 用途 |
|------|------|
| `list_actions` | 列出当前项目的所有 Action（分页） |
| `get_action_detail` | 获取 Action 详情（活跃版本的 messages/variables、版本历史） |
| `create_action` | 创建新 Action（绑定模型 + 提示词模板 + 变量定义），自动创建 v1 |
| `update_action` | 更新 Action 元数据（名称/描述/模型），不创建新版本 |
| `delete_action` | 删除 Action（被 Template 引用时阻止） |
| `create_action_version` | 创建新版本（版本号自增），默认设为活跃版本 |
| `activate_version` | 切换活跃版本（版本回滚/升级） |

### 3. Template 管理（6 个）—— 多步编排工作流
| Tool | 用途 |
|------|------|
| `list_templates` | 列出当前项目的所有 Template（分页） |
| `get_template_detail` | 获取 Template 详情（执行模式、步骤列表、保留变量），也支持预览公开模板 |
| `create_template` | 创建新 Template（引用已有 Action 编排为 sequential 或 fan-out 流程） |
| `update_template` | 更新 Template（步骤为全量替换） |
| `delete_template` | 删除 Template |
| `run_template` | 执行 Template 工作流，自动检测执行模式（sequential/fan-out） |

### 4. 公共模板市场（2 个）
| Tool | 用途 |
|------|------|
| `list_public_templates` | 浏览公开模板库，支持搜索，返回质量评分和 fork 数 |
| `fork_public_template` | 将公开模板及其关联 Action 复制到自己的项目中 |

### 5. 项目与密钥管理（5 个）
| Tool | 用途 |
|------|------|
| `create_project` | 创建新项目并设为默认 |
| `get_project_info` | 查看当前项目信息（名称、描述、调用次数、Key 数量） |
| `list_api_keys` | 列出当前用户的所有 API Key（脱敏） |
| `create_api_key` | 创建新 API Key（完整 key 仅返回一次） |
| `revoke_api_key` | 吊销 API Key（立即失效） |

### 6. 可观测性（4 个）
| Tool | 用途 |
|------|------|
| `list_logs` | 列出最近的 AI 调用日志，支持按模型/状态/内容搜索过滤 |
| `get_log_detail` | 按 traceId 获取完整调用详情（prompt、response、参数、cost、latency） |
| `get_usage_summary` | 获取用量汇总，支持按模型/天/来源/action/template 分组，支持 today/7d/30d 周期 |
| `run_action` | （已计入 Action 管理）支持 `dry_run=true` 预览模式 |

---

## 第二步：系统能力逆向推演

### 平台性质
这是一个 **AI 模型服务聚合网关**（AI Gateway / LLM Router），核心商业逻辑是：

1. **统一接入层**：将 OpenAI、Anthropic、Google、DeepSeek、字节、百度、智谱、Moonshot、Minimax、xAI 等 10+ 家 AI 厂商的模型聚合到一个统一 API 后面，用户无需分别管理各家 API Key
2. **按用量付费**：平台自有余额体系（USD），用户充值后按统一定价计费，平台赚取差价或服务费
3. **Prompt 工程化**：通过 Action（原子提示词 + 版本管理）和 Template（多步编排）将 prompt 工程从代码中解耦，支持版本回滚、变量注入、dry run 预览
4. **公共模板市场**：允许管理员发布模板供所有用户 fork 使用，形成 prompt 资产的复用生态

### 核心使用流程

```
开发者首次接入流程：
                                                      
 ① get_balance          → 确认账户有余额
 ② list_models          → 浏览可用模型和定价
 ③ chat / generate_image → 直接调用模型（快速验证）
 ④ create_action        → 将常用 prompt 封装为 Action
 ⑤ create_template      → 将多个 Action 编排为工作流
 ⑥ create_api_key       → 获取 API Key 用于生产环境
 ⑦ list_logs / get_usage_summary → 监控调用和成本
```

---

## 第三步：极客视角的吐槽与建议

### 吐槽 1：模型列表严重不一致 —— 信任基础崩塌

这是本次审计发现的**最严重问题**。`list_models` 作为用户选择模型的唯一权威来源，其数据与系统实际行为严重脱节：

- **`claude-sonnet-4.6`**：`list_models` 不返回它，但 `chat` 可以正常调用且成功返回结果。更讽刺的是，当用户输入错误模型名时，`chat` 的错误信息里赫然列出了 `claude-sonnet-4.6` 作为可用模型。**左手说没有，右手说有。**
- **`qwen-image`**：从未出现在 `list_models` 中，但 `get_usage_summary` 中记录了 6 次调用、$0.011 费用。这是一个"幽灵模型"——用户被收了费但无法在模型列表中找到它。
- **`deepseek-v3`**：`list_models` 堂堂正正列出它（含定价、capabilities），但实际调用 **8 次全部失败**，错误信息是"模型不存在"。一个不存在的模型被标价出售。
- **`seedream-3`**：同样被列出，同样全部失败。

**建议**：引入模型健康检查机制。`list_models` 应只返回当前可用的模型，或至少增加 `status: "available" | "degraded" | "unavailable"` 字段。对于后端路由不可达的模型，应自动从列表中移除或标记。

### 吐槽 2：`deprecated` 标记只在用量统计中出现，模型列表中完全缺失

`get_usage_summary` 的 `topModels` 中，`gpt-4o-mini`、`seedream-3`、`gpt-image` 带有 `deprecated: true` 标记。但 `list_models` 返回这些模型时**没有任何 deprecated 标识**。这意味着：

- 用户会继续选用已废弃的模型
- 只有在查看用量统计时才会偶然发现 deprecated 标记——这不是一个合理的发现路径

**建议**：在 `list_models` 的返回结构中增加 `deprecated: boolean` 和 `deprecationNotice: string` 字段。

### 吐槽 3：Reasoning tokens 的计费陷阱

实测 `qwen3.5-flash`（设 `max_tokens=5`）：返回的 `completionTokens=1588`（其中 `reasoningTokens=1582`）。`max_tokens` 只限制可见输出，reasoning tokens 不受限制且照常计费。

- Schema 的 `max_tokens` 描述仅说 "Maximum completion (answer) tokens"，但没有明确告知 reasoning tokens 是额外计费的
- `max_reasoning_tokens` 参数存在但是可选的，没有默认上限
- 对于不了解 reasoning 模型的开发者，这是一个**隐性成本炸弹**

**建议**：
1. 在 `chat` 的返回值中，始终分别展示 `reasoningCost` 和 `answerCost`
2. 对 reasoning 模型，当未设置 `max_reasoning_tokens` 时返回警告
3. 在 `list_models` 中为 reasoning 模型标注 "此模型会产生额外的推理 token 费用"

### 吐槽 4：计费数据不可信

- `claude-haiku-4.5`：1 次成功调用（49 tokens），费用 **$0.00000000**。按定价 $1/$5 per 1M tokens 计算，应为 ~$0.0001。精确为零说明计费系统根本没有触发。
- `gemini-3-pro-image`：4 次调用，$0 费用。是全部失败了还是漏计费？日志中无法区分。
- `gpt-image-mini`：6 次调用，394 tokens，$0 费用。定价 $0.09589/张，如果有任何一张成功应该不为零。

**建议**：在 `get_usage_summary` 中区分 `successCalls` 和 `errorCalls`，让用户明确知道 $0 是因为全部失败还是计费异常。

### 吐槽 5：错误信息质量参差不齐

| 场景 | 错误信息 | 问题 |
|------|---------|------|
| text 模型调 generate_image | "该接口接口暂不支持该模型调用" | 有错别字（"接口接口"重复），且未告知应使用 image 模态模型 |
| model not found (chat) | 列出可用模型列表 | **好的设计**，但列出的模型与 list_models 不一致 |
| invalid size (generate_image) | 返回 supportedSizes 数组 | **好的设计** |
| max_tokens 过大 | 详细说明了上下文限制 | 信息泄露了上游供应商特征 |
| deepseek-v3 调用失败 | "The model or [infra removed] does not exist" | "[infra removed]"是脱敏不完全的痕迹，暴露了后端架构细节 |

**建议**：统一错误信息语言（建议全英文 + i18n code），修复错别字，确保脱敏完整。

### 吐槽 6：缺少 `list_projects` 工具

有 `create_project` 和 `get_project_info`，但**没有 `list_projects`**。用户创建了多个项目后，无法通过 MCP 查看自己有哪些项目，也无法切换项目。这是 CRUD 操作中最基本的 List 缺失。

**建议**：增加 `list_projects` 和 `switch_project` 工具。

### 吐槽 7：交易流水缺少关键上下文

`get_balance` 的 transactions 只有 `"API call deduction"` 和 traceId。用户需要拿 traceId 再去 `get_log_detail` 查询才能知道是哪个模型消费的。对于账单审查场景，这增加了不必要的操作步骤。

**建议**：在 transaction 中内联 `model` 和 `source` 字段。

---

## 最终步骤：结构化断言输出

```json
{
  "assertions": [
    {
      "id": "DX-001",
      "severity": "critical",
      "category": "数据一致性",
      "tool": "list_models / chat",
      "description": "claude-sonnet-4.6 可通过 chat 成功调用，但 list_models 不返回该模型",
      "assertion": "chat(model='claude-sonnet-4.6', messages=[...]) 能成功返回 → list_models() 的返回列表中必须包含 name='claude-sonnet-4.6' 的条目",
      "actual": "chat 成功返回（traceId=trc_b76szf94omcivtnqbfj4sy1i），但 list_models() 返回的 20 个模型中不包含 claude-sonnet-4.6",
      "expected": "list_models 应返回所有可调用模型，包括 claude-sonnet-4.6"
    },
    {
      "id": "DX-002",
      "severity": "critical",
      "category": "数据一致性",
      "tool": "list_models / chat",
      "description": "deepseek-v3 在 list_models 中列出但实际调用全部失败",
      "assertion": "list_models() 返回的每个模型，使用 chat(model=name, messages=[{role:'user',content:'hi'}]) 调用时不应返回 model_not_found 错误",
      "actual": "deepseek-v3 被 list_models 返回（含定价），但 chat 调用返回 'The model does not exist or you do not have access to it'，历史 8 次调用全部失败",
      "expected": "list_models 不应列出不可用的模型，或应标记其状态为不可用"
    },
    {
      "id": "DX-003",
      "severity": "high",
      "category": "数据一致性",
      "tool": "list_models / get_usage_summary",
      "description": "get_usage_summary 中出现 list_models 未列出的幽灵模型 qwen-image",
      "assertion": "get_usage_summary(group_by='model') 返回的每个 key 都必须存在于 list_models() 的返回结果中",
      "actual": "get_usage_summary 返回了 qwen-image（6 次调用，$0.011 费用），但 list_models() 和 list_models(modality='image') 均不包含此模型",
      "expected": "用量中出现的模型应能在 list_models 中找到（即使已下线也应有记录）"
    },
    {
      "id": "DX-004",
      "severity": "high",
      "category": "数据一致性",
      "tool": "list_models / get_usage_summary",
      "description": "get_usage_summary 的 topModels 带有 deprecated 标记，但 list_models 返回的模型结构中无此字段",
      "assertion": "若 get_usage_summary().topModels 中某模型含 deprecated=true，则 list_models() 返回的对应模型也应包含 deprecated 字段",
      "actual": "get_usage_summary 标记 gpt-4o-mini、seedream-3、gpt-image 为 deprecated=true，但 list_models 返回这些模型时无 deprecated 字段",
      "expected": "list_models 应在模型数据中包含 deprecated 字段，让用户在选择模型时就能看到废弃状态"
    },
    {
      "id": "FIN-001",
      "severity": "high",
      "category": "计费",
      "tool": "chat / get_log_detail",
      "description": "claude-haiku-4.5 成功调用 49 tokens 但计费为精确的 $0.00",
      "assertion": "对于 status='success' 且 totalTokens>0 的调用，cost 不应为 $0.00000000（除非该模型明确标记为免费）",
      "actual": "traceId=trc_f8vx901d9zemkslcxk92es7v，claude-haiku-4.5，49 tokens，cost=$0.00000000",
      "expected": "按定价 $1/$5 per 1M tokens，49 tokens 的费用应约为 $0.0001，不应为精确的零"
    },
    {
      "id": "FIN-002",
      "severity": "medium",
      "category": "计费",
      "tool": "get_usage_summary",
      "description": "用量汇总不区分成功调用和失败调用的次数，无法判断 $0 费用是全部失败还是漏计费",
      "assertion": "get_usage_summary(group_by='model') 的每个分组应包含 successCalls 和 errorCalls 字段",
      "actual": "仅返回 totalCalls 和 totalCost，如 deepseek-v3（8 calls, $0）无法判断是否有成功调用被漏计费",
      "expected": "应拆分为 successCalls/errorCalls，或至少提供 errorRate"
    },
    {
      "id": "DX-005",
      "severity": "high",
      "category": "DX",
      "tool": "chat",
      "description": "chat 的 model_not_found 错误信息中列出的可用模型列表与 list_models 返回不一致",
      "assertion": "chat(model='不存在的模型') 返回的可用模型列表应与 list_models(modality='text') 的返回列表完全一致",
      "actual": "chat 错误消息列出了 claude-sonnet-4.6 作为可用模型，但 list_models 不返回它；反之 deepseek-v3 在 list_models 中但实际不可用",
      "expected": "两处模型列表应来自同一数据源，保持一致"
    },
    {
      "id": "DX-006",
      "severity": "medium",
      "category": "DX",
      "tool": "chat",
      "description": "reasoning 模型的 max_tokens 不限制 reasoning tokens，缺乏明确提示导致意外计费",
      "assertion": "chat(model=reasoning_model, max_tokens=5) 返回的 completionTokens 应 ≤ max_tokens + reasoningTokens，且响应中应包含 reasoningTokens 的独立计费提示",
      "actual": "qwen3.5-flash 设 max_tokens=5 返回 completionTokens=1588（含 reasoningTokens=1582），无任何计费提示",
      "expected": "应在响应中或 Schema 描述中明确告知 reasoning tokens 不受 max_tokens 限制且独立计费"
    },
    {
      "id": "DX-007",
      "severity": "medium",
      "category": "DX",
      "tool": "chat / generate_image",
      "description": "错误信息语言不统一，中文消息存在错别字",
      "assertion": "所有 MCP tool 的错误信息应使用统一的语言，且不包含重复用词或乱码",
      "actual": "generate_image 用 text 模型报错 '该接口接口暂不支持该模型调用'（'接口'重复），而其他错误用英文。chat 的错误混合中英文",
      "expected": "错误信息应统一为英文（或中英双语），修复 '接口接口' 错别字"
    },
    {
      "id": "DX-008",
      "severity": "medium",
      "category": "DX",
      "tool": "chat",
      "description": "chat 的 max_tokens 参数缺少 maximum 上限约束，可导致传入极大值引发晦涩错误",
      "assertion": "chat Schema 的 max_tokens 参数应定义 maximum 值（与模型的 contextWindow 对应），或服务端应返回明确的参数范围错误",
      "actual": "max_tokens=9999999 导致上游报错 'maximum context length is 1000000 tokens'，暴露上游限制细节",
      "expected": "Schema 应设置合理的 maximum（如 contextWindow），或服务端在转发前校验并返回友好错误"
    },
    {
      "id": "DX-009",
      "severity": "low",
      "category": "DX",
      "tool": "get_balance",
      "description": "交易流水 (transactions) 缺少模型名称和来源字段，审查账单需额外查询",
      "assertion": "get_balance(include_transactions=true) 返回的每条 transaction 应包含 model 和 source 字段",
      "actual": "transaction 仅含 type、amount、balanceAfter、traceId、description('API call deduction')，需要用 traceId 再查 get_log_detail",
      "expected": "应内联 model 和 source 字段，减少审查账单的操作步骤"
    },
    {
      "id": "DX-010",
      "severity": "medium",
      "category": "DX",
      "tool": "create_project / get_project_info",
      "description": "存在 create_project 和 get_project_info，但缺少 list_projects 和 switch_project",
      "assertion": "MCP tool 列表中应存在 list_projects 工具（CRUD 的 List 操作）",
      "actual": "26 个工具中无 list_projects 或 switch_project，用户无法查看或切换自己的多个项目",
      "expected": "应提供 list_projects（列出用户所有项目）和 switch_project（切换当前默认项目）"
    },
    {
      "id": "DX-011",
      "severity": "low",
      "category": "DX",
      "tool": "list_models",
      "description": "capability=vision 过滤同时返回 text 模型和 image 模型，但两者的 vision 含义不同",
      "assertion": "list_models(capability='vision') 应仅返回 modality='text' 的模型，或文档应明确说明 vision 在不同 modality 下的语义差异",
      "actual": "返回 15 个模型，混合了 text 模型（vision=理解图片输入）和 image 模型（vision/image_input=接受图片输入编辑），capabilities 的 key 也不同（text 用 vision，image 用 image_input）",
      "expected": "capability 过滤应仅在同一 modality 内生效，或 image 模型使用 image_input 而非 vision 参与过滤"
    },
    {
      "id": "DX-012",
      "severity": "low",
      "category": "容错",
      "tool": "list_public_templates",
      "description": "所有公开模板的 qualityScore 均为 null，该字段形同虚设",
      "assertion": "list_public_templates() 返回的模板中，qualityScore 字段应为数值或不返回该字段",
      "actual": "3 个公开模板的 qualityScore 全部为 null",
      "expected": "应填充实际评分，或在未评分时不返回该字段以避免暗示存在评分机制"
    },
    {
      "id": "DX-013",
      "severity": "low",
      "category": "安全",
      "tool": "get_log_detail",
      "description": "get_log_detail 完整返回恶意 payload 的原始内容，可能被用于注入攻击日志回显",
      "assertion": "get_log_detail 返回的 prompt 内容应对已知恶意模式（XSS payload、SQL 注入等）进行转义或标记",
      "actual": "traceId=trc_v6b0hmiekdst0dowhrq6cr6j 的日志中，parameters.prompt 字段包含完整的 '<img src=x onerror=alert(1)>' XSS payload（虽然 response 中做了 HTML entity 转义，但 parameters 中未转义）",
      "expected": "parameters 和 prompt 字段应统一进行转义处理，或至少标记 '[potentially malicious input]'"
    }
  ]
}
```

---

**审计总结**：AIGC Gateway 的核心架构设计合理——Action/Template 的 prompt 工程化抽象、版本管理、公共模板市场都是有价值的能力。但 **模型列表的数据一致性问题是致命的**（DX-001/002/003/005），它直接摧毁了开发者对平台的信任基础。一个 API Gateway 最核心的契约就是"我告诉你什么可用，什么就可用"——目前这个契约是破碎的。建议优先修复模型可用性同步机制和计费准确性，其次统一错误信息规范。
