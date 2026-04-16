# 审计执行报告
> **审计时间**：2026-04-13 01:41:34 (UTC+8)
> **审计角色**：Onboarding-Trial
---

### 阶段四结果：成本感知

**本次会话（我的操作）：** 只产生了 1 次计费调用

| 调用 | 模型 | Tokens | 费用 |
|------|------|--------|------|
| 成都攻略生成 | deepseek-r1 | 1,582 | $0.00333 |

其余操作（list_models、get_balance、list_logs 等）都是元数据查询，不消耗模型额度。

**项目整体（今日全部调用）统计：**

| 模型 | 调用次数 | Tokens | 费用 |
|------|---------|--------|------|
| qwen3.5-flash | 46 | 24,304 | $0.00644 |
| gpt-4o-mini | 9 | 883 | $0.00034 |
| deepseek-v3 | 6 | 0 | $0.00000 |
| qwen-image | 5 | 0 | $0.00563 |
| gpt-image-mini | 5 | 394 | $0.00000 |
| deepseek-r1 | 5 | 4,634 | $0.01055 |
| gemini-3-pro-image | 3 | 0 | $0.00000 |
| seedream-3 | 3 | 0 | $0.00000 |
| **gpt-image** | **2** | **0** | **$0.08260** |
| claude-sonnet-4.6 | 1 | 502 | $0.00849 |
| claude-haiku-4.5 | 1 | 49 | $0.00000 |
| **合计** | **86** | **30,766** | **$0.11405** |

**最贵模型：** `gpt-image`，仅 2 次调用就花了 $0.0826，占总费用的 **72.4%**。

> 计费异常发现：
> - `gpt-image-mini` 报告了 394 tokens 但费用为 $0（图片模型应按次计费，但既有 tokens 又不收费，不一致）
> - `claude-haiku-4.5` 报告了 49 tokens 但费用为 $0
> - `deepseek-v3` 有 6 次调用但 0 tokens、$0 费用（全部失败？但 usage_summary 不区分成功/失败）

---

## 最终步骤：结构化断言输出

```json
{
  "assertions": [
    {
      "id": "DX-001",
      "severity": "high",
      "category": "DX",
      "tool": "list_models",
      "description": "部分图片模型缺少 supportedSizes 字段，新手无法知道该传什么尺寸",
      "assertion": "list_models(modality='image') 返回的每个图片模型都必须包含顶层 supportedSizes 数组字段",
      "actual": "gemini-3-pro-image、gpt-image、qwen-image 缺少 supportedSizes 字段；gpt-image-mini 和 seedream-3 有该字段",
      "expected": "所有 modality='image' 的模型都应返回 supportedSizes 字段，即使只有一个默认尺寸"
    },
    {
      "id": "DX-002",
      "severity": "medium",
      "category": "DX",
      "tool": "get_project_info",
      "description": "平台没有任何工具暴露 API base URL，新手无法编写外部调用脚本",
      "assertion": "get_project_info 或 list_api_keys 返回值中应包含 apiBaseUrl 字段",
      "actual": "get_project_info 仅返回 id、name、description、createdAt、callCount、keyCount，无 API 端点信息",
      "expected": "返回值应包含 apiBaseUrl（如 'https://gateway.example.com/v1'），使开发者可直接用于 SDK 配置"
    },
    {
      "id": "DX-003",
      "severity": "medium",
      "category": "容错",
      "tool": "chat",
      "description": "chat 工具对 max_tokens 不做上限校验，超大值透传至上游导致报错",
      "assertion": "chat(model='qwen3.5-flash', messages=[{role:'user',content:'ping'}], max_tokens=9999999) 应在网关层返回参数校验错误，而非透传至上游",
      "actual": "请求被透传至上游模型，上游返回 'maximum context length' 错误，耗时 0.2s 且错误信息来自上游而非网关",
      "expected": "网关层应根据模型的 contextWindow 值拦截不合理的 max_tokens，返回清晰的参数校验错误"
    },
    {
      "id": "SEC-001",
      "severity": "high",
      "category": "安全",
      "tool": "generate_image",
      "description": "generate_image 接受二进制数据/恶意负载作为 prompt，无输入清洗",
      "assertion": "generate_image(model='gpt-image-mini', prompt='0x89504e470d0a1a0a...') 包含二进制数据时应在网关层拒绝",
      "actual": "网关将包含 PNG 文件头、PE 可执行文件头和控制字符的二进制字符串直接转发给上游模型，耗时 14.1s 后才返回错误",
      "expected": "网关应对 prompt 做基本的输入验证（如检测非文本内容、控制字符），在网关层快速拒绝明显非法输入"
    },
    {
      "id": "FIN-001",
      "severity": "high",
      "category": "计费",
      "tool": "get_usage_summary",
      "description": "图片模型 gpt-image-mini 报告了 tokens 消耗但费用为 $0，计费数据不一致",
      "assertion": "get_usage_summary 中 totalTokens > 0 的模型，其 totalCost 应 > $0（除非所有调用均为错误状态）",
      "actual": "gpt-image-mini 报告 5 次调用、394 tokens、$0 费用；claude-haiku-4.5 报告 1 次调用、49 tokens、$0 费用",
      "expected": "若调用成功且消耗了 tokens，费用应大于 0；若全部失败，tokens 应为 0 或 null"
    },
    {
      "id": "FIN-002",
      "severity": "medium",
      "category": "计费",
      "tool": "get_usage_summary",
      "description": "usage_summary 不区分成功和失败调用，无法判断 $0 费用是免费还是全部失败",
      "assertion": "get_usage_summary 的每个分组应包含 successCalls 和 errorCalls 字段，或支持 status 过滤参数",
      "actual": "deepseek-v3 显示 6 次调用、0 tokens、$0 费用，无法判断是调用全部失败还是模型免费",
      "expected": "分组数据应区分成功/失败次数，如 {totalCalls: 6, successCalls: 0, errorCalls: 6}，便于成本分析"
    },
    {
      "id": "DX-004",
      "severity": "low",
      "category": "数据一致性",
      "tool": "chat",
      "description": "deepseek-r1 返回内容在 finishReason='stop' 时被截断",
      "assertion": "chat 返回 finishReason='stop' 时，content 应为完整内容（非 mid-sentence 截断）",
      "actual": "成都攻略的 content 以 '共享单' 结尾（明显的句中截断），但 finishReason 报告为 'stop' 而非 'length'",
      "expected": "若因 max_tokens 限制导致截断，finishReason 应为 'length'；若为 'stop' 则内容应完整"
    },
    {
      "id": "DX-005",
      "severity": "low",
      "category": "DX",
      "tool": "list_models",
      "description": "部分文本模型的 contextWindow 为 null，新手无法评估模型容量",
      "assertion": "list_models 返回的所有文本模型都应有非 null 的 contextWindow 字段",
      "actual": "grok-4.1-fast（text 模型）的 contextWindow 为 null；minimax-m2.5 的 contextWindow 也为 null",
      "expected": "所有文本模型应返回准确的 contextWindow 数值，便于开发者做 token 预算规划"
    }
  ]
}
```

---

### 审计总结

作为一个"新手开发者"，我在零文档的情况下完成了从模型探索、内容生成、故障排查到成本分析的全流程。核心发现：

1. **平台基本可用**——模型列表、对话生成、日志查询、用量统计等核心功能正常运作。
2. **DX（开发者体验）有明显短板**——图片模型 `supportedSizes` 缺失不一致、API base URL 不可发现、文本模型 contextWindow 为 null，这些都会让新手卡住。
3. **输入校验缺失**——网关未对二进制 prompt 和超大 max_tokens 做前置拦截，安全和容错需要加强。
4. **计费数据不透明**——tokens > 0 但费用 = 0 的情况无法解释；usage_summary 不区分成功/失败调用，影响成本核算准确性。
5. **finishReason 可能不准确**——内容明显截断但报告 `stop`，会误导开发者认为响应已完整。
