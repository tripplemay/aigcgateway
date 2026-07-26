# 审计执行报告
> **审计时间**：2026-04-12 11:59:32 (UTC+8)
> **审计角色**：Onboarding-Trial
---

### 阶段四结果

**本次会话（我的操作）：**
- 调用次数：**1 次**（deepseek-r1 生成成都攻略）
- Token 消耗：**1,549 tokens**（44 prompt + 1,505 completion）
- 花费：**$0.00455**

**今日全平台 MCP 调用汇总（含之前会话的测试调用）：**

| 模型 | 调用次数 | 花费 | Tokens |
|------|---------|------|--------|
| qwen3.5-flash | 21 | $0.00163 | 5,402 |
| deepseek-r1 | 2 | **$0.00506** | 1,938 |
| claude-sonnet-4.6 | 1 | **$0.00849** | 502 |
| gpt-4o-mini | 4 | $0.00025 | 588 |
| deepseek-v3 | 5 | $0.00000 | 0 |
| 其余图片模型 | 9 | $0.00000 | 394 |
| **合计** | **43 次** | **$0.01543** | **9,273** |

**最贵模型：** `claude-sonnet-4.6` — 只调了 1 次 502 tokens 就花了 $0.00849，因为它的输出单价高达 $15/1M tokens。

**性价比观察：** `qwen3.5-flash` 调了 21 次才花 $0.00163，是最经济的文本模型。`deepseek-v3` 的 5 次调用和多个图片模型的调用费用显示为 $0，可能是因为调用失败未计费。

---

## 结构化断言输出

```json
{
  "assertions": [
    {
      "id": "DX-001",
      "severity": "medium",
      "category": "DX",
      "tool": "list_models",
      "description": "部分模型价格显示为浮点精度过长的小数，影响可读性",
      "assertion": "list_models() 返回的每个模型的 pricing 字段中，数值型价格应保留不超过 6 位小数",
      "actual": "doubao-pro 的 inputPerMillion 为 0.0821917808219178（16位小数），glm-4.7-flash 类似",
      "expected": "价格应格式化为合理精度（如 $0.0822），或 price 字符串字段与 pricing 数值字段保持一致的精度"
    },
    {
      "id": "DX-002",
      "severity": "medium",
      "category": "DX",
      "tool": "list_models",
      "description": "image 模型的 supportedSizes 字段在部分模型上缺失",
      "assertion": "list_models(modality='image') 返回的每个 image 模型都必须包含顶层 supportedSizes 字段",
      "actual": "gpt-image-mini 和 seedream-3 有 supportedSizes，但 gpt-image、gemini-3-pro-image、qwen-image 没有该字段",
      "expected": "所有 image 模型都应返回 supportedSizes，让调用者知道可传哪些尺寸"
    },
    {
      "id": "DX-003",
      "severity": "low",
      "category": "DX",
      "tool": "list_models",
      "description": "部分模型的 contextWindow 为 null，无法判断是否支持长文本",
      "assertion": "list_models() 返回的文本模型的 contextWindow 不应为 null",
      "actual": "grok-4.1-fast 和 minimax-m2.5 的 contextWindow 为 null",
      "expected": "所有文本模型应填写准确的 contextWindow 值，或标注为 'unknown'"
    },
    {
      "id": "FIN-001",
      "severity": "high",
      "category": "计费",
      "tool": "get_usage_summary",
      "description": "部分有实际调用记录但 totalCost 为 $0 且 totalTokens 为 0 的模型，无法区分是调用失败还是免费模型",
      "assertion": "get_usage_summary 中 totalCalls > 0 但 totalCost = 0 且 totalTokens = 0 的记录，应区分失败调用和成功但免费的调用",
      "actual": "deepseek-v3 有 5 次调用、qwen-image 有 3 次调用，cost 和 tokens 均为 0，无法判断是全部失败还是免费",
      "expected": "用量汇总应拆分 successCalls/errorCalls，或仅统计成功调用的 cost 和 tokens"
    },
    {
      "id": "FIN-002",
      "severity": "low",
      "category": "计费",
      "tool": "list_models",
      "description": "minimax-m2.5 的 outputPerMillion 有浮点精度误差",
      "assertion": "list_models() 返回的 pricing.outputPerMillion 应为精确值，不含浮点误差",
      "actual": "minimax-m2.5 的 outputPerMillion 为 0.9900000000000001",
      "expected": "应为 0.99"
    },
    {
      "id": "DX-004",
      "severity": "low",
      "category": "DX",
      "tool": "list_logs",
      "description": "image 模型调用的 cost 字段在日志中显示为 $0.00，但不清楚是真免费还是 per-call 计费未体现",
      "assertion": "list_logs 中 image 模型（如 qwen-image）的成功调用应显示实际 cost（基于 list_models 中的 perCall 价格）",
      "actual": "qwen-image 成功调用（trc_s8xm6asif2e3krketbvxepcg）的 cost 为 $0.00000000，但 list_models 显示 perCall = $0.041",
      "expected": "成功的 image 调用 cost 应等于 perCall 价格"
    }
  ]
}
```
