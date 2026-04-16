# 审计执行报告
> **审计时间**：2026-04-13 01:41:34 (UTC+8)
> **审计角色**：dx-audit-prompt.md
---

数据收集完毕，所有探测结束。现在开始撰写完整的审计报告。

---

# AIGC Gateway — MCP 端点逆向工程与 DX 审查报告

## 第一步：全量资产盘点 (Tool Discovery & Mapping)

共发现 **26 个 MCP Tools**，按功能域分类如下：

### 1. 基础信息与账户管理（4 个）
| Tool | 功能 |
|------|------|
| `get_balance` | 查询用户级余额（跨项目共享），可选返回最近 10 笔交易流水 |
| `get_project_info` | 获取当前项目的名称、描述、API 调用次数和密钥数量 |
| `list_api_keys` | 列出当前用户的所有 API Key（脱敏显示） |
| `create_api_key` / `revoke_api_key` | 创建或吊销 API Key |

### 2. 模型发现（1 个）
| Tool | 功能 |
|------|------|
| `list_models` | 列出可用模型，支持按 modality（text/image）、capability、free_only 筛选。返回价格、能力矩阵、上下文窗口等 |

### 3. AI 推理调用（2 个）
| Tool | 功能 |
|------|------|
| `chat` | 发送文本对话补全请求，支持流式、JSON 模式、Function Calling、采样参数控制 |
| `generate_image` | 发送图片生成请求，支持指定尺寸和数量 |

### 4. 可观测性（3 个）
| Tool | 功能 |
|------|------|
| `list_logs` | 列出最近的 AI 调用日志，支持按模型/状态/关键词筛选 |
| `get_log_detail` | 通过 traceId 查看完整的请求/响应详情，用于调试 |
| `get_usage_summary` | 按时间段查看用量统计，支持按模型/日期/来源/Action/Template 分组 |

### 5. Action 管理（6 个）— 原子执行单元
| Tool | 功能 |
|------|------|
| `list_actions` | 列出项目下所有 Action |
| `get_action_detail` | 查看 Action 详情及版本历史 |
| `create_action` | 创建 Action（绑定模型 + 提示词模板 + 变量定义） |
| `update_action` | 更新 Action 元数据（不影响版本） |
| `delete_action` | 删除 Action（被 Template 引用时阻止） |
| `create_action_version` / `activate_version` | 版本管理与回滚 |
| `run_action` | 执行 Action，支持变量注入和 dry_run 预览 |

### 6. Template 管理（6 个）— 多步编排工作流
| Tool | 功能 |
|------|------|
| `list_templates` | 列出项目下所有 Template |
| `get_template_detail` | 查看 Template 详情（执行模式、步骤列表） |
| `create_template` | 创建 Template，步骤引用已有 Action |
| `update_template` | 更新 Template（steps 为全量替换） |
| `delete_template` | 删除 Template |
| `run_template` | 执行 Template 工作流 |

### 7. 公共模板市场（2 个）
| Tool | 功能 |
|------|------|
| `list_public_templates` | 浏览公共模板库（含质量评分、fork 数） |
| `fork_public_template` | 将公共模板 fork 到自己项目中 |

---

## 第二步：系统能力逆向推演 (Reverse Engineering)

### 平台性质与核心商业逻辑

**AIGC Gateway 是一个 AI 服务商聚合网关平台**（类似 OpenRouter / LiteLLM 的商业化产品），其核心商业逻辑是：

1. **统一入口**：将 OpenAI、Anthropic、Google、DeepSeek、字节跳动、百度、智谱、Moonshot、Minimax、xAI、通义千问等 10+ 家厂商的模型聚合在一个统一的 API 接口下
2. **预付费钱包**：用户预充值余额，按调用量扣费（token 计费 + 按次计费两种模型）
3. **Prompt 工程化**：通过 Action（原子执行单元）和 Template（编排工作流）将提示词工程产品化，支持版本管理和变量注入
4. **可观测性**：提供完整的调用日志、费用追踪和用量统计

### 核心使用流程 (Workflow)

```
1. get_balance → 确认余额可用
2. list_models → 了解可用模型及价格
3. chat / generate_image → 直接调用模型
4. [进阶] create_action → 将常用提示词封装为 Action
5. [进阶] create_template → 将多个 Action 串联为工作流
6. [进阶] list_public_templates → fork 社区模板快速启动
7. list_logs / get_usage_summary → 监控和优化
```

---

## 第三步：极客视角的吐槽与建议 (DX Critique)

### 缺陷 1：多个上架模型实际不可用，严重损害开发者信任

**deepseek-v3** 在 `list_models` 中正常展示，但实际 **6 次调用全部失败**，错误信息为 *"The model or [infra removed] does not exist or you do not have access to it"*。同样，**gemini-3-pro-image**（3 次全失败）、**seedream-3**（3 次全失败）也存在类似问题。

开发者看到模型列表后理所当然地认为可以使用，结果调用直接报错，且错误信息中 `[infra removed]` 这种脱敏痕迹暴露了内部实现细节。

**建议**：引入模型健康检查机制，在 `list_models` 返回中增加 `status: "available" | "degraded" | "unavailable"` 字段；对持续失败的模型自动从列表中移除或标记。

### 缺陷 2：`supportedSizes` 字段在图片模型之间不一致

5 个图片模型中，仅 `gpt-image-mini` 和 `seedream-3` 返回了 `supportedSizes` 字段，而 `gemini-3-pro-image`、`gpt-image`、`qwen-image` 完全缺失。MCP 指令文档明确告知开发者"必须从 supportedSizes 中选择尺寸"，但实际有 3/5 的模型无法遵从这一指引。

**建议**：所有 image 模态模型必须返回 `supportedSizes`；如果某模型确实支持任意尺寸，应明确返回 `["any"]` 或相应说明。

### 缺陷 3：`max_tokens` 参数缺少上限校验

Schema 中 `max_tokens` 只有 `exclusiveMinimum: 0`，没有 `maximum`。实测传入 `9999999` 被服务端接受后才抛出错误。这应该在 Schema 层面就被拦截。

**建议**：根据每个模型的 `contextWindow` 动态限制 `max_tokens`，或至少在 Schema 中设定一个合理的静态上限（如 `maximum: 1000000`）。

### 缺陷 4：错误消息中模型列表被截断

调用 `chat` 时传入无效模型名，错误消息只列出了前 10 个文本模型（截止到 `glm-5`），漏掉了 `gpt-4o-mini`、`gpt-5`、`grok-4.1-fast`、`kimi-k2-thinking`、`minimax-m2.5`、`qwen3.5-flash`、`qwen3.5-plus` 共 7 个模型。对于依赖错误消息来纠错的开发者来说，这是误导性的不完整信息。

**建议**：错误消息要么列出完整列表，要么只给出 `"Use list_models for the full list"` 的提示而不列出部分列表。

### 缺陷 5：`list_logs` 的 model 过滤参数示例使用了错误的命名格式

`list_logs` 的 `model` 参数描述写的是 *"Filter by model name, e.g. openai/gpt-4o"*，使用了 `provider/model` 的格式。但实际上系统中模型名是不带前缀的（如 `gpt-4o-mini`、`deepseek-v3`），且用不带前缀的名称过滤能正常工作。这个文档示例直接误导开发者。

**建议**：修正为 `"e.g. gpt-4o-mini"`，与 `list_models` 返回的实际名称一致。

### 缺陷 6：交易流水描述缺乏可追溯性

`get_balance(include_transactions=true)` 返回的所有交易 `description` 都是千篇一律的 `"API call deduction"`。虽然有 `traceId` 可以关联，但开发者第一眼看到的描述完全没有区分度。

**建议**：description 至少包含模型名，例如 `"chat: deepseek-r1 (1582 tokens)"`。

### 缺陷 7：`gpt-image-mini` 定价反常 — "mini" 版比标准版更贵

`gpt-image` 定价 $0.082603/张，而 `gpt-image-mini` 定价 $0.09589/张。"mini" 语义暗示更便宜/更轻量，但实际价格高出 16%。这严重违反命名直觉。

**建议**：如果定价确实如此，需要在模型描述或命名中消除歧义；或者如果这是配置错误，应立即修正。

### 缺陷 8：`contextWindow` 为 null 的模型缺乏说明

`grok-4.1-fast` 和 `minimax-m2.5` 的 `contextWindow` 返回 `null`。开发者无法判断这是"未知"还是"不适用"还是"无限制"。

**建议**：文本模型的 `contextWindow` 应为必填字段。如果确实未知，使用 `-1` 或增加文字说明。

### 缺陷 9：`list_models` 的 `capability` 过滤参数未使用 enum

`capability` 参数类型为自由字符串，但合法值只有 `function_calling`、`vision`、`reasoning`、`search`、`json_mode`、`streaming` 等有限几个。没有 enum 约束意味着拼写错误不会报错，只会静默返回空结果。

**建议**：将 `capability` 改为 enum 类型，或至少对不合法值返回明确的错误提示。

### 缺陷 10：公共模板的 `qualityScore` 全部为 null

所有 3 个公共模板的 `qualityScore` 字段都是 `null`。这个字段暗示有评分机制，但实际从未被填充，对开发者选择模板毫无帮助。

**建议**：要么实现评分逻辑，要么移除此字段，避免暴露未完成的功能。

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
      "description": "deepseek-v3 在 list_models 中正常列出，但实际调用 100% 失败（6/6 次均报错）",
      "assertion": "list_models() 返回的每个模型，使用 chat(model, [{role:'user', content:'ping'}]) 调用时不应返回 'model does not exist' 类错误",
      "actual": "deepseek-v3 在 list_models 中显示为可用，但 6 次调用全部报错：'The model or [infra removed] does not exist or you do not have access to it'",
      "expected": "list_models 仅列出当前实际可调用的模型，或为不可用模型标注 status 字段"
    },
    {
      "id": "DX-002",
      "severity": "high",
      "category": "数据一致性",
      "tool": "list_models",
      "description": "图片模型的 supportedSizes 字段存在缺失，3/5 的模型没有该字段",
      "assertion": "list_models(modality='image') 返回的每个模型对象都必须包含顶层 supportedSizes 字段（非 null、非 undefined）",
      "actual": "gemini-3-pro-image、gpt-image、qwen-image 三个图片模型均无 supportedSizes 字段",
      "expected": "所有 image 模态模型均返回 supportedSizes 数组"
    },
    {
      "id": "DX-003",
      "severity": "high",
      "category": "数据一致性",
      "tool": "list_models",
      "description": "文本模型的 contextWindow 存在 null 值，开发者无法据此控制 max_tokens",
      "assertion": "list_models(modality='text') 返回的每个模型 contextWindow 字段必须为正整数",
      "actual": "grok-4.1-fast 和 minimax-m2.5 的 contextWindow 为 null",
      "expected": "所有文本模型必须提供有效的 contextWindow 数值"
    },
    {
      "id": "DX-004",
      "severity": "medium",
      "category": "DX",
      "tool": "chat",
      "description": "无效模型名的错误消息中可用模型列表被截断，仅显示部分模型",
      "assertion": "chat(model='nonexistent', messages=[...]) 返回的错误消息中列出的模型数量应等于 list_models(modality='text') 返回的模型总数",
      "actual": "错误消息仅列出 10 个模型（截止到 glm-5），缺少 gpt-4o-mini、gpt-5、grok-4.1-fast、kimi-k2-thinking、minimax-m2.5、qwen3.5-flash、qwen3.5-plus 共 7 个",
      "expected": "错误消息列出全部可用模型或仅提示 'Use list_models for details' 而不给出不完整列表"
    },
    {
      "id": "DX-005",
      "severity": "medium",
      "category": "DX",
      "tool": "list_logs",
      "description": "model 参数的示例文档使用了错误的命名格式（带 provider 前缀）",
      "assertion": "list_logs 的 model 参数 description 中的示例值应与 list_models 返回的模型 name 格式一致",
      "actual": "description 写为 'e.g. openai/gpt-4o'，使用了 provider/model 格式",
      "expected": "应为 'e.g. gpt-4o-mini'，与系统实际使用的无前缀 canonical name 一致"
    },
    {
      "id": "DX-006",
      "severity": "medium",
      "category": "DX",
      "tool": "chat",
      "description": "max_tokens 参数 Schema 缺少上限约束，允许传入超大值导致服务端错误",
      "assertion": "chat 的 max_tokens 参数 Schema 应包含 maximum 约束，或服务端应在转发前校验 max_tokens <= 模型的 contextWindow",
      "actual": "传入 max_tokens=9999999 被 Schema 验证通过，直到服务端返回 'maximum context length exceeded' 错误",
      "expected": "Schema 层面或 gateway 层面拒绝明显超出模型上下文窗口的 max_tokens 值"
    },
    {
      "id": "DX-007",
      "severity": "medium",
      "category": "DX",
      "tool": "list_models",
      "description": "capability 过滤参数为自由字符串而非枚举，拼写错误静默返回空结果",
      "assertion": "list_models(capability='nonexistent_capability') 应返回错误提示而非静默返回空数组",
      "actual": "传入无效 capability 值不会报错，静默返回空列表，与'确实没有模型支持该能力'的结果无法区分",
      "expected": "capability 参数使用 enum 约束，或对无效值返回明确错误"
    },
    {
      "id": "DX-008",
      "severity": "low",
      "category": "计费",
      "tool": "get_balance",
      "description": "交易流水的 description 字段无区分度，全部为 'API call deduction'",
      "assertion": "get_balance(include_transactions=true) 返回的交易记录 description 应包含可辨识的调用上下文信息（如模型名）",
      "actual": "所有 10 条交易记录的 description 均为 'API call deduction'",
      "expected": "description 应包含模型名或调用类型，如 'chat: deepseek-r1'"
    },
    {
      "id": "DX-009",
      "severity": "low",
      "category": "计费",
      "tool": "list_models",
      "description": "gpt-image-mini 定价高于 gpt-image，'mini' 命名暗示更低价但实际相反",
      "assertion": "名称含 'mini' 后缀的模型 pricing.perCall 应 <= 同系列无 'mini' 后缀的模型",
      "actual": "gpt-image-mini 定价 $0.09589/张，gpt-image 定价 $0.082603/张，mini 版贵 16%",
      "expected": "定价与命名语义一致，或通过描述字段明确说明差异原因"
    },
    {
      "id": "DX-010",
      "severity": "low",
      "category": "DX",
      "tool": "list_public_templates",
      "description": "所有公共模板的 qualityScore 字段均为 null，字段存在但未实现",
      "assertion": "list_public_templates() 返回的模板中，qualityScore 字段应为有效数值或该字段不应被暴露",
      "actual": "3 个公共模板的 qualityScore 全部为 null",
      "expected": "要么填充真实评分数据，要么在未实现前从响应中移除该字段"
    },
    {
      "id": "DX-011",
      "severity": "high",
      "category": "容错",
      "tool": "generate_image / list_models",
      "description": "多个图片模型实际不可用（gemini-3-pro-image 3/3 失败，seedream-3 3/3 失败，gpt-image-mini 4/5 失败），但仍正常列出",
      "assertion": "list_models(modality='image') 列出的每个模型，使用 generate_image(model, prompt='a red circle') 调用时应能成功返回图片",
      "actual": "gemini-3-pro-image（3 次全失败）、seedream-3（3 次全失败）、gpt-image-mini（4/5 失败）均持续报错",
      "expected": "持续失败的模型应被标记或自动从可用列表中移除"
    },
    {
      "id": "DX-012",
      "severity": "medium",
      "category": "安全",
      "tool": "get_log_detail",
      "description": "错误信息泄露内部基础设施信息，虽已部分脱敏但格式暴露了脱敏痕迹",
      "assertion": "get_log_detail 返回的 error 字段不应包含 '[infra removed]'、'[rid removed]' 等脱敏占位符",
      "actual": "deepseek-v3 的错误信息为 'The model or [infra removed] does not exist... [rid removed]'，暴露了后端存在基础设施路由和请求 ID 的事实",
      "expected": "错误消息应为面向开发者的友好文案，完全不暴露内部实现细节"
    },
    {
      "id": "DX-013",
      "severity": "medium",
      "category": "计费",
      "tool": "get_usage_summary",
      "description": "usage summary 中部分模型有调用次数但费用和 token 均为 0，无法区分是全部失败还是免费调用",
      "assertion": "get_usage_summary(group_by='model') 中 totalCost='$0.00000000' 且 totalTokens=0 的分组应额外提供 errorCount 字段以区分'免费'和'全部失败'",
      "actual": "deepseek-v3 显示 6 次调用、$0 费用、0 token，但无法从 summary 中判断这是免费模型还是全部失败",
      "expected": "usage summary 应包含 successCount/errorCount 维度，让开发者区分成功免费调用与失败零计费"
    },
    {
      "id": "DX-014",
      "severity": "low",
      "category": "DX",
      "tool": "list_models",
      "description": "free_only=true 返回空数组但无提示信息，开发者无法确认是'没有免费模型'还是'参数未生效'",
      "assertion": "list_models(free_only=true) 当结果为空时应返回说明性消息（如 'No free models currently available'）",
      "actual": "返回空数组 []，无任何附加信息",
      "expected": "空结果应附带说明性文字，帮助开发者理解空结果的含义"
    }
  ]
}
```
