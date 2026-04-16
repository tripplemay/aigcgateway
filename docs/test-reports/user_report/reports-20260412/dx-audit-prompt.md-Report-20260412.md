# 审计执行报告
> **审计时间**：2026-04-12 11:59:32 (UTC+8)
> **审计角色**：dx-audit-prompt.md
---

Now I have all the data needed. Here is the complete audit report.

---

# MCP 端点逆向工程与 DX 审查报告

## 第一步：全量资产盘点 (Tool Discovery & Mapping)

共发现 **25 个 MCP Tools**，分为 6 个功能域：

| 功能域 | Tools | 说明 |
|--------|-------|------|
| **模型发现** | `list_models` | 浏览可用 AI 模型，支持按 modality/capability/free_only 过滤 |
| **AI 调用** | `chat`, `generate_image` | 文本补全（含 function calling、JSON mode、streaming）与图片生成 |
| **Action（原子单元）** | `list_actions`, `get_action_detail`, `run_action`, `create_action`, `update_action`, `delete_action`, `create_action_version`, `activate_version` | 可复用的"模型+提示词+变量"封装，支持版本管理与回滚 |
| **Template（编排工作流）** | `list_templates`, `get_template_detail`, `run_template`, `create_template`, `update_template`, `delete_template`, `list_public_templates`, `fork_public_template` | 多 Action 编排（串行/扇出并行），含公开模板市场与 fork |
| **可观测性** | `list_logs`, `get_log_detail`, `get_usage_summary` | 调用日志全链路审计、用量统计（按 model/day/source/action/template 分组） |
| **账户管理** | `get_balance`, `create_api_key`, `list_api_keys`, `revoke_api_key`, `create_project`, `get_project_info` | 预充值余额、API Key 生命周期、项目隔离 |

---

## 第二步：系统能力逆向推演 (Reverse Engineering)

### 平台性质

这是一个 **AI 服务商聚合网关（AI Gateway）**。核心商业逻辑：

1. **统一抽象层**：将 11+ 家 AI 服务商（OpenAI、Anthropic、DeepSeek、Google、ByteDance、Baidu、智谱、Qwen、Moonshot、Minimax、xAI）的 API 差异屏蔽，暴露统一的 OpenAI 兼容接口
2. **预充值计费**：用户预存余额，每次调用实时扣费，按 token 或按次（图片）计价
3. **Prompt 工程平台**：Action + Template 体系让用户将提示词工程化、版本化、可复用
4. **全链路可观测**：每次调用有 traceId，可回溯完整 prompt/response/cost/latency

### 核心使用流程

```
get_balance → list_models → chat / generate_image
                                ↓ (进阶)
                    create_action → run_action
                                ↓ (编排)
                    create_template → run_template
                                ↓ (复盘)
                    list_logs → get_log_detail → get_usage_summary
```

---

## 第三步：极客视角的吐槽与建议 (DX Critique)

### 1. 价格精度灾难 — 浮点数直接暴露给用户

`doubao-pro` 的价格是 `$0.0821917808219178`，`minimax-m2.5` 的输出价是 `$0.9900000000000001`。这明显是 CNY÷7.3 的浮点运算残留。开发者看到 16 位小数的价格会困惑——这是精确值还是 bug？

**建议**：在 API 层 round 到合理精度（如 6 位小数），或直接返回 CNY 原价 + 汇率，让调用方自行换算。

### 2. `supportedSizes` 字段缺失不一致

5 个 image 模型中，只有 `gpt-image-mini` 和 `seedream-3` 返回了 `supportedSizes`。`gemini-3-pro-image`、`gpt-image`、`qwen-image` 都没有。MCP Server Instructions 明确说 "generate_image 的 size 参数必须从 supportedSizes 中选择"，但 3/5 的模型不告诉你可选值是什么。开发者只能盲猜或踩错。

**建议**：所有 image 模型必须返回 `supportedSizes`，即使只有一个默认值。

### 3. `capability` 过滤参数缺少 enum 约束

`list_models` 的 `capability` 参数是裸 `string`，没有 enum 定义。开发者必须靠猜或读文档才知道合法值是 `vision`、`reasoning`、`function_calling` 等。而 `modality` 参数做了 enum（`text | image`），同一个 tool 内风格不统一。

**建议**：给 `capability` 加 enum：`["function_calling", "vision", "json_mode", "reasoning", "streaming", "search", "system_prompt"]`。

### 4. 幽灵模型 — `seedream-3` 列出但无法使用

`seedream-3` 出现在 `list_models` 返回中，但实际调用报错 "The model does not exist or you do not have access to it"。这是典型的"目录与库存不同步"问题，会严重损害开发者信任。

**建议**：`list_models` 应只返回当前可用的模型，或增加 `status` 字段标记 `available | unavailable | maintenance`。

### 5. 计费黑洞 — 多个模型调用成功但扣费 $0

Usage summary 显示 `deepseek-v3`（5 calls, $0）、`qwen-image`（3 calls, $0）、`claude-haiku-4.5`（1 call, $0）、`gpt-image`（1 call, $0）等均为零成本。部分是错误调用（可理解），但 `qwen-image` 有成功记录（status: success）仍然 $0。这要么是免费模型未标记 `free`，要么是计费管道漏扣。

**建议**：如果是免费模型，`list_models` 应标记；如果是计费 bug，需要修复。`free_only=true` 返回空数组，但实际有 $0 模型存在——矛盾。

### 6. 日志过滤中的模型名格式误导

`list_logs` 的 `model` 参数描述写着 "e.g. openai/gpt-4o"（provider/model 格式），但 `list_models` 返回的 canonical name 是 `gpt-4o-mini`（无 provider 前缀）。开发者如果按描述中的格式去过滤，大概率查不到结果。

**建议**：统一示例为 canonical name 格式，或两种格式都支持。

### 7. `gpt-image-mini` 比 `gpt-image` 更贵 — 命名反直觉

`gpt-image`: $0.083/image, `gpt-image-mini`: $0.096/image。"mini" 暗示更便宜、更轻量，但实际更贵。这会误导成本敏感的开发者选错模型。

**建议**：如果 mini 确实因为某些原因更贵（如更新的底层模型），应在 description 中解释。

### 8. 上游错误信息直接穿透

`trc_v2nko775qprn0kf4ubvuqbcn` 的错误提到 "use the context-compression plugin"——这是上游服务商（Qwen/通义）的内部概念，对 AIGC Gateway 用户毫无意义。错误信息应由网关统一翻译。

**建议**：网关层拦截上游错误，映射为标准化的错误码 + 用户可操作的修复建议。

### 9. 输入安全 — 恶意 payload 成功穿透

`trc_s8xm6asif2e3krketbvxepcg` 显示一个包含 SQL 注入（`SELECT * FROM users; DROP TABLE images;--`）、XSS（`<script>alert(document.cookie)</script>`）、路径遍历（`../../etc/passwd`）的 prompt 被 `qwen-image` 成功处理并返回了图片 URL。虽然 AI 模型本身可能不受影响，但这些 payload 被原样存入日志数据库，如果日志展示层未做转义，就是存储型 XSS 风险。

### 10. Usage summary 中出现 `deprecated` 标记但 `list_models` 不体现

`get_usage_summary` 返回的 topModels 中，`gpt-4o-mini` 和 `qwen-image` 带有 `deprecated: true`。但 `list_models` 仍然正常返回这两个模型，没有任何 deprecated 标记。开发者无从知晓模型已被废弃。

---

## 最终步骤：结构化断言输出

```json
{
  "assertions": [
    {
      "id": "DX-001",
      "severity": "high",
      "category": "数据一致性",
      "tool": "list_models",
      "description": "大部分 image 模型缺少 supportedSizes 字段，但 generate_image 的文档要求必须从该字段选择 size",
      "assertion": "list_models(modality='image') 返回的每个模型都必须有顶层 supportedSizes 字段且为非空数组",
      "actual": "5 个 image 模型中只有 gpt-image-mini 和 seedream-3 有 supportedSizes，gemini-3-pro-image / gpt-image / qwen-image 缺失",
      "expected": "所有 image 模型均返回 supportedSizes 字段"
    },
    {
      "id": "DX-002",
      "severity": "critical",
      "category": "数据一致性",
      "tool": "list_models",
      "description": "seedream-3 在 list_models 中可见但实际调用 generate_image 报模型不存在",
      "assertion": "list_models 返回的每个模型，调用 chat（text）或 generate_image（image）时不应返回 'model does not exist' 错误",
      "actual": "generate_image(model='seedream-3', prompt='a simple red circle') 返回错误 'The model does not exist or you do not have access to it'",
      "expected": "list_models 只返回当前可调用的模型，或增加 status 字段区分可用性"
    },
    {
      "id": "DX-003",
      "severity": "high",
      "category": "计费",
      "tool": "get_usage_summary",
      "description": "多个模型调用成功但计费为 $0，且 free_only=true 返回空数组——免费模型未标记或计费管道漏扣",
      "assertion": "对于 list_models 中标价非零的模型，status=success 的调用在 get_usage_summary 中 totalCost 应大于 0；或若实为免费，list_models(free_only=true) 应返回该模型",
      "actual": "qwen-image 标价 $0.041/image，有 success 调用但 totalCost=$0；list_models(free_only=true) 返回空数组",
      "expected": "成功调用按标价扣费，或免费模型在 list_models(free_only=true) 中可见"
    },
    {
      "id": "DX-004",
      "severity": "medium",
      "category": "DX",
      "tool": "list_models",
      "description": "pricing 字段存在浮点精度问题，价格显示为 16 位小数",
      "assertion": "list_models 返回的 pricing 数值字段小数位数应 <= 6",
      "actual": "doubao-pro inputPerMillion=0.0821917808219178（16 位小数），minimax-m2.5 outputPerMillion=0.9900000000000001（浮点溢出）",
      "expected": "价格四舍五入到合理精度（如 6 位小数），不暴露浮点运算残留"
    },
    {
      "id": "DX-005",
      "severity": "medium",
      "category": "DX",
      "tool": "list_models",
      "description": "capability 参数为裸 string 类型，缺少 enum 约束，而同 tool 的 modality 参数有 enum",
      "assertion": "list_models 的 capability 参数 schema 应包含 enum 定义，与 modality 参数风格一致",
      "actual": "capability 参数 type 为 string，无 enum，开发者须猜测合法值",
      "expected": "capability 参数有 enum: ['function_calling','vision','json_mode','reasoning','streaming','search','system_prompt']"
    },
    {
      "id": "DX-006",
      "severity": "high",
      "category": "数据一致性",
      "tool": "list_models",
      "description": "get_usage_summary 标记 gpt-4o-mini 和 qwen-image 为 deprecated，但 list_models 仍正常返回无任何废弃标识",
      "assertion": "get_usage_summary 中 deprecated=true 的模型，在 list_models 返回中应有对应的 deprecated 字段或不再出现",
      "actual": "get_usage_summary 对 gpt-4o-mini 标记 deprecated:true，但 list_models 正常返回该模型且无 deprecated 字段",
      "expected": "list_models 对已废弃模型返回 deprecated:true 标记，或将其从默认列表中移除"
    },
    {
      "id": "DX-007",
      "severity": "medium",
      "category": "DX",
      "tool": "list_logs",
      "description": "list_logs 的 model 参数示例使用 provider/model 格式，与 list_models 返回的 canonical name 格式不一致",
      "assertion": "list_logs 的 model 参数 description 中的示例格式应与 list_models 返回的模型名格式一致",
      "actual": "list_logs model 参数描述为 'e.g. openai/gpt-4o'（provider 前缀格式）",
      "expected": "示例应为 'e.g. gpt-4o-mini'（canonical name 格式），与 list_models 输出一致"
    },
    {
      "id": "DX-008",
      "severity": "medium",
      "category": "容错",
      "tool": "get_log_detail",
      "description": "上游服务商错误信息原样穿透给用户，包含对用户无意义的内部概念",
      "assertion": "get_log_detail 返回的 error 字段不应包含上游服务商特有术语（如 'context-compression plugin'）",
      "actual": "traceId trc_v2nko775qprn0kf4ubvuqbcn 的 error 包含 'use the context-compression plugin to compress your prompt automatically'",
      "expected": "网关层翻译上游错误为标准化消息，如 'max_tokens (9999999) exceeds model context window (1000000). Please reduce max_tokens.'"
    },
    {
      "id": "DX-009",
      "severity": "medium",
      "category": "DX",
      "tool": "list_models",
      "description": "gpt-image-mini 单价高于 gpt-image，'mini' 命名暗示更便宜但实际更贵",
      "assertion": "命名含 'mini' 的模型价格应 <= 同系列非 mini 模型，或 list_models 返回中包含说明字段解释差异",
      "actual": "gpt-image: $0.0826/image, gpt-image-mini: $0.0959/image — mini 更贵",
      "expected": "价格与命名语义一致，或附带说明"
    },
    {
      "id": "DX-010",
      "severity": "high",
      "category": "安全",
      "tool": "generate_image",
      "description": "恶意 payload（SQL 注入、XSS、路径遍历）可作为 prompt 成功提交并原样存入日志，存在存储型 XSS 风险",
      "assertion": "包含 <script> 标签的 prompt 内容在 get_log_detail 返回时应被转义或净化",
      "actual": "prompt 含 '<script>alert(document.cookie)</script>' 等 payload，原样存储并在 get_log_detail 中原样返回",
      "expected": "日志存储和展示层对特殊字符进行 HTML 转义，或在入口层拒绝明显恶意 payload"
    },
    {
      "id": "DX-011",
      "severity": "low",
      "category": "DX",
      "tool": "list_models",
      "description": "部分 text 模型 contextWindow 为 null，开发者无法判断模型容量",
      "assertion": "list_models 返回的所有 text 模型应有非 null 的 contextWindow 值",
      "actual": "grok-4.1-fast 和 minimax-m2.5 的 contextWindow 为 null",
      "expected": "所有 text 模型返回准确的 contextWindow 数值"
    },
    {
      "id": "DX-012",
      "severity": "medium",
      "category": "DX",
      "tool": "list_models",
      "description": "image 模型和 text 模型的 capabilities 字段 key 不同（image 有 image_input 但缺 search/reasoning，text 有 search/reasoning 但缺 image_input），capability 过滤跨 modality 时语义混淆",
      "assertion": "list_models(capability='vision') 返回的 image 模型的 vision=true 语义应与 text 模型一致，或 image 模型不应出现在 capability='vision' 过滤结果中",
      "actual": "capability='vision' 同时返回 text 模型（vision=可处理图片输入）和 image 模型（vision=true 实际含义不明），且 image 模型有独立的 image_input 字段",
      "expected": "capability 过滤按 modality 隔离，或统一 capabilities 字段 schema"
    }
  ]
}
```

---

### 总评

| 维度 | 评分 (1-10) | 简评 |
|------|-------------|------|
| **Tool 命名与分类** | 8/10 | 命名清晰，Action/Template 分层合理 |
| **Schema 严谨度** | 5/10 | modality 有 enum 但 capability 没有；image 模型缺 supportedSizes |
| **错误信息质量** | 4/10 | 上游错误直接穿透，缺乏标准化错误码体系 |
| **数据一致性** | 3/10 | 幽灵模型、deprecated 不同步、计费 $0 黑洞 |
| **安全性** | 5/10 | 恶意 payload 原样入库，日志展示层需防 XSS |
| **整体 DX** | 6/10 | 框架设计优秀（Action→Template→Log 闭环），但细节打磨不足 |

**一句话**：架构骨架是一流的（统一网关 + prompt 工程 + 全链路审计），但"最后一公里"的数据卫生和错误体验还需要一轮精打细磨。
